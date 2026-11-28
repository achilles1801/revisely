// Label recitations (/label; adminConsole labels.*, functions/src/console/labels.ts; owners, admins and labellers,
// revisely-dev only). Redesigned Nov 16 2026 after Majd's first try ("i dont see a way to go to next clip … not have to
// refresh if it gets stuck"):
// - a bar always at the bottom: ‹ Previous, ▶ Play, Next › (Next says why it can't go yet: "2 marks left"), swipes too;
// - one question at a time ("Is this a mistake?"), moving on by itself, then to Next;
// - nothing ever needs a reload: every load has a 10 s watchdog that turns into Try again with the reason; saves go in the
//   background, retry by themselves and say so (Saving… / Saved / Couldn't save · Retry), kept on the phone meanwhile;
//   audio that won't load says so; the answers on a clip are kept as a draft until saved, so a reload resumes.
// The clip plays as it opens; the next one is fetched and decoded while this one is labelled.
import { boot, currentUser, signInUrl, signOutNow } from '/firebase.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── What the labeller can say ──
const ANSWERS = [
  ['yes', 'Mistake', '3'],
  ['no', 'Not a mistake', '1'],
  ['unsure', 'Can’t tell', '2'],
];
/** A word the checker didn't mark. */
const MISSED = [
  ['word', 'Wrong word', 'w'],
  ['skipped', 'Skipped', 's'],
  ['added', 'Extra word after it', 'a'],
  ['harakat', 'Haraka', 'h'],
  ['letter', 'Letter', 'l'],
  ['unclear', 'Not clear', 'u'],
];
const KIND_NAME = { word: 'Wrong word', skipped: 'Skipped word', added: 'Extra word', harakat: 'Haraka', letter: 'Letter', tajweed: 'Tajweed' };
const DETAIL_NAME = { lookalike: 'a similar word', sound: 'other sounds', replaced: 'replaced', order: 'out of order', trail: 'after the end', shadda: 'shadda' };
const GROUP = { word: 'red', skipped: 'red', added: 'red', harakat: 'amber', letter: 'amber', tajweed: 'violet' };
const KIND_ORDER = { skipped: 0, word: 1, harakat: 2, letter: 3, tajweed: 4, added: 5 };
const MISSED_GROUP = { word: 'red', skipped: 'red', added: 'red', harakat: 'amber', letter: 'amber', unclear: 'amber' };
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);
const SURAHS = ['', 'Al-Fātiḥah', 'Al-Baqarah', "Āli-'Imrān", 'An-Nisā', "Al-Mā'idah", "Al-An'ām", "Al-A'rāf", 'Al-Anfāl', 'At-Tawbah', 'Yūnus', 'Hūd', 'Yūsuf', "Ar-Ra'd", 'Ibrāhīm', 'Al-Ḥijr', 'An-Naḥl', "Al-Isrā'", 'Al-Kahf', 'Maryam', 'Ṭā-Hā', "Al-Anbiyā'", 'Al-Ḥajj', "Al-Mu'minūn", 'An-Nūr', 'Al-Furqān', "Ash-Shu'arā'", 'An-Naml', 'Al-Qaṣaṣ', "Al-'Ankabūt", 'Ar-Rūm', 'Luqmān', 'As-Sajdah', 'Al-Aḥzāb', "Saba'", 'Fāṭir', 'Yā-Sīn', 'Aṣ-Ṣāffāt', 'Ṣād', 'Az-Zumar', 'Ghāfir', 'Fuṣṣilat', 'Ash-Shūrā', 'Az-Zukhruf', 'Ad-Dukhān', 'Al-Jāthiyah', 'Al-Aḥqāf', 'Muḥammad', 'Al-Fatḥ', 'Al-Ḥujurāt', 'Qāf', 'Adh-Dhāriyāt', 'Aṭ-Ṭūr', 'An-Najm', 'Al-Qamar', 'Ar-Raḥmān', "Al-Wāqi'ah", 'Al-Ḥadīd', 'Al-Mujādilah', 'Al-Ḥashr', 'Al-Mumtaḥanah', 'Aṣ-Ṣaff', "Al-Jumu'ah", 'Al-Munāfiqūn', 'At-Taghābun', 'Aṭ-Ṭalāq', 'At-Taḥrīm', 'Al-Mulk', 'Al-Qalam', 'Al-Ḥāqqah', "Al-Ma'ārij", 'Nūḥ', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyāmah', 'Al-Insān', 'Al-Mursalāt', "An-Naba'", "An-Nāzi'āt", "'Abasa", 'At-Takwīr', 'Al-Infiṭār', 'Al-Muṭaffifīn', 'Al-Inshiqāq', 'Al-Burūj', 'Aṭ-Ṭāriq', "Al-A'lā", 'Al-Ghāshiyah', 'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Aḍ-Ḍuḥā', 'Ash-Sharḥ', 'At-Tīn', "Al-'Alaq", 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', "Al-'Ādiyāt", "Al-Qāri'ah", 'At-Takāthur', "Al-'Aṣr", 'Al-Humazah', 'Al-Fīl', 'Quraysh', "Al-Mā'ūn", 'Al-Kawthar', 'Al-Kāfirūn', 'An-Naṣr', 'Al-Masad', 'Al-Ikhlāṣ', 'Al-Falaq', 'An-Nās'];

const KEYS = { pending: 'revisely.labels.pending.v1.', draft: 'revisely.labels.draft.v1.', text: 'revisely.labels.textSize', speed: 'revisely.labels.speed', hint: 'revisely.labels.hintSeen' };
const TEXT_SIZES = [24, 28, 32, 38, 44, 52];
/** A clip open longer than this counts this long toward the hourly rate (time away isn't labelling). */
const ACTIVE_CAP_MS = 180_000;
/** Any wait longer than this becomes Try again, with the reason. */
const WATCHDOG_MS = 10_000;

const store = {
  get(k, fallback = null) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // private mode or full: kept in memory for this visit
    }
  },
};

