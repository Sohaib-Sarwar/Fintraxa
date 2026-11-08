import { useEffect, useRef, useState } from 'react';
import { Box, Dialog, Typography, IconButton, ButtonBase, InputBase, Avatar, Switch, Menu, MenuItem, CircularProgress, useMediaQuery } from '@mui/material';
import {
  CloseRounded, PhotoCameraRounded, PersonRounded, AccountBalanceWalletRounded, AccountBalanceRounded, CategoryRounded, LockRounded, AutoAwesomeRounded,
  PowerSettingsNewRounded, CheckCircleRounded, ErrorOutlineRounded, VisibilityRounded, VisibilityOffRounded,
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { useAppStore, CURRENCIES } from '../../store/appStore';
import { describeDbError, dbErrorHandler } from '../../lib/dbErrors';
import {
  useProfile, useSaveProfile, useAvatarUrl, useUploadAvatar, useRemoveAvatar, useChangePassword,
  usernameAvailable, validateProfile, validatePassword, ageFrom, USERNAME_RE,
} from '../../lib/profile/useProfile';
import { useFx, Seg, PillSelect, FONT_NUM } from '../../components/fx';
import { SavingsAccountsManager } from '../income-expense/SavingsAccountsDialog';
import CategoriesManager from './CategoriesManager';
import XyroSettings from '../xyro/XyroSettings';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: PersonRounded },
  { id: 'tax', label: 'Tax & preferences', icon: AccountBalanceWalletRounded },
  { id: 'accounts', label: 'Savings accounts', icon: AccountBalanceRounded },
  { id: 'categories', label: 'Categories', icon: CategoryRounded },
  { id: 'xyro', label: 'Xyro AI', icon: AutoAwesomeRounded },
  { id: 'security', label: 'Security', icon: LockRounded },
];
const today = () => new Date().toISOString().slice(0, 10);

