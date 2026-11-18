/* ================= Voice assistant ("Ask Life Garden") ================= */
const voice = { rec: null, busy: false };
document.body.insertAdjacentHTML('beforeend', '<button id="voiceFab" aria-label="Ask Life Garden by voice" title="Ask Life Garden">🎙</button>');
$('#voiceFab').onclick = () => openVoice(true);

/* ----- microphone → 16 kHz mono WAV (Web Audio; avoids MediaRecorder quirks in iPhone Home Screen apps) ----- */
function audioCtx() {   // one per conversation, created from a tap so iPhone lets it run
  if (!voice.ctx || voice.ctx.state === 'closed') { const AC = window.AudioContext || window.webkitAudioContext; voice.ctx = new AC(); }
  return voice.ctx;
}
async function startRecording(onLevel, onAutoStop, retried, onDead) {
  const ctx = audioCtx(); if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { } }   // iPhone leaves it 'interrupted' after a reply plays
  if (ctx.state !== 'running' && !retried) { try { ctx.close(); } catch (e) { } voice.ctx = null; return startRecording(onLevel, onAutoStop, true, onDead); }
  // keep one microphone stream for the whole conversation: asking again makes iPhone show the permission pop-up again.
  // Only re-open it if iPhone ended or muted it.
  const alive = voice.stream && voice.stream.getAudioTracks().some(t => t.readyState === 'live' && !t.muted);
  if (!alive) { if (voice.stream) voice.stream.getTracks().forEach(t => t.stop()); voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  const stream = voice.stream;
  const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
  let heard = false, quietSince = 0, lastLoud = 0, lastCb = Date.now(), maxRms = 0; const t0 = Date.now();
  // watchdog: iPhone sometimes hands back a microphone that delivers nothing (no audio at all, or pure zeros)
  const dog = setInterval(() => { const now = Date.now(); if (now - t0 > 1800 && (now - lastCb > 1200 || maxRms === 0)) { clearInterval(dog); onDead && onDead(); } }, 400);
  proc.onaudioprocess = e => {
    lastCb = Date.now();
    const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d));
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * d[i]; const rms = Math.sqrt(s / (d.length / 4)); if (rms > maxRms) maxRms = rms;
    onLevel && onLevel(rms);
    const now = Date.now();
    if (rms > 0.02) { heard = true; quietSince = 0; lastLoud = chunks.length; } else if (heard && !quietSince) quietSince = now;
    if ((heard && quietSince && now - quietSince > 1300) || (!heard && now - t0 > 8000) || now - t0 > 30000) onAutoStop && onAutoStop();
  };
  src.connect(proc); proc.connect(ctx.destination);
  return {
    async stop() {
      clearInterval(dog); try { src.disconnect(); proc.disconnect(); } catch (e) { }
      const rate = ctx.sampleRate;
      const keep = heard ? chunks.slice(0, Math.min(chunks.length, lastLoud + 3)) : chunks;   // drop trailing silence
      return { wav: encodeWav(downsample(keep, rate, 16000), 16000), seconds: keep.length * 4096 / rate, heard };
    },
    cancel() { clearInterval(dog); try { src.disconnect(); proc.disconnect(); } catch (e) { } },
  };
}
function downsample(chunks, from, to) {
  const len = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(len); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  if (from === to) return all;
  const ratio = from / to, out = new Float32Array(Math.floor(len / ratio));
  for (let i = 0; i < out.length; i++) { const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio)); let s = 0; for (let j = a; j < b; j++) s += all[j]; out[i] = s / Math.max(1, b - a); }
  return out;
}
function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Uint8Array(buf);
}
function toBase64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
/* ----- reading replies aloud: an iPhone/computer voice, or a ChatGPT voice ----- */
const OA_VOICES = ['coral', 'nova', 'shimmer', 'sage', 'alloy', 'ballad', 'ash', 'echo', 'fable', 'onyx', 'verse'];
const sysVoices = () => { try { return speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch (e) { return []; } };
if ('speechSynthesis' in window) try { speechSynthesis.onvoiceschanged = () => { if (R.view === 'backup' && !dlg().open && !(document.activeElement && /SELECT|INPUT/.test(document.activeElement.tagName))) render(); }; } catch (e) { }
const player = new Audio(); player.preload = 'auto';
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
function unlockSpeech() {   // called from a tap, so iPhone allows audio a moment later
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { }
  try { player.src = SILENT; const p = player.play(); p && p.catch(() => { }); } catch (e) { }
}
function speakSystem(text, rate) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise(done => { try {
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = rate;
    const est = setTimeout(done, 1500 + text.length * 90 / rate); u.onend = u.onerror = () => { clearTimeout(est); done(); };
    const want = String(S.settings.speakVoice || '').replace(/^sys:/, ''), v = want && sysVoices().find(x => x.voiceURI === want || x.name === want);
    if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.speak(u);
  } catch (e) { done(); } });
}
async function speak(text, force) {
  if ((S.settings.speakReplies === false && !force) || !text) return Promise.resolve();
  const choice = String(S.settings.speakVoice || ''), rate = +S.settings.speakRate || 1;
  if (choice.startsWith('oa:')) {
    const key = localOpenAIKey() || await openaiKey().catch(() => null);
    if (key) {
      for (const model of ['gpt-4o-mini-tts', 'tts-1']) {
        try {
          const body = { model, voice: choice.slice(3), input: text, response_format: 'mp3', speed: Math.max(0.5, Math.min(2, rate)) };
          if (model !== 'tts-1') body.instructions = 'Warm, calm and friendly, like a supportive friend helping plan the day.';
          const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 12000);
          const r = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }).finally(() => clearTimeout(to));
          if (r.status === 404 || r.status === 400) continue;
          if (!r.ok) break;
          const url = URL.createObjectURL(await r.blob());
          try { speechSynthesis.cancel(); } catch (e) { }
          player.pause(); player.src = url;
          const ended = new Promise(done => { player.onended = player.onerror = () => { URL.revokeObjectURL(url); done(); }; voice.stopPlayer = done; });
          await player.play(); return ended;
        } catch (e) { break; }
      }
    }
  }
  return speakSystem(text, rate);                              // fallback: the device's own voice
}
function stopSpeaking() { try { speechSynthesis.cancel(); } catch (e) { } try { player.pause(); } catch (e) { } voice.stopPlayer && voice.stopPlayer(); }