let ctx = null;
let me = null;

// ── State ──
let cur = null; // { clip, buffer, answers: { marks, words, notes, clipNote }, order, marksOn, undo, actions, shownAt }
let upcoming = null; // Promise<{ clip, buffer } | null | undefined>, fetched and decoded ahead
const visited = new Map(); // clip id → { clip, buffer, answers } for clips saved in this visit
const prevIds = []; // labelled clip ids before the one on screen, oldest first
const forward = []; // clips stepped back from, to return to (newest last)
let recentLoaded = false;
let pending = []; // labels not yet on the server
let flushing = false;
let saveFailed = false;
let stats = null;
const sitting = { answers: 0, ms: 0 };
let focus = -1; // index in cur.order of the question on screen
let speed = 1;

// ── Small pieces ──
function failureText(err) {
  const code = String((err && err.code) || '').replace('functions/', '');
  if (err && err.watchdog) return 'No answer after 10 seconds. The connection may be slow or down.';
  if (!navigator.onLine) return 'You’re offline. Your answers are kept on this phone.';
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal') return 'The console didn’t answer.';
  return (err && err.message) || 'That didn’t work.';
}

/** The call, or a watchdog failure after 10 s (the call carries on; Try again asks again). */
function guarded(promise) {
  let timer = 0;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('watchdog'), { watchdog: true })), WATCHDOG_MS);
    }),
  ]);
}

let toastTimer = 0;
function toast(text, bad = false) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.className = 'toast lab-toast' + (bad ? ' bad' : '');
  t.textContent = text;
  t.hidden = false;
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 3500);
}

/** The page's own failures, to the server's log (no answers, no audio): so a stuck page leaves a trace. */
let reports = 0;
function report(message, where, stack) {
  if (!ctx || reports >= 5) return;
  reports += 1;
  ctx.call('adminConsole', { action: 'labels.log', message: String(message || ''), where: String(where || ''), stack: String(stack || '') }).catch(() => {});
}
window.addEventListener('error', (e) => report(e.message, (e.filename || '') + ':' + (e.lineno || ''), e.error && e.error.stack));
window.addEventListener('unhandledrejection', (e) => report(e.reason && (e.reason.message || e.reason), 'promise', e.reason && e.reason.stack));

// ── Audio (Web Audio: exact snippets, one unlock for the sitting) ──
let actx = null;
let source = null;
let playing = null; // { from, to, t0, what, rate }
let lastPos = 0;
let raf = 0;

function audioContext() {
  if (!actx) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // play through the ringer switch
    } catch {
      // older Safari
    }
    actx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return actx;
}