/** Settings: a compact window. Your picture and sections on the left, the section on the right. */
export default function SettingsDialog({ open, onClose, initialSection = 'profile' }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const { data: profile } = useProfile();
  const { data: avatarUrl } = useAvatarUrl(profile?.avatar_path);
  const upload = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const [section, setSection] = useState(initialSection);
  const [menu, setMenu] = useState(null);
  const fileRef = useRef(null);

  const name = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'You';
  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    upload.mutate({ file, previous: profile?.avatar_path }, {
      onSuccess: () => showSnackbar('Picture updated', 'success'),
      onError: (err) => showSnackbar(err.friendly ? err.message : describeDbError(err), 'error'),
    });
  };
  const handleSignOut = async () => {
    onClose();
    try { await signOut(); } catch { showSnackbar('Signed out on this device, but the server could not be reached.', 'warning'); }
  };

  const avatar = (size) => (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <Avatar src={avatarUrl || undefined} alt={name} sx={{ width: size, height: size, fontSize: size * 0.38, fontWeight: 700, bgcolor: t.inv, color: t.invInk }}>
        {name.slice(0, 1).toUpperCase()}
      </Avatar>
      <IconButton aria-label="Change picture" onClick={(e) => (profile?.avatar_path ? setMenu(e.currentTarget) : fileRef.current?.click())} disabled={upload.isPending}
        sx={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, bgcolor: t.surface, border: `1px solid ${t.border}`, boxShadow: t.shadow, '&:hover': { bgcolor: t.surface2 } }}>
        {upload.isPending ? <CircularProgress size={14} /> : <PhotoCameraRounded sx={{ fontSize: 15 }} />}
      </IconButton>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickFile} />
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { borderRadius: '12px', minWidth: 170 } } }}>
        <MenuItem onClick={() => { setMenu(null); fileRef.current?.click(); }} sx={{ fontSize: '0.8rem' }}>Upload a new picture</MenuItem>
        <MenuItem onClick={() => { setMenu(null); removeAvatar.mutate(profile.avatar_path, { onSuccess: () => showSnackbar('Picture removed', 'success'), onError: dbErrorHandler(showSnackbar, 'Could not remove the picture') }); }}
          sx={{ fontSize: '0.8rem', color: t.neg }}>Remove picture</MenuItem>
      </Menu>
    </Box>
  );

  const nav = SECTIONS.map((s) => {
    const on = s.id === section;
    const Icon = s.icon;
    return (
      <ButtonBase key={s.id} onClick={() => setSection(s.id)} aria-current={on ? 'page' : undefined}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.1, justifyContent: 'flex-start', width: isMobile ? 'auto' : '100%', flexShrink: 0,
          px: 1.25, py: 0.9, borderRadius: '12px', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: on ? 700 : 550,
          bgcolor: on ? t.inv : 'transparent', color: on ? t.invInk : t.ink2, '&:hover': { bgcolor: on ? t.inv : t.surface2 },
        }}>
        <Icon sx={{ fontSize: 18 }} />{s.label}
      </ButtonBase>
    );
  });
  const current = SECTIONS.find((s) => s.id === section);

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isMobile} maxWidth={false}
      slotProps={{ paper: { sx: { width: isMobile ? '100%' : 'min(920px, 94vw)', height: isMobile ? '100%' : 'min(640px, 90dvh)', m: 0, borderRadius: isMobile ? 0 : '24px', bgcolor: t.surface, backgroundImage: 'none', overflow: 'hidden', display: 'flex', flexDirection: isMobile ? 'column' : 'row' } } }}>
      {/* Left rail (top block on mobile) */}
      <Box sx={{ width: isMobile ? '100%' : 260, flexShrink: 0, bgcolor: t.surface2, borderRight: isMobile ? 0 : `1px solid ${t.hairline}`, borderBottom: isMobile ? `1px solid ${t.hairline}` : 0,
        display: 'flex', flexDirection: 'column', p: isMobile ? 1.5 : 2.25 }}>
        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: isMobile ? 1.5 : 0, textAlign: isMobile ? 'left' : 'center', mb: isMobile ? 1.25 : 2.5 }}>
          {avatar(isMobile ? 56 : 88)}
          <Box sx={{ minWidth: 0, flex: isMobile ? 1 : 'none', mt: isMobile ? 0 : 1.5 }}>
            <Typography noWrap sx={{ fontSize: '1rem', fontWeight: 750 }}>{name}</Typography>
            <Typography noWrap sx={{ fontSize: '0.74rem', color: t.muted }}>{profile?.username ? `@${profile.username}` : user?.email}</Typography>
            {profile?.username && <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{user?.email}</Typography>}
          </Box>
          {isMobile && <IconButton aria-label="Close settings" onClick={onClose}><CloseRounded /></IconButton>}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 0.5, overflowX: isMobile ? 'auto' : 'visible', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>{nav}</Box>
        {!isMobile && (
          <ButtonBase onClick={handleSignOut} sx={{ mt: 'auto', gap: 1, justifyContent: 'flex-start', px: 1.25, py: 0.9, borderRadius: '12px', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, color: t.neg, '&:hover': { bgcolor: t.negSoft } }}>
            <PowerSettingsNewRounded sx={{ fontSize: 18 }} />Sign out
          </ButtonBase>
        )}
      </Box>

      {/* Section */}
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {!isMobile && (
          <Box sx={{ display: 'flex', alignItems: 'center', px: 3, pt: 2.5, pb: 1.5, flexShrink: 0 }}>
            <Typography component="h2" sx={{ fontSize: '1.15rem', fontWeight: 750, flex: 1 }}>{current.label}</Typography>
            <IconButton aria-label="Close settings" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
          </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: isMobile ? 2 : 3, pb: 3, pt: isMobile ? 2 : 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          {section === 'profile' && <ProfileSection />}
          {section === 'tax' && <TaxSection />}
          {section === 'accounts' && <SavingsAccountsManager />}
          {section === 'categories' && <CategoriesManager />}
          {section === 'xyro' && <XyroSettings />}
          {section === 'security' && <SecuritySection onSignOut={handleSignOut} />}
        </Box>
      </Box>
    </Dialog>
  );
}

