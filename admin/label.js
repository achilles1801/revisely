// Label recitations (/label; adminConsole labels.*, functions/src/console/labels.ts; owners and admins, revisely-dev
// only). One clip at a time: it plays as it opens, the passage's words show with the checker's marks, and each mark
// gets an answer (mistake, not a mistake, can't tell). Any word the checker missed can be tapped and labelled. Built
// for a phone held in one hand: the answers sit at the bottom, under the thumb, and the next clip is fetched and
// decoded while this one is labelled, so it opens and plays at once.
//
// Labels are sent in the background, one at a time, and kept on this device until the server has them, so a dropped
// connection loses nothing and never holds the labeller up.
import { boot, currentUser, signInUrl } from '/firebase.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── What the labeller can say ──
const ANSWERS = [
  ['no', 'Not a mistake', '1'],
  ['unsure', 'Can’t tell', '2'],
  ['yes', 'Mistake', '3'],
];
/** A word the checker didn't mark. */
const MISSED = [
  ['word', 'Wrong word'],
  ['skipped', 'Skipped'],
  ['added', 'Extra word after it'],
  ['harakat', 'Haraka or letter'],
  ['unclear', 'Not clear'],
];
const MISSED_NAME = Object.fromEntries(MISSED);
const KIND_NAME = { word: 'Wrong word', skipped: 'Skipped', added: 'Extra word', harakat: 'Haraka', letter: 'Letter', tajweed: 'Tajweed' };
const DETAIL_NAME = { lookalike: 'a similar word', sound: 'other sounds', replaced: 'replaced', order: 'out of order', trail: 'after the end', shadda: 'shadda' };
/** The app's three highlight colours: words, harakat and letters, tajweed. */
const GROUP = { word: 'red', skipped: 'red', added: 'red', harakat: 'amber', letter: 'amber', tajweed: 'violet' };
const KIND_ORDER = { skipped: 0, word: 1, harakat: 2, letter: 3, tajweed: 4, added: 5 };
const MISSED_GROUP = { word: 'red', skipped: 'red', added: 'red', harakat: 'amber', unclear: 'amber' };
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);
const SURAHS = ['', 'Al-Fātiḥah', 'Al-Baqarah', "Āli-'Imrān", 'An-Nisā', "Al-Mā'idah", "Al-An'ām", "Al-A'rāf", 'Al-Anfāl', 'At-Tawbah', 'Yūnus', 'Hūd', 'Yūsuf', "Ar-Ra'd", 'Ibrāhīm', 'Al-Ḥijr', 'An-Naḥl', "Al-Isrā'", 'Al-Kahf', 'Maryam', 'Ṭā-Hā', "Al-Anbiyā'", 'Al-Ḥajj', "Al-Mu'minūn", 'An-Nūr', 'Al-Furqān', "Ash-Shu'arā'", 'An-Naml', 'Al-Qaṣaṣ', "Al-'Ankabūt", 'Ar-Rūm', 'Luqmān', 'As-Sajdah', 'Al-Aḥzāb', "Saba'", 'Fāṭir', 'Yā-Sīn', 'Aṣ-Ṣāffāt', 'Ṣād', 'Az-Zumar', 'Ghāfir', 'Fuṣṣilat', 'Ash-Shūrā', 'Az-Zukhruf', 'Ad-Dukhān', 'Al-Jāthiyah', 'Al-Aḥqāf', 'Muḥammad', 'Al-Fatḥ', 'Al-Ḥujurāt', 'Qāf', 'Adh-Dhāriyāt', 'Aṭ-Ṭūr', 'An-Najm', 'Al-Qamar', 'Ar-Raḥmān', "Al-Wāqi'ah", 'Al-Ḥadīd', 'Al-Mujādilah', 'Al-Ḥashr', 'Al-Mumtaḥanah', 'Aṣ-Ṣaff', "Al-Jumu'ah", 'Al-Munāfiqūn', 'At-Taghābun', 'Aṭ-Ṭalāq', 'At-Taḥrīm', 'Al-Mulk', 'Al-Qalam', 'Al-Ḥāqqah', "Al-Ma'ārij", 'Nūḥ', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyāmah', 'Al-Insān', 'Al-Mursalāt', "An-Naba'", "An-Nāzi'āt", "'Abasa", 'At-Takwīr', 'Al-Infiṭār', 'Al-Muṭaffifīn', 'Al-Inshiqāq', 'Al-Burūj', 'Aṭ-Ṭāriq', "Al-A'lā", 'Al-Ghāshiyah', 'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Aḍ-Ḍuḥā', 'Ash-Sharḥ', 'At-Tīn', "Al-'Alaq", 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', "Al-'Ādiyāt", "Al-Qāri'ah", 'At-Takāthur', "Al-'Aṣr", 'Al-Humazah', 'Al-Fīl', 'Quraysh', "Al-Mā'ūn", 'Al-Kawthar', 'Al-Kāfirūn', 'An-Naṣr', 'Al-Masad', 'Al-Ikhlāṣ', 'Al-Falaq', 'An-Nās'];

const PENDING_KEY = (uid) => 'revisely.labels.pending.v1.' + uid;
/** A clip open longer than this counts this long toward the hourly rate (time away isn't labelling). */
const ACTIVE_CAP_MS = 180_000;

let ctx = null;
let me = null;

// ── State ──
let cur = null; // { clip, buffer, answers: { marks, words }, order: [mark], undo: [], shownAt, redo }
let upcoming = null; // Promise<{ clip, buffer } | null>: the next clip, fetched and decoded ahead
let upcomingId = null;
const back = []; // clips labelled in this sitting, newest last: { clip, buffer, answers }
const forward = []; // clips stepped back from, to return to
let pending = []; // labels not yet on the server: { id, marks, words, ms, skip }
let flushing = false;
let stats = null;
const sitting = { answers: 0, ms: 0, clips: 0 };
let focus = -1; // index in cur.order

// ── Audio (Web Audio: exact snippets, and one unlock for the whole sitting) ──
let actx = null;
let source = null;
let playing = null; // { from, to, t0, what }
let lastPos = 0;
let raf = 0;

function audioContext() {
  if (!actx) {
    // Safari: play through the ringer switch, as a media app does.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      // older Safari: Web Audio follows the switch
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
      // already ended
    }
  }
  if (playing) lastPos = position();
  playing = null;
  cancelAnimationFrame(raf);
  drawPlayer();
}