async function decode(audio) {
  const bin = atob(audio.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return audioContext().decodeAudioData(bytes.buffer);
}

function stop() {
  if (source) {
    const s = source;
    source = null;
    try {
      s.stop();
    } catch {
      // ended
    }
  }
  if (playing) lastPos = position();
  playing = null;
  cancelAnimationFrame(raf);
  drawPlayer();
}

function position() {
  if (!playing) return lastPos;
  return Math.min(playing.to, playing.from + (actx.currentTime - playing.t0) * playing.rate);
}

function play(from, to, what) {
  if (!cur?.buffer) return;
  stop();
  const ac = audioContext();
  if (ac.state === 'suspended') ac.resume();
  const dur = cur.buffer.duration;
  from = Math.max(0, Math.min(from, dur));
  to = Math.max(from, Math.min(to, dur));
  if (to - from < 0.05) return;
  const s = ac.createBufferSource();
  s.buffer = cur.buffer;
  s.playbackRate.value = speed; // slower is lower too: Web Audio has no pitch correction
  s.connect(ac.destination);
  s.start(0, from, to - from);
  source = s;
  playing = { from, to, t0: ac.currentTime, what, rate: speed };
  s.onended = () => {
    if (source !== s) return;
    source = null;
    lastPos = playing ? playing.to : lastPos;
    playing = null;
    drawPlayer();
  };
  tick();
}

function tick() {
  drawPlayer();
  if (playing) raf = requestAnimationFrame(tick);
}

const clock = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

function drawPlayer() {
  const isPlaying = !!playing;
  $('playIcon').setAttribute('d', isPlaying ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z');
  $('playBtn').setAttribute('aria-label', isPlaying ? 'Pause' : 'Play the clip');
  if (!cur) return;
  const dur = cur.buffer?.duration || cur.clip.seconds || 1;
  const pos = position();
  $('barFill').style.width = (100 * pos) / dur + '%';
  $('time').textContent = clock(pos) + ' / ' + clock(dur);
  $('bar').setAttribute('aria-valuemax', String(Math.round(dur)));
  $('bar').setAttribute('aria-valuenow', String(Math.round(pos)));
}

function playClip() {
  if (!cur?.buffer) return;
  if (playing) return stop();
  const dur = cur.buffer.duration;
  play(lastPos >= dur - 0.1 ? 0 : lastPos, dur, 'clip');
}

/** When a word was said: the checker's own time for a mark, else the clip's word times. */
function wordSpan(w) {
  const t = cur.clip.times.find((x) => x[0] === w);
  return t ? [t[1], t[2]] : null;
}

function markSpan(m) {
  if (Array.isArray(m.t) && m.t.length === 2) return [m.t[0] - 0.6, m.t[1] + 0.4];
  const a = wordSpan(m.w);
  const b = m.kind === 'added' ? wordSpan(m.w + 1) : null;
  if (a && b) return [a[0] - 0.4, b[1] + 0.4];
  if (a) return [a[0] - 0.8, a[1] + (m.kind === 'added' ? 1.6 : 0.6)];
  return null;
}

function playMark(m) {
  const span = markSpan(m);
  if (span) play(span[0], span[1], 'mark');
}

// ── Views, and trouble ──
function view(which) {
  $('clipView').hidden = which !== 'clip';
  $('trouble').hidden = which !== 'trouble';
  $('emptyView').hidden = which !== 'empty';
  $('nav').hidden = which !== 'clip';
  $('boot').hidden = which !== 'boot';
}

let retry = null;
function trouble(title, text, again) {
  stop();
  $('troubleTitle').textContent = title;
  $('troubleText').textContent = text;
  retry = again;
  view('trouble');
}

function orderOf(clip) {
  const pos = new Map(clip.words.map((w, i) => [w.w, i]));
  return [...clip.marks].sort((a, b) => (pos.get(a.w) ?? -1) - (pos.get(b.w) ?? -1) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

function emptyAnswers(label) {
  return {
    marks: { ...(label?.marks ?? {}) },
    words: { ...(label?.words ?? {}) },
    notes: { ...(label?.wordNotes ?? {}) },
    clipNote: label?.note ?? '',
  };
}

function show(item, answers) {
  stop();
  lastPos = 0;
  const clip = item.clip;
  // A draft of this clip left by a reload or a dropped connection comes back as it was.
  const draft = store.get(KEYS.draft + me.uid);
  const restored = !answers && draft && draft.id === clip.id ? draft : null;
  cur = {
    clip,
    buffer: item.buffer,
    answers: answers ?? restored?.answers ?? emptyAnswers(clip.label),
    order: orderOf(clip),
    undo: [],
    actions: restored?.actions ?? [],
    shownAt: Date.now(),
  };
  const first = clip.words[0];
  const last = clip.words[clip.words.length - 1];
  $('where').textContent = (SURAHS[first.s] || 'Surah ' + first.s) + ' ' + first.s + ':' + first.a + (last.s !== first.s ? '–' + last.s + ':' + last.a : last.a !== first.a ? '–' + last.a : '');
  drawSource();
  renderWords();
  drawTicks();
  focus = nextUnanswered(-1);
  view('clip');
  render();
  $('words').scrollTop = 0;
  drawPlayer();
  if (restored) toast('Picked up where you left off.');
}

function drawSource() {
  const clip = cur.clip;
  $('source').textContent = clip.source.name + (cur.answers.clipNote ? ' · ✎ clip note' : '');
  $('clipNo').textContent = clip.label ? 'Labelled · change anything' : clip.status !== 'open' ? 'Second label' : stats ? 'Clip ' + Math.min(stats.total, stats.labelled + 1) + ' of ' + stats.total : '';
}

function saveDraft() {
  if (!cur || !me) return;
  store.set(KEYS.draft + me.uid, { id: cur.clip.id, answers: cur.answers, actions: cur.actions.slice(0, 300) });
}

// ── Loading clips ──
async function fetchClip(action, extra) {
  const held = [cur?.clip.id, ...pending.map((p) => p.id), ...forward.map((f) => f.clip.id)].filter(Boolean);
  const body = { action, ...(action === 'labels.next' ? { held: [...new Set(held)] } : {}), ...extra };
  const res = await guarded(ctx.call('adminConsole', body, 60_000));
  if (!res.clip) return null;
  let buffer;
  try {
    buffer = await decode(res.audio);
  } catch (err) {
    throw Object.assign(new Error('audio'), { audio: true, cause: err });
  }
  return { clip: res.clip, buffer };
}

function prefetch() {
  upcoming = fetchClip('labels.next').catch(() => undefined);
}

async function openNext(autoplay = true) {
  if (forward.length) {
    const f = forward.pop();
    show(f, f.answers);
    if (autoplay) playClip();
    return;
  }
  let item = upcoming ? await upcoming : undefined;
  upcoming = null;
  if (item === undefined) {
    view('boot');
    $('boot').textContent = 'Loading the next clip…';
    try {
      item = await fetchClip('labels.next');
    } catch (err) {
      report('next failed: ' + (err.message || err), 'openNext');
      return trouble(
        err.audio ? 'Couldn’t load the audio' : 'Couldn’t load the next clip',
        err.audio ? 'This phone couldn’t play the clip’s audio.' : failureText(err),
        () => openNext(autoplay),
      );
    }
  }
  if (!item) return showEmpty();
  show(item);
  prefetch();
  if (autoplay) playClip();
}

async function openClip(id, answers) {
  const known = visited.get(id);
  if (known) {
    show(known, answers ?? known.answers);
    playClip();
    return;
  }
  view('boot');
  $('boot').textContent = 'Loading that clip…';
  try {
    const item = await fetchClip('labels.get', { id });
    if (!item) return openNext();
    show(item, answers);
    playClip();
  } catch (err) {
    trouble(err.audio ? 'Couldn’t load the audio' : 'Couldn’t load that clip', err.audio ? 'This phone couldn’t play the clip’s audio.' : failureText(err), () => openClip(id, answers));
  }
}

function showEmpty() {
  stop();
  cur = null;
  $('emptyText').textContent = pending.length
    ? 'Every clip has a label. ' + pending.length + (pending.length === 1 ? ' label is' : ' labels are') + ' still being sent.'
    : 'Every clip has a label. New ones show up here when the lab adds them.';
  view('empty');
  drawStats();
}

// ── The words ──
function renderWords() {
  const { clip } = cur;
  const marksOn = new Map();
  const added = new Map();
  for (const m of cur.order) {
    if (m.kind === 'added') added.set(m.w, [...(added.get(m.w) ?? []), m]);
    else marksOn.set(m.w, [...(marksOn.get(m.w) ?? []), m]);
  }
  cur.marksOn = marksOn;
  const html = [];
  for (const m of added.get(clip.words[0].w - 1) ?? []) html.push(insHtml(m));
  clip.words.forEach((w, i) => {
    html.push('<button type="button" class="wd" data-w="' + w.w + '">' + esc(w.t) + '</button>');
    for (const m of added.get(w.w) ?? []) html.push(insHtml(m));
    const nextWord = clip.words[i + 1];
    if (!nextWord || nextWord.a !== w.a || nextWord.s !== w.s) html.push('<span class="ayn" aria-label="end of ayah ' + w.a + '">﴿' + arNum(w.a) + '﴾</span>');
  });
  $('words').innerHTML = html.join(' ');
}

const insHtml = (m) => '<button type="button" class="ins" data-mark="' + esc(m.id) + '" aria-label="Extra word here">+</button>';

function paintWords() {
  const focused = cur.order[focus];
  for (const el of $('words').querySelectorAll('.wd')) {
    const w = +el.dataset.w;
    const marks = cur.marksOn.get(w) ?? [];
    const open = marks.filter((m) => !(m.id in cur.answers.marks));
    const lead = open[0] ?? marks[0];
    el.className = 'wd';
    if (lead) {
      el.classList.add('g-' + GROUP[lead.kind]);
      if (!open.length) el.classList.add('v-' + verdictOf(marks));
      if (lead.sure === 'likely' && open.length) el.classList.add('likely');
    }
    const miss = cur.answers.words[w];
    if (miss) el.classList.add('miss', 'm-' + MISSED_GROUP[miss]);
    if (cur.answers.notes[w]) el.classList.add('noted');
    if (focused && focused.w === w && focused.kind !== 'added') el.classList.add('focus');
  }
  for (const el of $('words').querySelectorAll('.ins')) {
    const m = cur.order.find((x) => x.id === el.dataset.mark);
    el.className = 'ins';
    if (m.id in cur.answers.marks) el.classList.add('v-' + cur.answers.marks[m.id]);
    if (focused && focused.id === m.id) el.classList.add('focus');
  }
}

function verdictOf(marks) {
  const vs = marks.map((m) => cur.answers.marks[m.id]);
  return vs.includes('yes') ? 'yes' : vs.includes('unsure') ? 'unsure' : 'no';
}

function drawTicks() {
  const dur = cur.buffer?.duration || cur.clip.seconds || 1;
  $('ticks').innerHTML = cur.order
    .map((m, i) => {
      const span = markSpan(m);
      if (!span) return '';
      const at = Math.max(0, Math.min(100, (100 * (span[0] + 0.6)) / dur));
      return '<span class="tick g-' + GROUP[m.kind] + '" data-i="' + i + '" style="left:' + at.toFixed(2) + '%"></span>';
    })
    .join('');
}

function nextUnanswered(from) {
  for (let i = from + 1; i < cur.order.length; i++) if (!(cur.order[i].id in cur.answers.marks)) return i;
  for (let i = 0; i <= from && i < cur.order.length; i++) if (!(cur.order[i].id in cur.answers.marks)) return i;
  return -1;
}

const openMarks = () => (cur ? cur.order.filter((m) => !(m.id in cur.answers.marks)).length : 0);

// ── The question card ──
function markText(m) {
  let head = KIND_NAME[m.kind] || m.kind;
  if (m.kind === 'tajweed' && m.rule) head = String(m.rule).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const detail = m.detail && DETAIL_NAME[m.detail] ? DETAIL_NAME[m.detail] : '';
  const lines = [];
  if (m.heard) lines.push('Heard <span class="ar" dir="rtl" lang="ar">' + esc(m.heard) + '</span>' + (m.heardExact === false ? ' (as it sounded)' : ''));
  if (m.slip && typeof m.slip === 'object') {
    // A haraka alone sits on a tatweel, which every Arabic font draws.
    const shape = (c) => (c === '' ? '' : /^[ً-ْٰ]+$/.test(c) ? 'ـ' + c + 'ـ' : c);
    const e = m.slip.expected;
    const h = m.slip.heard;
    lines.push(
      e === '' ? 'Added <span class="ar">' + esc(shape(h)) + '</span>'
        : h === '' ? '<span class="ar">' + esc(shape(e)) + '</span> not heard'
          : 'Expected <span class="ar">' + esc(shape(e)) + '</span>, heard <span class="ar">' + esc(shape(h)) + '</span>',
    );
  }
  if (typeof m.got === 'number' && typeof m.expected === 'number') lines.push('Held ' + m.got + ', needs ' + m.expected);
  return { head, detail, lines };
}

const tool = (id, label) => '<button type="button" class="lab-tool" id="' + id + '">' + label + '</button>';

function render() {
  paintWords();
  const card = $('card');
  const n = cur.order.length;
  const m = cur.order[focus];
  if (m) {
    const t = markText(m);
    const span = markSpan(m);
    const current = cur.answers.marks[m.id];
    card.innerHTML =
      '<div class="q-head"><span class="q-step">Mark ' + (focus + 1) + ' of ' + n + '</span>' +
      (m.sure === 'likely' ? '<span class="sure likely">checker unsure</span>' : '') + '</div>' +
      '<div class="q-title">Is this a mistake?</div>' +
      '<div class="q-what"><span class="sw g-' + GROUP[m.kind] + '"></span><b>' + esc(t.head) + '</b>' + (t.detail ? ' · ' + esc(t.detail) : '') +
      (t.lines.length ? '<div class="q-lines">' + t.lines.join(' · ') + '</div>' : '') + '</div>' +
      '<div class="q-answers">' +
      ANSWERS.map(([v, label, key]) => '<button type="button" class="lab-ans a-' + v + (current === v ? ' on' : '') + '" data-v="' + v + '">' + esc(label) + '<kbd>' + key + '</kbd></button>').join('') +
      '</div>' +
      '<div class="q-tools">' +
      (span ? tool('againBtn', '▶ Hear it again') : '') +
      tool('fineBtn', 'All fine') +
      tool('noteBtn', cur.answers.notes[m.w] ? '✎ Edit note' : '✎ Note') +
      (cur.undo.length ? tool('undoBtn', '↶ Undo') : '') +
      '</div>';
    if (span) $('againBtn').onclick = () => playMark(m);
    $('fineBtn').onclick = allFine;
    $('noteBtn').onclick = () => openNote(m.w);
  } else {
    const missed = Object.keys(cur.answers.words).length;
    card.innerHTML =
      '<div class="q-done"><span class="q-check" aria-hidden="true">✓</span>' +
      (n ? (n === 1 ? 'The mark is answered' : 'All ' + n + ' marks answered') : 'The checker found nothing here') + '</div>' +
      '<div class="q-sub">' + (missed ? missed + (missed === 1 ? ' word' : ' words') + ' you marked. ' : '') +
      'Tap any word the checker missed, or go on with Next.' + (n ? ' Tap a highlighted word to change its answer.' : '') + '</div>' +
      '<div class="q-tools">' + tool('clipNoteBtn', cur.answers.clipNote ? '✎ Edit clip note' : '✎ Note on this clip') + (cur.undo.length ? tool('undoBtn', '↶ Undo') : '') + '</div>';
    $('clipNoteBtn').onclick = () => openNote('clip');
  }
  if (cur.undo.length) $('undoBtn').onclick = undo;
  drawNav();
  drawStats();
}

function drawNav() {
  const left = openMarks();
  $('nextBtn').classList.toggle('ready', !left);
  $('nextBtn').setAttribute('aria-disabled', String(!!left));
  $('nextNote').textContent = left ? (left === 1 ? '1 mark left' : left + ' marks left') : '';
  $('prevBtn').disabled = !(prevIds.length > 0 || !recentLoaded);
}

// ── Answers ──
function act(a) {
  cur.actions.push({ t: Date.now() - cur.shownAt, ...a });
}

function changed() {
  saveDraft();
  render();
}

function answer(v) {
  const m = cur.order[focus];
  if (!m) return;
  const before = cur.answers.marks[m.id];
  cur.answers.marks[m.id] = v;
  cur.undo.push({ type: 'mark', id: m.id, before });
  act({ a: 'mark', id: m.id, v, was: before ?? null });
  focus = nextUnanswered(focus);
  changed();
  const now = cur.order[focus];
  if (now) {
    scrollToMark(now);
    if (!playing || playing.what !== 'clip') playMark(now);
  }
}

/** Every mark not answered yet: not a mistake. With none left: the next clip. */
function allFine() {
  if (!cur) return;
  const open = cur.order.filter((m) => !(m.id in cur.answers.marks)).map((m) => m.id);
  if (!open.length) return next();
  for (const id of open) cur.answers.marks[id] = 'no';
  cur.undo.push({ type: 'fine', ids: open });
  act({ a: 'fine' });
  focus = -1;
  changed();
}

function undo() {
  const u = cur?.undo.pop();
  if (!u) return;
  act({ a: 'undo' });
  if (u.type === 'fine') {
    for (const id of u.ids) delete cur.answers.marks[id];
    focus = nextUnanswered(-1);
  } else if (u.type === 'mark') {
    if (u.before === undefined) delete cur.answers.marks[u.id];
    else cur.answers.marks[u.id] = u.before;
    focus = cur.order.findIndex((m) => m.id === u.id);
  } else if (u.before === undefined) delete cur.answers.words[u.w];
  else cur.answers.words[u.w] = u.before;
  changed();
}

function focusMark(i) {
  if (i < 0 || i >= cur.order.length) return;
  focus = i;
  render();
  scrollToMark(cur.order[i]);
  playMark(cur.order[i]);
}

function scrollToMark(m) {
  const el = m.kind === 'added' ? $('words').querySelector('.ins[data-mark="' + CSS.escape(m.id) + '"]') : $('words').querySelector('.wd[data-w="' + m.w + '"]');
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── A word the checker missed ──
let sheetW = null;

function openSheet(w) {
  const word = cur.clip.words.find((x) => x.w === w);
  if (!word) return;
  sheetW = w;
  $('sheetWord').textContent = word.t;
  $('sheetTitle').textContent = (SURAHS[word.s] || '') + ' ' + word.s + ':' + word.a;
  const span = wordSpan(w);
  $('sheetPlay').hidden = !span;
  const current = cur.answers.words[w];
  $('sheetOpts').innerHTML =
    MISSED.map(([v, label, key]) => '<button type="button" class="lab-opt m-' + MISSED_GROUP[v] + (current === v ? ' on' : '') + '" data-v="' + v + '">' + esc(label) + '<kbd>' + key.toUpperCase() + '</kbd></button>').join('') +
    (current ? '<button type="button" class="lab-opt fine" data-v="">Fine: take it back<kbd>0</kbd></button>' : '') +
    '<button type="button" class="lab-opt note" data-note="1">' + (cur.answers.notes[w] ? '✎ Edit your note' : '✎ Add a note') + '<kbd>N</kbd></button>';
  $('sheetBack').hidden = false;
  $('sheet').hidden = false;
  if (span) play(span[0] - 0.5, span[1] + 0.5, 'word');
}

function closeSheet() {
  sheetW = null;
  $('sheet').hidden = true;
  $('sheetBack').hidden = true;
}

function labelWord(v) {
  const w = sheetW;
  closeSheet();
  if (w == null) return;
  const before = cur.answers.words[w];
  if (v) cur.answers.words[w] = v;
  else delete cur.answers.words[w];
  cur.undo.push({ type: 'word', w, before });
  act(v ? { a: 'word', w, v, was: before ?? null } : { a: 'clear', w, was: before ?? null });
  changed();
}

// ── Notes ──
let noteFor = null; // a word number, or 'clip'

function openNote(target) {
  if (!cur) return;
  noteFor = target;
  const isClip = target === 'clip';
  const word = isClip ? null : cur.clip.words.find((x) => x.w === target);
  $('noteTitle').textContent = isClip ? 'Note on this clip' : 'Note on this word';
  $('noteWord').textContent = word ? word.t : '';
  $('noteWord').hidden = !word;
  $('noteText').placeholder = isClip ? 'Background noise, two reciters, cut off…' : 'What you heard, in any language';
  $('noteText').value = isClip ? cur.answers.clipNote || '' : cur.answers.notes[target] || '';
  $('noteClear').hidden = !$('noteText').value;
  noteCount();
  closeSheet();
  closeSettings();
  $('noteBack').hidden = false;
  $('noteSheet').hidden = false;
  setTimeout(() => $('noteText').focus(), 50);
}

function noteCount() {
  const n = [...$('noteText').value].length;
  $('noteCount').textContent = n ? n + ' / 300' : '';
}

function closeNote() {
  noteFor = null;
  $('noteSheet').hidden = true;
  $('noteBack').hidden = true;
}

function saveNote(clear) {
  if (noteFor == null || !cur) return closeNote();
  const text = clear ? '' : $('noteText').value.replace(/\s+/g, ' ').trim().slice(0, 300);
  const before = noteFor === 'clip' ? cur.answers.clipNote || '' : cur.answers.notes[noteFor] || '';
  if (text !== before) {
    const v = !text ? 'cleared' : before ? 'changed' : 'added';
    if (noteFor === 'clip') {
      cur.answers.clipNote = text;
      act({ a: 'clipnote', v });
    } else {
      if (text) cur.answers.notes[noteFor] = text;
      else delete cur.answers.notes[noteFor];
      act({ a: 'note', w: noteFor, v });
    }
  }
  closeNote();
  drawSource();
  changed();
}

// ── Saving: in the background, retried by itself, kept on the phone until the server has it ──
function persist() {
  store.set(KEYS.pending + me.uid, pending);
}

let savedTimer = 0;
function drawSave(state) {
  const b = $('saveState');
  clearTimeout(savedTimer);
  b.className = 'lab-save ' + state;
  b.disabled = state !== 'failed';
  if (state === 'idle') {
    b.hidden = true;
    return;
  }
  b.hidden = false;
  b.textContent = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : !navigator.onLine ? 'Offline · kept here' : 'Couldn’t save · Retry';
  if (state === 'saved') savedTimer = setTimeout(() => drawSave('idle'), 2000);
}

let retryTimer = 0;
async function flush() {
  if (flushing || !pending.length) return;
  flushing = true;
  clearTimeout(retryTimer);
  drawSave('saving');
  const stuck = setTimeout(() => drawSave('failed'), WATCHDOG_MS);
  try {
    while (pending.length) {
      const p = pending[0];
      try {
        await ctx.call('adminConsole', { action: 'labels.save', ...p }, 30_000);
        pending.shift();
        persist();
        saveFailed = false;
      } catch (err) {
        const code = String((err && err.code) || '').replace('functions/', '');
        if (code === 'invalid-argument' || code === 'not-found' || code === 'permission-denied') {
          pending.shift();
          persist();
          report('save refused: ' + (err.message || code), 'flush');
          toast('A label wasn’t saved: ' + failureText(err), true);
        } else {
          saveFailed = true;
          retryTimer = setTimeout(flush, navigator.onLine ? 5000 : 15000);
          break;
        }
      }
    }
  } finally {
    clearTimeout(stuck);
    flushing = false;
    drawSave(pending.length || saveFailed ? 'failed' : 'saved');
    if (!pending.length) loadStats();
  }
}

function save(skip) {
  if (skip) act({ a: 'skip', v: skip });
  const ms = Math.min(Date.now() - cur.shownAt, ACTIVE_CAP_MS);
  const { marks, words, notes, clipNote } = cur.answers;
  const body = {
    id: cur.clip.id,
    marks: { ...marks },
    words: { ...words },
    wordNotes: { ...notes },
    note: clipNote || '',
    ms,
    actions: cur.actions.slice(0, 300),
    ...(skip ? { skip } : {}),
  };
  pending = pending.filter((p) => p.id !== cur.clip.id);
  pending.push(body);
  persist();
  store.set(KEYS.draft + me.uid, null);
  sitting.answers += Object.keys(marks).length + Object.keys(words).length;
  sitting.ms += ms;
  const label = { marks: body.marks, words: body.words, wordNotes: body.wordNotes, note: body.note, skip: skip ?? null };
  visited.set(cur.clip.id, { clip: { ...cur.clip, status: skip ? 'skipped' : 'done', label }, buffer: cur.buffer, answers: emptyAnswers(label) });
  if (prevIds[prevIds.length - 1] !== cur.clip.id) prevIds.push(cur.clip.id);
  flush();
}

// ── Moving between clips ──
function next() {
  if (!cur) return;
  const left = openMarks();
  if (left) {
    focus = nextUnanswered(-1);
    render();
    scrollToMark(cur.order[focus]);
    toast(left === 1 ? 'One mark still needs an answer.' : left + ' marks still need an answer.');
    return;
  }
  save();
  openNext();
}

function skip(reason) {
  if (!cur) return;
  closeSettings();
  save(reason);
  openNext();
}

async function goBack() {
  if (!recentLoaded) await loadRecent();
  // The clip before the one on screen.
  let id = prevIds.pop();
  while (id && cur && id === cur.clip.id) id = prevIds.pop();
  if (!id) {
    drawNav();
    return toast('No earlier clip to go back to.');
  }
  if (cur) forward.push({ clip: cur.clip, buffer: cur.buffer, answers: cur.answers });
  openClip(id);
}

/** Previous on a fresh visit: the labeller's latest saved clips, from the server, once. */
async function loadRecent() {
  recentLoaded = true;
  try {
    const res = await guarded(ctx.call('adminConsole', { action: 'labels.recent' }));
    const older = res.ids.filter((id) => !prevIds.includes(id) && id !== cur?.clip.id).reverse();
    prevIds.unshift(...older);
  } catch {
    // only this visit's clips to go back to
  }
}

// ── Stats ──
function drawStats() {
  const parts = [];
  if (stats) {
    parts.push(stats.labelled.toLocaleString() + ' of ' + stats.total.toLocaleString() + ' done');
    if (stats.queued) parts.push(stats.queued + ' for you');
    if (stats.today.clips) parts.push(stats.today.clips + ' today');
    $('progressFill').style.width = (stats.total ? (100 * stats.labelled) / stats.total : 0) + '%';
  }
  if (sitting.ms > 60_000) parts.push(Math.round(sitting.answers / (sitting.ms / 3_600_000)) + '/h');
  $('stats').textContent = parts.join(' · ');
}

async function loadStats() {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  try {
    stats = await guarded(ctx.call('adminConsole', { action: 'labels.stats', since: day.getTime() }));
  } catch (err) {
    report('stats failed: ' + (err.message || err), 'loadStats');
  }
  drawStats();
  if (cur) drawSource();
}

// ── Settings (speed, text size, this clip) ──
function openSettings() {
  $('setBack').hidden = false;
  $('settings').hidden = false;
}
function closeSettings() {
  $('setBack').hidden = true;
  $('settings').hidden = true;
}

function setSpeed(v) {
  speed = v;
  store.set(KEYS.speed, v);
  for (const b of $('speedSeg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === v));
  if (playing) play(position(), playing.what === 'clip' ? cur.buffer.duration : playing.to, playing.what);
}

function applySize(px) {
  document.documentElement.style.setProperty('--wsize', px + 'px');
}
function textSize(step) {
  const now = Number(store.get(KEYS.text, 32));
  let i = TEXT_SIZES.indexOf(now);
  if (i === -1) i = 2;
  i = Math.max(0, Math.min(TEXT_SIZES.length - 1, i + step));
  store.set(KEYS.text, TEXT_SIZES[i]);
  applySize(TEXT_SIZES[i]);
}

// ── Events ──
function wire() {
  $('playBtn').addEventListener('click', playClip);
  $('nextBtn').addEventListener('click', next);
  $('prevBtn').addEventListener('click', goBack);
  $('troubleRetry').addEventListener('click', () => (retry ? retry() : openNext()));
  $('saveState').addEventListener('click', () => {
    saveFailed = false;
    flush();
  });
  $('card').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) answer(b.dataset.v);
  });
  // Swipe on the words: left for Next, right for Previous.
  let sx = 0;
  let sy = 0;
  let swiped = false;
  $('words').addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    swiped = false;
  }, { passive: true });
  $('words').addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) {
      swiped = true;
      setTimeout(() => {
        swiped = false;
      }, 350);
      if (dx < 0) next();
      else goBack();
    }
  }, { passive: true });
  $('words').addEventListener('click', (e) => {
    if (swiped) return;
    const ins = e.target.closest('.ins');
    if (ins) return focusMark(cur.order.findIndex((m) => m.id === ins.dataset.mark));
    const wd = e.target.closest('.wd');
    if (!wd) return;
    const w = +wd.dataset.w;
    const marks = cur.marksOn.get(w) ?? [];
    if (!marks.length) return openSheet(w);
    const idx = marks.map((m) => cur.order.indexOf(m));
    const at = idx.indexOf(focus);
    if (at === -1) focusMark(idx[0]);
    else if (at < idx.length - 1) focusMark(idx[at + 1]);
    else openSheet(w);
  });
  $('ticks').addEventListener('click', (e) => {
    const t = e.target.closest('.tick');
    if (t) {
      e.stopPropagation();
      focusMark(+t.dataset.i);
    }
  });
  $('bar').addEventListener('click', (e) => {
    if (!cur?.buffer) return;
    const r = $('bar').getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    play(f * cur.buffer.duration, cur.buffer.duration, 'clip');
  });
  $('hintClose').addEventListener('click', () => {
    $('hint').hidden = true;
    store.set(KEYS.hint, true);
  });

  $('sheetOpts').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.note) openNote(sheetW);
    else labelWord(b.dataset.v);
  });
  $('sheetCancel').addEventListener('click', closeSheet);
  $('sheetBack').addEventListener('click', closeSheet);
  $('sheetPlay').addEventListener('click', () => {
    const span = sheetW != null && wordSpan(sheetW);
    if (span) play(span[0] - 0.5, span[1] + 0.5, 'word');
  });

  $('noteSave').addEventListener('click', () => saveNote(false));
  $('noteClear').addEventListener('click', () => saveNote(true));
  $('noteCancel').addEventListener('click', closeNote);
  $('noteBack').addEventListener('click', closeNote);
  $('noteText').addEventListener('input', noteCount);
  $('noteText').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      saveNote(false);
    } else if (e.key === 'Escape') closeNote();
  });

  $('menuBtn').addEventListener('click', openSettings);
  $('setDone').addEventListener('click', closeSettings);
  $('setBack').addEventListener('click', closeSettings);
  $('speedSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-speed]');
    if (b) setSpeed(Number(b.dataset.speed));
  });
  $('textSmaller').addEventListener('click', () => textSize(-1));
  $('textLarger').addEventListener('click', () => textSize(1));
  $('settings').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'clipnote') openNote('clip');
    else if (a === 'skip-audio') skip('audio');
    else if (a === 'skip-passage') skip('not-this-passage');
    else if (a === 'skip-other') skip('other');
    else if (a === 'signout') {
      stop();
      signOutNow(ctx).catch(() => {}).finally(() => location.replace('/sign-in'));
    }
  });
  $('emptyReload').addEventListener('click', async () => {
    await loadStats();
    openNext();
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$('noteSheet').hidden || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (!$('start').hidden) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $('startBtn').click();
      }
      return;
    }
    if (!$('settings').hidden) {
      if (e.key === 'Escape') closeSettings();
      return;
    }
    if (!$('sheet').hidden) {
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') closeSheet();
      else if (k === 'n') {
        e.preventDefault();
        openNote(sheetW);
      } else if (e.key === '0') {
        if (cur.answers.words[sheetW]) labelWord('');
      } else {
        const hit = MISSED.find(([, , key], i) => key === k || String(i + 1) === e.key);
        if (hit) labelWord(hit[0]);
      }
      return;
    }
    if (!cur) return;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      playClip();
    } else if (k === 'r') {
      const m = cur.order[focus];
      if (m) playMark(m);
    } else if (k === 'f') allFine();
    else if (k === 'n') {
      e.preventDefault();
      const m = cur.order[focus];
      openNote(m ? m.w : 'clip');
    } else if (k === '1' || k === 'j') answer('no');
    else if (k === '2' || k === 'k') answer('unsure');
    else if (k === '3' || k === 'l') answer('yes');
    else if (k === 'enter') {
      e.preventDefault();
      next();
    } else if (k === 'u' || k === 'backspace') undo();
    else if (k === 'b') goBack();
    else if (k === 'arrowright') focusMark(focus === -1 ? 0 : Math.min(cur.order.length - 1, focus + 1));
    else if (k === 'arrowleft') focusMark(focus === -1 ? cur.order.length - 1 : Math.max(0, focus - 1));
  });

  // Back on the page or the connection: anything unsent goes out; nothing waits for a reload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pending.length) flush();
    if (document.visibilityState === 'hidden') stop();
  });
  window.addEventListener('online', () => {
    if (pending.length) flush();
    if (!$('trouble').hidden && retry) retry();
  });
  window.addEventListener('offline', () => {
    if (pending.length) drawSave('failed');
  });
}

