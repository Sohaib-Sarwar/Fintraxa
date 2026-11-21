import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { DOC_LABEL, Identity, TYPE_LABEL, type DocKind } from '@/features/upload/Identity';
import { useRecentUploads } from '@/features/upload/recent';
import { ScanDoc, StepList, type Step } from '@/features/upload/Steps';
import {
  approveAllOpen, approveStaged, fetchStaged, findImport, importFund, OPEN_STAGED, pickPdf, readFile, recognise, saveDividends, saveTrades, uploadFile, UploadError,
  type DividendLine, type IntakeResult, type Picked, type StagedRow, type TradeLine,
} from '@/features/upload/upload';
import { dividendDuplicates, dividendKey, duplicateStatus, oversoldRefs } from '@/data/engines';
import { friendlyError } from '@/data/mutations';
import { useDividends, useTrades, useUid } from '@/data/queries';
import type { Dividend, Trade } from '@/data/types';
import { shortDate } from '@/lib/dates';
import { group, units } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { toast } from '@/ui/feedback';
import { Field } from '@/ui/Field';
import { useHidden } from '@/ui/Figures';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleCheck, CirclePlus, CopyCheck, FileUp, History, LockKeyhole,
} from '@/ui/icons';
import { AmcLogo, BrokerLogo, StockLogo } from '@/ui/Logos';
import { Button, CircleButton, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { accentOnDarkText, alpha, dark, font, space } from '@/ui/tokens';

type Phase = 'pick' | 'work' | 'password' | 'review' | 'saving' | 'done' | 'error';
type Match = 'new' | 'saved' | 'check';
type Ident = { kind: DocKind; source: { code: string; name: string }; items: string[]; pages?: number };
type FundOutcome = { importId: string; rows: StagedRow[]; repeat: string | null };

const STEPS: Step[] = [
  { id: 'read', label: 'Reading', state: 'pending' },
  { id: 'upload', label: 'Uploading', state: 'pending' },
  { id: 'kind', label: 'Document', state: 'pending' },
  { id: 'source', label: 'Issuer', state: 'pending' },
  { id: 'items', label: 'Contents', state: 'pending' },
  { id: 'totals', label: 'Totals', state: 'pending' },
  { id: 'fifo', label: 'FIFO', state: 'pending' },
  { id: 'dupes', label: 'Duplicates', state: 'pending' },
];
const EASE = Easing.bezier(0.2, 0, 0, 1);
const atLeast = async <T,>(fn: () => Promise<T>, ms = 480) => { const t0 = Date.now(); const v = await fn(); const left = ms - (Date.now() - t0); if (left > 0) await new Promise((r) => setTimeout(r, left)); return v; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Round glass tick in the accent. */
function Tick({ on }: { on: boolean }) {
  const p = useTheme();
  return (
    <View style={[styles.tick, { borderColor: on ? p.accentOnDark : 'rgba(255,255,255,0.3)', backgroundColor: on ? p.accentOnDark : 'transparent' }]}>
      {on ? <Check size={13} color={p.accentOnDarkInk} strokeWidth={3} /> : null}
    </View>
  );
}

/** Icon stat: icon, number, short word. */
function Stat({ icon, n, label, tint }: { icon: ReactNode; n: number; label: string; tint?: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${n}`}>
      <View style={[styles.statIcon, tint ? { backgroundColor: alpha(tint, 0.14) } : null]}>{icon}</View>
      <Text style={styles.statNum}>{n}</Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

/** Section heading inside a glass panel: icon · title · count (· chevron when collapsible). */
function Head({ icon, title, n, open, onToggle }: { icon: ReactNode; title: string; n: number; open?: boolean; onToggle?: () => void }) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <Pressable onPress={onToggle} disabled={!onToggle} accessibilityRole={onToggle ? 'button' : 'header'} accessibilityState={onToggle ? { expanded: !!open } : undefined}
      style={styles.head}>
      {icon}
      <Text style={styles.headTitle}>{title}</Text>
      <Text style={styles.headCount}>{n}</Text>
      {onToggle ? <Chevron size={16} color={GLASS_INK2} /> : null}
    </Pressable>
  );
}

/**
 * One line of the document. Left: logo with a small buy/sell or in/out mark. Middle: name, one figure line. Right:
 * amount; a tick when it can be chosen; an icon (no coloured text) when it needs a look: ⚠ looks like a hand entry,
 * ! sells more than held.
 */
function Row({ logo, inflow, title, figures, amount, flag, on, onPress, locked, first }: {
  logo: ReactNode; inflow: boolean | null; title: string; figures: string; amount: string; flag?: 'check' | 'oversold' | null;
  on?: boolean; onPress?: () => void; locked?: boolean; first: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress || locked} accessibilityRole={onPress ? 'checkbox' : undefined}
      accessibilityState={onPress ? { checked: !!on, disabled: !!locked } : undefined}
      accessibilityLabel={`${title}, ${figures}, ${amount}${flag === 'check' ? ', looks like a trade you entered by hand' : flag === 'oversold' ? ', sells more than you hold' : ''}${locked ? ', already saved' : ''}`}
      style={({ pressed }) => [styles.row, { opacity: locked ? 0.5 : pressed ? 0.8 : 1 }]}>
      <View>
        {logo}
        {inflow !== null ? (
          <View style={styles.side}>{inflow ? <ArrowDownLeft size={10} color={GLASS_INK} strokeWidth={2.6} /> : <ArrowUpRight size={10} color={GLASS_INK} strokeWidth={2.6} />}</View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.figures} numberOfLines={1}>{figures}</Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.amt} numberOfLines={1}>{amount}</Text>
        <View style={styles.inline}>
          {flag ? <AlertTriangle size={14} color={flag === 'oversold' ? dark.neg : dark.warn} /> : null}
          {locked ? <CopyCheck size={15} color={GLASS_INK2} /> : onPress ? <Tick on={!!on} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Upload (owner flow; 2026-11-15 rework to the web's logic, Apple-glass and minimal):
 *  • every file is identified first (document, broker / AMC / CDC, funds or stocks), with the checks in the web's order;
 *  • trade confirmations and dividend reports: rows split into "To add" and "Already saved" (locked) — the same matching
 *    as the web (source_ref / warrant); hand-entry look-alikes and FIFO over-sales are flagged with icons;
 *  • fund statements: handled exactly like the web's ImportDialog — the same file again is caught up front ("Already
 *    imported"); otherwise the statement pipeline imports at once (duplicates, reconciliation, FIFO), then every row
 *    shows its outcome (Added / Already in portfolio / Waiting for you) with Approve for the waiting ones.
 */
export default function Upload() {
  const p = useTheme();
  const hidden = useHidden();
  const qc = useQueryClient();
  const uid = useUid();
  const trades = useTrades();
  const dividends = useDividends();
  const recent = useRecentUploads();
  const [phase, setPhase] = useState<Phase>('pick');
  const [steps, setSteps] = useState<Step[]>(STEPS);
  const [file, setFile] = useState<Picked | null>(null);
  const [ident, setIdent] = useState<Ident | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [existingTrades, setExistingTrades] = useState<Trade[]>([]);
  const [existingDivs, setExistingDivs] = useState<Dividend[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<{ added: number; skipped: number } | null>(null);
  const [fund, setFund] = useState<FundOutcome | null>(null);
  const [approving, setApproving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const path = useRef<string | null>(null);
  const sha = useRef<string | null>(null);

  const step = (id: string, state: Step['state'], detail?: string | null, label?: string) =>
    setSteps((ss) => ss.map((s) => (s.id === id ? { ...s, state, detail: detail ?? s.detail, label: label ?? s.label } : s)));
  const fail = (msg: string, at?: string) => { if (at) step(at, 'error', null); setError(msg); setPhase('error'); haptic.error(); };

  /** A fund statement, the web's way: same file → already imported; else import now and show each row's outcome. */
  const runFund = async (r: Extract<IntakeResult, { kind: 'fund' }>) => {
    step('totals', 'active', null, 'Reconcile');
    const prior = uid && sha.current ? await findImport(uid, sha.current) : null;
    if (prior) {
      step('totals', 'done', 'Same file', 'Reconcile');
      step('fifo', 'done', '—');
      step('dupes', 'warn', 'Already imported');
      const rows = await fetchStaged(prior.id).catch(() => []);
      setFund({ importId: prior.id, rows, repeat: prior.created_at });
      haptic.warning();
      setTimeout(() => setPhase('done'), 500);
      return;
    }
    // Narrate the pipeline's stages while it works; the last waits for the answer (web ImportDialog).
    const stages: [string, string][] = [['dupes', 'Checking'], ['totals', 'Reconciling'], ['fifo', 'Booking']];
    let k = 0;
    step(stages[0][0], 'active', stages[0][1]);
    const timer = setInterval(() => {
      if (k < stages.length - 1) { step(stages[k][0], 'done', null); k += 1; step(stages[k][0], 'active', stages[k][1]); }
    }, 700);
    try {
      const out = await importFund(r.storage_path, file?.name ?? 'statement.pdf');
      clearInterval(timer);
      let rows = out.import_id ? await fetchStaged(out.import_id).catch(() => []) : [];
      // Auto-approve whatever is still waiting (owner); only rows the server refuses stay under "Waiting for you".
      if (out.import_id && !out.duplicate_file && rows.some((x) => OPEN_STAGED.includes(x.review_status))) {
        step('fifo', 'active', 'Approving');
        await approveAllOpen(out.import_id, rows).catch(() => 0);
        rows = await fetchStaged(out.import_id).catch(() => rows);
      }
      const added = rows.filter((x) => x.review_status === 'approved').length;
      const dup = rows.filter((x) => x.review_status === 'duplicate').length;
      step('dupes', 'done', dup ? `${dup} already in portfolio` : 'None');
      step('totals', 'done', 'Units reconciled');
      step('fifo', 'done', `${added} booked`);
      ['mf-ledger', 'mf-pending-review', 'mf-imports', 'snapshots'].forEach((q) => qc.invalidateQueries({ queryKey: [q] }));
      setFund({ importId: out.import_id, rows, repeat: out.duplicate_file ? (rows[0]?.trade_date ?? '') : null });
      haptic.success();
      setTimeout(() => setPhase('done'), 500);
    } catch (e) {
      clearInterval(timer);
      fail(e instanceof UploadError ? e.message : friendlyError(e), stages[k][0]);
    }
  };

  /** Identify, then check — revealed one by one (after upload, and again after a password). */
  const analyse = async (storagePath: string, pwd?: string) => {
    step('kind', 'active', null);
    let r: IntakeResult;
    try { r = await atLeast(() => recognise(storagePath, pwd), 700); } catch (e) { return fail(e instanceof UploadError ? e.message : 'Reading the document failed. Please try again.', 'kind'); }
    if (r.kind === 'password') { step('kind', 'warn', 'Locked'); setPwError(r.wrong ? r.message : null); setPhase('password'); return; }
    if (r.kind === 'unknown') { step('kind', 'error', r.source?.name ?? 'Unknown'); return fail(r.message); }

    step('kind', 'done', DOC_LABEL[r.kind]);
    setIdent({ kind: r.kind, source: r.source, items: [], pages: r.pages });
    step('source', 'active', null, r.kind === 'trades' ? 'Broker' : r.kind === 'fund' ? 'AMC' : 'Registrar');
    await wait(500);
    step('source', 'done', r.source.name);
    step('items', 'active', null, r.kind === 'fund' ? 'Funds' : 'Stocks');
    await wait(400);
    const items = r.kind === 'fund' ? r.preview.funds : r.kind === 'trades' ? uniq(r.confirmations.flatMap((c) => c.trades.map((t) => t.symbol))) : uniq(r.rows.map((d) => d.symbol));
    setIdent({ kind: r.kind, source: r.source, items, pages: r.pages });
    const n = r.kind === 'trades' ? r.trades : r.kind === 'dividends' ? r.rows.length : r.preview.count;
    step('items', 'done', `${items.length} · ${plural(n, r.kind === 'fund' ? 'row' : r.kind === 'trades' ? 'trade' : 'payment')}`);
    setResult(r);

    if (r.kind === 'fund') return runFund(r);

    // Trades / dividends: match against what is saved — wait for it, never match against an empty list.
    const ex = new Set<string>();
    step('totals', 'active', null);
    await wait(400);
    if (r.kind === 'trades') {
      const bad = r.checks.filter((c) => c.ok === false);
      step('totals', bad.length ? 'warn' : 'done', bad.length ? 'Differ' : r.checks.every((c) => c.ok) ? 'Match' : 'None printed');
      const have = trades.data ?? (await trades.refetch()).data ?? [];
      setExistingTrades(have);
      const st = duplicateStatus(r.confirmations, have);
      for (const [ref, v] of Object.entries(st)) if (v === 'similar' || v === 'recorded') ex.add(ref);
      step('fifo', 'active', null);
      await wait(400);
      const over = oversoldRefs(r.confirmations, (ref) => !ex.has(ref), have);
      step('fifo', over.size ? 'warn' : 'done', over.size ? `${over.size} over holdings` : 'Covered');
      step('dupes', 'active', null);
      await wait(400);
      const rec = Object.values(st).filter((v) => v === 'recorded').length;
      step('dupes', rec ? 'warn' : 'done', rec ? `${rec} of ${n} saved` : 'None');
    } else {
      const sts = r.statements ?? [];
      step('totals', sts.some((s) => s.matches === false) ? 'warn' : 'done', sts.length && sts.every((s) => s.matches) ? 'Match' : sts.some((s) => s.matches === false) ? 'Differ' : 'None printed');
      step('fifo', 'done', '—');
      const have = dividends.data ?? (await dividends.refetch()).data ?? [];
      setExistingDivs(have);
      const st = dividendDuplicates(r.rows, have);
      for (const [k, v] of Object.entries(st)) if (v) ex.add(k);
      step('dupes', 'active', null);
      await wait(400);
      const savedN = Object.values(st).filter((v) => v === 'saved').length;
      step('dupes', savedN ? 'warn' : 'done', savedN ? `${savedN} of ${n} saved` : 'None');
    }
    setExcluded(ex);
    setShowSaved(false);
    haptic.success();
    setTimeout(() => setPhase('review'), 600);
  };

  const start = async () => {
    const f = await pickPdf().catch(() => null);
    if (!f) return;
    setFile(f); setSteps(STEPS); setError(null); setResult(null); setIdent(null); setFund(null); setSaved(null); setPhase('work');
    step('read', 'active');
    let bytes: Uint8Array;
    try { const out = await atLeast(() => readFile(f)); bytes = out.bytes; sha.current = out.sha; } catch (e) { return fail(e instanceof UploadError ? e.message : 'That file could not be read.', 'read'); }
    step('read', 'done', `${(f.size / 1024).toFixed(0)} KB`);
    step('upload', 'active');
    try { path.current = await atLeast(() => uploadFile(uid!, sha.current!, bytes)); } catch (e) { return fail(e instanceof UploadError ? e.message : 'Upload failed.', 'upload'); }
    step('upload', 'done', 'Encrypted');
    await analyse(path.current);
  };

  const retryWithPassword = async () => {
    if (!password || !path.current) return;
    setPhase('work');
    await analyse(path.current, password);
    setPassword('');
  };
  const reset = () => { setPhase('pick'); setSteps(STEPS); setResult(null); setSaved(null); setIdent(null); setFund(null); };
  const toggle = (key: string) => { haptic.tick(); setExcluded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }); };

  const save = async () => {
    if (!result || !uid) return;
    setPhase('saving');
    try {
      if (result.kind === 'trades') {
        const picks = result.confirmations.map((c) => ({ c, trades: c.trades.filter((t) => !excluded.has(t.source_ref)) }));
        const r = await saveTrades(uid, picks);
        ['stock-transactions', 'psx-closes', 'snapshots'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        setSaved(r);
        toast(r.added ? `${plural(r.added, 'trade')} saved` : 'Everything here was already saved', { tone: r.added ? 'success' : 'info' });
      } else if (result.kind === 'dividends') {
        const r = await saveDividends(uid, result.rows.filter((d) => !excluded.has(dividendKey(d))));
        ['stock-dividends', 'snapshots'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        setSaved(r);
        toast(r.added ? `${plural(r.added, 'dividend')} saved${r.completed ? `, ${r.completed} completed` : ''}`
          : r.completed ? `${plural(r.completed, 'dividend')} already on file, completed with the report's details` : 'Everything here was already saved',
        { tone: r.added || r.completed ? 'success' : 'info' });
      }
      haptic.success();
      setPhase('done');
    } catch (e) {
      setError(e instanceof UploadError ? e.message : friendlyError(e));
      setPhase('error');
    }
  };

  const approveOpen = async () => {
    if (!fund) return;
    const ids = fund.rows.filter((x) => OPEN_STAGED.includes(x.review_status)).map((x) => x.id);
    if (!ids.length) return;
    setApproving(true);
    try {
      const r = await approveStaged(fund.importId, ids);
      haptic.success();
      toast(`${plural(r.approved, 'transaction')} added`);
      setFund({ ...fund, rows: await fetchStaged(fund.importId) });
      ['mf-ledger', 'mf-pending-review', 'mf-imports', 'snapshots'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      toast(friendlyError(e), { tone: 'error' });
    } finally {
      setApproving(false);
    }
  };

  /** New / Saved (already on file — locked) / Check (looks like a hand entry), against the saved list used above. */
  const matches = useMemo(() => {
    const out: Record<string, Match> = {};
    if (result?.kind === 'trades') {
      const st = duplicateStatus(result.confirmations, existingTrades);
      for (const c of result.confirmations) for (const t of c.trades) out[t.source_ref] = st[t.source_ref] === 'recorded' ? 'saved' : st[t.source_ref] === 'similar' ? 'check' : 'new';
    } else if (result?.kind === 'dividends') {
      const st = dividendDuplicates(result.rows, existingDivs);
      for (const d of result.rows) { const k = dividendKey(d); out[k] = st[k] === 'saved' ? 'saved' : st[k] ? 'check' : 'new'; }
    }
    return out;
  }, [result, existingTrades, existingDivs]);
  const counts = useMemo(() => {
    const c: Record<Match, number> = { new: 0, saved: 0, check: 0 };
    for (const m of Object.values(matches)) c[m] += 1;
    return c;
  }, [matches]);
  const oversold = useMemo(() => (result?.kind === 'trades'
    ? oversoldRefs(result.confirmations, (ref) => !excluded.has(ref) && matches[ref] !== 'saved', existingTrades) : new Set<string>()),
  [result, excluded, matches, existingTrades]);
  const chosen = Object.keys(matches).filter((k) => matches[k] !== 'saved' && !excluded.has(k)).length;

  const history = <CircleButton icon={History} label="Recent uploads" onPress={() => router.push('/uploads')} />;
  const rs = (v: string | number | null | undefined, d = 2) => (hidden ? '••••' : group(Number(String(v ?? 0).replace(/[,()]/g, '')), d));

  // ── Pick ──
  if (phase === 'pick') {
    return (
      <Screen back title="Upload" right={history}>
        <BlackGlass liquid onPress={start} accessibilityLabel="Choose a PDF" style={styles.drop}>
          <View style={styles.dashed} pointerEvents="none" />
          <View style={[styles.dropIcon, { backgroundColor: p.accentOnDark }]}><FileUp size={28} color={p.accentOnDarkInk} strokeWidth={2} /></View>
          <Text style={styles.dropTitle}>Choose a PDF</Text>
          <Text style={styles.small}>Trades · Dividends · Fund statements</Text>
        </BlackGlass>
        <View style={styles.sectionHead}>
          <Text variant="label" tone="ink2">Last imports</Text>
          <Pressable onPress={() => router.push('/uploads')} hitSlop={10} accessibilityRole="link" accessibilityLabel="Import history">
            <Text variant="label" style={{ color: accentOnDarkText(p) }}>History</Text>
          </Pressable>
        </View>
        <BlackGlass liquid style={{ paddingVertical: 0 }}>
          {recent.items.length ? recent.items.slice(0, 3).map((u, i) => (
            <Pressable key={u.id} onPress={() => router.push('/uploads')} accessibilityRole="button" accessibilityLabel={`${u.title}, ${u.count}`}
              style={({ pressed }) => [styles.row, i === 0 && { borderTopWidth: 0 }, { opacity: pressed ? 0.8 : 1 }]}>
              {u.kind === 'trades' ? <BrokerLogo code={u.code ?? ''} size={34} /> : u.kind === 'fund' ? <AmcLogo code={u.code} name={u.title} size={34} />
                : <View style={styles.cdc}><Text style={styles.cdcText}>CDC</Text></View>}
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{u.title}</Text>
                <Text style={styles.small} numberOfLines={1}>{u.count} {u.kind === 'fund' ? 'rows' : u.kind}</Text>
              </View>
              <Text style={styles.small}>{shortDate(u.at.slice(0, 10))}</Text>
            </Pressable>
          )) : <Text style={[styles.small, { paddingVertical: space.lg }]}>{recent.isLoading ? 'Loading…' : 'Nothing yet'}</Text>}
        </BlackGlass>
        <View style={styles.privacy}><LockKeyhole size={13} color={p.muted} /><Text variant="caption" tone="muted">Private · no AI</Text></View>
      </Screen>
    );
  }

  // ── Identify / check (and a fund statement importing) ──
  if (phase === 'work' || phase === 'password' || phase === 'error') {
    return (
      <Screen back title="Reading" right={history}>
        {ident ? <Identity key={`${ident.kind}-${ident.items.length > 0}`} kind={ident.kind} source={ident.source} items={ident.items} pages={ident.pages} fileName={file?.name} />
          : <><ScanDoc state={phase === 'error' ? 'error' : 'working'} /><Text style={[styles.small, { textAlign: 'center', marginBottom: space.md }]} numberOfLines={1}>{file?.name}</Text></>}
        <Gap h={space.md} />
        <BlackGlass liquid style={{ paddingVertical: space.sm }}><StepList steps={steps} /></BlackGlass>
        {phase === 'password' ? (
          <Animated.View entering={FadeInDown.duration(260)} style={{ marginTop: space.lg, gap: space.md }}>
            <Field label="PDF password" value={password} onChangeText={setPassword} secure autoFocus error={pwError} returnKeyType="go" onSubmitEditing={retryWithPassword}
              placeholder="Usually your CNIC, no dashes" />
            <Button label="Open" onPress={retryWithPassword} disabled={!password} />
          </Animated.View>
        ) : null}
        {phase === 'error' ? (
          <Animated.View entering={FadeIn} style={{ marginTop: space.lg, gap: space.md }}>
            <BlackGlass liquid style={styles.errorBox}><AlertTriangle size={18} color={dark.neg} /><Text style={[styles.rowTitle, { flex: 1 }]}>{error}</Text></BlackGlass>
            <Button label="Try another file" onPress={reset} />
            <Button label="Close" kind="secondary" onPress={() => router.back()} />
          </Animated.View>
        ) : null}
      </Screen>
    );
  }

  // ── Fund statement outcome (web ImportDialog) ──
  if (phase === 'done' && fund) {
    const added = fund.rows.filter((x) => x.review_status === 'approved');
    const dups = fund.rows.filter((x) => x.review_status === 'duplicate');
    const open = fund.rows.filter((x) => OPEN_STAGED.includes(x.review_status));
    const other = fund.rows.filter((x) => !added.includes(x) && !dups.includes(x) && !open.includes(x));
    const fundRow = (r: StagedRow, i: number, locked = false) => {
      const u = r.unit_delta !== null ? Number(r.unit_delta) : null;
      const amt = r.gross_amount ?? r.net_amount;
      return (
        <Row key={r.id} first={i === 0} locked={locked} inflow={u === null ? null : u >= 0}
          logo={<AmcLogo code={ident?.source.code ?? null} name={ident?.source.name} size={36} />}
          title={`${TYPE_LABEL[r.entry_type] ?? r.entry_type} · ${r.trade_date ? shortDate(r.trade_date) : '—'}`}
          figures={`${r.fund_name_printed ?? 'Fund'}${u !== null ? ` · ${u > 0 ? '+' : ''}${units(u)} u` : ''}`}
          amount={amt === null ? '—' : rs(amt, 0)} />
      );
    };
    return (
      <Screen back title={fund.repeat ? 'Already imported' : 'Imported'} right={history}>
        {ident ? <Identity kind={ident.kind} source={ident.source} items={ident.items} pages={ident.pages} fileName={file?.name} animate={false} /> : null}
        <BlackGlass liquid style={styles.stats}>
          <Stat icon={<CirclePlus size={16} color={GLASS_INK} />} n={fund.repeat ? 0 : added.length} label="Added" />
          <Stat icon={<CopyCheck size={16} color={GLASS_INK2} />} n={fund.repeat ? fund.rows.length : dups.length} label="Had" />
          <Stat icon={<AlertTriangle size={15} color={dark.warn} />} n={open.length} label="Waiting" tint={open.length ? dark.warn : undefined} />
        </BlackGlass>
        {fund.repeat ? (
          <BlackGlass liquid style={[styles.notice, { marginTop: space.md }]}>
            <CopyCheck size={18} color={GLASS_INK} />
            <Text style={[styles.rowTitle, { flex: 1 }]}>This file is already imported. Nothing was added.</Text>
          </BlackGlass>
        ) : null}
        {open.length ? (
          <Animated.View entering={FadeInDown.duration(260).easing(EASE)}>
            <BlackGlass liquid style={styles.panel}>
              <Head icon={<AlertTriangle size={15} color={dark.warn} />} title="Waiting for you" n={open.length} />
              {open.map((r, i) => fundRow(r, i))}
            </BlackGlass>
          </Animated.View>
        ) : null}
        {!fund.repeat && added.length ? (
          <BlackGlass liquid style={styles.panel}>
            <Head icon={<CirclePlus size={15} color={GLASS_INK} />} title="Added" n={added.length} />
            {added.map((r, i) => fundRow(r, i))}
          </BlackGlass>
        ) : null}
        {(fund.repeat ? fund.rows : dups).length ? (
          <BlackGlass liquid style={styles.panel}>
            <Head icon={<CopyCheck size={15} color={GLASS_INK2} />} title="Already in portfolio" n={(fund.repeat ? fund.rows : dups).length}
              open={showSaved} onToggle={() => { haptic.tick(); setShowSaved((v) => !v); }} />
            {showSaved ? (fund.repeat ? fund.rows : dups).map((r, i) => fundRow(r, i, true)) : null}
          </BlackGlass>
        ) : null}
        {other.length && !fund.repeat ? (
          <BlackGlass liquid style={styles.panel}>
            <Head icon={<ChevronRight size={15} color={GLASS_INK2} />} title="Excluded" n={other.length} />
            {other.map((r, i) => fundRow(r, i, true))}
          </BlackGlass>
        ) : null}
        <Gap h={space.lg} />
        {open.length ? <><Button label={approving ? 'Adding…' : `Approve ${open.length}`} loading={approving} onPress={approveOpen} /><Gap h={space.md} /></> : null}
        <Button label="See funds" kind={open.length ? 'secondary' : 'primary'} onPress={() => router.replace('/invest')} />
        <Gap h={space.md} />
        <Button label="Upload another" kind="secondary" onPress={reset} />
      </Screen>
    );
  }

  // ── Trades / dividends saved ──
  if (phase === 'done' && saved) {
    return (
      <Screen back title="Done" right={history}>
        <BlackGlass liquid style={styles.done}>
          <Animated.View entering={ZoomIn.duration(300).easing(EASE)} style={[styles.doneBadge, { backgroundColor: p.accentOnDark }]}>
            <CircleCheck size={38} color={p.accentOnDarkInk} strokeWidth={2} />
          </Animated.View>
          <Text style={styles.doneTitle}>{plural(saved.added, result?.kind === 'dividends' ? 'dividend' : 'trade')} added</Text>
          {saved.skipped ? <View style={styles.inline}><CopyCheck size={14} color={GLASS_INK2} /><Text style={styles.small}>{saved.skipped} already saved</Text></View> : null}
        </BlackGlass>
        <Gap h={space.lg} />
        <Button label={result?.kind === 'dividends' ? 'See passive income' : 'See shares'} onPress={() => router.replace(result?.kind === 'dividends' ? '/passive' : '/invest')} />
        <Gap h={space.md} />
        <Button label="Upload another" kind="secondary" onPress={reset} />
      </Screen>
    );
  }

  // ── Review (trades / dividends): To add · Already saved ──
  const r = result!;
  type Item = { key: string; match: Match; row: ReactNode };
  const build = (first: (i: number) => boolean): Item[] => {
    if (r.kind === 'trades') {
      return r.confirmations.flatMap((c) => c.trades.map((t: TradeLine) => ({ c, t }))).map(({ c, t }, i) => {
        const m = matches[t.source_ref] ?? 'new';
        return {
          key: t.source_ref, match: m,
          row: <Row key={t.source_ref} first={first(i)} logo={<StockLogo symbol={t.symbol} size={36} />} inflow={t.type === 'buy'}
            title={`${t.symbol} · ${t.type === 'buy' ? 'Buy' : 'Sell'}`} figures={`${units(t.quantity)} × ${rs(t.price)} · ${shortDate(c.trade_date)}`}
            amount={t.net ? rs(t.net) : ''} flag={oversold.has(t.source_ref) && !excluded.has(t.source_ref) ? 'oversold' : m === 'check' ? 'check' : null}
            on={!excluded.has(t.source_ref)} locked={m === 'saved'} onPress={m === 'saved' ? undefined : () => toggle(t.source_ref)} />,
        };
      });
    }
    if (r.kind === 'dividends') {
      return r.rows.map((d: DividendLine, i) => {
        const k = dividendKey(d);
        const m = matches[k] ?? 'new';
        return {
          key: k, match: m,
          row: <Row key={k} first={first(i)} logo={<StockLogo symbol={d.symbol} size={36} />} inflow
            title={d.symbol} figures={`${shortDate(d.payment_date)} · ${units(d.shares)} sh · tax ${rs(Number(d.tax_amount) + Number(d.jh_tax_amount ?? 0))}`}
            amount={rs(d.net_amount)} flag={m === 'check' ? 'check' : null}
            on={!excluded.has(k)} locked={m === 'saved'} onPress={m === 'saved' ? undefined : () => toggle(k)} />,
        };
      });
    }
    return [];
  };
  const all = build(() => false);
  const toAdd = all.filter((x) => x.match !== 'saved');
  const have = all.filter((x) => x.match === 'saved');
  const allNewOn = toAdd.filter((x) => x.match === 'new').every((x) => !excluded.has(x.key));
  return (
    <Screen back title="Confirm" right={history}>
      {ident ? <Identity kind={ident.kind} source={ident.source} items={ident.items} pages={ident.pages} fileName={file?.name} animate={false} /> : null}

      <BlackGlass liquid style={styles.stats}>
        <Stat icon={<CirclePlus size={16} color={GLASS_INK} />} n={counts.new} label="New" />
        <Stat icon={<CopyCheck size={16} color={GLASS_INK2} />} n={counts.saved} label="Saved" />
        <Stat icon={<AlertTriangle size={15} color={dark.warn} />} n={counts.check + oversold.size} label="Check" tint={counts.check + oversold.size ? dark.warn : undefined} />
      </BlackGlass>

      {toAdd.length ? (
        <Animated.View entering={FadeInDown.duration(260).easing(EASE)}>
          <BlackGlass liquid style={styles.panel}>
            <View style={styles.headRow}>
              <Head icon={<CirclePlus size={15} color={GLASS_INK} />} title="To add" n={chosen} />
              {counts.new > 1 ? (
                <Pressable onPress={() => { haptic.tick(); setExcluded((s) => { const n = new Set(s); for (const x of toAdd) if (x.match === 'new') { if (allNewOn) n.add(x.key); else n.delete(x.key); } return n; }); }}
                  hitSlop={8} accessibilityRole="button" accessibilityLabel={allNewOn ? 'Clear all' : 'Select all new'}>
                  <Text variant="label" style={{ color: accentOnDarkText(p) }}>{allNewOn ? 'None' : 'All'}</Text>
                </Pressable>
              ) : null}
            </View>
            {toAdd.map((x) => x.row)}
          </BlackGlass>
        </Animated.View>
      ) : (
        <BlackGlass liquid style={[styles.notice, { marginTop: space.md }]}>
          <CopyCheck size={18} color={GLASS_INK} />
          <Text style={[styles.rowTitle, { flex: 1 }]}>Everything here is already saved.</Text>
        </BlackGlass>
      )}

      {have.length ? (
        <BlackGlass liquid style={styles.panel}>
          <Head icon={<CopyCheck size={15} color={GLASS_INK2} />} title="Already saved" n={have.length} open={showSaved || !toAdd.length}
            onToggle={toAdd.length ? () => { haptic.tick(); setShowSaved((v) => !v); } : undefined} />
          {showSaved || !toAdd.length ? have.map((x) => x.row) : null}
        </BlackGlass>
      ) : null}

      <Gap h={space.xl} />
      {toAdd.length ? (
        <View style={styles.actions}>
          <Button label="Cancel" kind="secondary" style={{ flex: 1 }} onPress={() => router.back()} disabled={phase === 'saving'} />
          <Button label={phase === 'saving' ? 'Saving…' : `Add ${chosen}`} style={{ flex: 2 }} loading={phase === 'saving'} disabled={phase === 'saving' || chosen === 0} onPress={save} />
        </View>
      ) : <Button label="Done" kind="secondary" onPress={() => router.back()} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  drop: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  dashed: { position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, borderRadius: 16, borderWidth: 1.2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.16)' },
  dropIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  dropTitle: { color: GLASS_INK, fontFamily: font.bold, fontSize: 19 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm, marginHorizontal: 4 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.lg },
  cdc: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  cdcText: { color: GLASS_INK, fontFamily: font.bold, fontSize: 10 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stats: { flexDirection: 'row', marginTop: space.md, paddingVertical: space.md },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  statNum: { color: GLASS_INK, fontFamily: font.numMedium, fontSize: 20 },
  panel: { marginTop: space.md, paddingVertical: 0 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: space.md, flexGrow: 1 },
  headTitle: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14 },
  headCount: { color: GLASS_INK2, fontFamily: font.numMedium, fontSize: 13, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  side: { position: 'absolute', right: -3, bottom: -3, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2B2E', borderWidth: 1.5, borderColor: '#000' },
  rowTitle: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14.5, flexShrink: 1 },
  figures: { color: GLASS_INK2, fontFamily: font.num, fontSize: 12.5 },
  rowEnd: { alignItems: 'flex-end', gap: 6 },
  amt: { color: GLASS_INK, fontFamily: font.numMedium, fontSize: 14.5 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  done: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  doneBadge: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  doneTitle: { color: GLASS_INK, fontFamily: font.bold, fontSize: 20, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.sm },
});