function Field({ label, hint, children }) {
  const t = useFx();
  return (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.muted }}>{label}</Box>
      {children}
      {hint && <Box component="span" sx={{ fontSize: '0.68rem', color: t.muted }}>{hint}</Box>}
    </Box>
  );
}

function useInputSx() {
  const t = useFx();
  return { height: 42, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.86rem', color: t.ink, '&.Mui-focused': { borderColor: t.ink }, '&.Mui-disabled': { opacity: 0.7 }, '& input': { colorScheme: 'inherit' } };
}

function SaveBar({ dirty, pending, onSave, onReset, label = 'Save changes' }) {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2.5 }}>
      {dirty && <ButtonBase onClick={onReset} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Discard</ButtonBase>}
      <ButtonBase onClick={onSave} disabled={!dirty || pending} sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: !dirty || pending ? 0.4 : 1 }}>
        {pending ? 'Saving…' : label}
      </ButtonBase>
    </Box>
  );
}

function ProfileSection() {
  const t = useFx();
  const inputSx = useInputSx();
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const { data: profile } = useProfile();
  const save = useSaveProfile();
  const initial = { full_name: profile?.full_name ?? '', username: profile?.username ?? '', date_of_birth: profile?.date_of_birth ?? '' };
  const [f, setF] = useState(initial);
  const [check, setCheck] = useState(null); // null | 'checking' | 'free' | 'taken'
  const [err, setErr] = useState(null);
  const loadedKey = `${profile?.full_name}|${profile?.username}|${profile?.date_of_birth}`;
  const [seen, setSeen] = useState(loadedKey);
  if (seen !== loadedKey) { setSeen(loadedKey); setF(initial); } // the profile arrived or changed elsewhere
  const dirty = f.full_name !== initial.full_name || f.username !== initial.username || f.date_of_birth !== initial.date_of_birth;
  const uname = f.username.trim().toLowerCase();

  // Availability, checked a moment after typing stops.
  useEffect(() => {
    if (!uname || uname === (profile?.username ?? '') || !USERNAME_RE.test(uname)) return undefined;
    let live = true;
    const id = setTimeout(() => {
      setCheck('checking');
      usernameAvailable(uname).then((ok) => { if (live) setCheck(ok ? 'free' : 'taken'); }).catch(() => { if (live) setCheck(null); });
    }, 400);
    return () => { live = false; clearTimeout(id); };
  }, [uname, profile?.username]);
  const showCheck = uname && uname !== (profile?.username ?? '') && USERNAME_RE.test(uname) ? check : null;

  const submit = () => {
    const problem = validateProfile({ ...f, username: uname });
    if (problem) return setErr(problem);
    if (showCheck === 'taken') return setErr('That username is taken. Try another.');
    setErr(null);
    return save.mutate({ full_name: f.full_name, username: uname || null, date_of_birth: f.date_of_birth }, {
      onSuccess: () => showSnackbar('Profile saved', 'success'),
      onError: (e) => (e.friendly ? setErr(e.message) : dbErrorHandler(showSnackbar, 'Could not save your profile')(e)),
    });
  };
  const age = ageFrom(f.date_of_birth);

  return (
    <Box sx={{ display: 'grid', gap: 1.75, maxWidth: 520 }}>
      <Field label="Full name"><InputBase value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} inputProps={{ maxLength: 80, autoComplete: 'name' }} sx={inputSx} /></Field>
      <Field label="Username" hint={showCheck === 'taken' ? null : 'You can sign in with it instead of your email.'}>
        <InputBase value={f.username} onChange={(e) => { setCheck(null); setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }); }} inputProps={{ maxLength: 24, autoComplete: 'username', spellCheck: false }}
          startAdornment={<Box component="span" sx={{ color: t.muted, mr: 0.25 }}>@</Box>}
          endAdornment={showCheck === 'checking' ? <CircularProgress size={14} /> : showCheck === 'free' ? <CheckCircleRounded sx={{ fontSize: 18, color: t.pos }} /> : showCheck === 'taken' ? <ErrorOutlineRounded sx={{ fontSize: 18, color: t.neg }} /> : null}
          sx={inputSx} />
        {showCheck === 'taken' && <Box component="span" sx={{ fontSize: '0.68rem', color: t.neg }}>That username is taken.</Box>}
      </Field>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
        <Field label="Date of birth" hint={age !== null && age >= 0 ? `${age} years old` : null}>
          <InputBase type="date" value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} inputProps={{ max: today(), min: '1900-01-01' }} sx={inputSx} />
        </Field>
        <Field label="Email" hint="Used to sign in and to recover your account.">
          <InputBase value={user?.email ?? ''} disabled sx={inputSx} />
        </Field>
      </Box>
      {err && <Typography sx={{ fontSize: '0.76rem', color: t.neg }}>{err}</Typography>}
      <SaveBar dirty={dirty} pending={save.isPending} onSave={submit} onReset={() => { setF(initial); setErr(null); }} />
    </Box>
  );
}

