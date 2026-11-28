/* eslint-disable @typescript-eslint/no-require-imports -- the stand-ins and the layout must load after expo-router's testing library */
/**
 * Navigation smoke test with the real Expo Router and the real tab bar (src/app/(app)/(tabs)/_layout.tsx):
 * tapping each tab (Home, Wallet, Invest, Passive) must land on its screen, and the centre + must open the add menu. Guards against the Expo
 * Router 58 tab-bar API change that made every tab tap throw on the phone.
 */
import { Text } from 'react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

jest.mock('@/lib/env', () => ({
  env: { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_test', marketApi: 'https://example.test/api', webApp: 'https://example.test' },
  isExpoGo: true, isWeb: false, appVersion: '1.0.0',
}));

// Reanimated 4.7's initialiser cannot run under Jest (it throws on setCSSEventHandler), so expo-router's testing
// library falls back to mocking it as an EMPTY object — the tab bar's + menu then failed ("Easing is undefined").
// That cached object is filled in here with a small stand-in (values apply at once, animations finish
// immediately) before the layout is loaded. The overlays the tabs layout hosts (card picker, Home's and Passive's
// sheets) are closed during navigation and stubbed outright.
function stubReanimated() {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const done = (v: unknown, _c?: unknown, cb?: (finished: boolean) => void) => { cb?.(true); return v; };
  const ease = () => (t: number) => t;
  const Animated = { View: RN.View, Text: RN.Text, ScrollView: RN.ScrollView, FlatList: RN.FlatList, createAnimatedComponent: (c: unknown) => c };
  Object.assign(require('react-native-reanimated'), {
    __esModule: true,
    default: Animated,
    ...Animated,
    Easing: { bezier: ease, out: ease, in: ease, inOut: ease, linear: (t: number) => t, quad: (t: number) => t, cubic: (t: number) => t, ease: (t: number) => t },
    useSharedValue: (v: unknown) => { const sv = { value: v, get: () => sv.value, set: (n: unknown) => { sv.value = n; } }; return sv; },
    useAnimatedStyle: (f: () => object) => f(),
    withTiming: done, withSpring: done, withDelay: (_d: number, v: unknown) => v,
    interpolate: (x: number) => x, Extrapolation: { CLAMP: 'clamp' },
  });
  Object.assign(require('react-native-worklets'), {
    scheduleOnRN: (f: (...a: unknown[]) => void, ...a: unknown[]) => f(...a),
    scheduleOnUI: (f: (...a: unknown[]) => void, ...a: unknown[]) => f(...a),
  });
}
stubReanimated();
jest.mock('@/features/today/CardPicker', () => ({ CardPicker: () => null }));
jest.mock('@/features/today/WorthSheet', () => ({ WorthSheet: () => null }));
jest.mock('@/features/passive/LiveSheet', () => ({
  LiveSheet: () => null,
  useLiveSheet: (pick: (s: { data: null; open: () => void; close: () => void }) => unknown) => pick({ data: null, open: () => {}, close: () => {} }),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}), impactAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 's', Warning: 'w', Error: 'e' },
}));

// Loaded after the stand-in above.
const TabsLayout = require('../(app)/(tabs)/_layout').default;

const Screen = (label: string) => function S() { return <Text>{label}</Text>; };

async function renderApp() {
  return renderRouter({
    '(tabs)/_layout': TabsLayout,
    '(tabs)/index': Screen('Home screen'),
    '(tabs)/money': Screen('Wallet screen'),
    '(tabs)/invest': Screen('Invest screen'),
    '(tabs)/passive': Screen('Passive screen'),
    add: Screen('Add screen'),
  }, { initialUrl: '/' });
}

test('tabs: each tab opens its screen', async () => {
  const r = await renderApp();
  expect(screen.getByText('Home screen')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Wallet'));
  expect(await screen.findByText('Wallet screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/money');

  await fireEvent.press(screen.getByLabelText('Invest'));
  expect(await screen.findByText('Invest screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/invest');

  await fireEvent.press(screen.getByLabelText('Passive'));
  expect(await screen.findByText('Passive screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/passive');

  await fireEvent.press(screen.getByLabelText('Home'));
  expect(await screen.findByText('Home screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/');
});

test('the centre + opens the add menu, Expense opens Add', async () => {
  const r = await renderApp();
  await fireEvent.press(screen.getByLabelText('Add: expense, income or upload'));
  await fireEvent.press(await screen.findByLabelText('Expense'));
  expect(await screen.findByText('Add screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/add');
});