/* ----- what the assistant gets to see: about ten days of the plan and open next steps ----- */
function agentContext() {
  const t0 = todayISO(), from = [addDays(t0, -1), addDays(R.date, -1)].sort()[0], to = [addDays(t0, 7), addDays(R.date, 3)].sort()[1];
  const st = { confirmed: 'C', proposed: 'P', needs: 'N', source: 'S', sourceproposed: 'SP' };
  const upcoming = {}; for (let i = 0; i < 14; i++) { const d = addDays(t0, i); upcoming[d] = (i === 0 ? 'today ' : i === 1 ? 'tomorrow ' : i < 7 ? 'this coming ' : 'the following ') + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow(d)]; }
  return {
    now: `${t0} ${hhmm(nowMin())} (${DOW[dow(t0)]})`, viewing_date: R.date, people: people(),
    calendar: upcoming,
    date_rules: 'Pick dates from "calendar". If she names no day: use viewing_date, but if that is today and the time has already passed, use tomorrow. A weekday name means its next occurrence after today ("Monday" said on a Monday = 7 days later); "next <weekday>" means the same unless she says "next week". "Tonight"/"this morning"/"this afternoon" mean today. When unsure which day she means, ask instead of guessing. Say the weekday and date in your reply when you add or move something.',
    blocks_format: 'id|date|start-end|title|kind|status(C confirmed, P proposed draft, N needs confirmation, S source-listed, SP source+proposed, blank = her own)|done',
    blocks: S.blocks.filter(b => b.date >= from && b.date <= to && !b.sleep && !(b.status === 'proposed' && draftHidden())).sort((a, b) => (a.date + hhmm(a.start)).localeCompare(b.date + hhmm(b.start)))
      .map(b => [b.id, b.date, hm(b.start) + '-' + hm(b.end), b.title, b.kind, st[b.status] || '', b.done ? 'done' : ''].join('|').replace(/\|+$/, '')),
    next_steps: S.tasks.filter(t => !t.done).slice(0, 40).map(t => t.id + '|' + t.title + (t.date ? '|' + t.date : '')),
    dashboard: dashboardContext(),
  };
}
/* ----- the rest of the dashboard (read-only for the assistant): every tab, trimmed to fit ----- */
function slim(v, depth = 0) {   // drop ids, empty values and long text so each section stays small
  if (Array.isArray(v)) return v.map(x => slim(x, depth + 1)).filter(x => x !== undefined);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { if (k === 'id' || x === '' || x == null || x === false) continue; const y = slim(x, depth + 1); if (y === undefined || (Array.isArray(y) && !y.length) || (y && typeof y === 'object' && !Array.isArray(y) && !Object.keys(y).length)) continue; o[k] = y; } return o; }
  if (typeof v === 'string') return v.length > 240 ? v.slice(0, 240) + '…' : v;
  return v;
}
function capJSON(v, max) {
  const s = JSON.stringify(v); if (s.length <= max) return v;
  if (Array.isArray(v)) { let n = v.length; while (n > 1 && JSON.stringify(v.slice(-n)).length > max) n = Math.ceil(n * .7); return { note: `showing the latest ${n} of ${v.length}`, items: v.slice(-n) }; }
  return { note: 'shortened to fit', preview: s.slice(0, max) };
}
function dashboardContext() {
  const t0 = todayISO(), M = S.money || {};
  const recent = (M.entries || []).filter(e => !e.date || e.date >= addDays(t0, -60));
  const notes = {}; for (let i = -1; i < 14; i++) { const d = addDays(t0, i); if (S.daynotes && S.daynotes[d]) notes[d] = S.daynotes[d]; }
  const sec = {
    tabs: NAV.filter(n => n[0] !== 'sep').map(n => n[2]),
    capacity: slim(S.capacity), routines: slim(S.routines), together: slim(S.together),
    money: { recent_entries: capJSON(slim(recent), 4000), funds: slim(M.funds), presets: slim((M.presets || []).map(p => ({ name: p.name, type: p.type, amount: p.amount }))), reference: capJSON(slim(M.reference), 1200) },
    projects: capJSON(slim(S.projects), 4000), content: capJSON(slim(S.content), 1500),
    move_and_downsizing: { move: capJSON(slim(S.move), 3000), downsize: capJSON(slim(S.downsize), 1500) },
    opportunities: capJSON(slim(S.opps), 2500), well_being: capJSON(slim(S.well), 2000), family_prep: capJSON(slim(S.prep), 2000),
    day_notes: notes, done_recently: S.tasks.filter(t => t.done).slice(-10).map(t => t.title),
  };
  return sec;
}
/* ----- turn the assistant's proposals into checked, human-readable changes ----- */
const shortDay = d => fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' });
/* Gemini sometimes sends "2026-11-16T06:30:00", "6:30 AM", "0630" or "30 minutes" — read them all. */
function agentTime(v, start) {
  if (v == null || v === '') return null;
  const s = String(v).trim(), direct = parseTimeLoose(s); if (direct != null) return direct;
  let m = s.match(/(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?\s*([ap]\.?m\.?)?/i);
  if (m) return parseTimeLoose(`${m[1]}:${m[2]}${m[3] ? ' ' + m[3].replace(/\./g, '') : ''}`);
  if ((m = s.match(/^(\d{2})(\d{2})$/))) return +m[1] * 60 + +m[2];
  if (start != null && (m = s.match(/(\d+(?:\.\d+)?)\s*(h|hour|hr|m|min)/i))) return Math.min(1440, start + Math.round(/^h/i.test(m[2]) ? +m[1] * 60 : +m[1]));
  return null;
}
/* If Gemini "thinks out loud" inside the title (e.g. "... Title: X. Date: 2026-11-23. Start: 06:00 ..."), recover the real fields. */
function salvage(a) {
  const t = String(a.title || '');
  if (!(t.length > 70 || /\b(title|date|start|end|kind)\s*:/i.test(t) || /\b(wait|hmm|no,)\b/i.test(t))) return a;
  const last = re => { const m = [...t.matchAll(re)]; return m.length ? m[m.length - 1][1].trim() : null; };
  const title = last(/title\s*:\s*([^.\n]+?)(?=\s*(?:\.|\n|$|date\s*:|start\s*:|end\s*:|kind\s*:))/gi);
  const kind = (last(/kind\s*:\s*(flexible|fixed|protected)/gi) || '').toLowerCase();
  const out = { ...a,
    title: title || t.split(/[.?!\n]/)[0].slice(0, 60).trim(),
    date: a.date || last(/date\s*:\s*(\d{4}-\d{1,2}-\d{1,2})/gi) || undefined,
    start: a.start || last(/start\s*:\s*(\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?)/gi) || undefined,
    end: a.end || last(/end\s*:\s*(\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?)/gi) || undefined,
    kind: a.kind || kind || undefined };
  return out;
}
function planActions(actions) {
  const out = [];
  for (const raw of actions || []) {
    const a = salvage(raw);
    const blk = a.id && S.blocks.find(b => b.id === a.id), task = a.id && S.tasks.find(t => t.id === a.id);
    const startDate = /^\d{4}-\d{1,2}-\d{1,2}/.test(String(a.start || '')) ? parseDateLoose(String(a.start).slice(0, 10)) : null;   // only from a full date-time like 2026-11-23T06:00
    const date = (a.date ? parseDateLoose(a.date) : null) || startDate;
    const st = agentTime(a.start); let en = agentTime(a.end, st);
    if (a.type === 'add_block') {
      if (!a.title || !date || st == null) { out.push({ bad: `Couldn't add “${a.title || 'a block'}” — the day or time was unclear.` }); continue; }
      if (en == null || en <= st) en = Math.min(1440, st + 60);
      const kind = ['fixed', 'protected'].includes(a.kind) ? a.kind : 'flexible';
      out.push({ text: `Add “${a.title}” · ${shortDay(date)}, ${fmtTime(st)}–${fmtTime(en)}${kind !== 'flexible' ? ` (${kind === 'fixed' ? 'appointment' : 'protected'})` : ''}`, k: 'blocks', fn: bl => bl.push({ id: uid(), title: a.title, date, start: st, end: en, kind, cat: 'auto', notes: 'Added by voice' }) });
    } else if (a.type === 'update_block') {
      if (!blk) { out.push({ bad: 'One change pointed at a block that isn’t in the plan, so it was skipped.' }); continue; }
      const nd = date || blk.date, ns = st ?? blk.start; let ne = en ?? (st != null ? st + (blk.end - blk.start) : blk.end); if (ne <= ns) ne = Math.min(1440, ns + (blk.end - blk.start));
      const bits = [];
      if (nd !== blk.date || ns !== blk.start || ne !== blk.end) bits.push(`move to ${nd !== blk.date ? shortDay(nd) + ', ' : ''}${fmtTime(ns)}–${fmtTime(ne)}`);
      if (a.title && a.title !== blk.title) bits.push(`rename to “${a.title}”`);
      if (a.kind && a.kind !== blk.kind && KINDS[a.kind]) bits.push(`make it ${a.kind}`);
      if (a.done !== undefined && !!a.done !== !!blk.done) bits.push(a.done ? 'mark done' : 'mark not done');
      if (!bits.length) continue;
      out.push({ text: `“${blk.title}”: ${bits.join(', ')}`, k: 'blocks', fn: bl => { const b = bl.find(x => x.id === blk.id); if (!b) return; Object.assign(b, { date: nd, start: ns, end: ne }); if (a.title) b.title = a.title; if (a.kind && KINDS[a.kind]) b.kind = a.kind; if (a.done !== undefined) b.done = !!a.done; if (b.src === 'draft') b.edited = true; } });
    } else if (a.type === 'delete_block') {
      if (!blk) { out.push({ bad: 'Couldn’t find the block to remove.' }); continue; }
      out.push({ text: `Remove “${blk.title}” (${shortDay(blk.date)}, ${fmtTime(blk.start)})`, k: 'blocks', danger: true, fn: bl => { const i = bl.findIndex(x => x.id === blk.id); if (i >= 0) bl.splice(i, 1); } });
    } else if (a.type === 'add_step') {
      if (!a.title) continue;
      out.push({ text: `New next step: “${a.title}”${date ? ' for ' + shortDay(date) : ''}`, k: 'tasks', fn: ts => ts.push({ id: uid(), title: a.title, area: AREAS.includes(a.area) ? a.area : 'Today', status: 'Confirmed', date: date || null, mins: '', notes: 'Added by voice', order: -Date.now() / 1e13 }) });
    } else if (a.type === 'complete_step') {
      if (!task) { out.push({ bad: 'Couldn’t find the next step to finish.' }); continue; }
      out.push({ text: `Done: “${task.title}”`, k: 'tasks', fn: ts => { const t = ts.find(x => x.id === task.id); if (t) { t.done = true; t.doneAt = todayISO(); } } });
    } else if (a.type === 'add_money') {
      if (!(a.amount > 0)) { out.push({ bad: 'A money entry had no amount, so it was skipped.' }); continue; }
      const ty = a.money_type === 'income' ? 'income' : 'expense';
      out.push({ text: `${ty === 'income' ? 'Income' : 'Expense'} ${money(a.amount)} · ${a.title || 'untitled'}${date ? ' · ' + shortDay(date) : ''} (${a.settled ? (ty === 'income' ? 'received' : 'paid') : 'expected'})`, k: 'money', fn: M => M.entries.push({ id: uid(), type: ty, desc: a.title || '', cat: '', date: date || '', est: +a.amount, actual: a.settled ? +a.amount : '', settled: !!a.settled }) });
    }
  }
  return out;
}

/* ----- the panel ----- */
function openVoice(autoStart, noLive) {
  if (!sync.cfg && !localVoiceKey() && !localOpenAIKey()) return openModal(`<div class="mh"><h3>Ask Life Garden</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
    <div class="mb small"><p>Voice needs a key on this device first. Paste a ChatGPT (OpenAI) key, which starts with <code>sk-</code>, and tap Save:</p>
      <div class="row"><input id="oaKeyQuick" type="password" class="grow" placeholder="sk-…" autocomplete="off"><button class="btn primary" id="vSaveKey">Save</button></div>
      <p class="muted">No key yet? Create one at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a> and add a little credit under Billing. Prefer Gemini? Use Settings & backup → Voice assistant.</p></div>
    <div class="mf"><button class="btn" data-act="close">Close</button><button class="btn" id="vGo">Settings</button></div>`, m => {
      $('#vGo', m).onclick = () => { closeModal(); go('backup'); };
      $('#vSaveKey', m).onclick = () => { const v = $('#oaKeyQuick', m).value.trim(); if (!/^sk-/.test(v)) return toast('That doesn’t look like an OpenAI key — it starts with sk-'); try { localStorage.setItem(OPENAI_LOCAL, v); } catch (e) { } commit('settings', 'voice provider', st => { st.voiceProvider = 'openai'; }, { render: false }); closeModal(); toast('ChatGPT key saved on this device'); openVoice(true); };
    });
  if (!noLive && liveOn() && (localOpenAIKey() || sync.cfg)) return openLive();   // live conversation: tap once, then just talk
  openModal(`<div class="mh"><h3>Ask Life Garden</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
    <div class="mb stack">
      <div class="vmic-wrap"><button class="vmic" id="vMic" aria-label="Start talking"><span>🎙</span></button><div class="vlevel"><i id="vLevel"></i></div></div>
      <p class="small sans muted" id="vStatus" style="text-align:center;margin:.2rem 0" aria-live="polite">Tap and speak — e.g. “Move yoga to 4”, “Dentist Tuesday at 10”, “What's on Thursday?”</p>
      <form id="vForm" class="row" autocomplete="off"><input id="vText" class="grow" placeholder="…or type it"><button class="btn">Send</button></form>
      <div id="vOut"></div>
    </div>`, m => {
    $('#vMic', m).onclick = () => { stopSpeaking(); voice.rec ? finishRecording() : beginRecording(); };
    $('#vForm', m).onsubmit = e => { e.preventDefault(); const t = $('#vText', m).value.trim(); if (t) { unlockSpeech(); askAgent({ text: t }); } };
    if (autoStart && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) beginRecording();
    voiceKey().catch(() => { });
  });
  voice.history = []; voice.convo = true;
  dlg().addEventListener('close', () => { voice.convo = false; if (voice.rec) { voice.rec.cancel(); voice.rec = null; } if (voice.stream) { voice.stream.getTracks().forEach(t => t.stop()); voice.stream = null; } stopSpeaking(); try { voice.ctx && voice.ctx.close(); } catch (e) { } voice.ctx = null; }, { once: true });
}
const vStatus = t => { const el = $('#vStatus'); if (el) el.textContent = t; };
function resetMic() { if (voice.stream) voice.stream.getTracks().forEach(t => t.stop()); voice.stream = null; try { voice.ctx && voice.ctx.close(); } catch (e) { } voice.ctx = null; }
function micDead() {   // the microphone gave no sound: rebuild it once on its own, then ask for a tap
  const r = voice.rec; voice.rec = null; if (r) r.cancel(); resetMic();
  $('#vMic') && $('#vMic').classList.remove('on');
  if (!voice.deadRetry) { voice.deadRetry = true; beginRecording(true); }
  else vStatus('The microphone isn’t picking anything up — tap the mic to try again.');
}
async function beginRecording(fromRetry) {
  if (voice.busy) return;
  if (!fromRetry) { if (voice.deadRetry) resetMic(); voice.deadRetry = false; }   // a fresh tap starts clean after a failed try
  unlockSpeech();
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { vStatus('This device can’t record here — type instead (tap the keyboard’s microphone to dictate).'); $('#vText') && $('#vText').focus(); return; }
  try {
    voice.rec = await startRecording(rms => { const l = $('#vLevel'); if (l) l.style.width = Math.min(100, rms * 900) + '%'; }, () => finishRecording(), false, micDead);
    $('#vMic') && $('#vMic').classList.add('on'); $('#vMic') && $('#vMic').setAttribute('aria-label', 'Stop'); vStatus(handsFree() && voice.history && voice.history.length ? 'Listening… tap the mic when you’re done (or say “that’s all” to finish talking).' : 'Listening… tap the mic when you’re done.');
  } catch (e) {
    voice.rec = null;
    vStatus(e && e.name === 'NotAllowedError' ? 'Microphone access is off. Allow it in iPhone Settings, or type below — the keyboard microphone works too.' : 'Couldn’t start the microphone — type below instead.');
  }
}
async function finishRecording() {
  const r = voice.rec; if (!r) return; voice.rec = null;
  $('#vMic') && $('#vMic').classList.remove('on'); const l = $('#vLevel'); if (l) l.style.width = '0';
  const { wav, seconds, heard } = await r.stop();
  if (!heard || seconds < 0.6) { vStatus(voice.history && voice.history.length ? 'Paused — tap the mic to keep talking, or close when you’re done.' : 'I didn’t catch anything — tap the mic and try again.'); return; }
  askAgent({ audio: { mime: 'audio/wav', data: toBase64(wav) } });
}
const VOICE_SCHEMA = {
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
          title: { type: 'STRING', description: 'Only the short name, e.g. "Dentist". Never dates, times, notes or reasoning.' },
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
        propertyOrdering: ['type', 'id', 'date', 'start', 'end', 'kind', 'done', 'money_type', 'amount', 'settled', 'area', 'title'],
      },
    },
  },
  required: ['heard', 'reply', 'actions'],
};
const VOICE_RULES = [
  'You are the voice assistant inside Jordan\'s Life Garden, her personal day planner. You help her change her plan by voice.',
  'Use only the plan context provided. Dates are YYYY-MM-DD, times are 24-hour HH:MM in her local time zone (that is only the data format).',
  'In "reply" always say times the normal 12-hour way with AM or PM (for example 2:30 PM, 9 AM), never 24-hour or military time.',
  'Propose only the changes she actually asked for. Never invent ids: to change, move, finish or remove something, use the id of the matching item in the context. If several items could match or a needed detail is missing, ask one short question in reply and return no actions.',
  'New blocks: default length 60 minutes; appointments, classes, shifts and anything with another person at a set time are "fixed"; travel, meals, sleep and couple time are "protected"; everything else is "flexible". Use the title she would write herself, without dates or times in it.',
  'To move a block, use update_block with its id and the new date/start/end, keeping its length unless she says otherwise. "Mark X done" is update_block with done=true. To-dos without a time are add_step (date only if she gave a day).',
  'Money: add_money only when she states an amount. It is an estimate unless she says it was already paid or received.',
  'Questions about her plan ("what\'s on Thursday?") get a spoken answer and no actions.',
  'You can also see her whole dashboard in "dashboard": every tab (Today, Week & month, Capacity, Money, Projects, Move & downsizing, Opportunities, Well-being, Family prep, Settings), with money entries and savings funds, projects and their next steps, the move plan, opportunities, well-being, family prep, routines and day notes. Answer questions about any of it plainly. You can only change time blocks, next steps and money entries through actions; for anything else, tell her which tab to open to edit it.',
  'Never say you added, moved, finished or removed something unless that exact action is in "actions" — the app only changes what is in "actions".',
  'If she asks about your voice, speed or the app itself: your reading voice and speed can be changed in Settings & backup → Voice assistant → Voice and Speed (iPhone voices or ChatGPT voices like Nova, Coral or Shimmer). Say that briefly and return no actions.',
  'Reply in one or two short, plain sentences suitable to be read aloud. Do not repeat every detail of the change; the app shows it on screen. Never give medical, legal or financial advice.',
].join('\n');

