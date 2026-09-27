-- Portfolio Tracker: tables, indexes, RLS, triggers
-- Applied via Supabase MCP or CLI

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT NOT NULL DEFAULT 'Category',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO categories (name, type, icon, is_default)
SELECT * FROM (VALUES
  ('Salary', 'income', 'Work', TRUE),
  ('Freelance', 'income', 'Computer', TRUE),
  ('Investment Returns', 'income', 'TrendingUp', TRUE),
  ('Business', 'income', 'Business', TRUE),
  ('Gift', 'income', 'CardGiftcard', TRUE),
  ('Other Income', 'income', 'AttachMoney', TRUE),
  ('Food & Dining', 'expense', 'Restaurant', TRUE),
  ('Transportation', 'expense', 'DirectionsCar', TRUE),
  ('Shopping', 'expense', 'ShoppingBag', TRUE),
  ('Bills & Utilities', 'expense', 'Receipt', TRUE),
  ('Entertainment', 'expense', 'SportsEsports', TRUE),
  ('Health', 'expense', 'LocalHospital', TRUE),
  ('Education', 'expense', 'School', TRUE),
  ('Rent', 'expense', 'Home', TRUE),
  ('Groceries', 'expense', 'ShoppingCart', TRUE),
  ('Other Expense', 'expense', 'MoreHoriz', TRUE)
) AS v(name, type, icon, is_default)
WHERE NOT EXISTS (SELECT 1 FROM categories LIMIT 1);

CREATE TABLE IF NOT EXISTS income_expense_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  category_id UUID REFERENCES categories(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mutual_fund_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fund_id TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  fund_category TEXT,
  nav NUMERIC(12,4) NOT NULL,
  investment_amount NUMERIC(12,2) NOT NULL CHECK (investment_amount > 0),
  units NUMERIC(16,6) NOT NULL,
  type TEXT NOT NULL DEFAULT 'buy' CHECK (type IN ('buy', 'sell')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  company_name TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorite_stocks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_ie_user_date ON income_expense_transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ie_category ON income_expense_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_ie_type ON income_expense_transactions(type);
CREATE INDEX IF NOT EXISTS idx_mf_user_fund ON mutual_fund_transactions(user_id, fund_id);
CREATE INDEX IF NOT EXISTS idx_mf_date ON mutual_fund_transactions(date);
CREATE INDEX IF NOT EXISTS idx_st_user_symbol ON stock_transactions(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_st_date ON stock_transactions(date);
CREATE INDEX IF NOT EXISTS idx_st_type ON stock_transactions(type);
CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_cat_type ON categories(type);
CREATE INDEX IF NOT EXISTS idx_fav_user ON favorite_stocks(user_id);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_expense_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutual_fund_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view default and own categories" ON categories FOR SELECT USING (is_default = TRUE OR auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON categories FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON income_expense_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON income_expense_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON income_expense_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON income_expense_transactions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own fund transactions" ON mutual_fund_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fund transactions" ON mutual_fund_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fund transactions" ON mutual_fund_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fund transactions" ON mutual_fund_transactions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own stock transactions" ON stock_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stock transactions" ON stock_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stock transactions" ON stock_transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own stock transactions" ON stock_transactions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own favorites" ON favorite_stocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON favorite_stocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON favorite_stocks FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ie_updated_at ON income_expense_transactions;
CREATE TRIGGER update_ie_updated_at BEFORE UPDATE ON income_expense_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_mf_updated_at ON mutual_fund_transactions;
CREATE TRIGGER update_mf_updated_at BEFORE UPDATE ON mutual_fund_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_st_updated_at ON stock_transactions;
CREATE TRIGGER update_st_updated_at BEFORE UPDATE ON stock_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
