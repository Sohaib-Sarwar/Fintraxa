/**
 * Maps category icon name strings (from DB) to MUI Icon components.
 * The DB stores icon names like "Work", "ShowChart", "Restaurant", etc.
 * Also handles legacy emoji icons via category-name-based fallback.
 */
import {
  Work, Computer, TrendingUp, Business, CardGiftcard, AttachMoney,
  Restaurant, DirectionsCar, ShoppingBag, Receipt, SportsEsports,
  LocalHospital, School, Home, ShoppingCart, AccountBalance, ShowChart,
  MoreHoriz, Savings, Shield, LocalGroceryStore, Movie,
  Category, ArrowDownward, ArrowUpward,
} from '@mui/icons-material';

/* ── String → Component map ── */
const ICON_MAP = {
  Work, Computer, TrendingUp, Business, CardGiftcard, AttachMoney,
  Restaurant, DirectionsCar, ShoppingBag, Receipt, SportsEsports,
  LocalHospital, School, Home, ShoppingCart, AccountBalance, ShowChart,
  MoreHoriz, Savings, Shield, LocalGroceryStore, Movie,
  Category, ArrowDownward, ArrowUpward,
};

/* ── Category name → icon fallback (for legacy emoji or missing icon fields) ── */
const NAME_ICON_MAP = {
  'salary': Work,
  'freelance': Computer,
  'business': Business,
  'investment returns': TrendingUp,
  'gift': CardGiftcard,
  'other income': AttachMoney,
  'food & dining': Restaurant,
  'transport': DirectionsCar,
  'transportation': DirectionsCar,
  'shopping': ShoppingBag,
  'bills & utilities': Receipt,
  'health': LocalHospital,
  'education': School,
  'entertainment': SportsEsports,
  'rent': Home,
  'groceries': ShoppingCart,
  'insurance': Shield,
  'savings': Savings,
  'other expense': MoreHoriz,
  'investment - mutual funds': AccountBalance,
  'investment - stocks': ShowChart,
  'mess': Restaurant,
  'restaurant': Restaurant,
};

/** Check if a string is an emoji or non-MUI icon name */
function isEmoji(str) {
  if (!str || str.length === 0) return true;
  // If it's in our icon map, it's valid
  if (ICON_MAP[str]) return false;
  // Otherwise treat as emoji/invalid
  return true;
}

/**
 * Resolve icon: tries icon name first, falls back to category name lookup.
 */
export function getCategoryIconComponent(iconName, categoryName) {
  // Try direct icon name match first
  if (iconName && !isEmoji(iconName)) {
    return ICON_MAP[iconName] || Category;
  }
  // Fall back to category name lookup
  if (categoryName) {
    const key = categoryName.toLowerCase().trim();
    if (NAME_ICON_MAP[key]) return NAME_ICON_MAP[key];
  }
  return Category;
}

/**
 * React component to render a category icon from its DB string name.
 * Usage: <CategoryIcon name="ShowChart" categoryName="Salary" sx={{ fontSize: 18 }} />
 * The categoryName prop is used as fallback when name is an emoji.
 */
export default function CategoryIcon({ name, categoryName, sx = {}, ...props }) {
  const IconComp = getCategoryIconComponent(name, categoryName);
  return <IconComp sx={sx} {...props} />;
}

/* ── Default categories with MUI icon names (matching DB schema) ── */
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
