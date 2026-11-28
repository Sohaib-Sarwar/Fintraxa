/**
 * Web (/m): save a view as a PNG download. modern-screenshot draws the element through the browser's own renderer
 * (SVG foreignObject), so what downloads is what is on screen — fonts, gradients, object-fit and SVG logos
 * included (html2canvas gets object-fit and letter-spacing wrong). Images are inlined first; the stock logos are
 * same-origin on /m and served with CORS anyway. Scale 3 for a sharp image on any screen.
 */
import { domToPng } from 'modern-screenshot';
import type { ComponentRef } from 'react';
import type { View } from 'react-native';

export type SaveResult = 'saved' | 'denied';

export const SAVED_TO = 'Downloads';

export async function saveViewAsImage(view: ComponentRef<typeof View> | null, fileName: string): Promise<SaveResult> {
  const el = view as unknown as HTMLElement | null;
  if (!el || typeof el.getBoundingClientRect !== 'function') throw new Error('Nothing to save');
  await document.fonts?.ready;
  const url = await domToPng(el, { scale: 3, backgroundColor: getComputedStyle(el).backgroundColor || '#000000' });
  const a = document.createElement('a');
  a.download = /\.png$/i.test(fileName) ? fileName : `${fileName}.png`;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'saved';
}