// ── Start ──
async function start() {
  try {
    ctx = await boot();
  } catch (err) {
    $('boot').textContent = err.message;
    return;
  }
  const { user } = await currentUser(ctx);
  if (!user) return location.replace(signInUrl('/label'));
  try {
    me = await guarded(ctx.call('adminConsole', { action: 'me' }));
  } catch (err) {
    const code = String((err && err.code) || '').replace('functions/', '');
    if (code === 'unauthenticated') return location.replace(signInUrl('/label'));
    return trouble('Can’t open labelling', failureText(err), () => location.reload());
  }
  if (!me.role) return location.replace(signInUrl('/label'));
  if (ctx.env.kind !== 'dev') {
    $('env').hidden = false;
    $('env').textContent = ctx.env.label;
    $('env').dataset.kind = ctx.env.kind;
  }
  if (!me.labels) {
    $('boot').innerHTML = 'Labelling recitations isn’t open to your role here. <a href="/">Back to the console</a>';
    return;
  }
  wire();
  applySize(Number(store.get(KEYS.text, 32)));
  setSpeed(Number(store.get(KEYS.speed, 1)) === 0.75 ? 0.75 : 1);
  if (!me.permissions.some((p) => p !== 'recite.label')) {
    // A labeller has this page only.
    $('menuConsole').hidden = true;
    $('homeLink').removeAttribute('href');
  }
  pending = store.get(KEYS.pending + me.uid, []);
  if (!Array.isArray(pending)) pending = [];
  $('hint').hidden = !!store.get(KEYS.hint, false);
  audioContext();
  prefetch();
  loadStats();
  flush();
  $('boot').hidden = true;
  $('menuBtn').hidden = false;
  $('start').hidden = false;
  $('startBtn').focus();
  $('startBtn').addEventListener('click', () => {
    // The tap that unlocks audio for the sitting (Safari plays only after one).
    audioContext().resume();
    $('start').hidden = true;
    openNext(true);
  });
}

start();
