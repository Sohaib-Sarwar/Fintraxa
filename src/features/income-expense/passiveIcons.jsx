import { Box } from '@mui/material';
import { AccountBalanceRounded, PaymentsRounded, WorkRounded, ShoppingBagRounded } from '@mui/icons-material';
import StockLogo from '../../components/StockLogo';
import { useTheme } from '@mui/material';
import { passiveColors, flowColors } from '../../components/fx';

/** The Passive Income mark: the leaf on transparent (colours as supplied, never recoloured). */
export function PassiveLogo({ size = 34 }) {
  return <Box component="img" src="/passive-logo.png" alt="" width={size} height={size} sx={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }} />;
}

/** Active income, passive income or expenses: an icon in that flow's chart colour (passive uses the leaf). */
export function FlowIcon({ kind, size = 26 }) {
  const mode = useTheme().palette.mode;
  const c = flowColors(mode)[kind];
  if (kind === 'passive') return <PassiveLogo size={size} />;
  const Icon = kind === 'active' ? WorkRounded : ShoppingBagRounded;
  return (
    <Box sx={{ width: size, height: size, borderRadius: '50%', bgcolor: `${c}22`, color: c, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon sx={{ fontSize: size * 0.56 }} />
    </Box>
  );
}

/**
 * One icon per passive income source, tinted with that source's chart colour.
 * symbol: for savings, the bank's ticker, to show its logo instead of a generic bank.
 */
export function PassiveSourceIcon({ source, size = 26, symbol }) {
  const mode = useTheme().palette.mode;
  const c = passiveColors(mode)[source] ?? passiveColors(mode).other;
  if (source === 'dividends') {
    return <Box component="img" src="/psx.png" alt="PSX" width={size} height={size} sx={{ width: size, height: size, borderRadius: '50%', objectFit: 'contain', bgcolor: '#fff', p: '2px', boxSizing: 'border-box', flexShrink: 0 }} />;
  }
  if (source === 'savings' && symbol) return <StockLogo symbol={symbol} size={size >= 30 ? 'md' : 'sm'} />;
  const Icon = source === 'mutual_funds' ? AccountBalanceRounded : source === 'savings' ? AccountBalanceRounded : PaymentsRounded;
  return (
    <Box sx={{ width: size, height: size, borderRadius: '50%', bgcolor: `${c}22`, color: c, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon sx={{ fontSize: size * 0.58 }} />
    </Box>
  );
}