function TaxSection() {
  const t = useFx();
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const { data: profile } = useProfile();
  const save = useSaveProfile();
  const filer = profile?.filer_status ?? 'filer';
  const update = (patch, msg) => save.mutate(patch, { onSuccess: () => showSnackbar(msg, 'success'), onError: dbErrorHandler(showSnackbar, 'Could not save') });
  const changeCurrency = async (code) => {
    try {
      await setCurrency(code, user?.id);
      await useAppStore.getState().fetchExchangeRates();
      showSnackbar('Currency updated', 'success');
    } catch (err) {
      showSnackbar(describeDbError(err), 'error');
    }
  };
  const row = (label, a, b) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px', gap: 1, py: 0.6, fontSize: '0.76rem', borderTop: `1px solid ${t.hairline}` }}>
      <span>{label}</span>
      <Box component="span" sx={{ fontFamily: FONT_NUM, textAlign: 'right', fontWeight: filer === 'filer' ? 700 : 400, color: filer === 'filer' ? t.ink : t.muted }}>{a}</Box>
      <Box component="span" sx={{ fontFamily: FONT_NUM, textAlign: 'right', fontWeight: filer === 'non_filer' ? 700 : 400, color: filer === 'non_filer' ? t.ink : t.muted }}>{b}</Box>
    </Box>
  );
  const card = { p: 1.75, borderRadius: '16px', border: `1px solid ${t.border}` };

  return (
    <Box sx={{ display: 'grid', gap: 1.5, maxWidth: 560 }}>
      <Box sx={card}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontSize: '0.86rem', fontWeight: 700 }}>Filer status</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>On FBR&apos;s Active Taxpayer List. Sets the tax Fintraxa expects on your income.</Typography>
          </Box>
          <Seg size="sm" label="Filer status" value={filer} onChange={(v) => update({ filer_status: v }, v === 'filer' ? 'Marked as an active filer' : 'Marked as a non-filer')}
            options={[{ value: 'filer', label: 'Active filer' }, { value: 'non_filer', label: 'Non-filer' }]} />
        </Box>
        <Box sx={{ mt: 1.25 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px', gap: 1, pb: 0.5, fontSize: '0.66rem', fontWeight: 600, color: t.muted }}>
            <span>Withholding on</span><Box component="span" sx={{ textAlign: 'right' }}>Filer</Box><Box component="span" sx={{ textAlign: 'right' }}>Non-filer</Box>
          </Box>
          {row('Dividends', '15%', '30%')}
          {row('Bank profit (savings)', '20%', '40%')}
          {row('Mutual fund gains (CGT)', '15%', '30%')}
        </Box>
        <Typography sx={{ fontSize: '0.66rem', color: t.muted, mt: 1 }}>New savings accounts start at your rate; existing ones keep theirs.</Typography>
      </Box>

      <Box sx={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '0.86rem', fontWeight: 700 }}>Zakat exemption</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>You have filed a CZ-50 declaration, so banks and companies do not deduct zakat.</Typography>
        </Box>
        <Switch checked={!!profile?.zakat_exempt} onChange={(e) => update({ zakat_exempt: e.target.checked }, e.target.checked ? 'Zakat exemption on' : 'Zakat exemption off')} inputProps={{ 'aria-label': 'Zakat exemption' }} />
      </Box>

      <Box sx={{ ...card, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, alignItems: 'end' }}>
        <Box>
          <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, mb: 0.75 }}>Currency</Typography>
          <PillSelect value={currency} onChange={changeCurrency} label="Currency" width="100%"
            items={Object.entries(CURRENCIES).map(([code, info]) => ({ value: code, label: `${info.symbol}  ${code}, ${info.name}` }))} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, mb: 0.75 }}>Appearance</Typography>
          <Seg size="sm" label="Theme" value={themeMode} onChange={setThemeMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Box>
      </Box>
    </Box>
  );
}

