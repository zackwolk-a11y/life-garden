/* ================= Life Garden — core ================= */
const APP_VERSION = '2026.11.18-e';
const TZ = 'America/Los_Angeles';
const LS_KEY = 'lifegarden.v1';
const DEVICE = Math.random().toString(36).slice(2, 10);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sum = a => a.reduce((x, y) => x + (+y || 0), 0);

/* ---------- dates (all planner dates are Pacific YYYY-MM-DD) ---------- */
function pacificParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
const todayISO = () => pacificParts().date;
const nowMin = () => pacificParts().min;
const dObj = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = dt => dt.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = dObj(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = s => dObj(s).getUTCDay();
const weekStart = s => addDays(s, -((dow(s) + 6) % 7)); // Monday
const monthKey = s => s.slice(0, 7);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtDate = (s, o = { weekday: 'long', month: 'long', day: 'numeric' }) => s ? dObj(s).toLocaleDateString('en-US', { timeZone: 'UTC', ...o }) : '';
const fmtShort = s => fmtDate(s, { month: 'short', day: 'numeric' });
const daysBetween = (a, b) => Math.round((dObj(b) - dObj(a)) / 864e5);
function fmtTime(m) {
  if (m == null || isNaN(m)) return '—';
  m = ((m % 1440) + 1440) % 1440 || (m >= 1440 ? 1440 : 0);
  if (m === 1440) return '12:00 AM';
  const h = Math.floor(m / 60), mm = m % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}
const fmtTimeShort = m => fmtTime(m).replace(':00 ', ' ').replace(' AM', 'a').replace(' PM', 'p');
const hhmm = m => m == null ? '' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromHHMM = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmtDur = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };
const money = (v, unknown = '—') => (v === '' || v == null || isNaN(v)) ? unknown : (v < 0 ? '−' : '') + '$' + Math.abs(+v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/* ---------- activity categories ---------- */
const CATS = {
  exercise: { label: 'Exercise', re: /yoga|walk|run|gym|stretch|exercise|workout|hike|swim|train(?!ing)|pilates|bike/i },
  meals: { label: 'Meals', re: /breakfast|lunch|dinner|meal|cook|snack|brunch|eat/i },
  rest: { label: 'Rest', re: /rest|nap|break|relax|read for fun|meditat/i },
  focus: { label: 'Focus', re: /study|homework|write|focus|admin|email|edit|plan|research|class prep|budget|work/i },
  together: { label: 'Together', re: /together|date|zachary|couple|family|friends/i },
  sleep: { label: 'Sleep', re: /sleep|bed/i },
  appointments: { label: 'Appointments', re: /appt|appointment|doctor|dentist|therap|vet\b|haircut|meeting|call|interview|client|massage|session|class|teach|dance|rehearsal/i },
  travel: { label: 'Travel', re: /drive|commute|travel|bus|train to|flight|arrive/i },
  routine: { label: 'Daily routine', re: /dog|shower|chores|laundry|clean|groceries|errand|routine|care/i },
  other: { label: 'Other', re: /$^/ },
};
const autoCat = t => { for (const [k, c] of Object.entries(CATS)) if (c.re.test(t || '')) return k; return 'other'; };
const catOf = b => (b.cat && b.cat !== 'auto') ? b.cat : autoCat(b.title);
const catColor = k => `var(--c-${k})`;
const KINDS = { flexible: 'Flexible', fixed: 'Fixed appointment', protected: 'Protected (travel / meals / together)' };

/* ---------- default state ---------- */
const SECTIONS = ['blocks', 'tasks', 'routines', 'together', 'capacity', 'money', 'projects', 'content', 'move', 'downsize', 'well', 'prep', 'opps', 'daynotes', 'settings'];
function defaults() {
  return {
    blocks: [],
    tasks: [],
    routines: [{ id: uid(), title: 'Dog care', days: [0, 1, 2, 4, 5, 6], who: 'Jordan', mins: 30, done: {} }],
    together: {},
    capacity: { sleepH: 8, careH: 2.5, bufferH: 1, targets: [] },
    money: {
      entries: [], openings: {}, reference: [],
      funds: [{ id: uid(), name: 'Prius repair', target: '', saved: '', date: '' }, { id: uid(), name: 'Moving fund', target: '', saved: '', date: '' }],
      presets: [
        { id: uid(), name: 'Massage · 60 min', type: 'income', cat: 'Massage', amount: '' },
        { id: uid(), name: 'Massage · 90 min', type: 'income', cat: 'Massage', amount: '' },
        { id: uid(), name: 'Massage · 120 min', type: 'income', cat: 'Massage', amount: '' },
        { id: uid(), name: 'Thursday trainer pay', type: 'income', cat: 'Training', amount: '' },
      ],
    },
    projects: [
      { id: uid(), name: 'ILHA — online yoga & dance', area: 'Infinitely Love Healing Arts', deadline: '2026-12-31', status: 'In progress', next: 'Outline the first batch of free videos', effortH: '', weekH: '', deliverables: '10 free yoga + 10 free dance videos on YouTube and Wix, before any paid series or membership', notes: '', steps: [] },
      { id: uid(), name: 'Glimmer Promotions', area: 'Dance & Glimmer', deadline: '', status: 'Planning', next: 'Confirm class details and registration link', effortH: '', weekH: '', deliverables: 'Launch-ready class promotion: details, registration, content plan, measured tests', notes: '', steps: [] },
    ],
    content: [],
    move: {
      when: 'January or February — not decided',
      phases: [
        { id: uid(), name: 'Understand the numbers and agree the role', items: [] },
        { id: uid(), name: 'Prepare and test income pathways', items: [] },
        { id: uid(), name: 'Prove the handoff before the move', items: [] },
      ],
      packing: ['Set aside carry-with-you essentials', 'Pack low-use things', 'Pack spares', 'Handle daily rooms later', 'Leave last-use items until the end'].map(t => ({ id: uid(), title: t, done: false, notes: '' })),
      roles: [
        { id: uid(), title: 'Post-relocation Glimmer venue work', notes: 'Venue-sales commissions belong to the East Coast phase — not current Portland income.', status: 'Proposal' },
        { id: uid(), title: 'Own online / hybrid teaching (ILHA)', notes: 'Yoga and dance offerings of Jordan’s own.', status: 'Proposal' },
        { id: uid(), title: 'Glimmer grants & sponsorship coordination', notes: 'Proposed coordination role — no money awarded or sponsors contacted yet.', status: 'Proposal' },
        { id: uid(), title: 'Host-hired promotion', notes: 'Optional, separately hired promotion work.', status: 'Proposal' },
      ],
    },
    downsize: [],
    well: { logs: [], goals: [], routines: [] },
    prep: { tasks: [], appts: [], notes: [], qs: [] },
    opps: [],
    daynotes: {},
    settings: { people: ['Jordan', 'Zachary'], theme: 'dark', season: 'auto', dayStart: 6, dayEnd: 24, sleepFrom: '23:00', sleepTo: '07:00', trim: 5, showDraft: true },
  };
}
let S = defaults();

/* ---------- persistence: this device + Google Sheet ---------- */
const LS_SYNC = 'lifegarden.sync.v1';
const sync = { mode: 'local', cfg: null, base: null, hash: null, busy: false, timer: null, localRev: 0, status: 'loading', pendingRender: false, lastPull: 0, backupDay: null };
function loadLocal() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { const o = JSON.parse(raw); for (const k of SECTIONS) if (o[k] !== undefined) S[k] = o[k]; } } catch (e) { }
  try { const s = JSON.parse(localStorage.getItem(LS_SYNC) || 'null'); if (s) { sync.cfg = s.cfg; sync.base = s.base; sync.hash = s.hash; sync.backupDay = s.backupDay; } } catch (e) { }
}
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { } }
function saveSyncState() { try { localStorage.setItem(LS_SYNC, JSON.stringify({ cfg: sync.cfg, base: sync.base, hash: sync.hash, backupDay: sync.backupDay })); } catch (e) { } }
const STATUS_SHORT = { saved: 'Synced', saving: 'Syncing…', pending: 'Syncing…', local: 'Saved', error: 'Sync problem', loading: 'Loading…' };
let statusFade = null, lastStatus = '';
function showStatus() {
  const pill = $('#savePill'); if (!pill) return;
  pill.classList.remove('faded'); clearTimeout(statusFade);
  if (sync.status !== 'error') statusFade = setTimeout(() => pill.classList.add('faded'), 20000);   // problems stay visible
}
function setStatus(st, text) {
  sync.status = st;
  const col = { saved: 'var(--good)', saving: 'var(--warn)', pending: 'var(--warn)', local: 'var(--ink3)', error: 'var(--bad)', loading: 'var(--ink3)' }[st];
  const pill = $('#savePill'); if (!pill) return;
  pill.title = text;
  pill.innerHTML = `<span class="dot" style="background:${col}"></span><span class="pl-full">${esc(text)}</span><span class="pl-short" aria-hidden="true">${esc(STATUS_SHORT[st] || text)}</span>`;
  if (st + text !== lastStatus) { lastStatus = st + text; showStatus(); }   // the same status again (e.g. the minute-by-minute check) doesn't bring it back
}
function markDirty(k) {
  sync.localRev++; saveLocal();
  if (sync.cfg) { setStatus('pending', 'Waiting to sync…'); clearTimeout(sync.timer); sync.timer = setTimeout(syncNow, 1500); }
  else setStatus('local', 'Saved on this device');
}

