/**
 * The category set seeded for a new account.
 *
 * Kept apart from `categoryIcons.jsx` so that file exports a component and
 * nothing else — a module mixing components with plain values breaks Fast
 * Refresh, which then does a full page reload on every edit instead of
 * preserving state.
 *
 * `type` must be 'income' or 'expense': the categories table has a CHECK
 * constraint on exactly those two values. (The transactions table uses
 * 'credit' / 'debit' — a different vocabulary for a different column.)
 * `icon` is a MUI icon name resolved by getCategoryIconComponent.
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'income', icon: 'Work' },
  { name: 'Freelance', type: 'income', icon: 'Computer' },
  { name: 'Business', type: 'income', icon: 'Business' },
  { name: 'Investment Returns', type: 'income', icon: 'TrendingUp' },
  { name: 'Gift', type: 'income', icon: 'CardGiftcard' },
  { name: 'Other Income', type: 'income', icon: 'AttachMoney' },
  { name: 'Food & Dining', type: 'expense', icon: 'Restaurant' },
  { name: 'Transport', type: 'expense', icon: 'DirectionsCar' },
  { name: 'Shopping', type: 'expense', icon: 'ShoppingBag' },
  { name: 'Bills & Utilities', type: 'expense', icon: 'Receipt' },
  { name: 'Health', type: 'expense', icon: 'LocalHospital' },
  { name: 'Education', type: 'expense', icon: 'School' },
  { name: 'Entertainment', type: 'expense', icon: 'SportsEsports' },
  { name: 'Rent', type: 'expense', icon: 'Home' },
  { name: 'Groceries', type: 'expense', icon: 'ShoppingCart' },
  { name: 'Insurance', type: 'expense', icon: 'Shield' },
  { name: 'Savings', type: 'expense', icon: 'Savings' },
  { name: 'Other Expense', type: 'expense', icon: 'MoreHoriz' },
  { name: 'Investment - Mutual Funds', type: 'expense', icon: 'AccountBalance' },
  { name: 'Investment - Stocks', type: 'expense', icon: 'ShowChart' },
];