function SecuritySection({ onSignOut }) {
  const t = useFx();
  const inputSx = useInputSx();
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const { data: profile } = useProfile();
  const change = useChangePassword();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(null);
  const submit = () => {
    if (!f.current) return setErr('Enter your current password');
    const problem = validatePassword(f.next, f.confirm);
    if (problem) return setErr(problem);
    setErr(null);
    return change.mutate({ current: f.current, next: f.next }, {
      onSuccess: () => { showSnackbar('Password changed', 'success'); setF({ current: '', next: '', confirm: '' }); },
      onError: (e) => setErr(e.friendly ? e.message : 'Could not change the password. Try again.'),
    });
  };
  const eye = (
    <IconButton size="small" aria-label={show ? 'Hide passwords' : 'Show passwords'} onClick={() => setShow((s) => !s)}>
      {show ? <VisibilityOffRounded sx={{ fontSize: 17 }} /> : <VisibilityRounded sx={{ fontSize: 17 }} />}
    </IconButton>
  );
  const pwd = (k, label, auto) => (
    <Field label={label}>
      <InputBase type={show ? 'text' : 'password'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputProps={{ autoComplete: auto, maxLength: 128 }} endAdornment={k === 'current' ? eye : null} sx={inputSx} />
    </Field>
  );
  return (
    <Box sx={{ display: 'grid', gap: 1.75, maxWidth: 520 }}>
      <Box sx={{ p: 1.75, borderRadius: '16px', border: `1px solid ${t.border}` }}>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, mb: 1.25 }}>Change password</Typography>
        <Box sx={{ display: 'grid', gap: 1.25 }}>
          {pwd('current', 'Current password', 'current-password')}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
            {pwd('next', 'New password', 'new-password')}
            {pwd('confirm', 'Repeat new password', 'new-password')}
          </Box>
          <Typography sx={{ fontSize: '0.68rem', color: t.muted }}>At least 8 characters, with letters and a number.</Typography>
        </Box>
        {err && <Typography sx={{ fontSize: '0.76rem', color: t.neg, mt: 1 }}>{err}</Typography>}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
          <ButtonBase onClick={submit} disabled={change.isPending || !f.current || !f.next} sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: change.isPending || !f.current || !f.next ? 0.4 : 1 }}>
            {change.isPending ? 'Changing…' : 'Change password'}
          </ButtonBase>
        </Box>
      </Box>
      <Box sx={{ p: 1.75, borderRadius: '16px', border: `1px solid ${t.border}` }}>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: 700 }}>Sign in with your username</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: t.muted, mt: 0.25 }}>
          {profile?.username ? `You can sign in as @${profile.username} or with your email. After five wrong passwords, username sign-in pauses for 15 minutes.` : 'Set a username under Profile to sign in with it instead of your email.'}
        </Typography>
      </Box>
      <ButtonBase onClick={onSignOut} sx={{ justifySelf: 'start', gap: 1, height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, color: t.neg, fontFamily: 'inherit' }}>
        <PowerSettingsNewRounded sx={{ fontSize: 17 }} />Sign out of this device
      </ButtonBase>
    </Box>
  );
}
