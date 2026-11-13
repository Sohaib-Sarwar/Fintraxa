import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type Extra = { supabaseUrl: string; supabaseKey: string; marketApi: string; webApp: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

function need(key: keyof Extra): string {
  const v = extra[key];
  // A missing value is a build fault; fail loudly instead of showing a confident "Rs 0".
  if (!v) throw new Error(`[Fintraxa] app.config.ts extra.${key} is missing`);
  return v;
}

export const env = {
  supabaseUrl: need('supabaseUrl'),
  supabaseKey: need('supabaseKey'),
  marketApi: need('marketApi').replace(/\/+$/, ''),
  webApp: need('webApp').replace(/\/+$/, ''),
};

/** Running inside the Expo Go app (not a development/preview/production build of Fintraxa). */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const isWeb = Platform.OS === 'web';
export const appVersion = Constants.expoConfig?.version ?? '1.0.0';
