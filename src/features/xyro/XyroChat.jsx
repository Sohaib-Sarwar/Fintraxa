import { useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, InputBase, ButtonBase, Tooltip, Menu, MenuItem, ListItemIcon, useTheme } from '@mui/material';
import {
  CloseRounded, OpenInFullRounded, CloseFullscreenRounded, AddRounded, ArrowUpwardRounded, StopRounded,
  BarChartRounded, ReceiptLongRounded, AccountBalanceWalletRounded, PaymentsRounded, ContentCopyRounded, CheckRounded,
  ChatBubbleOutlineRounded, DeleteOutlineRounded, KeyRounded, EditNoteRounded, StorageRounded, ShieldOutlined, BoltRounded,
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { useFx, FONT_TEXT } from '../../components/fx';
import { useXyroConfig } from '../../lib/xyro/storage';
import { useXyroData } from '../../lib/xyro/useXyroData';
import { useXyroChat } from './useXyroChat';
import { modelsFor } from '../../lib/xyro/models';
import { xyroTheme, SERIF } from './theme';
import XyroOrb from './XyroOrb';
import Markdown from './Markdown';

const SUGGESTIONS = [
  { text: 'What did I earn in June?', icon: BarChartRounded },
  { text: 'Where did my money go this month?', icon: ReceiptLongRounded },
  { text: 'What is my net worth now?', icon: AccountBalanceWalletRounded },
  { text: 'How much did I get in dividends this year?', icon: PaymentsRounded },
];
const FOLLOW_UPS = ['Compare it with the month before', 'Break it down by category', 'And for this fiscal year?', 'What were my biggest expenses?'];
const openSettings = () => window.dispatchEvent(new CustomEvent('fintraxa:open-settings', { detail: { tab: 'xyro' } }));
const when = (ms) => {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** The chat itself: header, conversation (or the welcome), and the input. */
export default function XyroChat({ expanded, onToggleExpand, onClose, isMobile }) {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const x = xyroTheme(mode);
  const user = useAuthStore((s) => s.user);
  const { apiKey, model, hasKey } = useXyroConfig(user?.id);
  const { system, data, loading } = useXyroData();
  const chat = useXyroChat({ uid: user?.id, apiKey, model, system, data });
  const [input, setInput] = useState('');
  const [menu, setMenu] = useState(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const stick = useRef(true);
  const ready = hasKey && !!system;

  useEffect(() => { if (!isMobile) inputRef.current?.focus(); }, [isMobile, chat.activeId]);
  // Warm up while the user is still typing: open the connection to Google and make sure the model list is ready.
  useEffect(() => {
    if (!apiKey) return;
    const href = 'https://generativelanguage.googleapis.com';
    if (!document.querySelector(`link[rel="preconnect"][href="${href}"]`)) {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = href; l.crossOrigin = 'anonymous';
      document.head.appendChild(l);
    }
    modelsFor(user?.id, apiKey).catch(() => {});
  }, [apiKey, user?.id]);
  // Follow the answer as it streams, unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  const submit = (text = input) => {
    if (!ready || chat.busy || !String(text).trim()) return;
    stick.current = true;
    chat.send(text);
    setInput('');
  };
  const last = chat.messages.at(-1);
  const showFollowUps = !chat.busy && last?.role === 'model' && !last.error;

  const iconBtn = { color: t.ink2, '&:hover': { bgcolor: t.hover } };
  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, pt: 1.75, pb: 1.25, flexShrink: 0 }}>
      <XyroOrb size={38} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 750, letterSpacing: '0.02em', color: t.ink, lineHeight: 1.15 }}>Xyro</Typography>
        <Typography noWrap sx={{ fontSize: '0.72rem', color: t.muted }}>{loading ? 'Reading your data…' : 'Your Fintraxa money assistant'}</Typography>
      </Box>
      {/* What Xyro answers from: your own data, live. */}
      <Tooltip title={loading ? 'Reading your Fintraxa data' : 'Answers come from your Fintraxa data'} arrow>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, height: 28, px: 1, borderRadius: 999, bgcolor: x.accentSoft, color: x.accent }}>
          <StorageRounded sx={{ fontSize: 14 }} />
          <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: loading ? t.warn : t.pos, boxShadow: `0 0 0 3px ${loading ? t.warnSoft : t.posSoft}` }} />
        </Box>
      </Tooltip>
      {!isMobile && (
        <Tooltip title={expanded ? 'Back to side window' : 'Expand'} arrow>
          <IconButton size="small" onClick={onToggleExpand} aria-label={expanded ? 'Collapse to side window' : 'Expand to full window'} sx={iconBtn}>
            {expanded ? <CloseFullscreenRounded sx={{ fontSize: 18 }} /> : <OpenInFullRounded sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Close" arrow>
        <IconButton size="small" onClick={onClose} aria-label="Close Xyro" sx={iconBtn}><CloseRounded sx={{ fontSize: 20 }} /></IconButton>
      </Tooltip>
    </Box>
  );

  const welcome = (
    <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: { xs: 3, sm: expanded ? 6 : 4 }, pb: 2, maxWidth: expanded ? 640 : 'none', mx: 'auto', width: '100%' }}>
      <Typography sx={{ fontSize: '0.62rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: t.muted, mb: { xs: 3, sm: 5 } }}>
        Turn your numbers into answers
      </Typography>
      <Typography component="h2" sx={{ fontFamily: SERIF, fontWeight: 500, fontSize: expanded ? '2.6rem' : '2.1rem', lineHeight: 1.08, letterSpacing: '-0.02em', color: t.ink }}>
        Hi, I’m Xyro.
        <Box component="span" sx={{ display: 'block', color: x.accent }}>How can I help you today?</Box>
      </Typography>
      {hasKey ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mt: 3 }}>
          {SUGGESTIONS.map((s) => <Suggestion key={s.text} s={s} x={x} disabled={!ready || chat.busy} onPick={submit} />)}
        </Box>
      ) : (
        <Box sx={{ mt: 3, p: 1.75, borderRadius: '16px', bgcolor: x.chip, border: `1px solid ${x.chipBorder}`, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <KeyRounded sx={{ fontSize: 20, color: x.accent, mt: 0.25 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.84rem', fontWeight: 650, color: t.ink }}>Connect Xyro to start</Typography>
            <Typography sx={{ fontSize: '0.74rem', color: t.muted, mt: 0.25 }}>Add your API key in Settings, Xyro AI. It stays on this device.</Typography>
            <ButtonBase onClick={openSettings} sx={{ mt: 1.25, height: 34, px: 1.75, borderRadius: 999, bgcolor: x.accent, color: x.accentInk, fontSize: '0.76rem', fontWeight: 650, fontFamily: 'inherit' }}>
              Open settings
            </ButtonBase>
          </Box>
        </Box>
      )}
    </Box>
  );

  const conversation = (
    <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: expanded ? 760 : 'none', mx: 'auto', width: '100%' }}>
      {chat.messages.map((m, i) => (m.role === 'user'
        ? (
          <Box key={i} sx={{ alignSelf: 'flex-end', maxWidth: '85%', px: 1.5, py: 1, borderRadius: '18px 18px 6px 18px', bgcolor: t.inv, color: t.invInk, fontSize: '0.84rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {m.text}
          </Box>
        )
        : <Answer key={i} m={m} x={x} />))}
      {showFollowUps && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, pl: 4.5 }}>
          {FOLLOW_UPS.map((f) => (
            <ButtonBase key={f} onClick={() => submit(f)} sx={{ height: 30, px: 1.25, borderRadius: 999, bgcolor: x.chip, border: `1px solid ${x.chipBorder}`, color: t.ink2, fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit', '&:hover': { bgcolor: x.chipHover, color: t.ink } }}>{f}</ButtonBase>
          ))}
        </Box>
      )}
    </Box>
  );

  const inputBar = (
    <Box sx={{ px: { xs: 1.25, sm: 1.75 }, pb: { xs: 'calc(12px + env(safe-area-inset-bottom, 0px))', sm: 1.75 }, pt: 1, flexShrink: 0 }}>
      <Box sx={{
        display: 'flex', alignItems: 'flex-end', gap: 0.75, p: 0.75, pl: 0.5, borderRadius: '26px', bgcolor: x.input,
        border: `1px solid ${x.glassBorder}`, backdropFilter: x.blur, WebkitBackdropFilter: x.blur,
        boxShadow: mode === 'dark' ? 'none' : '0 10px 30px -18px rgba(60,50,140,0.45)', maxWidth: expanded ? 760 : 'none', mx: 'auto',
        '&:focus-within': { borderColor: x.accent },
      }}>
        <Tooltip title="New chat and history" arrow>
          <IconButton onClick={(e) => setMenu(e.currentTarget)} aria-label="New chat and history" sx={{ width: 38, height: 38, color: t.ink2 }}><AddRounded /></IconButton>
        </Tooltip>
        <Box sx={{ width: '1px', alignSelf: 'stretch', my: 1, bgcolor: x.glassBorder }} />
        <InputBase inputRef={inputRef} value={input} onChange={(e) => setInput(e.target.value)} multiline maxRows={5} fullWidth
          placeholder={hasKey ? 'Ask Xyro anything about your money…' : 'Add your API key in Settings to start'} disabled={!hasKey}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          inputProps={{ 'aria-label': 'Message Xyro', maxLength: 2000 }}
          sx={{ flex: 1, fontSize: '0.86rem', fontFamily: FONT_TEXT, color: t.ink, py: 1, px: 0.75, '& textarea::placeholder': { color: t.muted, opacity: 1 }, '& textarea': { scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } } }} />
        {chat.busy ? (
          <Tooltip title="Stop" arrow>
            <IconButton onClick={chat.stop} aria-label="Stop answering" sx={{ width: 40, height: 40, bgcolor: x.accent, color: x.accentInk, '&:hover': { bgcolor: x.accent, opacity: 0.9 } }}><StopRounded /></IconButton>
          </Tooltip>
        ) : (
          <IconButton onClick={() => submit()} disabled={!ready || !input.trim()} aria-label="Send"
            sx={{ width: 40, height: 40, bgcolor: x.accent, color: x.accentInk, boxShadow: `0 6px 18px -6px ${x.accent}`, '&:hover': { bgcolor: x.accent, opacity: 0.9 }, '&.Mui-disabled': { bgcolor: x.accent, color: x.accentInk, opacity: 0.45 } }}>
            <ArrowUpwardRounded sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </Box>
      {hasKey && !system && !loading && <Typography sx={{ fontSize: '0.66rem', color: t.muted, textAlign: 'center', mt: 0.75 }}>Could not read your data yet. Try again in a moment.</Typography>}
      {hasKey && (
        <Typography sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, fontSize: '0.62rem', color: t.muted, mt: 0.6, opacity: 0.9 }}>
          <ShieldOutlined sx={{ fontSize: 12 }} />Answers use your Fintraxa data. Check important figures.
        </Typography>
      )}
    </Box>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: x.wash, fontFamily: FONT_TEXT, minHeight: 0 }}>
      {header}
      <Box ref={scrollRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        {chat.messages.length ? conversation : welcome}
      </Box>
      {inputBar}

      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 260, maxWidth: 320, maxHeight: 380, mb: 1 } } }} sx={{ zIndex: 1400 }}>
        <MenuItem onClick={() => { chat.newChat(); setMenu(null); }} sx={{ fontSize: '0.8rem', fontWeight: 650 }}>
          <ListItemIcon><EditNoteRounded fontSize="small" /></ListItemIcon>New chat
        </MenuItem>
        {chat.sessions.length > 0 && <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: '0.66rem', color: t.muted, fontWeight: 600 }}>Recent chats</Typography>}
        {chat.sessions.map((s) => (
          <MenuItem key={s.id} selected={s.id === chat.activeId} onClick={() => { chat.openSession(s.id); setMenu(null); }} sx={{ fontSize: '0.78rem', gap: 1, pr: 0.5 }}>
            <ChatBubbleOutlineRounded sx={{ fontSize: 16, color: t.muted }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{s.title}</Typography>
              <Typography sx={{ fontSize: '0.64rem', color: t.muted }}>{when(s.updatedAt ?? s.createdAt)}</Typography>
            </Box>
            <IconButton size="small" aria-label={`Delete chat ${s.title}`} onClick={(e) => { e.stopPropagation(); chat.deleteSession(s.id); }}>
              <DeleteOutlineRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

/** A one-click question on the welcome screen. */
function Suggestion({ s, x, disabled, onPick }) {
  const t = useFx();
  const Icon = s.icon;
  return (
    <ButtonBase onClick={() => onPick(s.text)} disabled={disabled} sx={{
      justifyContent: 'flex-start', gap: 1, px: 1.4, py: 1.05, borderRadius: '14px', textAlign: 'left', fontFamily: 'inherit',
      bgcolor: x.chip, border: `1px solid ${x.chipBorder}`, color: t.ink, fontSize: '0.78rem', fontWeight: 550, lineHeight: 1.3,
      transition: 'background-color .15s, transform .15s', '&:hover': { bgcolor: x.chipHover }, '&:active': { transform: 'scale(0.98)' },
      '&.Mui-disabled': { opacity: 0.55 },
    }}>
      {Icon && <Icon sx={{ fontSize: 18, color: x.accent, flexShrink: 0 }} />}
      <span>{s.text}</span>
    </ButtonBase>
  );
}

/** One answer: the orb, the markdown, a copy button; dots while it thinks. */
function Answer({ m, x }) {
  const t = useFx();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(m.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', maxWidth: '100%' }}>
      <XyroOrb size={28} sx={{ mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{
          display: 'inline-block', maxWidth: '100%', px: 1.5, py: 1.1, borderRadius: '6px 18px 18px 18px',
          bgcolor: m.error ? t.negSoft : x.bubble, border: `1px solid ${m.error ? 'transparent' : x.glassBorder}`,
        }}>
          {m.pending && !m.text ? <Steps steps={m.steps} x={x} /> : m.error ? (
            <>
              <Typography sx={{ fontSize: '0.82rem', color: t.neg }}>{m.text}</Typography>
              {m.detail && <Typography sx={{ fontSize: '0.68rem', color: t.muted, mt: 0.5 }}>Details: {m.detail}</Typography>}
            </>
          ) : <Markdown text={m.text} accent={x.accent} />}
        </Box>
        {!m.pending && !m.error && (
          <Box sx={{ mt: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title={copied ? 'Copied' : 'Copy answer'} arrow>
              <IconButton size="small" onClick={copy} aria-label="Copy answer" sx={{ color: t.muted }}>
                {copied ? <CheckRounded sx={{ fontSize: 15 }} /> : <ContentCopyRounded sx={{ fontSize: 15 }} />}
              </IconButton>
            </Tooltip>
            {m.instant && (
              <Tooltip title="Worked out from your records on this device, exactly" arrow>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: '0.64rem', fontWeight: 600, color: t.muted }}>
                  <BoltRounded sx={{ fontSize: 13, color: x.accent }} />Instant, from your data
                </Box>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * While the answer is on its way: what Xyro is doing, one line at a time, with
 * a light sweep across the text. Lines advance on a timer and stop on the last
 * ("Writing your answer"); the first streamed word replaces them.
 */
function Steps({ steps = [], x }) {
  const t = useFx();
  const list = steps.length ? steps : ['Looking through your Fintraxa data', 'Writing your answer'];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= list.length - 1) return undefined;
    const id = setTimeout(() => setI((n) => n + 1), i === 0 ? 650 : 1100);
    return () => clearTimeout(id);
  }, [i, list.length]);
  return (
    <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25, minWidth: 180 }}>
      <Box sx={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0, border: `2px solid ${x.accentSoft}`, borderTopColor: x.accent,
        animation: 'xyro-spin .8s linear infinite', '@keyframes xyro-spin': { to: { transform: 'rotate(360deg)' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }} />
      <Box key={i} component="span" sx={{
        fontSize: '0.8rem', fontWeight: 550, whiteSpace: 'nowrap',
        background: `linear-gradient(90deg, ${t.muted} 0%, ${t.muted} 35%, ${x.accent} 50%, ${t.muted} 65%, ${t.muted} 100%)`, backgroundSize: '220% 100%',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        animation: 'xyro-sweep 1.6s linear infinite, xyro-in .28s ease-out',
        '@keyframes xyro-sweep': { from: { backgroundPosition: '120% 0' }, to: { backgroundPosition: '-120% 0' } },
        '@keyframes xyro-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none', color: t.muted, background: 'none' },
      }}>
        {list[i]}…
      </Box>
    </Box>
  );
}
