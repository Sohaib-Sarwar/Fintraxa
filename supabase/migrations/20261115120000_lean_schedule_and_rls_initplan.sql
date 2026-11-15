-- Free-plan disk IO budget (owner, 2026-11-15: "optimize the DB usage, snapshots only when needed, like at
-- midnight, not every 20 minutes").
--
-- 1) One nightly pipeline instead of ~85 cron runs a day. Times are UTC (PKT = UTC+5):
--      18:40  market-refresh-holdings-night     23:40 PKT  held quotes straight from PSX / MUFAP / AMCs
--      21:15  market-snapshot-request-night     02:15 PKT  fetch the published boards
--      21:20, 21:40  market-snapshot-ingest      02:20, 02:40 PKT  store held closes / NAVs / index closes
--      21:35  psx-backfill-nightly              02:35 PKT  (unchanged)
--      21:45  portfolio-snapshot-after-prices   02:45 PKT  everyone's snapshots, once
--      22:00  cron-history-cleanup              keep 7 days of pg_cron run history
--    Dropped: ingest every 20 minutes (538 of 594 logged runs; the responses are always back within 5 minutes),
--    the morning board request + morning snapshot, the 00:05 snapshot, and the 16:40 / 20:40 holdings refreshes.
--    The apps still ask for a user's snapshot when today's row is missing or after they change data.
--    A board that has not answered by 21:40 is marked "no response" by the next night's run (2-hour rule).
do $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname in (
    'market-snapshot-ingest', 'market-snapshot-request-morning', 'portfolio-snapshot-midnight',
    'portfolio-snapshot-morning', 'market-refresh-holdings-close', 'market-refresh-holdings-evening',
    'cron-history-cleanup');
end $$;

select cron.schedule('market-snapshot-ingest', '20,40 21 * * *', 'select market_private.ingest_snapshots()');
select cron.schedule('cron-history-cleanup', '0 22 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- 2) RLS: evaluate auth.uid() and is_admin() once per statement, not once per row (Supabase lint 0003).
--    is_admin() is itself a query on user_profiles, so every row read through an admin_* policy ran it.
--    Same predicates, wrapped in a scalar subquery so Postgres plans them as an InitPlan.
do $$
declare
  r record;
  q text; c text;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(auth\.uid\(\)|is_admin\(\))'
  loop
    q := r.qual; c := r.with_check;
    if q is not null and q !~* 'select auth\.uid\(\)' then q := regexp_replace(q, 'auth\.uid\(\)', '(select auth.uid())', 'g'); end if;
    if c is not null and c !~* 'select auth\.uid\(\)' then c := regexp_replace(c, 'auth\.uid\(\)', '(select auth.uid())', 'g'); end if;
    if q is not null and q !~* 'select (public\.)?is_admin\(\)' then q := regexp_replace(q, '(^|[^.[:alnum:]_])is_admin\(\)', '\1(select public.is_admin())', 'g'); end if;
    if c is not null and c !~* 'select (public\.)?is_admin\(\)' then c := regexp_replace(c, '(^|[^.[:alnum:]_])is_admin\(\)', '\1(select public.is_admin())', 'g'); end if;
    if q is distinct from r.qual and c is distinct from r.with_check then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, q, c);
    elsif q is distinct from r.qual then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, q);
    elsif c is distinct from r.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, c);
    end if;
  end loop;
end $$;
