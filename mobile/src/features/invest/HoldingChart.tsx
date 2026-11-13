import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useHoldingSnapshots } from '@/data/queries';
import { shortDate, todayIso } from '@/lib/dates';
import { compactNumber, money } from '@/lib/format';
import { AreaChart, type Point } from '@/ui/charts';
import { useHidden } from '@/ui/Figures';
import { Text } from '@/ui/Text';
import { space } from '@/ui/tokens';

/** Value (line) vs cost (dashed) of one holding over ~13 months, from server snapshots; live value last. */
export function HoldingChart({ type, assetKey, live }: { type: 'mf' | 'psx'; assetKey: string; live: { value: number | null; cost: number } }) {
  const hidden = useHidden();
  const snaps = useHoldingSnapshots(type, assetKey);
  const [scrub, setScrub] = useState<Point | null>(null);
  const points = useMemo(() => {
    const pts: Point[] = (snaps.data ?? []).filter((r) => r.units > 0).map((r) => ({ date: r.snap_date, value: r.value, cost: r.cost }));
    const today = todayIso();
    if (live.value !== null && live.value > 0) {
      if (pts.length && pts[pts.length - 1].date === today) pts[pts.length - 1] = { date: today, value: live.value, cost: live.cost };
      else pts.push({ date: today, value: live.value, cost: live.cost });
    }
    return pts;
  }, [snaps.data, live.value, live.cost]);
  return (
    <View style={{ marginTop: space.md }}>
      <Text variant="caption" tone="muted" style={{ minHeight: 16 }}>
        {scrub ? `${shortDate(scrub.date)} · value ${money(scrub.value, { hidden })} · cost ${money(scrub.cost ?? 0, { hidden })}` : 'Value vs what you paid (dashed) · drag to read'}
      </Text>
      <AreaChart points={points} height={160} onScrub={setScrub} format={(v) => (hidden ? '••••' : `Rs ${compactNumber(v)}`)} />
    </View>
  );
}
