-- A BEFORE DELETE trigger must return OLD, or the delete is silently skipped (20261122170000 returned NULL for a few
-- minutes on 2026-11-22: deleting a dividend did nothing in that window).
create or replace function market_private.on_dividend_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.upcoming_dividends set status = 'pending', dividend_id = null, decided_at = null, updated_at = now()
   where dividend_id = old.id and status in ('approved', 'matched');
  return old;
end; $$;
