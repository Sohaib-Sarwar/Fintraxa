-- Hand-added dividends on the phone (owner, 2026-11-15): the dividend's type (interim / final / special) and the
-- dividend per share the user typed, so the receipt can show them. Both optional: statement imports and older rows
-- leave them empty (the receipt then derives the per-share figure from gross ÷ shares).
alter table public.stock_dividends
  add column if not exists dividend_type text check (dividend_type is null or dividend_type in ('interim', 'final', 'special')),
  add column if not exists dps numeric(14,4) check (dps is null or dps > 0);
