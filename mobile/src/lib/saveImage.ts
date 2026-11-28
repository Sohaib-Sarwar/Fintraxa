/**
 * Save a view as a PNG in the phone's Gallery (owner, 2026-11-28: "download receipts as shown on screen").
 * The view is drawn exactly as it is on screen (react-native-view-shot), then handed to MediaStore through
 * expo-media-library's save, which needs no permission on Android 13+ (older Android asks for storage once).
 * The media-library config plugin is NOT used: it would add read access to all photos, which saving never needs.
 * Web: saveImage.web.ts.
 */
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform, type View } from 'react-native';
import type { ComponentRef } from 'react';
import { captureRef } from 'react-native-view-shot';

export type SaveResult = 'saved' | 'denied';

/** Where the image went, for the confirmation toast. */
export const SAVED_TO = 'Gallery';

export async function saveViewAsImage(view: ComponentRef<typeof View> | null, fileName: string): Promise<SaveResult> {
  if (!view) throw new Error('Nothing to save');
  if (Platform.OS === 'android' && Number(Platform.Version) < 33) {
    const p = await MediaLibrary.requestPermissionsAsync(true);
    if (!p.granted) return 'denied';
  }
  const uri = await captureRef(view as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile', fileName: fileName.replace(/\.png$/i, '') });
  await MediaLibrary.saveToLibraryAsync(uri.startsWith('file://') ? uri : `file://${uri}`);
  return 'saved';
}
