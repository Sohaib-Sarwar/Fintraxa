-- Trades imported from broker trade confirmations (AKD, KTrade).
--
-- A confirmation is parsed in the browser (src/lib/psx/confirmations.js) and
-- each trade is inserted as an ordinary stock_transactions row, so holdings,
-- profit and every screen work unchanged. The extra columns record where it
-- came from:
--   broker          'akd' | 'ktrade'
--   account_ref     the broker account: AKD "COZZ12345", KTrade client code "P12345"
--   confirmation_no AKD memo "260302/COZZ12345", KTrade confirmation "10000001"
--   source_ref      confirmation_no + side + symbol + position in the document:
--                   one per trade, stable across re-uploads
--   charges         the broker's breakdown (commission, CVT/WHT, sales tax, CDC, …)
--
-- Uploading the same confirmation twice is a no-op: (user, broker, source_ref)
-- is unique. Manual trades keep source = 'manual' with these columns null and
-- never collide (NULLs are distinct).

alter table public.stock_transactions
  add column if not exists broker          text check (broker in ('akd', 'ktrade')),
  add column if not exists account_ref     text check (char_length(account_ref) <= 40),
  add column if not exists source          text not null default 'manual' check (source in ('manual', 'confirmation')),
  add column if not exists confirmation_no text check (char_length(confirmation_no) <= 60),
  add column if not exists source_ref      text check (char_length(source_ref) <= 120),
  add column if not exists settlement_date date,
  add column if not exists charges         jsonb check (charges is null or jsonb_typeof(charges) = 'object');

alter table public.stock_transactions
  add constraint stock_transactions_confirmation_check
    check (source = 'manual' or (broker is not null and source_ref is not null and confirmation_no is not null)),
  add constraint stock_transactions_settlement_check
    check (settlement_date is null or settlement_date >= date),
  add constraint stock_transactions_source_ref_key unique (user_id, broker, source_ref);

comment on column public.stock_transactions.source_ref is 'One per imported trade: confirmation + side + symbol + position. Unique per user and broker, so a re-upload is a no-op.';
comment on column public.stock_transactions.fee is 'All charges on the trade. For imports: |quantity × rate − broker net amount|, so the row matches the confirmation to the paisa.';

create index if not exists stock_transactions_user_broker_idx on public.stock_transactions (user_id, broker) where broker is not null;
