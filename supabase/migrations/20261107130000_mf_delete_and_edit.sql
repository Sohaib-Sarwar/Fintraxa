-- Mutual funds: permanent delete (statement or single transaction) and
-- in-place edit of a ledger transaction, at the owner's request.
--
-- The ledger stays append-only for clients: the triggers still refuse
-- UPDATE/DELETE from authenticated/anon/service_role. These functions are
-- SECURITY DEFINER (they run as the owner, which the triggers allow), live in
-- the non-exposed mf_private schema, check auth.uid() ownership first, and
-- record every change in mf_audit_log. Additive: nothing existing changes.

-- Every entry id that has to go with p_ids: the entries plus any reversal
-- that mirrors one of them.
create or replace function mf_private.with_reversals(p_user uuid, p_ids uuid[])
returns uuid[] language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct id), '{}')
    from public.mf_ledger_entries
   where user_id = p_user
     and (id = any (p_ids) or reverses_entry_id = any (p_ids))
$$;

-- Removes ledger rows and everything that points at them. Caller has
-- already checked ownership; p_ids must all belong to p_user.
create or replace function mf_private.purge_entries(p_user uuid, p_ids uuid[])
returns integer language plpgsql
set search_path = ''
as $$
declare v_n integer; v_r integer;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  update public.mf_ledger_components set linked_entry_id = null
   where user_id = p_user and linked_entry_id = any (p_ids);
  -- A staged row that fed a deleted entry is marked excluded, so the
  -- statement's review shows what happened instead of a dangling approval.
  update public.mf_staged_transactions
     set ledger_entry_id = null, review_status = 'excluded',
         review_note = 'Deleted from the ledger', reviewed_by = p_user, reviewed_at = now()
   where user_id = p_user and ledger_entry_id = any (p_ids);
  delete from public.mf_ledger_components where user_id = p_user and entry_id = any (p_ids);
  -- Migrated rows: remove the legacy source too, so the delete is complete.
  delete from public.mutual_fund_transactions t
   using public.mf_ledger_entries e
   where e.id = any (p_ids) and e.user_id = p_user
     and t.id = e.legacy_txn_id and t.user_id = p_user;
  -- Reversals reference their targets: delete them first.
  delete from public.mf_ledger_entries where user_id = p_user and id = any (p_ids) and reverses_entry_id is not null;
  get diagnostics v_r = row_count;
  delete from public.mf_ledger_entries where user_id = p_user and id = any (p_ids);
  get diagnostics v_n = row_count;
  return v_n + v_r;
end;
$$;

