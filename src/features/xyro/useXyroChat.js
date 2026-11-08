/**
 * Chat sessions and the send loop. Sessions persist in this browser (see
 * lib/xyro/storage.js); each question goes to Gemini with the data snapshot as
 * the system instruction and the last turns of the current chat as context.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessions, saveSessions, clearSessions, titleFrom, newId } from '../../lib/xyro/storage';
import { answerWithFallback } from '../../lib/xyro/gemini';
import { chainFor, clearCachedModels } from '../../lib/xyro/models';
import { contextWindow } from '../../lib/xyro/context';
import { detectIntent, relevantRecords, withRecords, thinkingSteps } from '../../lib/xyro/intent';
import { instantAnswer } from '../../lib/xyro/instant';
import { todayIso } from '../../lib/dateRange';

const CONTEXT_TURNS = 10; // enough for follow-ups ("and July?"); fewer tokens, faster first word

export function useXyroChat({ uid, apiKey, model, system, data }) {
  const [sessions, setSessions] = useState(() => getSessions(uid));
  const [activeId, setActiveId] = useState(null); // null = a fresh, unsaved chat
  const [draftMessages, setDraftMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);

  // Another user signed in on this device: their own history.
  const [seenUid, setSeenUid] = useState(uid);
  if (seenUid !== uid) { setSeenUid(uid); setSessions(getSessions(uid)); setActiveId(null); setDraftMessages([]); }

  useEffect(() => () => abortRef.current?.abort(), []);
  // History cleared from Settings while the panel is open.
  useEffect(() => {
    const onCleared = () => { abortRef.current?.abort(); setSessions([]); setActiveId(null); setDraftMessages([]); };
    window.addEventListener('fintraxa:xyro-cleared', onCleared);
    return () => window.removeEventListener('fintraxa:xyro-cleared', onCleared);
  }, []);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const messages = active ? active.messages : draftMessages;

  const commit = useCallback((next) => { setSessions(next); saveSessions(uid, next); }, [uid]);

  const send = useCallback(async (raw) => {
    const text = String(raw ?? '').trim();
    if (!text || busy || !system) return;
    const now = Date.now();
    const userMsg = { role: 'user', text, at: now };
    // Read the question first: its period, categories and stocks pick the records that go with it.
    const intent = detectIntent(text, { today: todayIso(), categories: data?.categories, symbols: data?.symbols, notes: data?.notes });
    const records = data ? relevantRecords(intent, data) : '';
    const apiText = withRecords(text, records, intent.period);
    const pending = { role: 'model', text: '', at: now, pending: true, steps: thinkingSteps(intent) };
    const history = [...messages, userMsg];

    // Start (or continue) the session and show the question at once.
    const id = activeId ?? newId();
    const base = active ?? { id, title: titleFrom(text), createdAt: now, messages: [] };
    let current = { ...base, updatedAt: now, messages: [...history, pending] };
    let list = [current, ...sessions.filter((s) => s.id !== id)];
    setSessions(list);
    setActiveId(id);
    setDraftMessages([]);
    setBusy(true);

    // Common, clear questions are answered from the records at once, no model round trip.
    const instant = instantAnswer(text, intent, data);
    if (instant) {
      const done = { ...current, updatedAt: Date.now(), messages: [...history, { role: 'model', text: instant, at: Date.now(), instant: true }] };
      commit([done, ...list.filter((s) => s.id !== id)]);
      setBusy(false);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const update = (msg, persist = false) => {
      current = { ...current, updatedAt: Date.now(), messages: [...history, msg] };
      list = [current, ...list.filter((s) => s.id !== id)];
      if (persist) commit(list); else setSessions(list);
    };
    try {
      // 'auto': the fastest model this key can use (list cached for a day); a chosen model goes first, the fastest others back it up.
      const chain = await chainFor(uid, apiKey, model);
      const answer = await answerWithFallback({
        model: chain[0], fallbacks: chain.slice(1),
        // Only this question carries its records; earlier turns go as asked, which keeps the prompt small.
        apiKey, system, history: contextWindow(history, CONTEXT_TURNS).map((m) => (m === userMsg ? { ...m, apiText } : m)), signal: ctrl.signal,
        onText: (so) => update({ role: 'model', text: so, at: now, pending: true, steps: pending.steps }),
      });
      update({ role: 'model', text: answer, at: Date.now() }, true);
    } catch (e) {
      if (e?.name === 'AbortError') {
        const partial = current.messages.at(-1)?.text;
        update(partial ? { role: 'model', text: `${partial}\n\n*Stopped.*`, at: Date.now() } : { role: 'model', text: 'Stopped.', at: Date.now(), error: true }, true);
      } else {
        if (e?.code === 'model') clearCachedModels(uid); // models were retired: read the list again next time
        update({ role: 'model', text: e?.message || 'Something went wrong. Try again.', detail: e?.detail || null, at: Date.now(), error: true, code: e?.code }, true);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [busy, system, data, messages, activeId, active, sessions, apiKey, model, uid, commit]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const newChat = useCallback(() => { abortRef.current?.abort(); setActiveId(null); setDraftMessages([]); }, []);
  const openSession = useCallback((id) => { abortRef.current?.abort(); setActiveId(id); }, []);
  const deleteSession = useCallback((id) => {
    if (id === activeId) { abortRef.current?.abort(); setActiveId(null); }
    commit(sessions.filter((s) => s.id !== id));
  }, [activeId, sessions, commit]);
  const clearAll = useCallback(() => { abortRef.current?.abort(); clearSessions(uid); setSessions([]); setActiveId(null); }, [uid]);

  return { sessions, activeId, messages, busy, send, stop, newChat, openSession, deleteSession, clearAll };
}
