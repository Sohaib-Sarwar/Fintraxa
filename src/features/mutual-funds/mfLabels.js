/** Display vocabulary for imports and ledger entries. */

export const STATUS_LABEL = {
  uploaded: ['Uploaded', 'default'], parsing: ['Processing', 'info'], redacting: ['Processing', 'info'],
  extracting: ['Processing', 'info'], validating: ['Processing', 'info'],
  awaiting_approval: ['Needs review', 'warning'], partially_approved: ['Partly added', 'warning'],
  approved: ['Added', 'success'], completed_with_warnings: ['Added · notes', 'success'],
  rejected: ['Rejected', 'default'], failed: ['Failed', 'error'],
};

export const AMC_NAME = { atlas: 'Atlas', mcb: 'MCB / Alhamra', meezan: 'Meezan', nbp: 'NBP', ubl: 'UBL' };

export const TYPE_LABEL = {
  purchase: 'Purchase', redemption: 'Redemption', switch_in: 'Switch in', switch_out: 'Switch out',
  transfer_in: 'Transfer in', transfer_out: 'Transfer out', dividend_cash: 'Cash dividend',
  dividend_reinvest: 'Dividend reinvested', bonus_units: 'Bonus units', capital_refund_units: 'Refund of capital (units)',
  cgt_deduction: 'CGT deducted', cgt_reversal: 'CGT reversal', cgt_refund_cash: 'CGT refund (cash)',
  cgt_refund_reinvest: 'CGT refund (units)', zakat_deduction: 'Zakat', wht_deduction: 'Withholding tax',
  sales_load: 'Sales load', fee_charge: 'Fee / charge', other_adjustment: 'Adjustment', unknown: 'Unknown — classify',
};

export const COMPONENT_LABEL = {
  cgt: 'CGT', cgt_reversal: 'CGT reversal', cgt_refund: 'CGT refund', zakat: 'Zakat', wht: 'WHT',
  front_load: 'Front-end load', back_load: 'Back-end load', load_tax: 'Tax on load', transaction_cost: 'Transaction cost',
  charge: 'Charges', other_deduction: 'Other deduction', other_credit: 'Other credit',
};

/** Cash direction implied by an event type (mirrors normalize.js). */
export const DIRECTION = {
  purchase: 'investor_pays', redemption: 'investor_receives', switch_in: 'internal', switch_out: 'internal',
  transfer_in: 'none', transfer_out: 'none', dividend_cash: 'investor_receives', dividend_reinvest: 'internal',
  bonus_units: 'none', capital_refund_units: 'internal', cgt_deduction: 'none', cgt_reversal: 'investor_receives',
  cgt_refund_cash: 'investor_receives', cgt_refund_reinvest: 'internal', zakat_deduction: 'none',
  wht_deduction: 'none', sales_load: 'none', fee_charge: 'none', other_adjustment: 'none',
};

export const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** '2026-10' -> 'October 2026' */
export const monthName = (m) => (m ? `${MONTHS_LONG[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '');