/* ----- talking to Gemini: straight from this device, with the fastest model and setting that works ----- */
const AGENT_CFG_KEY = 'lifegarden.agentcfg', LOCAL_KEY = 'lifegarden.geminikey', COMBO_KEY = 'lifegarden.voicecombo';
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const localVoiceKey = () => { try { return localStorage.getItem(LOCAL_KEY) || ''; } catch (e) { return ''; } };
async function voiceKey() {
  const lk = localVoiceKey(); if (lk) return lk;
  if (!sync.cfg) return null;
  const c = lsGet(AGENT_CFG_KEY);
  if (c && c.url === sync.cfg.url) { if (c.key && Date.now() - c.at < 30 * 864e5) return c.key; if (c.none && Date.now() - c.at < 6 * 36e5) return null; }
  const r = await api('POST', { op: 'agentConfig' });
  const key = (r.agentConfig && r.agentConfig.key) || null;           // an older Sheet script doesn't share it → relay
  lsSet(AGENT_CFG_KEY, { url: sync.cfg.url, at: Date.now(), key, none: !key });
  return key;
}
const voiceModels = () => (S.settings.voiceCareful ? [] : ['gemini-flash-lite-latest']).concat(['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash']);
const thinkOptions = m => /gemini-2\./.test(m) ? [{ thinkingBudget: 0 }, null] : [{ thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, { thinkingBudget: 0 }, null];
function tidySchema(schema) {
  const s = JSON.parse(JSON.stringify(schema)), item = s.properties.actions.items;
  item.properties.title = { type: 'STRING', description: 'Only the short name of the block or step, exactly as she would write it (e.g. "Dentist"). Never put dates, times, notes or reasoning here.' };
  item.propertyOrdering = ['type', 'id', 'date', 'start', 'end', 'kind', 'done', 'money_type', 'amount', 'settled', 'area', 'title'];
  s.propertyOrdering = ['heard', 'actions', 'reply'];
  return s;
}
async function geminiDirect(key, input, context) {
  const parts = [];
  if (input.audio) parts.push({ inlineData: { mimeType: input.audio.mime, data: input.audio.data } });
  parts.push({ text: 'Plan context (JSON):\n' + JSON.stringify(context) + (input.text ? '\n\nJordan typed: ' + input.text : "\n\nJordan's request is in the audio.") });
  const rules = VOICE_RULES + '\nFill every field of an action separately: date as YYYY-MM-DD, start/end as HH:MM, and a short title. Do not think out loud in any field. Keep "reply" to one short sentence.';
  const mode = S.settings.voiceCareful ? 'careful' : 'fast', models = voiceModels(), saved = lsGet(COMBO_KEY);
  let mi = 0, ti = 0; if (saved && saved.mode === mode && models[saved.mi] === saved.model) { mi = saved.mi; ti = saved.ti; }
  for (let tries = 0; mi < models.length && tries < 12; tries++) {
    const m = models[mi], opts = thinkOptions(m), think = opts[Math.min(ti, opts.length - 1)];
    const body = { systemInstruction: { parts: [{ text: rules }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: tidySchema(VOICE_SCHEMA), temperature: 0.2 } };
    if (think) body.generationConfig.thinkingConfig = think;
    const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 20000);
    let r; try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: ctrl.signal }); } finally { clearTimeout(to); }
    const txt = await r.text();
    if (r.status === 401 || r.status === 403 || (r.status === 400 && /API key/i.test(txt))) throw new Error('apikey');
    if (r.status === 400 && ti < opts.length - 1) { ti++; continue; }       // this model doesn't take that speed setting → next one
    if (r.status === 404 || r.status === 400) { mi++; ti = 0; continue; }   // model not offered → next model
    if (r.status === 429 || r.status >= 500) { if (mi < models.length - 1) { mi++; ti = 0; continue; } throw new Error(r.status === 429 ? 'rate' : 'Gemini is having trouble — try again'); }
    if (!r.ok) throw new Error('Gemini ' + r.status);
    lsSet(COMBO_KEY, { mode, mi, ti, model: m });
    const agent = JSON.parse(JSON.parse(txt).candidates[0].content.parts.map(p => p.text || '').join('')); agent._model = m;
    return agent;
  }
  throw new Error('No Gemini model answered');
}

