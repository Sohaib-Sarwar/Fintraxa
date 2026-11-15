import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { create } from 'zustand';

// Expo Router 58's tab bar props: { state, descriptors, emitter, navigateToTab, insets } — no `navigation`.
export type BarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * Hands the navigator's tab-bar props to the nav, which is drawn OUTSIDE the navigator (owner, 2026-11-14: Apple
 * glass nav). On Android a blur can only show content drawn outside its `BlurTargetView`, and the navigator is
 * that target — so the navigator renders a bridge that publishes its props here, and the real bar reads them.
 */
export const useTabBarProps = create<{ props: BarProps | null; set: (p: BarProps) => void }>()((set) => ({
  props: null,
  set: (props) => set({ props }),
}));
