/**
 * The console's Firestore side (firebase-admin) and its collection of everything adminMetrics shows.
 *   config/admin            { conversations: boolean }: whether adminRevo shows conversation text (server only)
 *   adminMetrics/totals     { json, at }: the GitHub workflow's Sentry and App Store totals (server only)
 *   adminMetrics/alarms     { on: string[], at }: the alarms on at the last hourly check (server only)
 * Clients can't read or write any of them (the rules' catch-all).
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { Input, Totals } from './aggregate';
import { RANGES } from './aggregate';
import type { RevoChatRow, RevoMemoryRow, RevoMessageRow, RevoReadStore, TotalsStore } from './admin';
import { googleClient, metadataToken, readFirestore, readMonitoring, readRevoLines } from './sources';

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** What a question came with: its chips, and a note's or a day's own words where it had them. */
function attachmentsOf(d: Record<string, unknown>): { kind: string; label: string; detail?: string }[] {
  const list = (Array.isArray(d.attachList) ? d.attachList : d.attachData ? [d.attachData] : Array.isArray(d.attachments) ? d.attachments : d.attach ? [d.attach] : []) as Record<string, unknown>[];
  return list.map((a) => {
    const facts = (a.facts ?? {}) as Record<string, unknown>;
    const notes = Array.isArray(facts.notes) ? facts.notes.map((n) => (typeof n === 'string' ? n : str((n as Record<string, unknown>)?.text))).filter(Boolean).join(' · ') : '';
    const detail = str(a.text) || notes;
    return { kind: str(a.kind, 'other'), label: str(a.label), ...(detail ? { detail: detail.slice(0, 2000) } : {}) };
  });
}

export function adminRevoStore(db: Firestore): RevoReadStore {
  return {
    async conversationsOpen() {
      return (await db.doc('config/admin').get()).get('conversations') === true;
    },
    async accountExists(uid) {
      const [user, settings] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`coachSettings/${uid}`).get()]);
      return user.exists || settings.exists;
    },
    async chats(uid) {
      const snap = await db.collection(`users/${uid}/revoChats`).orderBy('updatedAt', 'desc').limit(200).get();
      return snap.docs.map((d): RevoChatRow => ({ id: d.id, kind: str(d.get('kind'), 'chat'), title: str(d.get('title')), day: str(d.get('day')), createdAt: num(d.get('createdAt')), updatedAt: num(d.get('updatedAt')), turns: num(d.get('turns')), ...(typeof d.get('meta') === 'string' ? { meta: d.get('meta') } : {}) }));
    },
    async messages(uid, chatId) {
      const chat = await db.doc(`users/${uid}/revoChats/${chatId}`).get();
      if (!chat.exists) return null;
      const snap = await chat.ref.collection('messages').orderBy('at', 'asc').limit(400).get();
      return snap.docs.map((doc): RevoMessageRow => {
        const d = doc.data() as Record<string, unknown>;
        const action = d.action as Record<string, unknown> | undefined;
        const chart = (d.visual ?? d.chart) as Record<string, unknown> | undefined;
        return {
          id: doc.id,
          role: str(d.role),
          text: str(d.text),
          ...(typeof d.textAfter === 'string' ? { textAfter: d.textAfter } : {}),
          at: num(d.at),
          attachments: attachmentsOf(d),
          ...(chart ? { chart: `${str(chart.kind)}${chart.title ? ': ' + str(chart.title) : ''}` } : {}),
          ...(action ? { action: { kind: str(action.kind), title: str(action.title), state: typeof d.actionState === 'string' ? d.actionState : null } } : {}),
          feedback: typeof d.feedback === 'string' ? d.feedback : null,
        };
      });
    },
    async memory(uid) {
      const snap = await db.collection(`users/${uid}/revoMemory`).orderBy('at', 'desc').limit(60).get();
      return snap.docs.map((d): RevoMemoryRow => ({ id: d.id, text: str(d.get('text')), source: str(d.get('source')), day: str(d.get('day')), at: num(d.get('at')) }));
    },
    async settings(uid) {
      const s = await db.doc(`coachSettings/${uid}`).get();
      const on = s.get('revoOn');
      return { revoOn: on === true || (on === undefined && s.get('optIn') === true), memoryOn: s.get('memoryOn') !== false };
    },
  };
}

export function adminTotalsStore(db: Firestore): TotalsStore {
  return {
    async saveTotals(json, at) {
      await db.doc('adminMetrics/totals').set({ json, at });
    },
    async alarmsOn() {
      const on = (await db.doc('adminMetrics/alarms').get()).get('on');
      return Array.isArray(on) ? on.filter((x): x is string => typeof x === 'string') : [];
    },
    async setAlarmsOn(ids, at) {
      await db.doc('adminMetrics/alarms').set({ on: ids, at });
    },
  };
}

async function storedTotals(db: Firestore): Promise<Totals | null> {
  const json = (await db.doc('adminMetrics/totals').get()).get('json');
  return typeof json === 'string' ? (JSON.parse(json) as Totals) : null;
}

/** Everything aggregate.ts needs. A part that fails is named in `sources`; the rest still shows. */
export function collector(db: Firestore, project: string, opts: { emulator: boolean }) {
  return async (now: number): Promise<Omit<Input, 'now'>> => {
    const sources: Record<string, string> = {};
    const attempt = async <T>(name: string, f: () => Promise<T>): Promise<T | null> => {
      try {
        const v = await f();
        sources[name] = 'ok';
        return v;
      } catch (err) {
        sources[name] = String((err as Error)?.message ?? err).replace(/[A-Za-z0-9_-]{20,}/g, '…').slice(0, 160);
        return null;
      }
    };
    const call = googleClient(() => metadataToken());
    const cloud = <T>(name: string, f: () => Promise<T>) => (opts.emulator ? (sources[name] = 'not in the emulator', Promise.resolve(null)) : attempt(name, f));
    const [fsData, revoLines, monitoring, totals] = await Promise.all([
      attempt('Firestore', () => readFirestore(db)),
      cloud('Revo logs', () => readRevoLines(call, project, new Date(now - RANGES['30d'].ms - 86400e3).toISOString())),
      cloud('Cloud Monitoring', () => readMonitoring(call, project, now)),
      attempt('Sentry and App Store', () => storedTotals(db)),
    ]);
    if (totals?.errors) for (const [k, v] of Object.entries(totals.errors)) if (v) sources[k === 'sentry' ? 'Sentry' : 'App Store'] = String(v).slice(0, 160);
    if (!totals && sources['Sentry and App Store'] === 'ok') sources['Sentry and App Store'] = 'no totals yet (the Metrics workflow sends them hourly)';
    return {
      chats: fsData?.chats,
      messages: fsData?.messages,
      settings: fsData?.settings,
      testers: fsData?.testers,
      ledgerDays: fsData?.ledgerDays,
      coach: fsData?.coach,
      app: fsData?.app,
      revoLines,
      monitoring,
      totals,
      sources,
    };
  };
}
