import { create } from 'zustand';

export type PickerCard = { label: string; value: number; holders: { label: string; value: number }[] };

/**
 * Open state of the card-design picker. The picker is drawn by the tabs layout (so it can blur the whole
 * screen, nav included); Home's card opens it with the figures to show on every design.
 */
export const useCardPicker = create<{ card: PickerCard | null; open: (c: PickerCard) => void; close: () => void }>()((set) => ({
  card: null,
  open: (card) => set({ card }),
  close: () => set({ card: null }),
}));
