import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useApp } from '@/lib/store';
import { dark, light, type Palette } from './tokens';

const ThemeContext = createContext<Palette>(dark);

/** Dark is the default (OLED true black); "system" follows the phone; the user can force either. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const pref = useApp((s) => s.themePref);
  const palette = pref === 'light' || (pref === 'system' && scheme === 'light') ? light : dark;
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.bg).catch(() => {});
  }, [palette.bg]);
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
