/**
 * Me › Home-screen widget (owner, 2026-11-28: "edit should be in settings"). Every change is saved at once and
 * redraws the widgets on the home screen. "Add to home screen" asks the launcher to place one (Android 8+); when a
 * launcher can't, the page says how to add it by hand.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePassive } from '@/data/portfolio';
import { fromEvents } from '@/features/widget/earnings';
import { pinWidget, refreshWidgets, widgetsAvailable } from '@/features/widget/native';
import { loadConfig, saveConfig, type WidgetConfig } from '@/features/widget/storage';
import { WidgetEditor } from '@/features/widget/WidgetEditor';
import { ALL_TIME_START, todayIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { toast } from '@/ui/feedback';
import { Button } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/tokens';

export default function WidgetPage() {
  const appCard = useApp((s) => s.cardDesign);
  const [allTime] = useState(() => ({ start: ALL_TIME_START, end: todayIso() }));
  const { events } = usePassive(allTime);
  const data = useMemo(() => (events ? { events: fromEvents(events) } : null), [events]);
  const [cfg, setCfg] = useState<WidgetConfig | null>(null);
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}); }, []);

  // Save and redraw shortly after the last change (a burst of taps is one save).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (next: WidgetConfig) => {
    setCfg(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveConfig(next).then(() => refreshWidgets()).catch(() => {}); }, 400);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const add = async () => {
    haptic.tick();
    const ok = await pinWidget();
    if (!ok) toast('Long-press an empty spot on your home screen, tap Widgets, then choose Fintraxa.', { tone: 'info' });
  };

  return (
    <Screen back title="Home-screen widget">
      {cfg ? <WidgetEditor cfg={cfg} onChange={change} data={data} appCard={appCard} /> : null}
      {widgetsAvailable ? <Button label="Add to home screen" onPress={add} style={{ marginTop: space.xxl, marginBottom: space.xl }} /> : null}
    </Screen>
  );
}
