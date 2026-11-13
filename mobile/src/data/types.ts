/** Row shapes the app reads (subset of the Supabase schema; see CONTEXT.md §8). */

export type CategoryKind = 'active' | 'passive' | 'spend' | 'transfer';
export type Category = {
  id: string; user_id: string; name: string; type: 'income' | 'expense' | 'credit' | 'debit';
  icon: string | null; kind: CategoryKind | null; is_default?: boolean; default_tax_rate?: number | null;
};

export type Txn = {
  id: string; user_id: string; amount: number | string; type: 'credit' | 'debit'; category_id: string | null;
  date: string; notes: string | null; created_at: string;
  categories: { name: string; icon: string | null; kind: CategoryKind | null; type?: string } | null;
  savings_accounts?: { name: string; bank_symbol: string | null; bank_name: string | null } | null;
};

export type Trade = {
  id: string; user_id: string; symbol: string; company_name?: string | null; type: 'buy' | 'sell';
  quantity: number | string; price: number | string; fee?: number | string | null; date: string;
  settlement_date?: string | null; broker?: string | null; notes?: string | null; created_at?: string;
};

export type Dividend = {
  id: string; symbol: string; company_name: string | null; payment_date: string; shares: string;
  gross_amount: string; tax_amount: string; zakat_amount: string; net_amount: string; source: string; created_at: string;
};

export type Snapshot = {
  snap_date: string; funds_value: number; funds_cost: number; stocks_value: number; stocks_cost: number; savings: number; net_worth: number;
};

export type Ledger = {
  entries: Record<string, unknown>[]; components: { entry_id: string; component_type: string; amount: string }[];
  funds: { id: string; name: string; amc_id: string; mufap_slug: string | null; category: string | null }[];
  amcs: { id: string; code: string; name: string }[];
  accounts: { id: string; amc_id: string; account_ref_masked: string | null; label: string | null }[];
  navs: { id: string; fund_id: string; nav_date: string; price: string; price_kind: string; source: string }[];
};

export type BoardStock = {
  symbol: string; name: string; sector: string | null; current: number | null; change: number | null; change_pct: number | null; ldcp: number | null;
};
export type Board = { asOf: string | null; data: BoardStock[] };
export type FundQuote = {
  slug: string; fund_name: string; category: string | null; amc: string | null; nav: number | null; repurchase_price: number | null; validity_date: string | null;
};
export type FundsFeed = { asOf: string | null; data: FundQuote[] };
export type IndexRow = { index_name: string; current: number; change: number; change_pct: number };
export type FeedHealthRow = { feed: string; latest_data: string | null; last_success: string | null; last_error: string | null; last_error_at: string | null };

export type Profile = { username: string | null; full_name: string | null; filer_status: string | null };
export type Prefs = { tracks: { spending?: boolean; funds?: boolean; stocks?: boolean } | null; auto_lock_minutes: number | null };
export type Release = { version_code: number; version_name: string; apk_url: string; notes: string; min_supported_code: number };

// ── engine outputs used by the screens (src/lib/mf/profit.js, src/lib/psx/portfolio.js) ──

export type FundPosition = {
  key: string; accountId: string; fundId: string; fundName: string | null; amcCode: string | null; amcName: string | null;
  isOpen: boolean; units: number; price: { value: number; date: string; source: string; stale: boolean } | null;
  value: number | null; invested: number; avgCost: number | null;
  unrealized: { gross: number; tax: number; net: number };
  realized: { gross: number; cgt: number; charges: number; net: number; sales: number };
  allTime: { gross: number; cgt: number; net: number };
  entries: Record<string, unknown>[]; firstDate: string | null; flags: string[];
};
export type FundsAnalysis = {
  totals: {
    value: number; invested: number; held: number; incomplete: boolean;
    realized: { gross: number; cgt: number; charges: number; net: number; sales: number };
    unrealized: { gross: number; tax: number; net: number };
  };
  positions: FundPosition[]; allPositions: FundPosition[];
};

export type StockPosition = {
  symbol: string; companyName: string; isOpen: boolean; shares: number; avgCost: number | null; invested: number;
  price: number | null; priceSource: string | null; priceDate: string | null; dayChange: number | null; dayChangePct: number | null;
  value: number | null; unrealized: number | null; unrealizedPct: number | null; realized: number;
  trades: Trade[]; firstDate: string; flags: string[];
};
export type StocksAnalysis = {
  totals: {
    invested: number; unrealized: number; value: number; unrealizedPct: number | null; realized: number; held: number;
    dayChange: number | null; unpriced: number; salesCount: number;
  };
  positions: StockPosition[]; allPositions: StockPosition[];
};