function position() {
  if (!playing) return lastPos;
  return Math.min(playing.to, playing.from + (actx.currentTime - playing.t0));
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
  s.connect(ac.destination);
  s.start(0, from, to - from);
  source = s;
  playing = { from, to, t0: ac.currentTime, what };
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
  if (!cur) return;
  const dur = cur.buffer?.duration || cur.clip.seconds || 1;
  const pos = position();
  $('barFill').style.width = (100 * pos) / dur + '%';
  $('time').textContent = clock(pos) + ' / ' + clock(dur);
  $('bar').setAttribute('aria-valuemax', String(Math.round(dur)));
  $('bar').setAttribute('aria-valuenow', String(Math.round(pos)));
  const isPlaying = !!playing;
  $('playIcon').setAttribute('d', isPlaying ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z');
  $('playBtn').setAttribute('aria-label', isPlaying ? 'Pause' : 'Play the clip');
}

function playClip() {
  if (playing) return stop();
  const dur = cur.buffer.duration;
  const from = lastPos >= dur - 0.1 ? 0 : lastPos;
  play(from, dur, 'clip');
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

// ── Loading clips ──
async function fetchNext() {
  const held = [cur?.clip.id, ...pending.map((p) => p.id), ...forward.map((f) => f.clip.id)].filter(Boolean);
  const res = await ctx.call('adminConsole', { action: 'labels.next', held: [...new Set(held)] }, 60_000);
  if (!res.clip) return null;
  return { clip: res.clip, buffer: await decode(res.audio) };
}

function prefetch() {
  upcomingId = null;
  upcoming = fetchNext().then(
    (x) => {
      upcomingId = x?.clip.id ?? null;
      return x;
    },
    (err) => {
      upcoming = null;
      throw err;
    },
  );
  upcoming.catch(() => {});
}

function orderOf(clip) {
  const pos = new Map(clip.words.map((w, i) => [w.w, i]));
  return [...clip.marks].sort((a, b) => (pos.get(a.w) ?? -1) - (pos.get(b.w) ?? -1) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

function show(item, answers) {
  stop();
  lastPos = 0;
  const clip = item.clip;
  cur = {
    clip,
    buffer: item.buffer,
    answers: answers ?? { marks: { ...(clip.label?.marks ?? {}) }, words: { ...(clip.label?.words ?? {}) } },
    order: orderOf(clip),
    undo: [],
    shownAt: Date.now(),
  };
  const first = clip.words[0];
  const last = clip.words[clip.words.length - 1];
  $('where').textContent = (SURAHS[first.s] || 'Surah ' + first.s) + ' ' + first.s + ':' + first.a + (last.s !== first.s ? '–' + last.s + ':' + last.a : last.a !== first.a ? '–' + last.a : '');
  $('source').textContent = clip.source.name + (clip.status !== 'open' ? ' · labelled' : '');
  $('clipView').hidden = false;
  $('emptyView').hidden = true;
  $('foot').hidden = false;
  renderWords();
  drawTicks();
  focus = nextUnanswered(-1);
  render();
  $('words').scrollTop = 0;
  drawPlayer();
}

function showEmpty() {
  stop();
  cur = null;
  $('clipView').hidden = true;
  $('foot').hidden = true;
  $('emptyView').hidden = false;
  $('emptyText').textContent = pending.length
    ? 'Every clip has a label. ' + pending.length + ' still being sent.'
    : 'Every clip has a label. New ones show up here when the lab adds them.';
  drawStats();
}

async function openNext(autoplay = true) {
  if (forward.length) {
    const f = forward.pop();
    show(f, f.answers);
    if (autoplay) playClip();
    return;
  }
  let item = null;
  try {
    item = await (upcoming ?? (prefetch(), upcoming));
  } catch (err) {
    item = undefined;
    toast(failureText(err), true);
  }
  upcoming = null;
  if (item === undefined) {
    // The fetch failed: try once more now.
    try {
      item = await fetchNext();
    } catch (err) {
      $('boot').hidden = false;
      $('boot').textContent = failureText(err) + ' Reload to try again.';
      return;
    }
  }
  if (!item) return showEmpty();
  show(item);
  prefetch();
  if (autoplay) playClip();
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
  // A mark of kind added before the clip's first word (the reciter added something first).
  const html = [];
  const before = added.get(clip.words[0].w - 1);
  if (before) html.push(...before.map((m) => insHtml(m)));
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
    if (focused && focused.w === w && focused.kind !== 'added') el.classList.add('focus');
  }
  for (const el of $('words').querySelectorAll('.ins')) {
    const m = cur.order.find((x) => x.id === el.dataset.mark);
    el.className = 'ins';
    if (m.id in cur.answers.marks) el.classList.add('v-' + cur.answers.marks[m.id]);
    if (focused && focused.id === m.id) el.classList.add('focus');
  }
}

/** Several marks on one word, all answered: the strongest answer shows. */
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
      return '<span class="tick g-' + GROUP[m.kind] + '" data-i="' + i + '" style="right:auto;left:' + at.toFixed(2) + '%"></span>';
    })
    .join('');
}

