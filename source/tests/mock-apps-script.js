// Minimal stand-in for Google Apps Script services, enough to run Code.gs for real.
const fs = require('fs'), vm = require('vm'), http = require('http'), crypto = require('crypto'), url = require('url');
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  _grid() { const g = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); g.push(row); } return g; }
  getDisplayValues() { return this._grid().map(r => r.map(v => v == null ? '' : String(v))); }
  getValues() { return this._grid().map(r => r.map(v => v == null ? '' : v)); }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; }
  setValue(x) { this.sh.set(this.r, this.c, x); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, ''); return this; }
}
['setFontWeight', 'setBackground', 'setNumberFormat', 'setWrap', 'setFontSize'].forEach(m => Range.prototype[m] = function () { return this; });
class Sheet {
  constructor(name) { this.name = name; this.d = []; }
  get(r, c) { return (this.d[r - 1] || [])[c - 1]; }
  deleteRow(r) { this.d.splice(r - 1, 1); global.__mtime = Date.now() + Math.random(); }
  set(r, c, v) { global.__mtime = Date.now() + Math.random(); while (this.d.length < r) this.d.push([]); const row = this.d[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getLastRow() { for (let i = this.d.length; i > 0; i--) if (this.d[i - 1].some(x => x !== '' && x != null)) return i; return 0; }
  getLastColumn() { let m = 0; for (const r of this.d) for (let j = r.length; j > 0; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } return m; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows() { } setTabColor() { } setColumnWidth() { }
  clear() { this.d = []; } clearContents() { this.d = []; }
}
const sheets = []; const ss = {
  getSheetByName: n => sheets.find(s => s.name === n) || null,
  insertSheet: (n, i) => { const s = new Sheet(n); i === 0 ? sheets.unshift(s) : sheets.push(s); return s; },
  getSheets: () => sheets, deleteSheet: s => sheets.splice(sheets.indexOf(s), 1), getUrl: () => 'https://docs.google.com/spreadsheets/d/MOCK/edit', getId: () => 'MOCK',
};
sheets.push(new Sheet('Sheet1'));
const drive = {}; const mkIter = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() { } },
  ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => process.env['MOCK_' + k] || null }) },
  UrlFetchApp: { fetch: (u, o) => {
    const req = JSON.parse(o.payload); global.__lastGemini = { url: u, req };
    const m = u.match(/models\/([^:]+):/)[1];
    if (m === 'gemini-3.6-flash' && process.env.MOCK_404_FIRST) return { getResponseCode: () => 404, getContentText: () => '{}' };
    const parts = req.contents[0].parts, audio = parts.find(p => p.inlineData), txt = parts.map(p => p.text || '').join(' ');
    const ctx = JSON.parse(txt.split('Plan context (JSON):\n')[1].split('\n\nJordan')[0]);
    let said = audio ? 'Move dinner to 7 PM and add dentist Tuesday at 10' : (txt.split('Jordan typed: ')[1] || '');
    const dinner = ctx.blocks.find(b => /dinner/i.test(b.title));
    let ans;
    if (/what'?s on/i.test(said)) ans = { heard: said, reply: 'Thursday has dance teaching from 4:30 and dinner at 6.', actions: [] };
    else ans = { heard: said, reply: 'Okay — moving dinner and adding the dentist.', actions: [
      ...(dinner ? [{ type: 'update_block', id: dinner.id, start: '19:00', end: '20:00' }] : []),
      { type: 'add_block', title: 'Dentist', date: '2026-11-17', start: '10:00', end: '11:00', kind: 'fixed' },
      { type: 'add_money', title: 'Phone bill', amount: 45, money_type: 'expense', settled: true, date: '2026-11-16' },
      { type: 'update_block', id: 'does-not-exist', start: '09:00' } ] };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(ans) }] } }] }) };
  } },
  CacheService: { getScriptCache: () => ({ get: k => (global.__c = global.__c || {})[k] || null, put: (k, v) => { (global.__c = global.__c || {})[k] = v; }, remove: k => { delete (global.__c || {})[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
  Utilities: { getUuid: () => crypto.randomUUID(), computeDigest: (a, s) => [...crypto.createHash('md5').update(s, 'utf8').digest()], base64Encode: b => Buffer.from(b).toString('base64'), DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' }, formatDate: () => new Date().toISOString().slice(0, 10), sleep: () => { } },
  DriveApp: {
    getFileById: () => ({ getLastUpdated: () => new Date(Math.floor(global.__mtime || 1)) }),
    getFoldersByName: n => mkIter(drive[n] ? [drive[n]] : []),
    createFolder: n => (drive[n] = { files: [], getFilesByName(x) { return mkIter(this.files.filter(f => f.name === x)); }, createFile(name, text) { const f = { name, text, getName() { return this.name; }, setContent(t) { this.text = t; }, setTrashed() { } }; this.files.push(f); return f; }, getFiles() { return mkIter(this.files); } }),
  },
  console,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8').replace("const PASSCODE = 'CHANGE-ME-to-a-private-phrase';", "const PASSCODE = 'tucker';"), ctx);
console.log('setup ->', vm.runInContext('setup()', ctx));
const tab = n => ss.getSheetByName(n);
http.createServer((req, res) => {
  const u = url.parse(req.url, true); let body = '';
  req.on('data', c => body += c); req.on('end', () => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', 'application/json');
    try {
      if (u.pathname === '/inspect') return res.end(JSON.stringify(Object.fromEntries(sheets.map(s => [s.name, s.d.slice(0, +u.query.n || 4)])).concat ? 0 : Object.fromEntries(sheets.map(s => [s.name, { rows: s.getLastRow(), head: s.d[0], sample: s.d.slice(1, +u.query.n || 3) }]))));
      if (u.pathname === '/calllog') { const l = global.__log || []; global.__log = []; return res.end(JSON.stringify(l)); }
      if (u.pathname === '/lastgemini') { const g = global.__lastGemini || {}; const a = g.req && g.req.contents[0].parts.find(p => p.inlineData); return res.end(JSON.stringify({ url: g.url, hasSchema: !!(g.req && g.req.generationConfig.responseSchema), mime: a && a.inlineData.mimeType, audioBytes: a ? Buffer.from(a.inlineData.data, 'base64').length : 0, riff: a ? Buffer.from(a.inlineData.data, 'base64').slice(0, 4).toString() : '', sysPrompt: !!(g.req && g.req.systemInstruction), ctxBlocks: g.req ? JSON.parse(g.req.contents[0].parts.map(p => p.text || '').join('').split('Plan context (JSON):\n')[1].split('\n\nJordan')[0]).blocks.length : 0 })); }
      if (u.pathname === '/gemini') { // simulate Gemini/people editing the Sheet directly
        const ed = JSON.parse(body), sh = tab(ed.tab), head = sh.d[0];
        if (ed.append) { const r = sh.getLastRow() + 1; ed.append.forEach((row, i) => Object.entries(row).forEach(([k, v]) => sh.set(r + i, head.indexOf(k) + 1, v))); }
        if (ed.setWhere) { for (let i = 1; i < sh.d.length; i++) if (sh.d[i][head.indexOf(ed.setWhere.col)] === ed.setWhere.eq) Object.entries(ed.setWhere.set).forEach(([k, v]) => sh.set(i + 1, head.indexOf(k) + 1, v)); }
        global.__mtime = Date.now() + 7;
        if (ed.keepFirst != null) sh.d = sh.d.slice(0, ed.keepFirst + 1);
        if (ed.deleteWhere) { sh.d = [sh.d[0], ...sh.d.slice(1).filter(r => r[head.indexOf(ed.deleteWhere.col)] !== ed.deleteWhere.eq)]; }
        return res.end('{"ok":true}');
      }
      global.__calls = (global.__calls || 0) + 1; const t0 = Date.now();
      const out = req.method === 'GET' ? ctx.doGet({ parameter: u.query }) : ctx.doPost({ postData: { contents: body } });
      const o = JSON.parse(out.t); (global.__log = global.__log || []).push((req.method) + (o.same ? ' same' : o.tables ? ' full' : ' small') + ' ' + out.t.length + 'B');
      res.end(out.t);
    } catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e) })); }
  });
}).listen(8790, () => console.log('mock apps script on 8790'));