-- Permanently delete one transaction (manual, migrated or from a statement).
create or replace function mf_private.delete_entry(p_entry_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  e public.mf_ledger_entries;
  v_ids uuid[];
  v_n integer;
begin
  select * into e from public.mf_ledger_entries where id = p_entry_id and user_id = v_uid;
  if not found then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  -- Deleting a reversal deletes only the reversal (the original comes back);
  -- deleting an original deletes its reversal with it.
  v_ids := case when e.reverses_entry_id is not null then array[e.id]
                else mf_private.with_reversals(v_uid, array[e.id]) end;
  v_n := mf_private.purge_entries(v_uid, v_ids);
  if e.source_import_id is not null then
    perform mf_private.refresh_import_status(e.source_import_id);
  end if;
  perform mf_private.audit(v_uid, 'delete_entry', 'mf_ledger_entries', e.id, jsonb_build_object(
    'entry_type', e.entry_type, 'trade_date', e.trade_date, 'fund_id', e.fund_id, 'origin', e.origin,
    'import_id', e.source_import_id, 'deleted', v_n));
  return jsonb_build_object('deleted', v_n);
end;
$$;

-- Permanently delete a statement import and everything derived from it:
-- its ledger transactions (and their reversals), staged rows, evidence
-- lines and the NAV observations it recorded. The PDF itself is removed by
-- the client through the Storage API (direct deletes on storage.objects are
-- not allowed); its path is returned for that.
create or replace function mf_private.delete_import(p_import_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  i public.mf_statement_imports;
  v_ids uuid[];
  v_n integer;
begin
  select * into i from public.mf_statement_imports where id = p_import_id and user_id = v_uid;
  if not found then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;
  if i.lease_until is not null and i.lease_until > now() then
    raise exception 'This statement is still being processed. Try again in a minute.' using errcode = '55P03';
  end if;
  select mf_private.with_reversals(v_uid, coalesce(array_agg(id), '{}')) into v_ids
    from public.mf_ledger_entries where user_id = v_uid and source_import_id = i.id;
  v_n := mf_private.purge_entries(v_uid, v_ids);
  delete from public.mf_nav_history where user_id = v_uid and source = 'statement' and source_ref = i.id::text;
  delete from public.mf_approval_requests where user_id = v_uid and import_id = i.id;
  delete from public.mf_statement_imports where id = i.id;   -- cascades staged rows and lines
  perform mf_private.audit(v_uid, 'delete_import', 'mf_statement_imports', i.id, jsonb_build_object(
    'period_start', i.period_start, 'period_end', i.period_end, 'entries_deleted', v_n));
  return jsonb_build_object('entries_deleted', v_n, 'storage_path', i.storage_path);
end;
$$;

-- Edit a ledger transaction in place. Only figures and the date change; the
-- type, fund and direction stay, so the unit-direction rule keeps holding.
-- Fields: trade_date, units (magnitude), nav, gross_amount, net_amount, cgt.
create or replace function mf_private.edit_entry(p_entry_id uuid, p_edits jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  e public.mf_ledger_entries;
  k text;
  v_units numeric; v_nav numeric; v_gross numeric; v_net numeric; v_cgt numeric; v_date date;
  v_before jsonb;
  v_rule text;
begin
  select * into e from public.mf_ledger_entries where id = p_entry_id and user_id = v_uid;
  if not found then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if e.reverses_entry_id is not null or mf_private.is_reversed(e.id) then
    raise exception 'A reversed transaction cannot be edited' using errcode = '22023';
  end if;
  if jsonb_typeof(p_edits) is distinct from 'object' then
    raise exception 'Edits must be an object' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_edits) loop
    if k not in ('trade_date', 'units', 'nav', 'gross_amount', 'net_amount', 'cgt') then
      raise exception 'Field % cannot be edited', k using errcode = '22023';
    end if;
  end loop;

  v_before := jsonb_build_object('trade_date', e.trade_date, 'unit_delta', e.unit_delta, 'nav', e.nav,
    'gross_amount', e.gross_amount, 'net_amount', e.net_amount,
    'cgt', (select sum(amount) from public.mf_ledger_components where entry_id = e.id and component_type = 'cgt'));

  v_date  := case when p_edits ? 'trade_date' then (p_edits->>'trade_date')::date else e.trade_date end;
  v_nav   := case when p_edits ? 'nav' then nullif(p_edits->>'nav', '')::numeric else e.nav end;
  v_gross := case when p_edits ? 'gross_amount' then nullif(p_edits->>'gross_amount', '')::numeric else e.gross_amount end;
  v_net   := case when p_edits ? 'net_amount' then nullif(p_edits->>'net_amount', '')::numeric else e.net_amount end;
  v_rule  := mf_private.unit_rule(e.entry_type);
  if p_edits ? 'units' then
    v_units := abs(nullif(p_edits->>'units', '')::numeric);
    v_units := case when v_rule = 'out' then -v_units when v_rule = 'none' then null else v_units end;
  else
    v_units := e.unit_delta;
  end if;

  if v_date is null or v_date > current_date then
    raise exception 'Date cannot be empty or in the future' using errcode = '22023';
  end if;
  if v_nav is not null and v_nav <= 0 then
    raise exception 'Price must be greater than zero' using errcode = '22023';
  end if;
  if (v_gross is not null and v_gross < 0) or (v_net is not null and v_net < 0) then
    raise exception 'Amounts cannot be negative' using errcode = '22023';
  end if;
  if v_rule in ('in', 'out') and (v_units is null or v_units = 0) then
    raise exception 'Units must be greater than zero' using errcode = '22023';
  end if;

  update public.mf_ledger_entries
     set trade_date = v_date, price_date = case when price_date = e.trade_date then v_date else price_date end,
         nav = v_nav, unit_delta = v_units, gross_amount = v_gross, net_amount = v_net
   where id = e.id;

  if p_edits ? 'cgt' then
    v_cgt := nullif(p_edits->>'cgt', '')::numeric;
    if v_cgt is not null and v_cgt < 0 then
      raise exception 'CGT cannot be negative' using errcode = '22023';
    end if;
    delete from public.mf_ledger_components where entry_id = e.id and component_type = 'cgt';
    if coalesce(v_cgt, 0) > 0 then
      insert into public.mf_ledger_components (entry_id, user_id, component_type, amount, original_label)
      values (e.id, v_uid, 'cgt', v_cgt, 'Edited');
    end if;
  end if;

  perform mf_private.audit(v_uid, 'edit_entry', 'mf_ledger_entries', e.id,
    jsonb_build_object('before', v_before, 'edits', p_edits));
  return jsonb_build_object('id', e.id);
end;
$$;

-- ─── Public wrappers (SECURITY INVOKER) ──────────────────────────────────────

create or replace function public.mf_delete_entry(p_entry_id uuid)
returns jsonb language sql security invoker
set search_path = ''
as $$ select mf_private.delete_entry(p_entry_id) $$;

create or replace function public.mf_delete_import(p_import_id uuid)
returns jsonb language sql security invoker
set search_path = ''
as $$ select mf_private.delete_import(p_import_id) $$;

create or replace function public.mf_edit_entry(p_entry_id uuid, p_edits jsonb)
returns jsonb language sql security invoker
set search_path = ''
as $$ select mf_private.edit_entry(p_entry_id, p_edits) $$;

revoke all on function
  mf_private.with_reversals(uuid, uuid[]), mf_private.purge_entries(uuid, uuid[]),
  mf_private.delete_entry(uuid), mf_private.delete_import(uuid), mf_private.edit_entry(uuid, jsonb),
  public.mf_delete_entry(uuid), public.mf_delete_import(uuid), public.mf_edit_entry(uuid, jsonb)
from public, anon;

grant execute on function
  public.mf_delete_entry(uuid), public.mf_delete_import(uuid), public.mf_edit_entry(uuid, jsonb)
to authenticated;
grant execute on function
  mf_private.delete_entry(uuid), mf_private.delete_import(uuid), mf_private.edit_entry(uuid, jsonb)
to authenticated;
