/**
 * Jordan's Life Garden — Google Sheet sync backend
 * ------------------------------------------------
 * 1. In the Google Sheet: Extensions → Apps Script, delete what's there, paste this whole file.
 * 2. Change PASSCODE below to a private phrase (the app asks for it once per device).
 * 3. Run the function  setup  once (▶ Run) and allow access when Google asks.
 * 4. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *    Copy the Web app URL into the Life Garden app (Settings & backup → Google Sheet).
 * After changing this code later, use Deploy → Manage deployments → Edit → Version: New version.
 *
 * Voice assistant (optional): get a Gemini API key at https://aistudio.google.com/apikey (same Google account),
 * then in this Apps Script project: Project Settings (gear) → Script properties → Add script property
 *   Property: GEMINI_API_KEY    Value: (paste the key)    → Save.  No redeploy needed.
 */
const PASSCODE = 'CHANGE-ME-to-a-private-phrase';
// Use a long phrase (4+ random words). After 10 wrong passcodes in 15 minutes the Sheet stops answering for 30 minutes.

const TABLES = {
  blocks:   { tab: 'Time blocks',   key: 'id',   cols: ['id', 'date', 'start', 'end', 'title', 'kind', 'status', 'category', 'done', 'notes', 'source', 'edited', 'extra'] },
  tasks:    { tab: 'Next steps',    key: 'id',   cols: ['id', 'title', 'area', 'status', 'show_from', 'minutes', 'done', 'done_on', 'notes', 'project_id', 'source', 'extra'] },
  daynotes: { tab: 'Day notes',     key: 'date', cols: ['date', 'phase', 'cycle', 'note', 'priority', 'basis', 'media', 'source'] },
  entries:  { tab: 'Money',         key: 'id',   cols: ['id', 'type', 'description', 'category', 'date', 'estimate', 'actual', 'settled'] },
  opps:     { tab: 'Opportunities', key: 'id',   cols: ['id', 'title', 'organization', 'kind', 'status', 'pay', 'hours', 'location', 'deadline', 'last_checked', 'url', 'notes', 'priority'] },
};
const JSON_TAB = 'App data (do not edit)';
const HELP_TAB = 'How to edit (for Gemini)';
const BACKUP_FOLDER = 'Life Garden backups';
const CHUNK = 45000;

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const t of Object.values(TABLES)) ensureTable_(ss, t);
  const j = ss.getSheetByName(JSON_TAB) || ss.insertSheet(JSON_TAB);
  if (j.getLastRow() === 0) j.getRange(1, 1, 1, 3).setValues([['section', 'part', 'json']]).setFontWeight('bold');
  j.setTabColor('#888888');
  let h = ss.getSheetByName(HELP_TAB) || ss.insertSheet(HELP_TAB, 0);
  h.clear();
  const help = [
    ['How to edit Jordan\'s Life Garden in this Sheet'],
    ['The Life Garden app on Jordan\'s phone reads these tabs. Edits here show up in the app the next time it syncs (about a minute, or when the app is reopened).'],
    [''],
    ['Time blocks — one row per scheduled block'],
    ['date: YYYY-MM-DD (e.g. 2026-11-18).  start / end: 24-hour HH:MM in local time (e.g. 09:00, 16:30; use 24:00 for midnight). A block never crosses midnight — split overnight plans into two rows.'],
    ['title: what the activity is.  kind: flexible (can be moved), fixed (appointment), or protected (travel, meals, sleep, together time).'],
    ['status: leave blank for Jordan\'s own plan, or one of: confirmed, proposed, needs confirmation, source-listed, source + proposed. Proposed means a suggestion, not a booking.'],
    ['category (optional): exercise, meals, rest, focus, together, sleep, appointments, travel, routine, other. Blank = automatic from the title.'],
    ['done: yes when it actually happened.  notes: free text.  id: leave blank on new rows — the app fills it in.  Leave source, edited and extra as they are.'],
    [''],
    ['Next steps — Jordan\'s to-do items'],
    ['title, area (Today, Dance & Glimmer, Academic, Move, Life admin, Family planning, Opportunities, Money, Well-being), status (Idea, Needs decision, Needs verification, Confirmed, In progress), show_from (YYYY-MM-DD or blank), minutes (estimate), done (yes/blank), done_on (YYYY-MM-DD).'],
    [''],
    ['Day notes — one row per date: phase, cycle, note, priority (the week\'s suggested focus), basis (time zone basis), media (screen-time limit).'],
    ['Money — type (income or expense), description, category, date, estimate, actual, settled (yes when received or paid). Never enter a guess in actual.'],
    ['Opportunities — jobs, spaces, grants: title, organization, kind, status (New, Shortlist, Applied, Not for me), pay, hours, location, deadline, last_checked, url, notes, priority (yes/blank).'],
    [''],
    ['Please don\'t rename tabs or the header row, and don\'t edit the grey "' + JSON_TAB + '" tab. You may add your own extra columns to the right — the app keeps them.'],
  ];
  h.getRange(1, 1, help.length, 1).setValues(help).setWrap(true);
  h.setColumnWidth(1, 900); h.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  [4, 11, 14, 15, 16].forEach(r => h.getRange(r, 1).setFontWeight('bold'));
  h.setTabColor('#e8964a');
  const extra = ss.getSheetByName('Sheet1'); if (extra && extra.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(extra);
  return 'Ready. Now Deploy → New deployment → Web app.';
}

