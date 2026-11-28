import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * APP_VARIANT=development builds install beside the real app (`com.fintraxa.app.dev`, "Fintraxa (dev)"),
 * so a development client and a preview/production APK can live on the same phone.
 * Expo Go ignores the native parts of this file (package, icons, scheme); they matter for EAS builds.
 */
const IS_DEV = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Fintraxa (dev)' : 'Fintraxa',
  slug: 'fintraxa',
  scheme: 'fintraxa',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  ios: {
    supportsTablet: false,
    bundleIdentifier: IS_DEV ? 'com.fintraxa.app.dev' : 'com.fintraxa.app',
  },
  android: {
    package: IS_DEV ? 'com.fintraxa.app.dev' : 'com.fintraxa.app',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#000000',
    },
    predictiveBackGestureEnabled: true,
    softwareKeyboardLayoutMode: 'resize',
    allowBackup: false,
    // No storage, SMS, contacts, location or camera permission in v1 (plan §12.6).
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  web: { favicon: './assets/favicon.png', bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    ['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: 'Unlock Fintraxa with Face ID.' }],
    ['expo-local-authentication', { faceIDPermission: 'Unlock Fintraxa with Face ID.' }],
    'expo-image',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 120,
        resizeMode: 'contain',
        backgroundColor: '#000000',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#000000' },
      },
    ],
    // Home-screen widget "Passive income" (owner, 2026-11-28; src/features/widget). Added at once, no setup screen
    // (reconfigurable|configuration_optional, Android 12+); long-press → Settings, or Me › Home-screen widget, edits it.
    // Sizes per developer.android.com: targetCell* on Android 12+, minWidth/minHeight the fallback for older ones.
    // Android redraws it every 30 min (its shortest period); the app redraws it whenever the figures change.
    [
      'react-native-android-widget',
      {
        fonts: [
          './node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
          './node_modules/@expo-google-fonts/inter-tight/600SemiBold/InterTight_600SemiBold.ttf',
          './node_modules/@expo-google-fonts/inter-tight/800ExtraBold/InterTight_800ExtraBold.ttf',
        ],
        widgets: [
          {
            name: 'PassiveIncome',
            label: 'Passive income',
            description: 'What you earn passively today, counted at your average',
            minWidth: '250dp',
            minHeight: '110dp',
            targetCellWidth: 4,
            targetCellHeight: 2,
            resizeMode: 'horizontal|vertical',
            widgetFeatures: 'reconfigurable|configuration_optional',
            updatePeriodMillis: 1800000,
            previewImage: './assets/widget/preview-wide.png',
          },
          {
            name: 'PassiveIncomeSmall',
            label: 'Passive income (small)',
            description: 'Earned today, on a small card',
            minWidth: '110dp',
            minHeight: '40dp',
            targetCellWidth: 2,
            targetCellHeight: 2,
            resizeMode: 'horizontal|vertical',
            widgetFeatures: 'reconfigurable|configuration_optional',
            updatePeriodMillis: 1800000,
            previewImage: './assets/widget/preview-small.png',
          },
        ],
      },
    ],
    // The widget's frame (system corner radius, edge to edge) and its live flipping number (modules/fx-ticker).
    './plugins/withWidgetTicker',
  ],
  // The web build is served from /m of the main site: scripts/build-mobile-web.mjs sets FINTRAXA_WEB_BASE=/m. Only
  // then is baseUrl set, so the native config (and its update fingerprint) stays the same as the installed APK's.
  experiments: { typedRoutes: true, reactCompiler: true, ...(process.env.FINTRAXA_WEB_BASE ? { baseUrl: process.env.FINTRAXA_WEB_BASE } : {}) },
  extra: {
    // Public by design (RLS decides what each user sees) — same values the web app ships in its bundle.
    supabaseUrl: 'https://qrekpudclwesajfhrokv.supabase.co',
    supabaseKey: 'sb_publishable_6N_yU1V4l76J3QIP6Md3BQ_4u5wW-4X',
    marketApi: 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api',
    webApp: 'https://fintraxa.vercel.app',
    router: { origin: false },
    // EAS project (owner's Expo account), needed for cloud APK builds.
    eas: { projectId: 'feff0bb7-b40c-4bde-b14b-4a3328eb46dd' },
  },
  owner: 'transfinancial',
  // Over-the-air updates (owner, 2026-11-15: "make the updates automatically"): JS / asset changes ship with
  // `eas update --channel preview` and reach installed APKs on their own. The runtime version is the native
  // fingerprint, so an update that needs different native code is never delivered to an older APK.
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/feff0bb7-b40c-4bde-b14b-4a3328eb46dd',
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
});
