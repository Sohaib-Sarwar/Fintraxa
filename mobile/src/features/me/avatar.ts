/**
 * Profile photo: pick from the gallery (square crop), upload to the private `avatars` bucket under a new name
 * each time (no stale caches), point profiles.avatar_path at it, remove the previous file — the web's rules
 * (src/lib/profile/useProfile.js).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { friendlyError } from '@/data/mutations';
import { useProfile, useUid } from '@/data/queries';
import { supabase } from '@/lib/supabase';
import { toast } from '@/ui/feedback';

export function useAvatarUpload() {
  const uid = useUid();
  const qc = useQueryClient();
  const profile = useProfile();
  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (r.canceled || !r.assets?.length) return false;
      const a = r.assets[0];
      // Web build: the picker returns a blob/data URI and expo-file-system has no web File — read it with fetch.
      const bytes = Platform.OS === 'web' ? await (await fetch(a.uri)).arrayBuffer() : await new File(a.uri).arrayBuffer();
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('That photo is larger than 5 MB.');
      const ext = a.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `${uid}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, bytes, { contentType: a.mimeType ?? 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from('profiles').upsert({ user_id: uid, avatar_path: path }, { onConflict: 'user_id' });
      if (error) { await supabase.storage.from('avatars').remove([path]); throw error; }
      const previous = profile.data?.avatar_path;
      if (previous && previous !== path) await supabase.storage.from('avatars').remove([previous]).catch(() => {});
      return true;
    },
    onSuccess: (changed) => {
      if (!changed) return;
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast('Profile photo updated');
    },
    onError: (e) => toast(e instanceof Error && /larger/.test(e.message) ? e.message : friendlyError(e), { tone: 'error' }),
  });
}

/** Same rules as the web's validateProfile / useSaveProfile (src/lib/profile/useProfile.js). */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/;
export type ProfilePatch = { full_name?: string | null; username?: string | null; filer_status?: 'filer' | 'non_filer' };

export function validateProfile(f: ProfilePatch): string | null {
  if (f.username && !USERNAME_RE.test(f.username.trim().toLowerCase())) return 'Username: 3–24 lowercase letters, numbers, dots or underscores.';
  if (f.full_name && f.full_name.trim().length > 80) return 'Keep your name under 80 characters.';
  return null;
}

export function useSaveProfile() {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const row: Record<string, unknown> = { user_id: uid, ...patch };
      if ('username' in patch) row.username = patch.username ? patch.username.trim().toLowerCase() : null;
      if ('full_name' in patch) row.full_name = patch.full_name?.trim() || null;
      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' });
      if (error) {
        if (error.code === '23505') throw new Error('That username is taken. Try another.');
        throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); toast('Profile saved'); },
    onError: (e) => toast(e instanceof Error && /taken/.test(e.message) ? e.message : friendlyError(e), { tone: 'error' }),
  });
}
