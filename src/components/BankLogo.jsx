import { Box } from '@mui/material';
import StockLogo from './StockLogo';
import { bankLogo } from '../lib/finance/banks';

/**
 * A bank's logo for savings accounts (owner, 2026-11-15): its own image from public/bank-logos/ when there is one
 * (UBL Ameen, MCB Islamic, Raqami), otherwise the bank's PSX stock logo. Same sizes as StockLogo.
 */
export default function BankLogo({ symbol, size = 'md', sx = {} }) {
  const src = bankLogo(symbol);
  if (!src) return <StockLogo symbol={symbol} size={size} sx={sx} />;
  const dims = { sm: 24, md: 32, lg: 40 }[size] || 32;
  return (
    <Box component="img" src={src} alt={symbol} sx={{ width: dims, height: dims, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, bgcolor: 'action.hover', ...sx }} />
  );
}
