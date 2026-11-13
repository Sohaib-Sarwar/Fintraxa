import { ChevronLeft, ChevronRight } from '@/ui/icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { addMonths, isoLocal, monthLabel, todayIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { IconButton } from './primitives';
import { Text } from './Text';
import { useTheme } from './theme';

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month grid date picker (no native module). Future days are disabled — money can't be spent tomorrow. */
export function Calendar({ value, onChange, max = todayIso() }: { value: string; onChange: (iso: string) => void; max?: string }) {
  const p = useTheme();
  const [month, setMonth] = useState(value.slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => isoLocal(new Date(y, m - 1, i + 1)))];
  const canNext = addMonths(month, 1) <= max.slice(0, 7);
  return (
    <View>
      <View style={styles.head}>
        <IconButton icon={ChevronLeft} label="Previous month" onPress={() => setMonth(addMonths(month, -1))} />
        <Text variant="bodyStrong">{monthLabel(month, true)}</Text>
        <View style={{ opacity: canNext ? 1 : 0.3 }} pointerEvents={canNext ? 'auto' : 'none'}>
          <IconButton icon={ChevronRight} label="Next month" onPress={() => setMonth(addMonths(month, 1))} />
        </View>
      </View>
      <View style={styles.grid}>
        {WEEK.map((d, i) => <Text key={`w${i}`} variant="caption" tone="muted" style={styles.week}>{d}</Text>)}
        {cells.map((iso, i) => {
          if (!iso) return <View key={`e${i}`} style={styles.cell} />;
          const off = iso > max;
          const on = iso === value;
          return (
            <Pressable key={iso} disabled={off} onPress={() => { haptic.tick(); onChange(iso); }} style={styles.cell}
              accessibilityRole="button" accessibilityState={{ selected: on, disabled: off }} accessibilityLabel={iso}>
              <View style={[styles.day, on && { backgroundColor: p.ink }]}>
                <Text variant="body" style={{ color: on ? p.bg : off ? p.muted : p.ink, fontVariant: ['tabular-nums'] }}>{Number(iso.slice(8))}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: `${100 / 7}%`, textAlign: 'center', paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