function nextUnanswered(from) {
  for (let i = from + 1; i < cur.order.length; i++) if (!(cur.order[i].id in cur.answers.marks)) return i;
  for (let i = 0; i <= from && i < cur.order.length; i++) if (!(cur.order[i].id in cur.answers.marks)) return i;
  return -1;
}

// ── The card and the answers ──
function markText(m) {
  let head = KIND_NAME[m.kind] || m.kind;
  if (m.kind === 'tajweed' && m.rule) head = String(m.rule).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const detail = m.detail && DETAIL_NAME[m.detail] ? DETAIL_NAME[m.detail] : '';
  const lines = [];
  if (m.heard) lines.push('Heard <span class="ar" dir="rtl" lang="ar">' + esc(m.heard) + '</span>' + (m.heardExact === false ? ' (as it sounded)' : ''));
  if (m.slip && typeof m.slip === 'object') {
    // A haraka alone sits on a tatweel, which every Arabic font draws (Amiri Quran has no dotted circle).
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

function render() {
  paintWords();
  const card = $('card');
  const bar = $('actions');
  const n = cur.order.length;
  const answered = cur.order.filter((m) => m.id in cur.answers.marks).length;
  const missed = Object.keys(cur.answers.words).length;
  const m = cur.order[focus];
  if (m) {
    const t = markText(m);
    const span = markSpan(m);
    card.innerHTML =
      '<div class="lab-card-h"><span class="sw g-' + GROUP[m.kind] + '"></span><b>' + esc(t.head) + '</b>' +
      (t.detail ? '<span class="dim">· ' + esc(t.detail) + '</span>' : '') +
      (m.sure ? '<span class="sure ' + m.sure + '">' + (m.sure === 'clear' ? 'clear' : 'likely') + '</span>' : '') +
      '<span class="cnt">' + (focus + 1) + ' of ' + n + '</span></div>' +
      (t.lines.length ? '<div class="lab-card-b">' + t.lines.join(' · ') + '</div>' : '') +
      (span ? '<button type="button" class="lab-again" id="againBtn">▶ Hear it again <kbd>R</kbd></button>' : '');
    if (span) $('againBtn').onclick = () => playMark(m);
    const current = cur.answers.marks[m.id];
    bar.className = 'lab-actions three';
    bar.innerHTML = ANSWERS.map(
      ([v, label, key]) => '<button type="button" class="lab-ans a-' + v + (current === v ? ' on' : '') + '" data-v="' + v + '">' + esc(label) + '<kbd>' + key + '</kbd></button>',
    ).join('');
  } else {
    const parts = [];
    if (n) parts.push(answered + ' of ' + n + ' marks answered');
    else parts.push('The checker marked nothing here');
    if (missed) parts.push(missed + (missed === 1 ? ' word' : ' words') + ' you marked');
    card.innerHTML = '<div class="lab-card-h"><b>' + esc(parts.join(' · ')) + '</b></div>' +
      '<div class="lab-card-b dim">Tap any word that was said wrong, or go on.' + (n ? ' Tap a mark to change its answer.' : '') + '</div>';
    bar.className = 'lab-actions two';
    bar.innerHTML =
      '<button type="button" class="lab-ans a-undo" data-act="undo"' + (cur.undo.length ? '' : ' disabled') + '>Undo<kbd>U</kbd></button>' +
      '<button type="button" class="lab-ans a-next" data-act="next">Next clip ›<kbd>↵</kbd></button>';
  }
  drawStats();
}

function answer(v) {
  const m = cur.order[focus];
  if (!m) return;
  const before = cur.answers.marks[m.id];
  cur.answers.marks[m.id] = v;
  cur.undo.push({ type: 'mark', id: m.id, before });
  const was = focus;
  focus = nextUnanswered(focus);
  if (focus === -1 && was !== -1) {
    // Every mark answered: stay on the card that says so.
  }
  render();
  const now = cur.order[focus];
  if (now) {
    scrollTo(now);
    // Re-hear the next mark unless the clip is still playing through it.
    if (!playing || playing.what !== 'clip') playMark(now);
  }
}

function undo() {
  const u = cur.undo.pop();
  if (!u) return;
  if (u.type === 'mark') {
    if (u.before === undefined) delete cur.answers.marks[u.id];
    else cur.answers.marks[u.id] = u.before;
    focus = cur.order.findIndex((m) => m.id === u.id);
  } else {
    if (u.before === undefined) delete cur.answers.words[u.w];
    else cur.answers.words[u.w] = u.before;
  }
  render();
}

function focusMark(i) {
  if (i < 0 || i >= cur.order.length) return;
  focus = i;
  render();
  scrollTo(cur.order[i]);
  playMark(cur.order[i]);
}

function scrollTo(m) {
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
    MISSED.map(([v, label], i) => '<button type="button" class="lab-opt m-' + MISSED_GROUP[v] + (current === v ? ' on' : '') + '" data-v="' + v + '">' + esc(label) + '<kbd>' + (i + 1) + '</kbd></button>').join('') +
    (current ? '<button type="button" class="lab-opt fine" data-v="">Fine: take it back<kbd>0</kbd></button>' : '');
  $('sheetBack').hidden = false;
  $('sheet').hidden = false;
  if (span) play(span[0] - 0.5, span[1] + 0.5, 'word');
  $('sheetOpts').querySelector('button')?.focus({ preventScroll: true });
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
  render();
}

// ── Saving ──
function persist() {
  try {
    localStorage.setItem(PENDING_KEY(me.uid), JSON.stringify(pending));
  } catch {
    // private mode or full: labels still go out from memory
  }
}

function restorePending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY(me.uid));
    pending = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(pending)) pending = [];
  } catch {
    pending = [];
  }
}