/* ----- ChatGPT (OpenAI): transcribe her voice, then a fast chat model decides the change ----- */
const OPENAI_LOCAL = 'lifegarden.openaikey', OPENAI_COMBO = 'lifegarden.openaicombo';
const provider = () => S.settings.voiceProvider === 'gemini' ? 'gemini' : (S.settings.voiceProvider === 'openai' || localOpenAIKey() ? 'openai' : 'gemini');
const localOpenAIKey = () => { try { return localStorage.getItem(OPENAI_LOCAL) || ''; } catch (e) { return ''; } };
async function openaiKey() {
  const lk = localOpenAIKey(); if (lk) return lk;
  if (!sync.cfg) return null;
  const c = lsGet(AGENT_CFG_KEY);
  if (c && c.url === sync.cfg.url && 'openai' in c && Date.now() - c.at < 30 * 864e5) return c.openai || null;
  try {
    const r = await api('POST', { op: 'agentConfig' });
    const cfg = r.agentConfig || {};
    lsSet(AGENT_CFG_KEY, { url: sync.cfg.url, at: Date.now(), key: cfg.key || null, none: !cfg.key, openai: cfg.openaiKey || null });
    return cfg.openaiKey || null;
  } catch (e) { return null; }
}
const OA_SCHEMA = (() => {
  const S2 = (t, d) => ({ type: [t, 'null'], ...(d ? { description: d } : {}) });
  const E = (vals) => ({ type: ['string', 'null'], enum: [...vals, null] });
  const props = {
    type: { type: 'string', enum: ['add_block', 'update_block', 'delete_block', 'add_step', 'complete_step', 'add_money'] },
    id: S2('string', 'Existing block or step id from the context, else null. Never invent one.'),
    date: S2('string', 'YYYY-MM-DD'), start: S2('string', '24-hour HH:MM'), end: S2('string', '24-hour HH:MM, same day, after start (24:00 = midnight)'),
    kind: E(['flexible', 'fixed', 'protected']), done: S2('boolean'), area: S2('string'),
    money_type: E(['income', 'expense']), amount: S2('number'), settled: S2('boolean', 'true only if she says it was already paid or received'),
    title: S2('string', 'Only the short name, e.g. "Dentist". Never dates, times, notes or reasoning.'),
  };
  return { type: 'object', additionalProperties: false, required: ['heard', 'actions', 'reply'], properties: {
    heard: { type: 'string', description: 'What Jordan said.' },
    actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props } },
    reply: { type: 'string', description: 'One short, warm sentence to read aloud. Name the weekday and date of anything added or moved.' },
  } };
})();
const oaModels = () => S.settings.voiceCareful ? ['gpt-4.1', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o'] : ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-mini', 'gpt-4.1-nano'];
async function oaFetch(key, path, init, ms) {
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), ms || 20000);
  try { const r = await fetch('https://api.openai.com/v1/' + path, { ...init, headers: { Authorization: 'Bearer ' + key, ...(init.headers || {}) }, signal: ctrl.signal }); return { r, txt: await r.text() }; }
  finally { clearTimeout(to); }
}
const oaFail = (r, txt) => { if (r.status === 401) throw new Error('apikey_openai'); if (r.status === 429) throw new Error(/quota|billing/i.test(txt) ? 'quota_openai' : 'rate'); };
async function openaiTranscribe(key, b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const pref = lsGet('lifegarden.oastt'), list = ['gpt-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'];
  for (const model of pref && list.includes(pref) ? [pref, ...list.filter(m => m !== pref)] : list) {
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: 'audio/wav' }), 'speech.wav'); fd.append('model', model);
    if (model !== 'whisper-1') fd.append('prompt', `A short request to a day planner. Names: ${people().join(', ')}, Tucker, Lesley, Glimmer. Today is ${DOW[dow(todayISO())]}.`);
    const { r, txt } = await oaFetch(key, 'audio/transcriptions', { method: 'POST', body: fd }, 20000);
    oaFail(r, txt);
    if (r.status === 404 || r.status === 400) continue;
    if (!r.ok) throw new Error('ChatGPT couldn’t hear that (' + r.status + ')');
    lsSet('lifegarden.oastt', model);
    return (JSON.parse(txt).text || '').trim();
  }
  throw new Error('No ChatGPT transcription model answered');
}
async function openaiDirect(key, input, context) {
  let said = input.text || '';
  if (input.audio) { vStatus('Listening back…'); said = await openaiTranscribe(key, input.audio.data); if (!said) throw new Error('I didn’t catch anything — try again.'); vStatus('Thinking…'); }
  const rules = VOICE_RULES + '\nReturn every field of every action; use null for fields that do not apply. Date as YYYY-MM-DD, times as HH:MM. Do not think out loud in any field.';
  const user = 'Plan context (JSON):\n' + JSON.stringify(context) + '\n\nJordan said: ' + said;
  const models = oaModels(), mode = S.settings.voiceCareful ? 'careful' : 'fast', saved = lsGet(OPENAI_COMBO);
  let mi = saved && saved.mode === mode && models[saved.mi] === saved.model ? saved.mi : 0, plain = false;
  for (let tries = 0; mi < models.length && tries < 10; tries++) {
    const m = models[mi], reasoning = /^gpt-5|^o\d/.test(m);
    const body = { model: m, messages: [{ role: 'system', content: rules }, { role: 'user', content: user }], response_format: { type: 'json_schema', json_schema: { name: 'planner_change', strict: true, schema: OA_SCHEMA } } };
    if (reasoning && !plain) body.reasoning_effort = 'minimal'; else if (!reasoning) body.temperature = 0.2;
    const { r, txt } = await oaFetch(key, 'chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    oaFail(r, txt);
    if (r.status === 400 && reasoning && !plain && /reasoning/i.test(txt)) { plain = true; continue; }
    if (r.status === 404 || r.status === 400 || r.status === 403) { mi++; plain = false; continue; }
    if (r.status >= 500) { if (mi < models.length - 1) { mi++; continue; } throw new Error('ChatGPT is having trouble — try again'); }
    if (!r.ok) throw new Error('ChatGPT ' + r.status);
    lsSet(OPENAI_COMBO, { mode, mi, model: m });
    const msg = JSON.parse(txt).choices[0].message;
    if (msg.refusal) return { heard: said, reply: msg.refusal, actions: [] };
    const agent = JSON.parse(msg.content);
    agent.actions = (agent.actions || []).map(a => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null)));
    agent.heard = agent.heard || said; agent._model = m;
    return agent;
  }
  throw new Error('No ChatGPT model answered');
}

