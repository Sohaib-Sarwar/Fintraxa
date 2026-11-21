-- PSX company letters already read for the upcoming-dividends fallback (dividends-scan, Gemini URL-context), so a letter
-- is read once, not every night. Service only; kept 120 days.
create table if not exists market_private.psx_docs_read (
  doc text primary key check (doc ~ '^[0-9]{3,12}$'),
  symbol text not null,
  has_dividend boolean not null,
  read_at timestamptz not null default now()
);

create or replace function public.dividend_docs_unread(p_docs text[])
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(d), '{}') from unnest(p_docs) d
   where not exists (select 1 from market_private.psx_docs_read r where r.doc = d);
$$;

create or replace function public.dividend_docs_mark(p_rows jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into market_private.psx_docs_read (doc, symbol, has_dividend)
  select x->>'doc', upper(x->>'symbol'), coalesce((x->>'has_dividend')::boolean, false)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
   where x->>'doc' ~ '^[0-9]{3,12}$'
  on conflict (doc) do nothing;
  delete from market_private.psx_docs_read where read_at < now() - interval '120 days';
$$;

revoke all on function public.dividend_docs_unread(text[]) from public, anon, authenticated;
revoke all on function public.dividend_docs_mark(jsonb) from public, anon, authenticated;
