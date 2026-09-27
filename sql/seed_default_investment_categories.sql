-- Seed default investment categories for existing databases
-- Safe to run multiple times (idempotent)

INSERT INTO categories (name, type, icon, is_default)
SELECT 'Investment - Mutual Funds', 'expense', 'AccountBalance', TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE lower(name) = 'investment - mutual funds'
    AND type = 'expense'
    AND is_default = TRUE
);

INSERT INTO categories (name, type, icon, is_default)
SELECT 'Investment - Stocks', 'expense', 'ShowChart', TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE lower(name) = 'investment - stocks'
    AND type = 'expense'
    AND is_default = TRUE
);