let retryTimer = 0;
async function flush() {
  if (flushing) return;
  flushing = true;
  clearTimeout(retryTimer);
  try {
    while (pending.length) {
      const p = pending[0];
      try {
        await ctx.call('adminConsole', { action: 'labels.save', ...p }, 30_000);
        pending.shift();
        persist();
        if (stats) {
          if (!p.relabel) stats.today.clips += 1;
          stats.open = Math.max(0, stats.open - (p.relabel ? 0 : 1));
        }
      } catch (err) {
        const code = String((err && err.code) || '').replace('functions/', '');
        if (code === 'invalid-argument' || code === 'not-found' || code === 'permission-denied') {
          // The server will never take this one: say so and drop it, so the rest go out.
          pending.shift();
          persist();
          toast('A label wasn’t saved: ' + failureText(err), true);
        } else {
          retryTimer = setTimeout(flush, 5000);
          break;
        }
      }
    }
  } finally {
    flushing = false;
    drawStats();
  }
}

function save(skip) {
  const ms = Math.min(Date.now() - cur.shownAt, ACTIVE_CAP_MS);
  const marks = { ...cur.answers.marks };
  const words = { ...cur.answers.words };
  const relabel = cur.clip.status !== 'open';
  pending = pending.filter((p) => p.id !== cur.clip.id);
  pending.push({ id: cur.clip.id, marks, words, ms, ...(skip ? { skip } : {}), relabel });
  persist();
  sitting.answers += Object.keys(marks).length + Object.keys(words).length;
  sitting.ms += ms;
  sitting.clips += 1;
  back.push({ clip: { ...cur.clip, status: skip ? 'skipped' : 'done' }, buffer: cur.buffer, answers: { marks, words } });
  if (back.length > 5) back.shift();
  flush();
}