async function askAgent(input) {
  if (voice.busy) return; voice.busy = true;
  const t0 = Date.now(); vStatus('Thinking…'); $('#vOut') && ($('#vOut').innerHTML = '');
  const tick = setInterval(() => { const el = $('#vStatus'); if (el && /^(Thinking|Listening back)/.test(el.textContent)) vStatus(`${el.textContent.split('…')[0]}… ${Math.round((Date.now() - t0) / 1000)}s`); }, 1000);
  const context = agentContext();
  if (voice.history && voice.history.length) context.earlier_in_this_conversation = voice.history.slice(-3);
  try {
    let agent = null, key = null;
    if (provider() === 'openai') {
      const ok = await openaiKey(); if (!ok) throw new Error('nokey_openai');
      agent = await openaiDirect(ok, input, context);
    }
    if (!agent) try { key = await voiceKey(); } catch (e) { if (e.message === 'nokey') throw e; }
    if (!agent && key) { try { agent = await geminiDirect(key, input, context); } catch (e) { if (['rate', 'apikey'].includes(e.message) || !sync.cfg) throw e; console.warn('direct Gemini failed, using the Sheet relay', e); } }
    if (!agent) { if (!sync.cfg) throw new Error('nokey'); agent = (await api('POST', { op: 'agent', ...input, context })).agent || {}; agent._relay = true; }
    agent._secs = (Date.now() - t0) / 1000;
    clearInterval(tick); showAgent(agent);
  } catch (e) {
    clearInterval(tick);
    if (e.message === 'apikey') { try { localStorage.removeItem(AGENT_CFG_KEY); } catch (x) { } }
    const msg = { nokey_openai: 'ChatGPT needs an OpenAI key — see Settings & backup → Voice assistant.', apikey_openai: 'OpenAI didn’t accept the key. Check it in Settings & backup → Voice assistant.', quota_openai: 'The OpenAI account has no credit left — add some at platform.openai.com → Billing.', nokey: 'The assistant needs a Gemini key — see Settings & backup → Voice assistant.', rate: 'Gemini is busy right now. Try again in a minute.', apikey: 'Gemini didn’t accept the key. Check it in Settings & backup → Voice assistant.' }[e.message] || (e.name === 'AbortError' ? 'That took too long — try again.' : (e.message || 'Something went wrong.'));
    vStatus(msg);
  } finally { voice.busy = false; clearInterval(tick); }
}

