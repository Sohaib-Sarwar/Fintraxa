/**
 * Keeps the home-screen widget current: whenever the signed-in user's passive payments change (or load), save them
 * for the widget and redraw it. Mounted once in the signed-in layout. Installed Android builds only.
 *
 * Saved: every passive payment (date, source, gross, tax, net) — the same events the Passive income pages use
 * (usePassive → the web's passiveEvents), so the widget's average is the web counter's to the paisa.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePassive } from '@/data/portfolio';
import { ALL_TIME_START, todayIso } from '@/lib/dates';
import { useApp } from '@/lib/store';
import { fromEvents } from './earnings';
import { refreshWidgets, widgetsAvailable } from './native';
import { saveData, saveDefaultCard } from './storage';

const ALL_TIME = { start: ALL_TIME_START, end: todayIso() };

export function useWidgetSync(uid: string | undefined) {
  const { events } = usePassive(ALL_TIME);
  const card = useApp((s) => s.cardDesign);

  useEffect(() => {
    if (!widgetsAvailable || !uid || !events) return undefined;
    const t = setTimeout(() => {
      saveData({ v: 1, uid, builtAt: Date.now(), events: fromEvents(events) })
        .then(() => refreshWidgets())
        .catch((e) => console.warn('[widget] save failed', e));
    }, 1500);
    return () => clearTimeout(t);
  }, [uid, events]);

  useEffect(() => {
    if (!widgetsAvailable) return;
    saveDefaultCard(card).catch(() => {});
  }, [card]);

  // Leaving the app redraws the widget, so the home screen shows today's figure right away.
  useEffect(() => {
    if (!widgetsAvailable) return undefined;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background') refreshWidgets(); });
    return () => sub.remove();
  }, []);
}
