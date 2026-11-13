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
  userInterfaceStyle: 'automatic',
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
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    // Public by design (RLS decides what each user sees) — same values the web app ships in its bundle.
    supabaseUrl: 'https://qrekpudclwesajfhrokv.supabase.co',
    supabaseKey: 'sb_publishable_6N_yU1V4l76J3QIP6Md3BQ_4u5wW-4X',
    marketApi: 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api',
    webApp: 'https://fintraxa.vercel.app',
    router: { origin: false },
  },
});