/* ---------------- web endpoints ---------------- */
function checkKey_(k) {
  const c = CacheService.getScriptCache();
  if (c.get('locked')) return 'locked';
  if (PASSCODE.indexOf('CHANGE-ME') === 0) return 'setup';
  if (k === PASSCODE) return '';
  const n = (+c.get('fails') || 0) + 1; c.put('fails', String(n), 900);
  if (n >= 10) { c.put('locked', '1', 1800); c.remove('fails'); }
  return 'passcode';
}
function doGet(e) {
  const p = e.parameter || {};
  const bad = checkKey_(p.k); if (bad) return out_({ ok: false, error: bad });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return out_(pull_(p.h)); } finally { lock.releaseLock(); }
}
function doPost(e) {
  let body; try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); }
  const bad = checkKey_(body.k); if (bad) return out_({ ok: false, error: bad });
  if (body.op === 'agent') return out_(agent_(body));
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ops = body.ops || {};
    for (const [name, op] of Object.entries(ops.tables || {})) if (TABLES[name]) applyTable_(ss, TABLES[name], op.upsert || [], op.del || []);
    if (ops.json && Object.keys(ops.json).length) writeJson_(ss, ops.json);
    if (body.backup) saveBackup_(body.backup);
    SpreadsheetApp.flush();
    return out_(pull_());
  } finally { lock.releaseLock(); }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------------- tables ---------------- */
function ensureTable_(ss, t) {
  let sh = ss.getSheetByName(t.tab);
  if (!sh) sh = ss.insertSheet(t.tab);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  let head = sh.getLastRow() ? sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].filter(String) : [];
  const missing = t.cols.filter(c => head.indexOf(c) < 0);
  if (missing.length) { head = head.concat(missing); sh.getRange(1, 1, 1, head.length).setValues([head]); }
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#f3e7d3');
  sh.setFrozenRows(1);
  return { sh, head };
}
function readTable_(ss, t) {
  const { sh, head } = ensureTable_(ss, t);
  const n = sh.getLastRow() - 1; if (n < 1) return { sh, head, rows: [] };
  const vals = sh.getRange(2, 1, n, head.length).getDisplayValues();
  const rows = [];
  let filled = false;
  vals.forEach((v, i) => {
    if (!v.some(x => String(x).trim() !== '')) return;
    const o = {}; head.forEach((h, j) => { o[h] = v[j]; });
    if (!o[t.key] && t.key === 'id') { o.id = 'g' + Utilities.getUuid().replace(/-/g, '').slice(0, 11); sh.getRange(i + 2, head.indexOf('id') + 1).setValue(o.id); filled = true; }
    if (o[t.key]) rows.push(o);
  });
  if (filled) SpreadsheetApp.flush();
  return { sh, head, rows };
}
function applyTable_(ss, t, upsert, del) {
  const { sh, head, rows } = readTable_(ss, t);
  const dels = {}; del.forEach(k => dels[k] = true);
  const map = {}; const order = [];
  rows.forEach(r => { if (!dels[r[t.key]]) { map[r[t.key]] = r; order.push(r[t.key]); } });
  upsert.forEach(u => {
    const k = u[t.key]; if (!k) return;
    for (const c of Object.keys(u)) if (head.indexOf(c) < 0) head.push(c);
    if (map[k]) Object.assign(map[k], u); else { map[k] = u; order.push(k); }
  });
  const data = order.map(k => head.map(h => map[k][h] == null ? '' : String(map[k][h])));
  const oldN = Math.max(sh.getLastRow() - 1, 0);
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  if (oldN) sh.getRange(2, 1, oldN, Math.max(sh.getLastColumn(), head.length)).clearContent();
  if (data.length) { const r = sh.getRange(2, 1, data.length, head.length); r.setNumberFormat('@'); r.setValues(data); }
}

/* ---------------- JSON sections ---------------- */
function readJson_(ss) {
  const sh = ss.getSheetByName(JSON_TAB); const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const parts = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(([s, p, j]) => { if (s) (parts[s] = parts[s] || []).push([+p || 0, String(j)]); });
  for (const [s, arr] of Object.entries(parts)) { try { out[s] = JSON.parse(arr.sort((a, b) => a[0] - b[0]).map(x => x[1]).join('')); } catch (e) { } }
  return out;
}
function writeJson_(ss, sections) {
  const sh = ss.getSheetByName(JSON_TAB) || ss.insertSheet(JSON_TAB);
  const cur = readJson_(ss); Object.assign(cur, sections);
  const rows = [];
  for (const [s, v] of Object.entries(cur)) { const str = JSON.stringify(v); for (let i = 0, p = 0; i < Math.max(str.length, 1); i += CHUNK, p++) rows.push([s, p, str.slice(i, i + CHUNK)]); }
  sh.clearContents(); sh.getRange(1, 1, 1, 3).setValues([['section', 'part', 'json']]).setFontWeight('bold');
  if (rows.length) { const r = sh.getRange(2, 1, rows.length, 3); r.setNumberFormat('@'); r.setValues(rows); }
}

