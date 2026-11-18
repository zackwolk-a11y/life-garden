/* ================= Live conversation (ChatGPT Realtime voice over WebRTC) =================
   Tap 🎙 once and just talk: it hears when she starts and stops, answers out loud, and she can
   interrupt it mid-sentence. Plan changes go through the same checked actions as the tap-to-talk
   assistant (planActions), with Undo. Uses the OpenAI key already set up for voice. */
const LIVE_MODELS = ['gpt-realtime-2.1-mini', 'gpt-realtime-mini', 'gpt-realtime-2.1', 'gpt-realtime'];
const LIVE_VOICES = ['marin', 'cedar', 'coral', 'shimmer', 'sage', 'alloy', 'ash', 'ballad', 'echo', 'verse'];
const LIVE_IDLE_MS = 3 * 60e3, LIVE_MAX_MS = 15 * 60e3;   // ends by itself after 3 quiet minutes or 15 minutes in all (keeps the bill small)
const liveOn = () => provider() === 'openai' && S.settings.voiceLive !== false && 'RTCPeerConnection' in window;
const live = { pc: null, dc: null, stream: null, audio: null, done: new Set(), lastTalk: 0, t0: 0, dog: null, muted: false };

function liveSchema(s) {   // Gemini-style schema (VOICE_SCHEMA) → JSON schema for the tool
  if (!s || typeof s !== 'object') return s; const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'propertyOrdering') continue;
    if (k === 'type') o.type = String(v).toLowerCase();
    else if (k === 'properties') { o.properties = {}; for (const [pk, pv] of Object.entries(v)) o.properties[pk] = liveSchema(pv); }
    else if (k === 'items') o.items = liveSchema(v); else o[k] = v;
  }
  return o;
}
const liveTools = () => [{ type: 'function', name: 'change_plan', description: 'Change her plan: add, move, rename, finish or remove time blocks; add or finish next steps; add money entries. Call it as soon as she clearly asks for a change, using ids from the plan context. Wait for the result before saying it is done.',
  parameters: { type: 'object', properties: { actions: { type: 'array', items: liveSchema(VOICE_SCHEMA.properties.actions.items) } }, required: ['actions'] } }];
