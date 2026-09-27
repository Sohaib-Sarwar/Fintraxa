import { Box, Avatar } from '@mui/material';
import { getStockLogo } from '../lib/stockMeta';

/**
 * Renders a stock logo (SVG from local assets) or a letter-based fallback.
 * Sizes: 'sm' (24px), 'md' (32px), 'lg' (40px)
 */
export default function StockLogo({ symbol, size = 'md', sx = {} }) {
  const logo = getStockLogo(symbol);
  const sym = symbol?.toUpperCase() || '?';

  const dims = { sm: 24, md: 32, lg: 40 }[size] || 32;

  if (logo) {
    return (
      <Box
        component="img"
        src={logo}
        alt={sym}
        sx={{
          width: dims,
          height: dims,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          bgcolor: 'action.hover',
          ...sx,
        }}
      />
    );
  }

  return (
    <Avatar
      sx={{
        width: dims,
        height: dims,
        fontSize: dims * 0.38,
        fontWeight: 700,
        bgcolor: 'action.hover',
        color: 'text.secondary',
        flexShrink: 0,
        ...sx,
      }}
    >
      {sym.slice(0, 2)}
    </Avatar>
  );
}