/* ----- app state <-> readable Sheet rows ----- */
const STATUS_WORDS = { confirmed: 'confirmed', proposed: 'proposed', needs: 'needs confirmation', source: 'source-listed', sourceproposed: 'source + proposed' };
const yes = v => /^(yes|y|true|x|✓|done|1)$/i.test(String(v || '').trim());
const yn = v => v ? 'yes' : '';
const numOrBlank = v => { const s = String(v ?? '').replace(/[$,\s]/g, ''); return s === '' || isNaN(+s) ? '' : +s; };
function parseStatus(v) { const s = String(v || '').trim().toLowerCase(); if (!s) return undefined; for (const [k, w] of Object.entries(STATUS_WORDS)) if (s === w || s === k) return k; if (/^confirm/.test(s)) return 'confirmed'; if (/need/.test(s)) return 'needs'; if (/source.*prop/.test(s)) return 'sourceproposed'; if (/source/.test(s)) return 'source'; if (/prop|draft|sugg/.test(s)) return 'proposed'; return undefined; }
function parseDateLoose(v) {
  const s = String(v || '').trim(); if (!s) return null; let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  const t = Date.parse(s + (/\d{4}/.test(s) ? '' : ' ' + todayISO().slice(0, 4))); if (!isNaN(t)) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  return null;
}
function parseTimeLoose(v) {
  const s = String(v || '').trim().toLowerCase(); if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(a|p|am|pm|a\.m\.|p\.m\.)?$/); if (!m) return null;
  let h = +m[1], mm = +(m[2] || 0); if (m[3]) { const p = m[3][0] === 'p'; if (p && h < 12) h += 12; if (!p && h === 12) h = 0; }
  return h === 24 && mm === 0 ? 1440 : h > 23 ? null : h * 60 + mm;
}
const hm = m => m == null ? '' : fmtTime(m);   // Sheet shows normal 12-hour time (2:30 PM); 24-hour typed in the Sheet still works
/* the same block row in 24-hour and 12-hour form counts as unchanged, so the format switch alone never re-uploads the whole plan */
const normBlockRow = j => { try { const r = JSON.parse(j); r.start = parseTimeLoose(r.start); const e = parseTimeLoose(r.end); r.end = e === 0 && r.start > 0 ? 1440 : e; return JSON.stringify(r); } catch (x) { return j; } };
/* 12-hour times for anything shown or spoken: "14:30" → "2:30 PM" (leaves 9:30 AM etc. alone) */
/* for text people typed: only times that are clearly 24-hour (07:00, 15:30, 22:00) — "9:30" or "11:00" stay as written.
   A range converts both ends when either end is clearly 24-hour: "07:00–12:30" → "7:00 AM–12:30 PM". */
