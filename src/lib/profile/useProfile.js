/**
 * The signed-in user's profile (public.profiles), avatar (private `avatars`
 * bucket, read through short-lived signed URLs) and password change.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';

export const USERNAME_RE = /^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/;
const EMPTY = { username: null, full_name: null, date_of_birth: null, filer_status: 'filer', zakat_exempt: false, avatar_path: null };

export function useProfile() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('username, full_name, date_of_birth, filer_status, zakat_exempt, avatar_path').eq('user_id', user.id).maybeSingle();
      if (error) {
        if (['42P01', 'PGRST205'].includes(error.code)) return { ...EMPTY }; // older database: defaults
        throw error;
      }
      return data ?? { ...EMPTY };
    },
  });
}

/** Age in whole years from an ISO date of birth, or null. */
export function ageFrom(dob, today = new Date()) {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

/** Validate the profile form; returns a message or null. */
export function validateProfile(f) {
  if (f.username && !USERNAME_RE.test(f.username)) return 'Username: 3 to 24 lowercase letters, numbers, dots or underscores; start and end with a letter or number';
  if (f.full_name && f.full_name.trim().length > 80) return 'Keep your name under 80 characters';
  if (f.date_of_birth) {
    const age = ageFrom(f.date_of_birth);
    if (age === null || age < 13 || age > 120) return 'Enter a real date of birth (age 13 to 120)';
  }
  return null;
}

function useRefreshProfile() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['profile'] });
}

export function useSaveProfile() {
  const user = useAuthStore((s) => s.user);
  const refresh = useRefreshProfile();
  return useMutation({
    mutationFn: async (patch) => {
      const row = { user_id: user.id, ...patch };
      if ('username' in row) row.username = row.username ? row.username.trim().toLowerCase() : null;
      if ('full_name' in row) row.full_name = row.full_name?.trim() || null;
      if ('date_of_birth' in row) row.date_of_birth = row.date_of_birth || null;
      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' });
      if (error) {
        if (error.code === '23505') throw Object.assign(new Error('That username is taken. Try another.'), { friendly: true });
        throw error;
      }
    },
    onSuccess: refresh,
  });
}

/** Is this username free? (Signed-in users only; the unique index is the real guard.) */
export async function usernameAvailable(name) {
  const { data, error } = await supabase.rpc('username_available', { p_username: name });
  if (error) throw error;
  return data === true;
}

/** Signed URL for the avatar (private bucket), refreshed before it expires. */
export function useAvatarUrl(path) {
  return useQuery({
    queryKey: ['avatar-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Square-crop and shrink a picture to a 256 px WebP in the browser before upload. */
async function toAvatarWebp(file) {
  if (!/^image\/(png|jpe?g|webp|heic|heif)$/i.test(file.type)) throw Object.assign(new Error('Choose a JPG, PNG or WebP picture'), { friendly: true });
  if (file.size > 15 * 1024 * 1024) throw Object.assign(new Error('That picture is larger than 15 MB'), { friendly: true });
  const bitmap = await createImageBitmap(file).catch(() => { throw Object.assign(new Error('That picture could not be read'), { friendly: true }); });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) throw Object.assign(new Error('That picture could not be converted'), { friendly: true });
  return blob;
}

export function useUploadAvatar() {
  const user = useAuthStore((s) => s.user);
  const refresh = useRefreshProfile();
  return useMutation({
    mutationFn: async ({ file, previous }) => {
      const blob = await toAvatarWebp(file);
      const path = `${user.id}/avatar-${Date.now()}.webp`; // a new name each time: no stale caches
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/webp', upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from('profiles').upsert({ user_id: user.id, avatar_path: path }, { onConflict: 'user_id' });
      if (error) { await supabase.storage.from('avatars').remove([path]); throw error; }
      if (previous && previous !== path) await supabase.storage.from('avatars').remove([previous]); // best effort
      return path;
    },
    onSuccess: refresh,
  });
}

export function useRemoveAvatar() {
  const user = useAuthStore((s) => s.user);
  const refresh = useRefreshProfile();
  return useMutation({
    mutationFn: async (path) => {
      const { error } = await supabase.from('profiles').upsert({ user_id: user.id, avatar_path: null }, { onConflict: 'user_id' });
      if (error) throw error;
      if (path) await supabase.storage.from('avatars').remove([path]);
    },
    onSuccess: refresh,
  });
}

/** Change the password after confirming the current one (re-signing in with it). */
export function useChangePassword() {
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: async ({ current, next }) => {
      if (!user?.email) throw Object.assign(new Error('Your account has no email to verify against'), { friendly: true });
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (verifyErr) throw Object.assign(new Error('Your current password is not right'), { friendly: true });
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw Object.assign(new Error(error.message?.includes('different') ? 'Choose a password different from the current one' : 'Could not change the password. Try again.'), { friendly: true });
    },
  });
}

/** Rules for a new password; returns a message or null. */
export function validatePassword(next, confirm) {
  if (!next || next.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return 'Use letters and at least one number';
  if (next !== confirm) return 'The two new passwords do not match';
  return null;
}