function liveInstructions() {
  return [VOICE_RULES,
    'THIS IS A LIVE SPOKEN CONVERSATION. Talk naturally, warmly and briefly, like a friend helping plan the day. She may interrupt you; just stop and listen.',
    'Where these rules mention "reply" they mean what you say out loud, and "actions" means calling the change_plan tool. Only say a change is done after the tool result lists it under "applied".',
    'Before removing or deleting anything, ask her to confirm. If she says goodbye, that is all, or thanks, say a short goodbye.',
    'PLAN CONTEXT (JSON, refreshed after each change):', JSON.stringify(agentContext())].join('\n');
}
const liveVoice = () => { const c = String(S.settings.speakVoice || ''); const v = c.startsWith('oa:') ? c.slice(3) : ''; return LIVE_VOICES.includes(v) ? v : 'marin'; };
async function liveToken(key) {
  let last = '';
  for (const model of LIVE_MODELS) for (const full of [true, false]) {
    const session = { type: 'realtime', model, instructions: liveInstructions(), tools: liveTools(), tool_choice: 'auto', audio: { output: { voice: liveVoice() } } };
    if (full) session.audio.input = { turn_detection: { type: 'semantic_vad', eagerness: 'medium' }, transcription: { model: 'gpt-4o-mini-transcribe' } };
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 600 }, session }) });
    if (r.ok) { const j = await r.json(); const v = j.value || (j.client_secret && j.client_secret.value); if (v) return v; }
    last = r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200);
    if (r.status === 401) throw new Error('apikey_openai'); if (r.status === 429 && /quota|billing|credit/i.test(last)) throw new Error('quota_openai');
  }
  throw new Error('live_unavailable ' + last);
}
const lvStatus = t => { const el = $('#lvStatus'); if (el) el.textContent = t; };
function lvLine(who, text) {
  const log = $('#lvLog'); if (!log || !text) return;
  log.insertAdjacentHTML('beforeend', `<p class="${who === 'you' ? 'small sans muted' : ''}" style="margin:.25rem 0">${who === 'you' ? 'You: ' : ''}${esc(text)}</p>`);
  log.scrollTop = log.scrollHeight;
}
const lvSend = o => { try { live.dc && live.dc.readyState === 'open' && live.dc.send(JSON.stringify(o)); } catch (e) { } };
function openLive() {
  openModal(`<div class="mh"><h3>Ask Life Garden</h3><button class="iconbtn" data-act="close" aria-label="End conversation">✕</button></div>
    <div class="mb stack">
      <div class="vmic-wrap"><button class="vmic on" id="lvMic" aria-label="Pause listening"><span>🎙</span></button></div>
      <p class="small sans muted" id="lvStatus" style="text-align:center;margin:.2rem 0" aria-live="polite">Connecting…</p>
      <div id="lvLog" style="max-height:38vh;overflow:auto"></div>
      <form id="lvForm" class="row" autocomplete="off"><input id="lvText" class="grow" placeholder="…or type it"><button class="btn">Send</button></form>
      <p class="tiny sans muted" style="text-align:center;margin:0">Just talk — interrupt any time. Tap ✕ when you’re done.</p>
    </div>`, m => {
    $('#lvMic', m).onclick = () => { live.muted = !live.muted; if (live.stream) live.stream.getAudioTracks().forEach(t => t.enabled = !live.muted); $('#lvMic').classList.toggle('on', !live.muted); lvStatus(live.muted ? 'Paused — tap the mic to keep talking.' : 'I’m listening — just talk.'); };
    $('#lvForm', m).onsubmit = e => { e.preventDefault(); const t = $('#lvText', m).value.trim(); if (!t) return; $('#lvText', m).value = ''; lvLine('you', t);
      lvSend({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: t }] } }); lvSend({ type: 'response.create' }); };
  });
  // the audio element must start from this tap so iPhone lets it play
  live.audio = new Audio(); live.audio.autoplay = true; live.audio.playsInline = true; try { live.audio.play().catch(() => { }); } catch (e) { }
  dlg().addEventListener('close', liveStop, { once: true });
  liveStart().catch(e => {
    const msg = String(e && e.message || e);
    const why = /apikey_openai/.test(msg) ? 'OpenAI didn’t accept the key — check it in Settings & backup → Voice assistant.' : /quota_openai/.test(msg) ? 'The OpenAI account is out of credit — add some at platform.openai.com.' : /NotAllowed/.test(e && e.name || msg) ? 'Microphone access is off — allow it in iPhone Settings → Apps → Safari → Microphone.' : 'Live conversation couldn’t start here, so I switched to tap-to-talk.';
    liveStop(); if (dlg().open) closeModal();
    if (/tap-to-talk/.test(why)) { openVoice(true, true); vStatus(why); } else toast(why);
  });
}
async function liveStart() {
  live.done = new Set(); live.t0 = live.lastTalk = Date.now(); live.muted = false;
  const key = localOpenAIKey() || await openaiKey(); if (!key) throw new Error('nokey_openai');
  live.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const token = await liveToken(key);
  const pc = live.pc = new RTCPeerConnection();
  pc.ontrack = e => { live.audio.srcObject = e.streams[0]; live.audio.play().catch(() => { }); };
  pc.addTrack(live.stream.getAudioTracks()[0], live.stream);
  const dc = live.dc = pc.createDataChannel('oai-events');
  dc.onmessage = e => { try { liveEvent(JSON.parse(e.data)); } catch (err) { } };
  dc.onopen = () => lvStatus('I’m listening — just talk.');
  pc.onconnectionstatechange = () => { if (['failed', 'disconnected'].includes(pc.connectionState) && dlg().open && live.pc === pc) lvStatus('The connection dropped — close and tap 🎙 to start again.'); };
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  const r = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/sdp' } });
  if (!r.ok) throw new Error('live_unavailable ' + r.status);
  await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
  live.dog = setInterval(() => { const now = Date.now(); if (!dlg().open) return liveStop(); if (now - live.lastTalk > LIVE_IDLE_MS || now - live.t0 > LIVE_MAX_MS) { toast('Conversation ended to save credit — tap 🎙 any time.'); closeModal(); } }, 5000);
}
function liveStop() {
  clearInterval(live.dog); live.dog = null;
  try { live.dc && live.dc.close(); } catch (e) { } try { live.pc && live.pc.close(); } catch (e) { }
  if (live.stream) live.stream.getTracks().forEach(t => t.stop());
  try { if (live.audio) { live.audio.pause(); live.audio.srcObject = null; } } catch (e) { }
  live.pc = live.dc = live.stream = live.audio = null;
}
function liveEvent(ev) {
  switch (ev.type) {
    case 'input_audio_buffer.speech_started': live.lastTalk = Date.now(); lvStatus('Listening…'); break;
    case 'input_audio_buffer.speech_stopped': live.lastTalk = Date.now(); lvStatus('Thinking…'); break;
    case 'conversation.item.input_audio_transcription.completed': lvLine('you', (ev.transcript || '').trim()); break;
    case 'response.output_audio_transcript.done': case 'response.audio_transcript.done': lvLine('assistant', to12(ev.transcript || '')); lvStatus('I’m listening — just talk.'); break;
    case 'response.function_call_arguments.done': liveTool(ev.call_id, ev.name, ev.arguments); break;
    case 'response.done': for (const it of (ev.response && ev.response.output) || []) if (it.type === 'function_call') liveTool(it.call_id, it.name, it.arguments); break;
    case 'error': if (ev.error && !/cancel|no active response/i.test(ev.error.message || '')) lvStatus('Hmm — ' + (ev.error.message || 'something went wrong') + '. Keep talking or close and try again.'); break;
  }
}
function liveTool(callId, name, args) {
  if (!callId || live.done.has(callId)) return; live.done.add(callId);
  let out = { applied: [], problems: [] };
  try {
    const a = typeof args === 'string' ? JSON.parse(args || '{}') : (args || {});
    const plan = name === 'change_plan' ? planActions(a.actions || []) : [], ok = plan.filter(p => !p.bad), bad = plan.filter(p => p.bad);
    out.problems = bad.map(b => b.bad);
    if (ok.length) {
      const groups = {}; for (const p of ok) (groups[p.k] = groups[p.k] || []).push(p.fn);
      for (const [k, fns] of Object.entries(groups)) commit(k, 'voice change', root => fns.forEach(f => f(root)), { render: false });
      render(); out.applied = ok.map(p => p.text);
      toast(ok.length === 1 ? ok[0].text : `Done — ${ok.length} changes`, 'Undo', () => { for (let i = 0; i < Object.keys(groups).length; i++) undo(); }, 9000);
      ok.forEach(p => lvLine('change', '✓ ' + p.text));
      lvSend({ type: 'session.update', session: { type: 'realtime', instructions: liveInstructions() } });   // she sees the new plan right away
    }
    if (!ok.length && !bad.length) out.problems.push('Nothing to change — no valid actions were given.');
  } catch (e) { out.problems.push('Could not read the change: ' + (e.message || e)); }
  lvSend({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(out) } });
  lvSend({ type: 'response.create' });
}