const H24 = '(?:0\\d|1[3-9]|2[0-4])';
const to12Typed = t => String(t || '')
  .replace(/\b(\d{1,2}):([0-5]\d)(\s*[–—-]\s*)(\d{1,2}):([0-5]\d)\b(?!\s*(?:[ap]\.?m\b|AM|PM))/gi, (x, h1, m1, sep, h2, m2) => new RegExp('^' + H24 + '$').test(h1) || new RegExp('^' + H24 + '$').test(h2) ? fmtTime(+h1 * 60 + +m1) + sep + fmtTime(+h2 * 60 + +m2) : x)
  .replace(new RegExp('\\b(' + H24 + '):([0-5]\\d)\\b(?!\\s*(?:[ap]\\.?m\\b|AM|PM))', 'gi'), (x, h, m) => fmtTime(+h * 60 + +m));
const to12 = t => String(t || '').replace(/\b([01]?\d|2[0-4]):([0-5]\d)\b(?!\s*(?:[ap]\.?m\.?|AM|PM))/gi, (x, h, m) => fmtTime(+h * 60 + +m));
const extraJSON = (o, keys) => { const x = {}; for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '' && !(typeof o[k] === 'object' && !Object.keys(o[k]).length)) x[k] = o[k]; return Object.keys(x).length ? JSON.stringify(x) : ''; };
const parseExtra = s => { try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; } };
const MAP = {
  blocks: {
    rows: () => S.blocks.map(b => ({ id: b.id, date: b.date, start: hm(b.start), end: hm(b.end), title: b.title, kind: b.kind, status: b.status ? STATUS_WORDS[b.status] : '', category: b.cat && b.cat !== 'auto' ? b.cat : '', done: yn(b.done), notes: b.notes || '', source: b.src || '', edited: yn(b.edited), extra: extraJSON(b, ['minLen', 'orig', 'sleep', 'taskId', 'icsUid']) })),
    obj: r => { const date = parseDateLoose(r.date), s = parseTimeLoose(r.start); let e = parseTimeLoose(r.end); if (!date || s == null) return null; if (e === 0 && s > 0) e = 1440; if (e == null || e <= s) e = Math.min(1440, s + 60);
      const kind = /fix|appt|appoint/i.test(r.kind) ? 'fixed' : /prot/i.test(r.kind) ? 'protected' : 'flexible', cat = String(r.category || '').toLowerCase().trim();
      return { ...parseExtra(r.extra), id: r.id, title: r.title || 'Untitled', date, start: s, end: e, kind, cat: CATS[cat] ? cat : 'auto', status: parseStatus(r.status), done: yes(r.done), notes: r.notes || '', src: r.source || undefined, edited: yes(r.edited) || undefined }; },
  },
  tasks: {
    rows: () => S.tasks.map(t => ({ id: t.id, title: t.title, area: t.area || '', status: t.status || '', show_from: t.date || '', minutes: t.mins ?? '', done: yn(t.done), done_on: t.doneAt || '', notes: t.notes || '', project_id: t.projectId || '', source: t.src || '', extra: extraJSON(t, ['focus', 'defer', 'order', 'blockId', 'prereq']) })),
    obj: r => r.title ? ({ ...parseExtra(r.extra), id: r.id, title: r.title, area: r.area || 'Today', status: r.status || 'Confirmed', date: parseDateLoose(r.show_from), mins: numOrBlank(r.minutes), done: yes(r.done), doneAt: parseDateLoose(r.done_on), notes: r.notes || '', projectId: r.project_id || undefined, src: r.source || undefined }) : null,
  },
  daynotes: {
    rows: () => Object.entries(S.daynotes).map(([date, n]) => ({ date, phase: n.phase || '', cycle: n.cycle || '', note: n.note || '', priority: n.priority || '', basis: n.basis || '', media: n.media || '', source: n.src || '' })),
    key: 'date',
  },
  entries: {
    rows: () => S.money.entries.map(e => ({ id: e.id, type: e.type, description: e.desc || '', category: e.cat || '', date: e.date || '', estimate: e.est ?? '', actual: e.actual ?? '', settled: yn(e.settled) })),
    obj: r => ({ id: r.id, type: /inc/i.test(r.type) ? 'income' : 'expense', desc: r.description || '', cat: r.category || '', date: parseDateLoose(r.date) || '', est: numOrBlank(r.estimate), actual: numOrBlank(r.actual), settled: yes(r.settled) }),
  },
  opps: {
    rows: () => S.opps.map(o => ({ id: o.id, title: o.title || '', organization: o.org || '', kind: o.kind || '', status: o.status || '', pay: o.pay || '', hours: o.hours || '', location: o.location || '', deadline: o.deadline || '', last_checked: o.checked || '', url: o.url || '', notes: o.notes || '', priority: yn(o.priority) })),
    obj: r => ({ id: r.id, title: r.title || '', org: r.organization || '', kind: r.kind || 'Other', status: r.status || 'New', pay: r.pay || '', hours: r.hours || '', location: r.location || '', deadline: parseDateLoose(r.deadline) || '', checked: parseDateLoose(r.last_checked) || '', url: r.url || '', notes: r.notes || '', priority: yes(r.priority) ? 1 : 0 }),
  },
};
const JSON_SECTIONS = ['routines', 'together', 'capacity', 'money', 'projects', 'content', 'move', 'downsize', 'well', 'prep', 'settings'];
function jsonOf(k) { if (k === 'money') { const { entries, ...rest } = S.money; return rest; } if (k === 'settings') { const { theme, ...rest } = S.settings; return rest; } return S[k]; }
function snapshotRows() {
  const t = {}; for (const [k, m] of Object.entries(MAP)) { const key = m.key || 'id'; t[k] = {}; for (const r of m.rows()) t[k][r[key]] = JSON.stringify(r); }
  const j = {}; for (const k of JSON_SECTIONS) j[k] = JSON.stringify(jsonOf(k));
  return { t, j };
}
function adoptServer(data) {
  const T = data.tables || {}, J = data.json || {};
  for (const [k, m] of Object.entries(MAP)) {
    const rows = T[k] || [];
    if (k === 'daynotes') { const dn = {}; for (const r of rows) { const d = parseDateLoose(r.date); if (d) dn[d] = Object.fromEntries(Object.entries({ phase: r.phase, cycle: r.cycle, note: r.note, priority: r.priority, basis: r.basis, media: r.media, src: r.source }).filter(([, v]) => v)); } S.daynotes = dn; continue; }
    const objs = rows.map(m.obj).filter(Boolean).map(o => JSON.parse(JSON.stringify(o)));
    if (k === 'entries') S.money.entries = objs; else S[k] = objs;
  }
  const base = defaults();
  for (const k of JSON_SECTIONS) if (J[k] !== undefined) {
    if (k === 'money') S.money = { ...base.money, ...J.money, entries: S.money.entries };
    else if (k === 'settings') S.settings = { ...base.settings, ...J.settings, theme: S.settings.theme };
    else S[k] = J[k];
  }
}
function diffOps(cur, base) {
  const ops = { tables: {}, json: {} }; let n = 0;
  for (const k of Object.keys(MAP)) {
    const c = cur.t[k], b = (base && base.t[k]) || {}, up = [], del = [];
    for (const [id, s] of Object.entries(c)) if (b[id] !== s && !(k === 'blocks' && b[id] && normBlockRow(b[id]) === normBlockRow(s))) up.push(JSON.parse(s));
    for (const id of Object.keys(b)) if (!(id in c)) del.push(id);
    if (up.length || del.length) { ops.tables[k] = { upsert: up, del }; n += up.length + del.length; }
  }
  for (const k of JSON_SECTIONS) if (!base || base.j[k] !== cur.j[k]) { ops.json[k] = JSON.parse(cur.j[k]); n++; }
  return n ? ops : null;
}
const isServerEmpty = d => !Object.values(d.tables || {}).some(r => r.length) && !Object.keys(d.json || {}).length;
async function api(method, payload) {
  const c = sync.cfg; if (!c) throw new Error('not connected');
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), method === 'GET' ? 45000 : 90000);
  try {
    const r = method === 'GET'
      ? await fetch(`${c.url}?k=${encodeURIComponent(c.key)}${payload && payload.h ? '&h=' + encodeURIComponent(payload.h) : ''}`, { signal: ctrl.signal, redirect: 'follow' })
      : await fetch(c.url, { method: 'POST', body: JSON.stringify({ k: c.key, ...payload }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal, redirect: 'follow' });
    const txt = await r.text(); let o;
    try { o = JSON.parse(txt); } catch (e) {
      const msg = (txt.match(/<div[^>]*(?:errorMessage|error-message)[^>]*>([\s\S]*?)<\/div>/i) || txt.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
      const clean = msg ? msg.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
      if (/sign in|ServiceLogin|accounts\.google/i.test(txt) && !clean.match(/Exception|Error/)) throw new Error('The Sheet link needs “Who has access: Anyone” in Deploy → Manage deployments');
      throw new Error('Sheet script error: ' + (clean || 'unexpected reply').slice(0, 140));
    }
    if (!o.ok) throw new Error({ passcode: 'Wrong passcode', locked: 'Too many wrong passcodes — the Sheet is locked for 30 minutes', setup: 'The script still has the placeholder passcode — change it, save, and deploy a new version' }[o.error] || o.error || 'Sheet error');
    return o;
  } finally { clearTimeout(to); }
}
function receive(data, revAtSend, sent) {
  sync.hash = data.hash; if (data.sheetUrl) sync.cfg.sheetUrl = data.sheetUrl;
  if (data.same) { if (sent) sync.base = sent; saveSyncState(); return; }   // after an upload nobody else touched: the Sheet now matches what was sent
  if (sync.localRev === revAtSend) {
    const before = JSON.stringify(S), c0 = snapCounts(S); adoptServer(data); sync.base = snapshotRows();
    const c1 = snapCounts(S), lost = ['blocks', 'tasks', 'money', 'notes'].filter(k => c0[k] - c1[k] >= Math.max(5, c0[k] * 0.1));
    if (lost.length) { takeSnapshot(`Before a large change from the Sheet (${lost.map(k => `${k} ${c0[k]}→${c1[k]}`).join(', ')})`, before); toast('The Sheet removed a lot at once — a restore point of the earlier plan is in Settings'); }
    if (JSON.stringify(S) !== before) { saveLocal(); softRender(); }
  } else {
    const keep = clone(S); adoptServer(data); sync.base = snapshotRows(); for (const k of SECTIONS) S[k] = keep[k];
    clearTimeout(sync.timer); sync.timer = setTimeout(syncNow, 800);
  }
  saveSyncState();
}
async function syncNow(opts = {}) {
  if (!sync.cfg || sync.busy) return;
  if (!navigator.onLine) { setStatus('local', 'Offline · saved on this device'); return; }
  sync.busy = true; const rev = sync.localRev;
  try {
    const snap = snapshotRows(), ops = diffOps(snap, sync.base);
    if (ops) {
      setStatus('saving', 'Syncing…');
      receive(await api('POST', { ops, h: sync.hash }), rev, snap);
    } else {
      if (!opts.quiet) setStatus('saving', 'Checking for changes…');
      receive(await api('GET', { h: sync.hash }), rev);
      if (sync.localRev === rev) await reformatSheetTimes(rev);
    }
    sync.lastPull = Date.now();
    setStatus('saved', 'Synced with Google Sheet');
    if (sync.backupDay !== todayISO()) { sync.backupDay = todayISO(); saveSyncState(); setTimeout(() => api('POST', { ops: {}, backup: { app: 'life-garden', version: 1, exported: new Date().toISOString(), data: S } }).catch(e => { console.warn('daily Drive backup failed', e); sync.backupDay = null; saveSyncState(); }), 4000); }
  } catch (e) {
    console.warn('sync', e);
    setStatus('error', e.name === 'AbortError' ? 'Sheet is slow — will retry' : (e.message || 'Sync failed') + ' · saved on this device');
    clearTimeout(sync.timer); sync.timer = setTimeout(syncNow, 20000);
  } finally { sync.busy = false; if (sync.localRev !== rev && sync.cfg) { clearTimeout(sync.timer); sync.timer = setTimeout(syncNow, 1000); } }
}
/* One-time, gradual: rewrite old 24-hour times in the Sheet as 12-hour, 150 rows per sync.
   Runs only straight after a check that found this device up to date, and sends each row exactly as it is now. */
async function reformatSheetTimes(rev) {
  let q; try { q = JSON.parse(localStorage.getItem('lifegarden.ampmQueue') || 'null'); } catch (e) { q = null; }
  if (q === null) { if (localStorage.getItem('lifegarden.ampmDone')) return; q = S.blocks.map(b => b.id); }
  if (!q.length) { localStorage.setItem('lifegarden.ampmDone', '1'); localStorage.removeItem('lifegarden.ampmQueue'); return; }
  const snap = snapshotRows(), batch = q.slice(0, 150), rows = batch.map(id => snap.t.blocks[id]).filter(Boolean).map(j => JSON.parse(j));
  if (rows.length) receive(await api('POST', { ops: { tables: { blocks: { upsert: rows, del: [] } }, json: {} }, h: sync.hash }), rev, snap);
  localStorage.setItem('lifegarden.ampmQueue', JSON.stringify(q.slice(150)));
}
/* First connection: decide whether the Sheet or this device is the starting point. */
async function connectSheet(url, key) {
  url = url.trim(); key = key.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error('Paste the Web app URL that ends in /exec');
  const prev = sync.cfg; sync.cfg = { url, key };
  let data;
  try { data = await api('GET', {}); } catch (e) { sync.cfg = prev; throw e; }
  if (isServerEmpty(data)) { sync.base = null; sync.hash = null; saveSyncState(); await syncNow(); return 'pushed'; }
  const choice = await new Promise(res => openModal(`<div class="mh"><h3>This Sheet already has a plan</h3></div><div class="mb"><p class="small">Most of the time you want the Sheet's plan on this device. Merging adds everything from this device to the Sheet too, which can create duplicates if both started from the same backup.</p></div>
    <div class="mf"><button class="btn" id="cMerge">Merge this device into the Sheet</button><button class="btn primary" id="cUse">Use the Sheet's plan</button></div>`, m => { $('#cUse', m).onclick = () => { closeModal(); res('use'); }; $('#cMerge', m).onclick = () => { closeModal(); res('merge'); }; }));
  if (choice === 'use') { if (!isEmptyPlan(S)) await takeSnapshot('Before using the Sheet’s plan on this device'); const theme = S.settings.theme; adoptServer(data); S.settings.theme = theme; sync.base = snapshotRows(); sync.hash = data.hash; saveLocal(); saveSyncState(); render(); setStatus('saved', 'Synced with Google Sheet'); return 'used'; }
  const keep = clone(S); adoptServer(data); sync.base = snapshotRows(); for (const k of SECTIONS) S[k] = keep[k]; sync.hash = data.hash; saveSyncState(); await syncNow(); return 'merged';
}
function disconnectSheet() { sync.cfg = null; sync.base = null; sync.hash = null; saveSyncState(); setStatus('local', 'Saved on this device'); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sync.cfg && Date.now() - sync.lastPull > 15000) syncNow({ quiet: true }); });
window.addEventListener('online', () => sync.cfg && syncNow({ quiet: true }));
setInterval(() => { if (document.visibilityState === 'visible' && sync.cfg && !dlg().open) syncNow({ quiet: true }); }, 60000);
/* re-render without yanking focus out of a field someone is typing in */
function softRender() {
  const a = document.activeElement;
  if (R.interacting || dlg().open || (a && $('#main').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { sync.pendingRender = true; return; }
  render();
}
function flushPendingRender() { if (sync.pendingRender && !R.interacting && !dlg().open) { sync.pendingRender = false; render(); } }
document.addEventListener('focusout', () => setTimeout(() => {
  if (sync.pendingRender) { const a = document.activeElement; if (!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { sync.pendingRender = false; render(); } }
}, 50));

/* ---------- undo ---------- */
const undoStack = [];
function commit(k, label, fn, opts = {}) {
  const prev = JSON.stringify(S[k]);
  const r = fn(S[k]);
  if (JSON.stringify(S[k]) === prev) return r;
  undoStack.push({ k, prev, label }); if (undoStack.length > 60) undoStack.shift();
  $('#undoBtn').disabled = false; $('#undoBtn').title = 'Undo: ' + label;
  markDirty(k);
  if (opts.toast) toast(opts.toast, 'Undo', undo);
  if (opts.render !== false) render();
  return r;
}
function undo() {
  const u = undoStack.pop(); if (!u) return;
  S[u.k] = JSON.parse(u.prev); markDirty(u.k); render();
  toast('Undid: ' + u.label);
  $('#undoBtn').disabled = !undoStack.length; $('#undoBtn').title = undoStack.length ? 'Undo: ' + undoStack[undoStack.length - 1].label : 'Undo';
}

/* ---------- generic field binding: data-b="money.entries#ID.desc" ---------- */
function resolvePath(path) {
  const segs = path.split('.'); const k = segs.shift();
  return { k, walk(root) { let o = root; for (let i = 0; i < segs.length - 1; i++) o = step(o, segs[i]); return [o, segs[segs.length - 1]]; } };
  function step(o, s) { if (s.includes('#')) { const [arr, id] = s.split('#'); return (arr ? o[arr] : o).find(x => x.id === id); } return o[s]; }
}
function coerce(el) {
  const t = el.dataset.t;
  if (el.type === 'checkbox') return el.checked;
  if (t === 'num' || el.type === 'number') return el.value === '' ? '' : +el.value;
  if (t === 'time') return fromHHMM(el.value);
  return el.value;
}
function bindChange(el) {
  const { k, walk } = resolvePath(el.dataset.b);
  const val = coerce(el);
  commit(k, el.dataset.label || 'edit', root => { const [o, f] = walk(root); if (o) o[f] = val; }, { render: el.dataset.rerender === '1' });
}

/* ---------- toast / modal ---------- */
function toast(msg, actLabel, act, ms = 4500) {
  const box = $('#toasts'); while (box.children.length >= 3) box.firstChild.remove();
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (actLabel) { const b = document.createElement('button'); b.textContent = actLabel; b.onclick = () => { act(); t.remove(); }; t.appendChild(b); }
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
}
const dlg = () => $('#dlg');
function openModal(html, onBind, wide) {
  const fresh = document.createElement('div'); fresh.id = 'dlgBody'; $('#dlgBody').replaceWith(fresh); // drop listeners from earlier dialogs
  fresh.innerHTML = html; const d = dlg(); d.classList.toggle('wide', !!wide);
  if (!d.open) d.showModal();
  onBind && onBind($('#dlgBody'));
  const f = $('#dlgBody [autofocus]') || $('#dlgBody input,#dlgBody button'); f && f.focus();
}
function closeModal() { const d = dlg(); if (d.open) d.close(); $('#dlgBody').innerHTML = ''; setTimeout(flushPendingRender, 0); }
dlg().addEventListener('close', () => setTimeout(flushPendingRender, 0));
dlg().addEventListener('click', e => { if (e.target === dlg()) closeModal(); });
function confirmBox(msg, okLabel = 'Remove') {
  return new Promise(res => {
    openModal(`<div class="mh"><h3>Are you sure?</h3></div><div class="mb"><p>${esc(msg)}</p></div><div class="mf"><button class="btn" id="cNo">Cancel</button><button class="btn danger" id="cYes">${esc(okLabel)}</button></div>`, b => {
      $('#cNo', b).onclick = () => { closeModal(); res(false); }; $('#cYes', b).onclick = () => { closeModal(); res(true); };
    });
  });
}
async function downloadFile(filename, data, mime = 'application/octet-stream') {
  try {
    const file = new File([data], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [file], title: filename }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { toast('Download blocked here — use “Copy backup text” instead'); }
}
/* ---------- routing ---------- */
const NAV = [
  ['today', '☀', 'Today'], ['week', '▦', 'Week & month'], ['capacity', '⧗', 'Capacity'], ['sep'],
  ['money', '$', 'Money'], ['projects', '✎', 'Projects'], ['move', '➜', 'Move & downsizing'], ['opps', '✦', 'Opportunities'], ['sep'],
  ['well', '❀', 'Well-being'], ['prep', '♡', 'Family prep'], ['sep'], ['backup', '⚙', 'Settings & backup'],
];
const R = { view: 'today', date: todayISO(), tab: {} };
function parseHash() { const v = location.hash.slice(1); R.view = NAV.some(n => n[0] === v) ? v : 'today'; }
function go(view, date) { if (date) R.date = date; const changed = R.view !== view; R.view = view; if (location.hash.slice(1) !== view) { try { history.replaceState(null, '', '#' + view); } catch (e) { } } render(); if (changed) { $('#main').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); } }
window.addEventListener('hashchange', () => { parseHash(); render(); });
function renderNav() {
  $('#sidenav').innerHTML = NAV.map(n => n[0] === 'sep' ? '<div class="sep"></div>' : `<button data-nav="${n[0]}" ${R.view === n[0] ? 'aria-current="page"' : ''}><span class="ico" aria-hidden="true">${n[1]}</span>${n[2]}</button>`).join('');
  const TABS = [['today', '☀', 'Today'], ['week', '▦', 'Week'], ['capacity', '⧗', 'Capacity'], ['money', '$', 'Money']];
  const inTabs = TABS.some(t => t[0] === R.view);
  $('#tabbar').innerHTML = TABS.map(t => `<button data-nav="${t[0]}" ${R.view === t[0] ? 'aria-current="page"' : ''}><span class="ti" aria-hidden="true">${t[1]}</span>${t[2]}</button>`).join('') + `<button data-more="1" ${inTabs ? '' : 'aria-current="page"'}><span class="ti" aria-hidden="true">☰</span>${inTabs ? 'More' : NAV.find(n => n[0] === R.view)[2].split(' ')[0]}</button>`;
  $('#mnav').innerHTML = NAV.filter(n => n[0] !== 'sep').map(n => `<option value="${n[0]}" ${R.view === n[0] ? 'selected' : ''}>${n[2]}</option>`).join('');
}
$('#sidenav').addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b) go(b.dataset.nav); });
$('#mnav').addEventListener('change', e => go(e.target.value));
$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.nav) return go(b.dataset.nav);
  openModal(`<div class="mh"><h3>Life Garden</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div><div class="mb morelist">${NAV.filter(n => n[0] !== 'sep').map(n => `<button data-goto="${n[0]}"><span aria-hidden="true" style="width:1.4rem;text-align:center">${n[1]}</span>${n[2]}</button>`).join('')}</div>`, m => m.addEventListener('click', ev => { const x = ev.target.closest('[data-goto]'); if (x) { closeModal(); go(x.dataset.goto); } }));
});

