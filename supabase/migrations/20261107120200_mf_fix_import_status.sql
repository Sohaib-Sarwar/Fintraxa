-- Fix: imports stayed "Processing" after their transactions were added.
--
-- refresh_import_status() refused to touch imports still in an in-flight
-- stage, but the Edge Function finalises an import while it is in the
-- 'validating' stage — so the final status was computed and then never
-- written. Only genuinely unprocessed or failed imports are now skipped.

create or replace function mf_private.refresh_import_status(p_import uuid)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_open int; v_approved int; v_total int; v_warn int; v_dupes int; v_status text;
begin
  select count(*) filter (where review_status in ('pending_review', 'requires_attention')),
         count(*) filter (where review_status = 'approved'),
         count(*),
         count(*) filter (where review_status = 'approved'
                          and exists (select 1 from jsonb_array_elements(warnings) w
                                       where w->>'severity' in ('warning', 'error'))),
         count(*) filter (where review_status = 'duplicate')
    into v_open, v_approved, v_total, v_warn, v_dupes
    from public.mf_staged_transactions where import_id = p_import;

  v_status := case
    when v_total = 0 then 'completed_with_warnings'
    when v_open > 0 and v_approved > 0 then 'partially_approved'
    when v_open > 0 then 'awaiting_approval'
    when v_approved = 0 and v_dupes > 0 then 'completed_with_warnings'
    when v_approved = 0 then 'rejected'
    when v_warn > 0 or v_dupes > 0 then 'completed_with_warnings'
    else 'approved' end;

  update public.mf_statement_imports
     set status = v_status,
         stage = 'done',
         completed_at = case when v_open = 0 then coalesce(completed_at, now()) else null end
   where id = p_import
     and status not in ('failed', 'uploaded');
  return v_status;
end;
$$;

-- Repair imports that finished processing but were left showing a stage.
select mf_private.refresh_import_status(id)
  from public.mf_statement_imports
 where status in ('parsing', 'redacting', 'extracting', 'validating')
   and exists (select 1 from public.mf_staged_transactions s where s.import_id = mf_statement_imports.id);
