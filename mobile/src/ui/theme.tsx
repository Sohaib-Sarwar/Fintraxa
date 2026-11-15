import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useApp } from '@/lib/store';
import { dark, withAccent, type Palette } from './tokens';

const ThemeContext = createContext<Palette>(dark);

/** Dark only (owner, 2026-11-15: "only app theme is dark theme"), with the user's accent colour. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const accent = useApp((s) => s.accent);
  const custom = useApp((s) => s.customAccent);
  const palette = useMemo(() => withAccent(dark, accent, custom), [accent, custom]);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.bg).catch(() => {});
  }, [palette.bg]);
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
