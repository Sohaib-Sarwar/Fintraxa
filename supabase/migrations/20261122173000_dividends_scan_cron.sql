-- Upcoming dividends: once a night in the one evening pipeline, after the holdings price refresh (23:40 PKT).
-- 18:55 UTC = 23:55 PKT. Free plan: one job, a few seconds of DB time; the work runs in the Edge Function.
select cron.unschedule('dividends-scan-nightly') where exists (select 1 from cron.job where jobname = 'dividends-scan-nightly');
select cron.schedule('dividends-scan-nightly', '55 18 * * *', $$select market_private.request_dividends_scan()$$);
