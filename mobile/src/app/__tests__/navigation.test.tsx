/**
 * Navigation smoke test with the real Expo Router and the real tab bar (src/app/(app)/(tabs)/_layout.tsx):
 * tapping each tab must land on its screen, and the centre + must open Add. Guards against the Expo
 * Router 58 tab-bar API change that made every tab tap throw on the phone.
 */
import { Text } from 'react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import TabsLayout from '../(app)/(tabs)/_layout';

jest.mock('@/lib/env', () => ({
  env: { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_test', marketApi: 'https://example.test/api', webApp: 'https://example.test' },
  isExpoGo: true, isWeb: false, appVersion: '1.0.0',
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}), impactAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 's', Warning: 'w', Error: 'e' },
}));

const Screen = (label: string) => function S() { return <Text>{label}</Text>; };

async function renderApp() {
  return renderRouter({
    '(tabs)/_layout': TabsLayout,
    '(tabs)/index': Screen('Today screen'),
    '(tabs)/money': Screen('Money screen'),
    '(tabs)/invest': Screen('Invest screen'),
    '(tabs)/me': Screen('Me screen'),
    add: Screen('Add screen'),
  }, { initialUrl: '/' });
}

test('tabs: each tab opens its screen', async () => {
  const r = await renderApp();
  expect(screen.getByText('Today screen')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Money'));
  expect(await screen.findByText('Money screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/money');

  await fireEvent.press(screen.getByLabelText('Invest'));
  expect(await screen.findByText('Invest screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/invest');

  await fireEvent.press(screen.getByLabelText('Me'));
  expect(await screen.findByText('Me screen')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Today'));
  expect(await screen.findByText('Today screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/');
});

test('the centre + opens Add', async () => {
  const r = await renderApp();
  await fireEvent.press(screen.getByLabelText('Add a transaction'));
  expect(await screen.findByText('Add screen')).toBeTruthy();
  expect(r.getPathname()).toBe('/add');
});
