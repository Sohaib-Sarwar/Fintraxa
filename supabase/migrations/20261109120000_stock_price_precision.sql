-- Trade prices keep 4 decimals. A confirmation's rate is often an average of several fills
-- (182.6520), and rounding it to 2 decimals moved capital gains off NCCPL's by paisas per lot.
-- Widening keeps every stored value as it is.
alter table public.stock_transactions alter column price type numeric(14, 4);
