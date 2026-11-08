-- Delete one of your categories, first moving its transactions to another category of
-- the same type, in one transaction (Settings > Categories). Runs as the caller, so
-- row-level security still decides what can be read and changed.
create or replace function public.delete_category(p_category uuid, p_move_to uuid default null)
returns integer
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_cat record;
  v_to record;
  v_moved integer := 0;
  v_left integer;
begin
  select id, user_id, name, case when type in ('income', 'credit') then 'income' else 'expense' end as kind_type
    into v_cat from public.categories where id = p_category;
  if not found or v_cat.user_id is distinct from (select auth.uid()) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;
  if v_cat.name = 'Savings profit' or v_cat.name like 'Investment -%' then
    raise exception 'This category is used by the app and cannot be deleted' using errcode = 'P0001';
  end if;

  if p_move_to is not null then
    select id, user_id, case when type in ('income', 'credit') then 'income' else 'expense' end as kind_type
      into v_to from public.categories where id = p_move_to;
    if not found or v_to.user_id is distinct from (select auth.uid()) or v_to.id = v_cat.id then
      raise exception 'Choose another of your categories' using errcode = 'P0001';
    end if;
    if v_to.kind_type <> v_cat.kind_type then
      raise exception 'Move the transactions to a category of the same type' using errcode = 'P0001';
    end if;
    update public.income_expense_transactions
       set category_id = p_move_to
     where category_id = p_category and user_id = (select auth.uid());
    get diagnostics v_moved = row_count;
  end if;

  select count(*) into v_left from public.income_expense_transactions where category_id = p_category;
  if v_left > 0 then
    raise exception '% transaction(s) still use this category; choose where to move them', v_left using errcode = 'P0001';
  end if;
  delete from public.categories where id = p_category;
  return v_moved;
end;
$$;

comment on function public.delete_category(uuid, uuid) is
  'Delete a category of the caller, moving its transactions to p_move_to (same type) first. Returns how many moved.';
revoke all on function public.delete_category(uuid, uuid) from public, anon;
grant execute on function public.delete_category(uuid, uuid) to authenticated;
