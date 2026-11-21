import { Box, Tooltip, Typography } from '@mui/material';
import { useFx } from './fx';

/**
 * Hover (or long-press on a touch screen) a price to see its stamp: the day it is for, when it was fetched
 * and where it came from. `stamp` comes from src/lib/market/priceStamp.js (stockStamp / fundStamp).
 */
export default function PriceStampTip({ stamp, children }) {
  const t = useFx();
  if (!stamp) return children;
  const body = (
    <Box sx={{ p: 0.5, minWidth: 220 }}>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, mb: 0.6 }}>{stamp.title}</Typography>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.25, rowGap: 0.35 }}>
        {stamp.rows.map(([k, v]) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Box component="dt" sx={{ fontSize: '0.7rem', opacity: 0.7 }}>{k}</Box>
            <Box component="dd" sx={{ m: 0, fontSize: '0.72rem', fontWeight: 600 }}>{v}</Box>
          </Box>
        ))}
      </Box>
      {stamp.note && <Typography sx={{ fontSize: '0.68rem', color: t.warn, mt: 0.6 }}>{stamp.note}</Typography>}
    </Box>
  );
  return (
    <Tooltip arrow title={body} enterTouchDelay={400} leaveTouchDelay={6000} describeChild>
      <Box tabIndex={0} sx={{ cursor: 'help', borderRadius: '14px', '&:focus-visible': { outline: `2px solid ${t.ink}`, outlineOffset: 2 } }}>{children}</Box>
    </Tooltip>
  );
}
