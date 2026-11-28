/**
 * App entry. Before Expo Router starts, an installed Android build registers the home-screen widget's background
 * task and settings screen (src/features/widget/register.tsx): Android can run them without opening the app.
 * Expo Go and the web build have no widget module, so they skip it.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

if (Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  require('./src/features/widget/register');
}

require('expo-router/entry');