/* ---------- theme & season ---------- */
function seasonFor(dateIso) { const m = +dateIso.slice(5, 7); return m >= 3 && m <= 5 ? 'spring' : m <= 8 && m >= 6 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; }
function applyLook() {
  document.documentElement.dataset.theme = S.settings.theme || 'dark';
  const s = S.settings.season === 'auto' || !S.settings.season ? seasonFor(todayISO()) : S.settings.season;
  $('#hero').className = 'hero season-' + s;
}
$('#themeBtn').onclick = () => commit('settings', 'theme', st => { st.theme = st.theme === 'light' ? 'dark' : 'light'; });
$('#undoBtn').onclick = undo;
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && R.view === 'today') { e.preventDefault(); $('#cmd') && $('#cmd').focus(); }
});

/* ---------- delegated events ---------- */
const ACT = {};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.b) bindChange(el); });

/* ---------- render ---------- */
const VIEWS = {};
function render() {
  applyLook(); renderNav();
  const main = $('#main');
  const keepScroll = $('.tl-scroll') ? $('.tl-scroll').scrollTop : null;
  try { main.innerHTML = VIEWS[R.view](); } catch (err) { console.error(err); main.innerHTML = `<div class="card"><h3>Something went wrong drawing this section.</h3><pre class="small">${esc(err.stack || err)}</pre></div>`; }
  (VIEWS[R.view + '_after'] || (() => { }))(keepScroll);
}