const handsFree = () => S.settings.voiceHandsFree2 === true;   // off unless turned on: after a reply she taps the mic to say more
const STOP_WORDS = /^(?:ok(?:ay)?[,. ]*)?(?:that'?s (?:all|it)|thanks?(?: you)?|thank you|no(?:pe)?,? (?:that'?s|thanks)|stop|done|bye|goodbye|never ?mind|i'?m (?:done|good))\b/i;
async function afterReply(a, canContinue) {
  voice.history = (voice.history || []).concat([{ she_said: a.heard || '', you_replied: a.reply || '' }]).slice(-3);
  const ending = STOP_WORDS.test((a.heard || '').trim());
  await speak(ending ? (a.reply && a.reply.length < 60 ? a.reply : 'Okay — talk soon.') : a.reply);
  if (ending) { if (voice.convo) closeModal(); return; }
  if (!handsFree() && canContinue && voice.convo && dlg().open && !voice.rec && !voice.busy) vStatus('Tap the mic to say more, or close when you’re done.');
  if (handsFree() && canContinue && voice.convo && dlg().open && !voice.rec && !voice.busy) {
    await new Promise(r => setTimeout(r, 250));
    if (voice.convo && dlg().open && !voice.rec) beginRecording();
  }
}
function applyVoice(pick, a) {
  const groups = {}; for (const p of pick) (groups[p.k] = groups[p.k] || []).push(p.fn);
  for (const [k, fns] of Object.entries(groups)) commit(k, 'voice change', root => fns.forEach(f => f(root)), { render: false });
  if (handsFree() && voice.convo) { const out = $('#vOut'); if (out) out.innerHTML = `${a.heard ? `<p class="small sans muted" style="margin:0 0 .3rem">You said: “${esc(a.heard)}”</p>` : ''}<p style="margin:.2rem 0">${esc(a.reply || '')}</p><p class="small sans" style="color:var(--good)">✓ ${pick.map(p => esc(p.text)).join('<br>✓ ')}</p>`; }
  else closeModal();
  render();
  const firstDate = (a.actions || []).map(x => x.date && parseDateLoose(x.date)).find(Boolean);
  toast(pick.length === 1 ? pick[0].text : `Done — ${pick.length} changes`, 'Undo', () => { for (let i = 0; i < Object.keys(groups).length; i++) undo(); }, 9000);
  if (firstDate && (firstDate !== R.date || R.view !== 'today')) go('today', firstDate);
  const newest = S.blocks.filter(b => b.date === (firstDate || R.date) && b.notes === 'Added by voice').slice(-1)[0];
  setTimeout(() => { const el = newest && $(`.blk[data-blk="${newest.id}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('preview'); setTimeout(() => el.classList.remove('preview'), 2500); } }, 150);
}
function showAgent(a) {
  a.reply = to12(a.reply);   // normal 12-hour times on screen and out loud
  const plan = planActions(a.actions), ok = plan.filter(p => !p.bad), bad = plan.filter(p => p.bad);
  if (!ok.length && /\b(add(ed)?|mov(e|ed)|scheduled|put|mark(ed)?|remov(e|ed)|delet(e|ed)|logg?ed|set)\b/i.test(a.reply || '') && !/\?\s*$/.test(a.reply || '')) {
    a.reply = 'Sorry — I understood you, but no change came through, so nothing was saved. Please try again and say the day and time.';
  }
  vStatus(a._secs ? `${a._model && /^gpt|^o\d/.test(a._model) ? 'ChatGPT' : 'Gemini'} answered in ${a._secs.toFixed(1)}s${a._relay ? ' (through the Sheet — update the Sheet script or add a key on this device to speed up)' : ''}` : '');
  const out = $('#vOut'); if (!out) return;
  if (S.settings.voiceAuto !== false && ok.length && !bad.length && !ok.some(p => p.danger)) { applyVoice(ok, a); return afterReply(a, true); }   // nothing risky → save at once, Undo stays available
  out.innerHTML = `${a.heard ? `<p class="small sans muted" style="margin:0 0 .3rem">You said: “${esc(a.heard)}”</p>` : ''}
    ${a.reply ? `<p style="margin:.2rem 0 .6rem;font-size:1.05rem">${esc(a.reply)}</p>` : ''}
    ${ok.length ? `<div class="card flat" style="padding:.5rem .7rem">${ok.map((p, i) => `<label class="row small" style="flex-wrap:nowrap;padding:.35rem 0;align-items:flex-start;gap:.5rem;${p.danger ? 'color:var(--bad)' : ''}"><input type="checkbox" data-vi="${i}" checked style="margin-top:.2rem"> <span>${esc(p.text)}</span></label>`).join('')}</div>
      <div class="row" style="justify-content:flex-end;margin-top:.6rem"><button class="btn" id="vAgain">Not quite — try again</button><button class="btn primary" id="vApply">Apply ${ok.length > 1 ? ok.length + ' changes' : 'change'}</button></div>` : ''}
    ${bad.length ? `<p class="tiny sans" style="color:var(--warn)">${bad.map(b => esc(b.bad)).join('<br>')}</p>` : ''}`;
  afterReply(a, !ok.length);   // a question or answer → keep listening; changes waiting for a tap → wait for her
  if ($('#vAgain')) $('#vAgain').onclick = () => { stopSpeaking(); out.innerHTML = ''; beginRecording(); };
  if ($('#vApply')) $('#vApply').onclick = () => { const pick = $$('[data-vi]', out).filter(c => c.checked).map(c => ok[+c.dataset.vi]); if (pick.length) { stopSpeaking(); applyVoice(pick, a); if (handsFree() && voice.convo) afterReply({ heard: '', reply: 'Done.' }, true); } };
}

/* ----- settings card ----- */
function voiceCard() {
  return `<div class="card stack" style="grid-column:1/-1"><div class="row between"><h3>Voice assistant</h3><button class="btn sm primary" data-act="voiceTry">🎙 Try it</button></div>
    <p class="small" style="margin:0">Tap 🎙 on any screen and say what you want — “Move yoga to 4 tomorrow”, “Dentist Tuesday at 10”, “I paid the phone bill, 45 dollars”, “What's on Thursday?”. Changes save right away with an Undo button; removals always ask first. It uses ${provider() === 'openai' ? 'ChatGPT (OpenAI)' : 'Gemini'} with your own key.</p>
    <div class="row"><label class="f">Assistant<select data-b="settings.voiceProvider" data-rerender="1"><option value="openai" ${provider() === 'openai' ? 'selected' : ''}>ChatGPT (OpenAI)</option><option value="gemini" ${provider() === 'gemini' ? 'selected' : ''}>Gemini (Google)</option></select></label></div>
    ${provider() === 'openai' ? `<div class="card flat stack small" style="padding:.7rem .9rem"><b>ChatGPT key on this device ${localOpenAIKey() ? '✓' : ''}</b>
      <p style="margin:0">1. Sign in at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a> → <b>Create new secret key</b> → copy it (starts with <code>sk-</code>). 2. Add a little credit under <b>Billing</b> — the API is pay-as-you-go and separate from a ChatGPT Plus subscription. 3. Paste the key here on each device:</p>
      <div class="row"><input id="oaKey" type="password" class="grow" placeholder="sk-…" value="${esc(localOpenAIKey())}" autocomplete="off"><button class="btn sm primary" data-act="saveOpenAIKey">Save</button></div>
      <p class="tiny muted sans" style="margin:0">Stored only on this device. Each request costs a fraction of a cent. OpenAI doesn't train on API requests by default.</p></div>` : ''}
    ${provider() === 'openai' ? '' : `<details class="disc"><summary>Turn it on (2 minutes, on a computer)</summary><div class="in small stack">
      <p><b>1.</b> Signed in as the Sheet's owner, open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and create an API key. Copy it.</p>
      <p><b>2.</b> Reload the Google Sheet. In its menu bar, open <b>Life Garden → Set voice assistant key…</b>, paste the key, OK. It tests the key and tells you if it works.</p>
      <p class="tiny muted sans">Set up the Sheet before today? Paste the latest script first (<button class="btn sm" data-act="copyScript">Copy the script</button> — it keeps your passcode), then <b>Deploy → Manage deployments → Edit → Version: New version</b>.</p>
      <p class="tiny muted sans">Privacy: on Gemini's free tier Google may use requests to improve its products; turning on billing in AI Studio stops that. Each request sends the recording plus about ten days of the plan, and typically costs well under a cent on the paid tier.</p>
    </div></details>`}
    <label class="row small sans"><input type="checkbox" data-b="settings.voiceAuto" ${S.settings.voiceAuto !== false ? 'checked' : ''}> Save voice changes right away (untick to review each one first)</label>
    <label class="row small sans"><input type="checkbox" data-b="settings.voiceCareful" ${S.settings.voiceCareful ? 'checked' : ''}> Use the more careful, slower model</label>
    <label class="row small sans"><input type="checkbox" data-b="settings.briefingOn" ${S.settings.briefingOn !== false ? 'checked' : ''}> Show a daily briefing the first time the app opens each day</label>
    <label class="row small sans"><input type="checkbox" data-b="settings.voiceLive" ${S.settings.voiceLive !== false ? 'checked' : ''}> Live conversation (ChatGPT key): tap 🎙 once, then just talk — interrupt any time</label>
    <label class="row small sans"><input type="checkbox" data-b="settings.voiceHandsFree2" ${S.settings.voiceHandsFree2 === true ? 'checked' : ''}> Hands-free: keep listening after each reply (say “that's all” to end). Off = tap the mic each time.</label>
    <label class="row small sans"><input type="checkbox" data-b="settings.speakReplies" ${S.settings.speakReplies !== false ? 'checked' : ''}> Read replies aloud</label>
    <div class="row" style="align-items:flex-end">
      <label class="f grow">Voice<select data-b="settings.speakVoice">
        <option value="">This device's default voice</option>
        ${sysVoices().length ? `<optgroup label="${/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : 'This device'} voices (free, instant)">${sysVoices().map(v => `<option value="sys:${esc(v.voiceURI)}" ${S.settings.speakVoice === 'sys:' + v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</optgroup>` : ''}
        <optgroup label="ChatGPT voices (natural; needs the OpenAI key)">${OA_VOICES.map(v => `<option value="oa:${v}" ${S.settings.speakVoice === 'oa:' + v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</optgroup>
      </select></label>
      <label class="f" style="width:7rem">Speed<select data-b="settings.speakRate" data-t="num">${[[0.85, 'Slower'], [1, 'Normal'], [1.15, 'Faster'], [1.3, 'Fast']].map(([v, l]) => `<option value="${v}" ${(+S.settings.speakRate || 1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn sm" data-act="previewVoice">▶ Preview</button>
    </div>
    <p class="tiny muted sans" style="margin:0">iPhone voices: download nicer ones (marked Enhanced or Premium) in iPhone Settings → Accessibility → Spoken Content → Voices, then reopen the app. ChatGPT voices take about a second longer to start and cost a fraction of a cent per reply.</p>
    ${provider() === 'openai' ? '' : `<details class="disc"><summary>Gemini key on this device ${localVoiceKey() ? '✓' : ''}</summary><div class="in small stack"><p style="margin:0">For the fastest answers this device talks to Gemini directly. It normally fetches the key from the Sheet script; if the script hasn't been updated, paste the Gemini key here instead. It is stored only on this device.</p>
      <div class="row"><input id="vKey" type="password" class="grow" placeholder="AIza…" value="${esc(localVoiceKey())}" autocomplete="off"><button class="btn sm" data-act="saveVoiceKey">Save</button></div></div></details>`}</div>`;
}
ACT.voiceTry = () => openVoice(false);
ACT.saveVoiceKey = () => { const v = $('#vKey').value.trim(); try { if (v) localStorage.setItem(LOCAL_KEY, v); else localStorage.removeItem(LOCAL_KEY); localStorage.removeItem(COMBO_KEY); } catch (e) { } render(); toast(v ? 'Key saved on this device' : 'Key removed from this device'); };
setTimeout(() => { if (sync.cfg || localVoiceKey()) voiceKey().catch(() => { }); }, 2500);   // warm up so the first question doesn't wait
ACT.saveOpenAIKey = () => { const v = $('#oaKey').value.trim(); try { if (v) localStorage.setItem(OPENAI_LOCAL, v); else localStorage.removeItem(OPENAI_LOCAL); localStorage.removeItem(OPENAI_COMBO); } catch (e) { } if (v && S.settings.voiceProvider !== 'openai') commit('settings', 'voice provider', st => { st.voiceProvider = 'openai'; }); render(); toast(v ? 'ChatGPT key saved on this device' : 'ChatGPT key removed from this device'); };
ACT.previewVoice = () => { unlockSpeech(); speak('Hi Jordan. I added tea with Sarah on Friday, November 20th, at 3 PM.', true); };
