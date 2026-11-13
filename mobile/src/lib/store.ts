/**
 * Device preferences (not secret, so plain AsyncStorage): theme, privacy mask, fingerprint flag, auto-lock,
 * "hide in recent apps", haptics, per-user onboarding and "since you last looked" marks.
 * Account-wide preferences (what the user tracks, auto-lock) are also synced to user_preferences.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'dark' | 'light';
export type Tracks = { spending: boolean; funds: boolean; stocks: boolean };
export const ALL_TRACKS: Tracks = { spending: true, funds: true, stocks: true };

/** What the user saw last time Today was open, to say what changed since (plan §5). */
export type LastSeen = { at: number; worth: number; stocks: number; funds: number; navDate: string | null; psxDate: string | null };

type State = {
  themePref: ThemePref;
  hideAmounts: boolean;
  biometricEnabled: boolean;
  /** Owner of the biometric flag, so another account on the same phone never inherits it. */
  biometricUser: string | null;
  autoLockMinutes: number;
  hideInRecents: boolean;
  haptics: boolean;
  tracks: Record<string, Tracks>;
  onboarded: Record<string, boolean>;
  biometricAsked: Record<string, boolean>;
  lastSeen: Record<string, LastSeen>;
  hydrated: boolean;
  set: (p: Partial<Omit<State, 'set' | 'hydrated'>>) => void;
  setTracks: (uid: string, t: Tracks) => void;
  markOnboarded: (uid: string) => void;
  markBiometricAsked: (uid: string) => void;
  setLastSeen: (uid: string, v: LastSeen) => void;
  forgetUser: (uid: string) => void;
};

export const useApp = create<State>()(
  persist(
    (set) => ({
      themePref: 'system',
      hideAmounts: false,
      biometricEnabled: false,
      biometricUser: null,
      autoLockMinutes: 5,
      hideInRecents: true,
      haptics: true,
      tracks: {},
      onboarded: {},
      biometricAsked: {},
      lastSeen: {},
      hydrated: false,
      set: (p) => set(p),
      setTracks: (uid, t) => set((s) => ({ tracks: { ...s.tracks, [uid]: t } })),
      markOnboarded: (uid) => set((s) => ({ onboarded: { ...s.onboarded, [uid]: true } })),
      markBiometricAsked: (uid) => set((s) => ({ biometricAsked: { ...s.biometricAsked, [uid]: true } })),
      setLastSeen: (uid, v) => set((s) => ({ lastSeen: { ...s.lastSeen, [uid]: v } })),
      forgetUser: (uid) => set((s) => {
        const drop = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== uid));
        return { lastSeen: drop(s.lastSeen), tracks: drop(s.tracks) };
      }),
    }),
    {
      name: 'fx.prefs.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _h, set: _s, setTracks: _t, markOnboarded: _o, markBiometricAsked: _b, setLastSeen: _l, forgetUser: _f, ...rest }) => rest,
      onRehydrateStorage: () => () => { useApp.setState({ hydrated: true }); },
    },
  ),
);

export const tracksFor = (uid: string | undefined) => (uid && useApp.getState().tracks[uid]) || ALL_TRACKS;
export function useTracks(uid: string | undefined): Tracks {
  return useApp((s) => (uid && s.tracks[uid]) || ALL_TRACKS);
}