/* ---------------- pull + backups ---------------- */
function pull_(knownHash) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tables = {}; for (const [name, t] of Object.entries(TABLES)) tables[name] = readTable_(ss, t).rows;
  const json = readJson_(ss);
  const payload = JSON.stringify({ tables, json });
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, payload, Utilities.Charset.UTF_8));
  if (knownHash && knownHash === hash) return { ok: true, same: true, hash };
  return { ok: true, hash, tables, json, sheetUrl: ss.getUrl() };
}
function saveBackup_(data) {
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  const day = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  const name = 'Life Garden backup ' + day + '.json';
  const ex = folder.getFilesByName(name);
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  if (ex.hasNext()) ex.next().setContent(text); else folder.createFile(name, text, 'application/json');
  const files = []; const all = folder.getFiles(); while (all.hasNext()) files.push(all.next());
  files.sort((a, b) => b.getName() < a.getName() ? -1 : 1).slice(30).forEach(f => f.setTrashed(true)); // keep 30 days
}

/* ---------------- voice assistant (Gemini) ---------------- */
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
const AGENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    heard: { type: 'STRING', description: 'What Jordan said, transcribed (or the typed text).' },
    reply: { type: 'STRING', description: 'Short, warm spoken reply: one or two sentences.' },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['add_block', 'update_block', 'delete_block', 'add_step', 'complete_step', 'add_money'] },
          id: { type: 'STRING', description: 'Existing block or step id from the context. Never invent one.' },
          title: { type: 'STRING' },
          date: { type: 'STRING', description: 'YYYY-MM-DD' },
          start: { type: 'STRING', description: '24-hour HH:MM' },
          end: { type: 'STRING', description: '24-hour HH:MM, after start, same day (24:00 = midnight)' },
          kind: { type: 'STRING', enum: ['flexible', 'fixed', 'protected'] },
          done: { type: 'BOOLEAN' },
          area: { type: 'STRING' },
          money_type: { type: 'STRING', enum: ['income', 'expense'] },
          amount: { type: 'NUMBER' },
          settled: { type: 'BOOLEAN', description: 'true only if she says it was already paid or received' },
        },
        required: ['type'],
      },
    },
  },
  required: ['heard', 'reply', 'actions'],
};
const AGENT_RULES = [
  'You are the voice assistant inside Jordan\'s Life Garden, her personal day planner. You help her change her plan by voice.',
  'Use only the plan context provided. Dates are YYYY-MM-DD, times are 24-hour HH:MM in her local time zone.',
  'Propose only the changes she actually asked for. Never invent ids: to change, move, finish or remove something, use the id of the matching item in the context. If several items could match or a needed detail is missing, ask one short question in reply and return no actions.',
  'New blocks: default length 60 minutes; appointments, classes, shifts and anything with another person at a set time are "fixed"; travel, meals, sleep and couple time are "protected"; everything else is "flexible". Use the title she would write herself, without dates or times in it.',
  'To move a block, use update_block with its id and the new date/start/end, keeping its length unless she says otherwise. "Mark X done" is update_block with done=true. To-dos without a time are add_step (date only if she gave a day).',
  'Money: add_money only when she states an amount. It is an estimate unless she says it was already paid or received.',
  'Questions about her plan ("what\'s on Thursday?") get a spoken answer and no actions.',
  'Reply in one or two short, plain sentences suitable to be read aloud. Do not repeat every detail of the change; the app shows it on screen. Never give medical, legal or financial advice.',
].join('\n');
function agent_(body) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'nokey' };
  const parts = [];
  if (body.audio && body.audio.data) parts.push({ inlineData: { mimeType: body.audio.mime || 'audio/wav', data: body.audio.data } });
  parts.push({ text: 'Plan context (JSON):\n' + JSON.stringify(body.context || {}) + (body.text ? '\n\nJordan typed: ' + body.text : '\n\nJordan\'s request is in the audio.') });
  const req = { systemInstruction: { parts: [{ text: AGENT_RULES }] }, contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: AGENT_SCHEMA, temperature: 0.2 } };
  let last = '';
  for (const m of GEMINI_MODELS) {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify(req), muteHttpExceptions: true });
    const code = r.getResponseCode(), txt = r.getContentText();
    if (code === 404) { last = 'model ' + m + ' not found'; continue; }
    if (code === 429) return { ok: false, error: 'rate' };
    if (code === 400 && /API key/i.test(txt) || code === 401 || code === 403) return { ok: false, error: 'apikey' };
    if (code !== 200) return { ok: false, error: 'gemini ' + code + ': ' + txt.slice(0, 200) };
    try {
      const j = JSON.parse(txt), t = j.candidates[0].content.parts.map(p => p.text || '').join('');
      return { ok: true, model: m, agent: JSON.parse(t) };
    } catch (e) { return { ok: false, error: 'Gemini answer could not be read' }; }
  }
  return { ok: false, error: last || 'no model available' };
}