function next() {
  if (!cur) return;
  const left = cur.order.filter((m) => !(m.id in cur.answers.marks)).length;
  if (left) {
    focus = nextUnanswered(-1);
    render();
    toast(left === 1 ? 'One mark has no answer yet.' : left + ' marks have no answer yet.');
    return;
  }
  save();
  openNext();
}

function skip(reason) {
  if (!cur) return;
  save(reason);
  openNext();
}

function goBack() {
  const prev = back.pop();
  if (!prev) return toast('Nothing to go back to in this sitting.');
  if (cur) forward.push({ clip: cur.clip, buffer: cur.buffer, answers: cur.answers });
  show(prev, prev.answers);
  playClip();
}

// ── Stats ──
function drawStats() {
  const parts = [];
  if (stats) parts.push(stats.today.clips + ' today', Math.max(0, stats.open) + ' left');
  if (sitting.ms > 60_000) parts.push(Math.round(sitting.answers / (sitting.ms / 3_600_000)) + '/h');
  if (pending.length) parts.push('<span class="warn">' + pending.length + ' sending</span>');
  $('stats').innerHTML = parts.join(' · ');
}

async function loadStats() {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  try {
    stats = await ctx.call('adminConsole', { action: 'labels.stats', since: day.getTime() });
  } catch {
    stats = null;
  }
  drawStats();
}

