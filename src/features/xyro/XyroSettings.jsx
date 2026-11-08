import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Box, Typography, InputBase, IconButton, ButtonBase, CircularProgress, useTheme } from '@mui/material';
import { VisibilityRounded, VisibilityOffRounded, CheckCircleRounded, LockRounded, BoltRounded, RefreshRounded, MemoryRounded } from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { useFx, PillSelect } from '../../components/fx';
import { setApiKey, setModel, clearSessions, getSessions, useXyroConfig } from '../../lib/xyro/storage';
import { listModels } from '../../lib/xyro/gemini';
import { setCachedModels, clearCachedModels, getCachedModels, modelOptions } from '../../lib/xyro/models';
import { xyroTheme } from './theme';
import XyroOrb from './XyroOrb';

const mask = (key) => (key ? `${key.slice(0, 4)}${'•'.repeat(10)}${key.slice(-4)}` : '');

/**
 * Settings, Xyro AI: the user's own Gemini API key (kept on this device only),
 * the model (found from the key: the fastest one by default, changeable) and the chat history.
 */
export default function XyroSettings() {
  const t = useFx();
  const x = xyroTheme(useTheme().palette.mode);
  const user = useAuthStore((s) => s.user);
  const uid = user?.id;
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const { apiKey, model, hasKey } = useXyroConfig(uid);
  const [catalog, setCatalog] = useState(() => getCachedModels(uid)); // the models this key can use
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState(null);
  const [chats, setChats] = useState(() => getSessions(uid).length);
  const [verified, setVerified] = useState(false); // the tick, right after a key checks out


  const save = async () => {
    const key = draft.trim();
    if (!key) return setErr('Paste your API key');
    // Google issues more than one key format (AIza…, newer ones with dots); only spaces and very short strings are clearly wrong.
    if (/\s/.test(key) || key.length < 20) return setErr('That does not look like a complete API key. Copy it again from Google AI Studio.');
    setErr(null); setChecking(true);
    try {
      const list = await listModels(key);   // the check: Google lists models only for a working key
      setCatalog(setCachedModels(uid, list)); // and the same list tells Xyro which model is fastest
      setModel(uid, 'auto');
      setApiKey(uid, key);
      setDraft(''); setShow(false);
      setVerified(true);
      setTimeout(() => setVerified(false), 2600);
    } catch (e) {
      setErr(e.detail && e.code !== 'network' ? `${e.message} (Google: ${e.detail})` : e.message);
    } finally { setChecking(false); }
    return undefined;
  };
  const remove = () => showConfirm('Remove Gemini key', 'Xyro will stop answering on this device until you add a key again.', () => {
    setApiKey(uid, null); clearCachedModels(uid); setCatalog(null); setModel(uid, null); showSnackbar('Gemini key removed', 'success');
  });
  // Look for newer models (Google adds and retires them); a chosen model that is gone goes back to automatic.
  const refresh = async () => {
    setRefreshing(true);
    try {
      const next = setCachedModels(uid, await listModels(apiKey));
      setCatalog(next);
      if (model !== 'auto' && !next.ids.includes(model)) { setModel(uid, 'auto'); showSnackbar(`${model} is no longer available. Xyro is back on automatic.`, 'info'); }
      else showSnackbar('Model list updated', 'success');
    } catch (e) { showSnackbar(e.message, 'error'); } finally { setRefreshing(false); }
  };
  const options = modelOptions(catalog);
  const fastest = options[0] ?? null;
  const nameOf = (id) => catalog?.labels?.[id] ?? id;
  const checked = catalog?.at ? new Date(catalog.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  const inUse = model === 'auto' ? fastest : model;

  const clear = () => showConfirm('Clear chat history', 'Every Xyro chat saved on this device will be deleted. This cannot be undone.', () => {
    clearSessions(uid); setChats(0); showSnackbar('Chat history cleared', 'success');
  });

  const inputSx = { height: 42, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.86rem', color: t.ink, '&.Mui-focused': { borderColor: t.ink } };
  const label = (text) => <Box component="span" sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.muted }}>{text}</Box>;
  const pill = (text, onClick, opts = {}) => (
    <ButtonBase onClick={onClick} disabled={opts.disabled} sx={{
      height: 40, px: 2.25, borderRadius: 999, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', gap: 0.75,
      ...(opts.primary ? { bgcolor: t.inv, color: t.invInk } : { border: `1px solid ${t.border}`, color: opts.danger ? t.neg : t.ink }),
      opacity: opts.disabled ? 0.45 : 1,
    }}>{text}</ButtonBase>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '16px', background: x.wash, border: `1px solid ${t.border}` }}>
        <XyroOrb size={44} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: t.ink }}>Xyro, your money assistant</Typography>
          <Typography sx={{ fontSize: '0.74rem', color: t.ink2 }}>Ask about your income, spending, funds, shares and dividends in plain words.</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {label('Gemini API key')}
        <AnimatePresence>{verified && <Verified key="ok" />}</AnimatePresence>
        {hasKey ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ ...inputSx, display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 200 }}>
              <CheckCircleRounded sx={{ fontSize: 18, color: t.pos }} />
              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: t.ink2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{mask(apiKey)}</Box>
            </Box>
            {pill('Remove', remove, { danger: true })}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <InputBase type={show ? 'text' : 'password'} value={draft} onChange={(e) => { setDraft(e.target.value); setErr(null); }} placeholder="Paste your key"
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              inputProps={{ 'aria-label': 'Gemini API key', autoComplete: 'off', spellCheck: false, maxLength: 200 }}
              endAdornment={<IconButton size="small" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow((s) => !s)}>{show ? <VisibilityOffRounded sx={{ fontSize: 18 }} /> : <VisibilityRounded sx={{ fontSize: 18 }} />}</IconButton>}
              sx={{ ...inputSx, flex: 1, minWidth: 200 }} />
            {pill(checking ? <><CircularProgress size={14} sx={{ color: 'inherit' }} />Checking…</> : 'Save key', save, { primary: true, disabled: checking || !draft.trim() })}
          </Box>
        )}
        {err && <Typography sx={{ fontSize: '0.72rem', color: t.neg }}>{err}</Typography>}
        <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>
          Get a free key at Google AI Studio (aistudio.google.com, Get API key).
        </Typography>
      </Box>


      {hasKey && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {label('Model')}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: 480 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <PillSelect value={options.includes(model) || model === 'auto' ? model : 'auto'} onChange={(v) => setModel(uid, v)} label="Model" width="100%"
                items={[
                  { value: 'auto', label: fastest ? `Automatic: fastest (${fastest})` : 'Automatic: fastest available', icon: <BoltRounded sx={{ fontSize: 17, color: x.accent }} /> },
                  ...options.map((id) => ({ value: id, label: nameOf(id) === id ? id : `${nameOf(id)} (${id})`, icon: <MemoryRounded sx={{ fontSize: 16, color: t.muted }} /> })),
                ]} />
            </Box>
            <IconButton onClick={refresh} disabled={refreshing} aria-label="Check for newer models" title="Check for newer models" sx={{ border: `1px solid ${t.border}`, width: 34, height: 34 }}>
              {refreshing ? <CircularProgress size={15} /> : <RefreshRounded sx={{ fontSize: 18 }} />}
            </IconButton>
          </Box>
          {/* What is actually in use, in plain words. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 1, borderRadius: '12px', bgcolor: x.accentSoft, maxWidth: 480 }}>
            <BoltRounded sx={{ fontSize: 16, color: x.accent }} />
            <Typography sx={{ fontSize: '0.74rem', color: t.ink2, lineHeight: 1.45 }}>
              {inUse ? <>In use: <Box component="b" sx={{ color: t.ink }}>{nameOf(inUse)}</Box>{nameOf(inUse) !== inUse ? ` (${inUse})` : ''}. </> : 'Xyro will find the fastest model on your first question. '}
              {model === 'auto' ? 'Automatic keeps Xyro on the fastest model your key can use, even as Google adds or retires models.' : 'If this model is retired, Xyro falls back to the fastest available.'}
              {checked ? ` Checked ${checked}.` : ''}
            </Typography>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1.25, p: 1.5, borderRadius: '14px', bgcolor: t.surface2 }}>
        <LockRounded sx={{ fontSize: 18, color: t.muted, mt: 0.1 }} />
        <Typography sx={{ fontSize: '0.74rem', color: t.ink2, lineHeight: 1.55 }}>
          Your key is stored only in this browser on this device, never in Fintraxa’s database. When you ask Xyro a question, a summary of your Fintraxa data (transactions, holdings, dividends) and your chat go to Google Gemini with your key to produce the answer. Chats are saved on this device only.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', pt: 0.5, borderTop: `1px solid ${t.hairline}` }}>
        <Box sx={{ pt: 1 }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 650, color: t.ink }}>Chat history</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>{chats ? `${chats} chat${chats === 1 ? '' : 's'} saved on this device` : 'No saved chats'}</Typography>
        </Box>
        <Box sx={{ pt: 1 }}>{pill('Clear history', clear, { danger: true, disabled: !chats })}</Box>
      </Box>
    </Box>
  );
}

/** The key checked out: a circle draws itself, then the tick, then the words. */
function Verified() {
  const t = useFx();
  const reduce = useReducedMotion();
  const draw = (delay) => (reduce ? { duration: 0 } : { duration: 0.45, ease: 'easeOut', delay });
  return (
    <Box component={motion.div} role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      sx={{ overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, mb: 1, borderRadius: '14px', bgcolor: t.posSoft }}>
        <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden>
          <motion.circle cx="18" cy="18" r="15" fill="none" stroke={t.pos} strokeWidth="2.5" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw(0)} style={{ rotate: -90, transformOrigin: '50% 50%' }} />
          <motion.path d="M11 18.5 L16 23.5 L25.5 13" fill="none" stroke={t.pos} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw(0.35)} />
        </svg>
        <Box component={motion.div} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={draw(0.6)}>
          <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: t.pos }}>Key verified</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: t.ink2 }}>Xyro is ready. Open it from the orb at the bottom right.</Typography>
        </Box>
      </Box>
    </Box>
  );
}