/* ---------- restore points: automatic local copies of the whole plan ----------
   Kept in IndexedDB on this device (room for many full copies), newest first.
   Taken before an app update, once a day, and before anything that replaces lots of data. */
const SNAP_KEEP = 14;
const snapCounts = o => ({ blocks: (o.blocks || []).length, tasks: (o.tasks || []).length, money: ((o.money || {}).entries || []).length, notes: Object.keys(o.daynotes || {}).length });
let snapDB = null;
function snapOpen() {
  return snapDB || (snapDB = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
    const r = indexedDB.open('lifegarden', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('snaps', { keyPath: 't' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
async function snapTx(mode, fn) {
  const db = await snapOpen();
  return new Promise((res, rej) => { const tx = db.transaction('snaps', mode), req = fn(tx.objectStore('snaps')); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}
async function snapList() {
  try { return ((await snapTx('readonly', st => st.getAll())) || []).sort((a, b) => b.t - a.t); }
  catch (e) { try { const o = JSON.parse(localStorage.getItem('lifegarden.snap') || 'null'); return o ? [o] : []; } catch (e2) { return []; } }
}
async function takeSnapshot(reason, dataStr) {
  const data = dataStr || JSON.stringify(S), rec = { t: Date.now(), reason, version: APP_VERSION, day: todayISO(), counts: snapCounts(dataStr ? JSON.parse(dataStr) : S), data };
  try {
    await snapTx('readwrite', st => st.put(rec));
    const all = await snapList();
    if (all.length > SNAP_KEEP) await snapTx('readwrite', st => { let r; for (const o of all.slice(SNAP_KEEP)) r = st.delete(o.t); return r; });
    return true;
  } catch (e) {
    try { localStorage.setItem('lifegarden.snap', JSON.stringify(rec)); return true; } catch (e2) { console.warn('restore point failed', e, e2); return false; }
  }
}
async function snapGet(t) { const all = await snapList(); return all.find(o => o.t === +t); }
const isEmptyPlan = o => !o.blocks.length && !o.tasks.length && !(o.money.entries || []).length;
/* called once at start-up, after the saved plan is loaded */
async function bootSnapshots() {
  if (isEmptyPlan(S)) { localStorage.setItem('lifegarden.appver', APP_VERSION); return; }
  const prev = localStorage.getItem('lifegarden.appver');
  if (prev !== APP_VERSION) { if (await takeSnapshot(prev ? `Before app update (${prev} → ${APP_VERSION})` : 'First open of this version')) localStorage.setItem('lifegarden.appver', APP_VERSION); }
  const all = await snapList();
  if (!all.some(o => o.day === todayISO())) await takeSnapshot('Daily copy');
}