// ── Small pieces ──
function failureText(err) {
  const code = String((err && err.code) || '').replace('functions/', '');
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal') return 'The console didn’t answer.';
  return (err && err.message) || 'That didn’t work.';
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

function closeMenu() {
  $('menu').hidden = true;
}

// ── Events ──
function wire() {
  $('playBtn').addEventListener('click', playClip);
  $('actions').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.v) answer(b.dataset.v);
    else if (b.dataset.act === 'undo') undo();
    else if (b.dataset.act === 'next') next();
  });
  $('words').addEventListener('click', (e) => {
    const ins = e.target.closest('.ins');
    if (ins) return focusMark(cur.order.findIndex((m) => m.id === ins.dataset.mark));
    const wd = e.target.closest('.wd');
    if (!wd) return;
    const w = +wd.dataset.w;
    const marks = cur.marksOn.get(w) ?? [];
    if (!marks.length) return openSheet(w);
    // A marked word: its marks in turn; once the focus is already on its last one, the sheet (a mistake it missed).
    const idx = marks.map((m) => cur.order.indexOf(m));
    const at = idx.indexOf(focus);
    if (at === -1) focusMark(idx[0]);
    else if (at < idx.length - 1) focusMark(idx[at + 1]);
    else openSheet(w);
  });
  // Hold a word: label it as missed, marked or not.
  let holdTimer = 0;
  $('words').addEventListener('pointerdown', (e) => {
    const wd = e.target.closest('.wd');
    if (!wd) return;
    holdTimer = setTimeout(() => {
      holdTimer = 0;
      openSheet(+wd.dataset.w);
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      wd.addEventListener('click', swallow, { capture: true, once: true });
    }, 550);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('words').addEventListener(ev, () => clearTimeout(holdTimer));
  $('words').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.wd')) e.preventDefault();
  });

  $('ticks').addEventListener('click', (e) => {
    const t = e.target.closest('.tick');
    if (t) {
      e.stopPropagation();
      focusMark(+t.dataset.i);
    }
  });
  const seek = (e) => {
    if (!cur?.buffer) return;
    const r = $('bar').getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    play(f * cur.buffer.duration, cur.buffer.duration, 'clip');
  };
  $('bar').addEventListener('click', seek);

  $('sheetOpts').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) labelWord(b.dataset.v);
  });
  $('sheetCancel').addEventListener('click', closeSheet);
  $('sheetBack').addEventListener('click', closeSheet);
  $('sheetPlay').addEventListener('click', () => {
    const span = sheetW != null && wordSpan(sheetW);
    if (span) play(span[0] - 0.5, span[1] + 0.5, 'word');
  });

  $('menuBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('menu').hidden = !$('menu').hidden;
  });
  document.addEventListener('click', (e) => {
    if (!$('menu').hidden && !e.target.closest('#menu')) closeMenu();
  });
  $('menu').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    closeMenu();
    const act = b.dataset.act;
    if (act === 'back') goBack();
    else if (act === 'skip-audio') skip('audio');
    else if (act === 'skip-passage') skip('not-this-passage');
    else if (act === 'skip-other') skip('other');
    else if (act === 'keys') toast('Space play · R the mark again · 1 not a mistake · 2 can’t tell · 3 mistake · ← → marks · Enter next · U undo · B back');
  });
  $('emptyReload').addEventListener('click', async () => {
    await loadStats();
    prefetch();
    openNext();
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$('start').hidden) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $('startBtn').click();
      }
      return;
    }
    if (!$('sheet').hidden) {
      if (e.key === 'Escape') closeSheet();
      else if (/^[0-5]$/.test(e.key)) {
        const i = +e.key;
        if (i === 0) {
          if (cur.answers.words[sheetW]) labelWord('');
        } else if (MISSED[i - 1]) labelWord(MISSED[i - 1][0]);
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

  // Back on the page after a while: anything unsent goes out.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pending.length) flush();
    if (document.visibilityState === 'hidden') stop();
  });
  window.addEventListener('online', () => flush());
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
  if (!user) {
    location.replace(signInUrl('/label'));
    return;
  }
  try {
    me = await ctx.call('adminConsole', { action: 'me' });
  } catch (err) {
    const code = String((err && err.code) || '').replace('functions/', '');
    if (code === 'unauthenticated') return location.replace(signInUrl('/label'));
    $('boot').textContent = 'The console didn’t answer (' + (code || 'no connection') + '). Reload in a minute.';
    return;
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
  restorePending();
  audioContext();
  prefetch();
  await loadStats();
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
