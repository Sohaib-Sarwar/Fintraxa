import { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useHoldingSnapshots } from '../../lib/snapshots/useSnapshots';
import { windowProfit } from '../../lib/snapshots/build';
import { todayIso } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import { useFx, FONT_NUM, signColor } from './tokens';
import Seg from './Seg';

const WINDOWS = [{ value: 1, label: 'Last day' }, { value: 7, label: '7 days' }, { value: 30, label: '30 days' }];
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n), 2)}`;
const short = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * What one holding earned over the last day, 7 or 30 days, from its daily
 * snapshots: change in unrealized gain + what was realized in the window
 * (money paid in or taken out is not profit).
 *
 * assetType: 'mf' (assetKey = position key) or 'psx' (assetKey = symbol)
 */
export default function PeriodProfit({ assetType, assetKey }) {
  const t = useFx();
  const [n, setN] = useState(1);
  const { rows, isLoading } = useHoldingSnapshots(assetType, assetKey);
  const w = useMemo(() => windowProfit(rows, n, todayIso()), [rows, n]);

  return (
    <Box sx={{ p: 1.5, mb: 1.5, borderRadius: '14px', border: `1px solid ${t.border}`, bgcolor: t.surface2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.74rem', fontWeight: 650, color: t.ink2 }}>Profit</Typography>
        <Seg size="sm" label="Profit window" value={n} onChange={setN} options={WINDOWS} />
      </Box>
      {w ? (
        <Box sx={{ mt: 1 }}>
          <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.35rem', fontWeight: 650, letterSpacing: '-0.03em', color: signColor(t, w.profit) }}>
            {signed(w.profit)}
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>
            {short(w.from)} to {short(w.to)}: unrealized {signed(w.unrealizedChange)}, realized {signed(w.realized)}
            {!w.complete && ' (history starts inside this window)'}
          </Typography>
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.74rem', color: t.muted, mt: 1 }}>
          {isLoading ? 'Loading daily history…' : 'Daily profit appears after the first nightly snapshot of this holding.'}
        </Typography>
      )}
    </Box>
  );
}
