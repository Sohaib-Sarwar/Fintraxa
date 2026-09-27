/**
 * Turn a Postgres / PostgREST error into something worth showing a person.
 *
 * Every write mutation in the app used to define `onSuccess` and nothing else,
 * so a rejected write produced no snackbar, no console output and no visible
 * change — the dialog simply stayed open. Where a message did get through it
 * was the raw driver text: "new row for relation \"stock_transactions\"
 * violates check constraint \"stock_transactions_quantity_check\"".
 *
 * Codes: https://postgrest.org/en/stable/references/errors.html
 */

const CHECK_CONSTRAINTS = {
  income_expense_transactions_amount_check: 'Amount must be greater than zero.',
  stock_transactions_price_check: 'Price must be greater than zero.',
  stock_transactions_quantity_check: 'Quantity must be greater than zero.',
  mutual_fund_transactions_investment_amount_check:
    'Investment amount must be greater than zero.',
  income_expense_transactions_type_check: 'Transaction type must be income or expense.',
  categories_type_check: 'Category type must be income or expense.',
  stock_transactions_type_check: 'Trade type must be buy or sell.',
  mutual_fund_transactions_type_check: 'Trade type must be buy or sell.',
};

const UNIQUE_CONSTRAINTS = {
  categories_user_id_name_unique: 'You already have a category with that name.',
  favorite_stocks_user_id_symbol_key: 'That stock is already in your favourites.',
  user_preferences_user_id_key: 'Preferences already exist for this account.',
};

const NAMED_COLUMNS = {
  amount: 'an amount',
  price: 'a price',
  quantity: 'a quantity',
  nav: 'a NAV',
  units: 'a unit count',
  investment_amount: 'an investment amount',
  symbol: 'a stock symbol',
  fund_name: 'a fund name',
  date: 'a date',
};

/** Pull the constraint name out of a driver message when the field is absent. */
const constraintFrom = (err) =>
  err?.constraint
  || err?.message?.match(/constraint "([^"]+)"/)?.[1]
  || null;

const columnFrom = (err) =>
  err?.column
  || err?.message?.match(/column "([^"]+)"/)?.[1]
  || err?.message?.match(/null value in column "([^"]+)"/)?.[1]
  || null;

export function describeDbError(err) {
  if (!err) return 'Something went wrong.';

  const code = err.code;
  const constraint = constraintFrom(err);

  switch (code) {
    case '23514': // check_violation
      return CHECK_CONSTRAINTS[constraint] || 'That value is outside the allowed range.';

    case '23505': // unique_violation
      return UNIQUE_CONSTRAINTS[constraint] || 'That record already exists.';

    case '23502': { // not_null_violation
      const col = columnFrom(err);
      return col
        ? `Please enter ${NAMED_COLUMNS[col] || `a value for ${col}`}.`
        : 'A required field is missing.';
    }

    case '23503': // foreign_key_violation
      return 'That item is still referenced by existing records, so it cannot be removed.';

    case '22P02': // invalid_text_representation
      return 'One of the values is not a valid number or date.';

    case '42501': // insufficient_privilege
    case 'PGRST301':
      return 'You are not allowed to change this record. Try signing in again.';

    case 'PGRST116': // no rows where exactly one was expected
      return 'That record no longer exists — it may have been deleted elsewhere.';

    case 'PGRST204': // column not found in schema cache
      return 'The app and the database are out of step. Please reload the page.';

    case 'PGRST205': // table not found
      return 'That feature is not available on this database yet.';

    default:
      break;
  }

  // Network-level failure: supabase-js surfaces these with no code at all.
  if (!code && /fetch|network|Failed to fetch/i.test(err.message || '')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return err.message || 'Something went wrong.';
}

/**
 * A ready-made `onError` for a react-query mutation.
 *
 *   useMutation({ mutationFn, onSuccess, onError: dbErrorHandler(showSnackbar) })
 */
export const dbErrorHandler = (showSnackbar, prefix) => (err) => {
  const message = describeDbError(err);
  showSnackbar(prefix ? `${prefix}: ${message}` : message, 'error');
  // Kept for the browser console — the friendly text above drops the detail a
  // developer needs.
  console.error('[Fintraxa] write failed', err);
};

/**
 * Validate a money/quantity input before it reaches a CHECK constraint.
 * Returns an error string, or null when the value is acceptable.
 */
export function validatePositiveNumber(value, label = 'Value') {
  if (value === '' || value === null || value === undefined) {
    return `${label} is required.`;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n <= 0) return `${label} must be greater than zero.`;
  if (n > 1e12) return `${label} is implausibly large.`;
  return null;
}
