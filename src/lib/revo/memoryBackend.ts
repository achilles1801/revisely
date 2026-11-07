// An in-memory Revo backend for component tests (components/revo/__tests__): the server's rules
// (the questions a day, one Day in review a day, memory on or off, turning Revo off deletes history
// and memory) without the model. Scenarios and E2E use the real functions (TESTING.md).
// Its answers are fixed, picked by a few words of the question.

import type { RevoBackend } from './backend';
import { RevoError } from './backend';
import { pagesLabel } from './greeting';
import { REVO_DAILY_QUESTIONS, type RevoChat, type RevoContext, type RevoMemoryItem, type RevoMessage, type RevoSettings } from './types';

type Listener<T> = (v: T) => void;

export function createMemoryRevoBackend(opts: { now?: () => number; optIn?: boolean } = {}): RevoBackend & {
  /** Tests and E2E links: questions left today (0: the limit card). */
  setRemaining(day: string, left: number): void;
  /** A Day in review waiting (the button's dot). */
  seedReview(day: string, text: string, meta: string): void;
  seedMemory(items: { text: string; source: 'chat' | 'review'; day: string }[]): void;
  state(): { settings: RevoSettings; chats: RevoChat[]; memory: RevoMemoryItem[]; usage: { day: string; count: number } };
} {
  const now = opts.now ?? (() => Date.now());
  let settings: RevoSettings = { optIn: opts.optIn ?? false, memoryOn: true };
  let usage = { day: '', count: 0 };
  let chats: RevoChat[] = [];
  const messages = new Map<string, RevoMessage[]>();
  let memory: RevoMemoryItem[] = [];
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;

  const settingsL = new Set<Listener<RevoSettings>>();
  const usageL = new Set<Listener<{ day: string; count: number }>>();
  const chatsL = new Set<Listener<RevoChat[]>>();
  const memoryL = new Set<Listener<RevoMemoryItem[]>>();
  const messagesL = new Map<string, Set<Listener<RevoMessage[]>>>();

  const emit = () => {
    settingsL.forEach((l) => l(settings));
    usageL.forEach((l) => l(usage));
    const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
    chatsL.forEach((l) => l(sorted));
    memoryL.forEach((l) => l([...memory].sort((a, b) => b.at - a.at)));
    messagesL.forEach((set, chatId) => set.forEach((l) => l(messages.get(chatId) ?? [])));
  };
  const watch = <T,>(set: Set<Listener<T>>, cb: Listener<T>, value: T) => {
    set.add(cb);
    cb(value);
    return () => {
      set.delete(cb);
    };
  };

  const answer = (question: string, ctx: RevoContext): Omit<RevoMessage, 'id' | 'role' | 'at'> & { title: string } => {
    const q = question.toLowerCase();
    // The weak pages coming up, else any weak page, else what's next today.
    const weak = [ctx.today.weakNext, ctx.weakPages, ctx.today.nextPages].find((l) => l.length > 0)?.slice(0, 2) ?? [];
    if ((/plan|slip|weak/.test(q)) && weak.length > 0) {
      return {
        title: `Why ${pagesLabel(weak)} keep slipping`,
        text: `Both of these are rated weak, and they come round only every couple of weeks in your plan. Pages seen every few days tend to hold up better.`,
        chart: { kind: 'pageRatings', title: `${pagesLabel(weak)} · last 30 days`, pages: weak },
        textAfter: 'Seeing them first for a while should help. Here’s a plan:',
        action: { kind: 'reviseFirst', title: `${pagesLabel(weak)} first, tomorrow`, detail: 'Before the rest of tomorrow’s revision', pages: weak },
        chips: ['Which pages are like these?', 'How was my week?'],
      };
    }
    if (/week/.test(q)) {
      const total = ctx.week.reduce((n, d) => n + d.pages, 0);
      const days = ctx.week.filter((d) => d.pages > 0).length;
      return {
        title: 'How my week went',
        text: `You revised ${total} pages on ${days} of the last 7 days, about ${ctx.totals.pagesPerDay7} a day against a plan of ${ctx.totals.plannedPerDay}.`,
        chart: { kind: 'dailyPages', title: 'Pages revised · last 7 days', days: 7 },
        chips: ['How is my pace?'],
      };
    }
    return {
      title: question.length > 60 ? `${question.slice(0, 57)}…` : question,
      text: `At about ${ctx.totals.pagesPerDay30} pages a day over the last month, you’re close to your plan of ${ctx.totals.plannedPerDay}. Short sessions most days have been your steadiest weeks.`,
      chips: ['How was my week?'],
    };
  };

  const backend: ReturnType<typeof createMemoryRevoBackend> = {
    watchSettings: (_uid, cb) => watch(settingsL, cb, settings),
    watchUsage: (_uid, cb) => watch(usageL, cb, usage),
    watchChats: (_uid, cb) => watch(chatsL, cb, [...chats].sort((a, b) => b.updatedAt - a.updatedAt)),
    watchMemory: (_uid, cb) => watch(memoryL, cb, [...memory].sort((a, b) => b.at - a.at)),
    watchMessages(_uid, chatId, cb) {
      const set = messagesL.get(chatId) ?? new Set();
      messagesL.set(chatId, set);
      return watch(set, cb, messages.get(chatId) ?? []);
    },
    async ask({ chatId, day, question, context, attach }) {
      if (!settings.optIn) throw new RevoError('off', 'Turn Revo on first.');
      if (usage.day && day < usage.day) throw new RevoError('clock', 'Your phone’s date is behind.');
      if (usage.day !== day) usage = { day, count: 0 };
      if (usage.count >= REVO_DAILY_QUESTIONS) throw new RevoError('daily', `That’s today’s ${REVO_DAILY_QUESTIONS} questions.`);
      usage = { day, count: usage.count + 1 };
      const at = now();
      const a = answer(question, context);
      let chat = chatId ? chats.find((c) => c.id === chatId) : undefined;
      if (!chat) {
        chat = { id: id('chat'), kind: 'chat', title: a.title, day, createdAt: at, updatedAt: at, turns: 0 };
        chats = [...chats, chat];
      }
      const q: RevoMessage = { id: id('m'), role: 'user', text: question, at, ...(attach ? { attach: { kind: attach.kind, label: attach.label } } : {}) };
      const { title: _t, ...rest } = a;
      const r: RevoMessage = { id: id('m'), role: 'revo', at: at + 1, ...rest };
      messages.set(chat.id, [...(messages.get(chat.id) ?? []), q, r]);
      chats = chats.map((c) => (c.id === chat!.id ? { ...c, updatedAt: at + 1, turns: c.turns + 1 } : c));
      if (settings.memoryOn && /short|practical/.test(question.toLowerCase())) {
        memory = [...memory, { id: id('mem'), text: 'You like short, practical plans.', source: 'chat', day, chatId: chat.id, at }];
      }
      emit();
      return { chatId: chat.id, title: chat.title, question: q, reply: r, remainingToday: REVO_DAILY_QUESTIONS - usage.count, cached: false };
    },
    async dayInReview({ day }) {
      const chatId = `review-${day}`;
      return chats.some((c) => c.id === chatId) ? { chatId } : null;
    },
    async setOptions(input) {
      settings = { optIn: input.optIn ?? settings.optIn, memoryOn: input.memoryOn ?? settings.memoryOn };
      if (input.optIn === false) {
        chats = [];
        messages.clear();
        memory = [];
      }
      emit();
      return settings;
    },
    async clear(what) {
      if (what === 'memory') memory = [];
      else {
        chats = [];
        messages.clear();
      }
      emit();
    },
    async setFeedback(_uid, chatId, messageId, feedback) {
      messages.set(chatId, (messages.get(chatId) ?? []).map((m) => (m.id === messageId ? { ...m, feedback } : m)));
      emit();
    },
    async setActionState(_uid, chatId, messageId, state) {
      messages.set(chatId, (messages.get(chatId) ?? []).map((m) => (m.id === messageId ? { ...m, actionState: state } : m)));
      if (state === 'added') chats = chats.map((c) => (c.id === chatId ? { ...c, meta: 'plan added' } : c));
      emit();
    },
    async deleteMemory(_uid, memId) {
      memory = memory.filter((m) => m.id !== memId);
      emit();
    },
    setRemaining(day, left) {
      usage = { day, count: Math.max(0, REVO_DAILY_QUESTIONS - left) };
      emit();
    },
    seedReview(day, text, meta) {
      const at = now();
      const chatId = `review-${day}`;
      chats = [...chats.filter((c) => c.id !== chatId), { id: chatId, kind: 'review', title: 'Day in review', day, createdAt: at, updatedAt: at, turns: 1, meta }];
      messages.set(chatId, [{ id: id('m'), role: 'revo', text, at }]);
      emit();
    },
    seedMemory(items) {
      // Sent twice (a link can arrive twice), still once each.
      const fresh = items.filter((m) => !memory.some((x) => x.text === m.text));
      memory = [...memory, ...fresh.map((m, i) => ({ id: id('mem'), at: now() - i * 1000, ...m }))];
      emit();
    },
    state: () => ({ settings, chats, memory, usage }),
  };
  return backend;
}
