/* ================= Daily briefing ================= */
const BRIEF_KEY = 'lifegarden.brief';
const greetWord = () => { const h = Math.floor(nowMin() / 60); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const firstName = () => (people()[0] || 'Jordan').split(' ')[0];
const STATUS_WORD = { confirmed: 'confirmed', proposed: 'suggested in the draft', needs: 'needs confirming', source: 'from the source plan', sourceproposed: 'from the source plan, with suggested changes' };

/* ----- what the briefing is based on ----- */
function briefData(d) {
  const bl = dayBlocks(d).filter(b => !b.sleep && catOf(b) !== 'sleep');
  const t = tasksFor(d).filter(x => !x.done);
  return {
    date: d, weekday: DOW[dow(d)], now: d === todayISO() ? fmtTime(nowMin()) : null,
    day_note: S.daynotes[d] || null,
    blocks: bl.map(b => ({ time: `${fmtTime(b.start)}–${fmtTime(b.end)}`, title: b.title, kind: b.kind, ...(b.status ? { status: STATUS_WORD[b.status] } : {}), ...(b.done ? { done: true } : {}) })),
    overlaps: conflictsOn(d).pairs.map(([a, b]) => `${a.title} and ${b.title}`),
    focus_steps: t.filter(x => x.focus && x.focus[d]).map(x => x.title),
    next_steps: t.slice(0, 8).map(x => x.title + (x.status && x.status !== 'Confirmed' ? ` (${x.status})` : '')),
    daily_care: S.routines.filter(r => r.days.includes(dow(d))).map(r => r.title + (r.done && r.done[d] ? ' (done)' : '')),
  };
}
function weekData(d) {
  const ws = weekStart(d), days = [...Array(7)].map((_, i) => addDays(ws, i)), we = days[6];
  const tw = S.together[ws];
  return {
    week_of: ws, today: todayISO(),
    days: days.map(x => ({ date: x, weekday: DOW[dow(x)], note: (S.daynotes[x] || {}).note || null,
      commitments: dayBlocks(x).filter(b => !b.sleep && (b.kind !== 'flexible' || b.status === 'confirmed' || !b.status)).map(b => `${fmtTimeShort(b.start)} ${b.title}${b.status ? ' [' + STATUS_WORD[b.status] + ']' : ''}`).slice(0, 10),
      overlaps: conflictsOn(x).pairs.length })),
    shared_priorities: tw && tw.pri ? tw.pri.filter(p => p.text).map(p => p.text + (p.done ? ' (done)' : '')) : [],
    deadlines: [...S.projects.filter(p => p.deadline && p.deadline >= ws && p.deadline <= addDays(we, 14)).map(p => `${p.name} — ${fmtShort(p.deadline)}`),
      ...S.opps.filter(o => o.deadline && o.deadline >= ws && o.deadline <= addDays(we, 14) && o.status !== 'Not for me').map(o => `${o.title || 'Opportunity'} — ${fmtShort(o.deadline)}`)],
    money_due: S.money.entries.filter(e => e.date >= ws && e.date <= we && !e.settled).map(e => `${e.type === 'income' ? 'Expected in' : 'Due'}: ${e.desc} ${money(entryAmt(e) == null ? null : Math.abs(entryAmt(e)))} (${fmtShort(e.date)})`),
    open_questions: S.tasks.filter(x => !x.done && x.status === 'Needs verification').slice(0, 6).map(x => x.title),
  };
}

/* ----- a plain version that needs no AI ----- */
function localDay(d) {
  const bd = briefData(d), bl = dayBlocks(d).filter(b => !b.sleep && catOf(b) !== 'sleep');
  const key = bl.filter(b => b.kind !== 'flexible' || b.status === 'confirmed');
  return {
    greeting: `${greetWord()}, ${firstName()}.`,
    summary: bl.length ? `${DOW[dow(d)]} has ${bl.length} block${bl.length > 1 ? 's' : ''}, from ${fmtTime(bl[0].start)} to ${fmtTime(bl[bl.length - 1].end)}.` : 'Nothing is scheduled today — a good day to choose one thing that matters.',
    schedule: (key.length ? key : bl).slice(0, 8).map(b => ({ time: fmtTimeShort(b.start), what: b.title + (b.status && b.status !== 'confirmed' ? ` (${STATUS_WORD[b.status]})` : '') })),
    heads_up: [...bd.overlaps.map(o => `Overlap: ${o}`), ...bl.filter(b => b.status === 'needs').map(b => `Needs confirming: ${b.title}`)].slice(0, 5),
    focus: bd.focus_steps[0] || bd.next_steps[0] || '',
    encouragement: '',
  };
}
function localWeek(d) {
  const w = weekData(d);
  return {
    summary: `Week of ${fmtShort(w.week_of)}.`,
    days: w.days.filter(x => x.commitments.length).map(x => ({ day: `${x.weekday} ${+x.date.slice(8)}`, highlights: x.commitments.slice(0, 4) })),
    heads_up: [...w.deadlines.map(x => 'Deadline: ' + x), ...w.days.filter(x => x.overlaps).map(x => `${x.weekday}: ${x.overlaps} overlap${x.overlaps > 1 ? 's' : ''} to decide`)].slice(0, 6),
  };
}

/* ----- AI version (ChatGPT or Gemini, whichever the voice assistant uses) ----- */
const DAY_SCHEMA = { type: 'object', additionalProperties: false, required: ['greeting', 'summary', 'schedule', 'heads_up', 'focus', 'encouragement'], properties: {
  greeting: { type: 'string', description: 'Warm one-line greeting using her name and the time of day.' },
  summary: { type: 'string', description: 'Two short sentences: the shape of the day.' },
  schedule: { type: 'array', description: 'Up to 8 key moments in order. Skip routine filler.', items: { type: 'object', additionalProperties: false, required: ['time', 'what'], properties: { time: { type: 'string' }, what: { type: 'string' } } } },
  heads_up: { type: 'array', description: 'Up to 4 things to watch: overlaps, items needing confirmation, deadlines.', items: { type: 'string' } },
  focus: { type: 'string', description: 'One concrete suggestion for what to prioritise today.' },
  encouragement: { type: 'string', description: 'One gentle, genuine sentence. No clichés.' } } };
const WEEK_SCHEMA = { type: 'object', additionalProperties: false, required: ['summary', 'days', 'heads_up'], properties: {
  summary: { type: 'string', description: 'Two sentences on the shape of the week.' },
  days: { type: 'array', description: 'Only days with something important.', items: { type: 'object', additionalProperties: false, required: ['day', 'highlights'], properties: { day: { type: 'string', description: 'e.g. "Wed 18"' }, highlights: { type: 'array', items: { type: 'string' } } } } },
  heads_up: { type: 'array', description: 'Up to 5: deadlines, overlaps, money due, open questions.', items: { type: 'string' } } } };
const BRIEF_RULES = `You write Jordan's daily briefing inside her planner, Life Garden. Be warm, calm and brief — this is read on a phone, maybe aloud.
Use only the facts given; never invent events, times or people. Times in 12-hour form (9:30 AM). Items marked "suggested in the draft" are proposals from an old working draft, not bookings — call them suggestions if you mention them.
No medical, legal or financial advice. No exclamation-mark overload.`;
function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const o = {}; for (const [k, v] of Object.entries(s)) { if (k === 'additionalProperties') continue; o[k] = k === 'type' ? String(v).toUpperCase() : (k === 'properties' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, toGeminiSchema(b)])) : toGeminiSchema(v)); }
  return o;
}
const deep12 = o => typeof o === 'string' ? to12(o) : Array.isArray(o) ? o.map(deep12) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deep12(v)])) : o;
async function aiJSON(system, user, schema, name) {
  if (provider() === 'openai') {
    const key = await openaiKey(); if (!key) return null;
    for (const m of ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-mini']) {
      const body = { model: m, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } };
      if (/^gpt-5/.test(m)) body.reasoning_effort = 'minimal'; else body.temperature = 0.5;
      const { r, txt } = await oaFetch(key, 'chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 30000);
      if (r.status === 404 || r.status === 400) continue;
      if (!r.ok) return null;
      return deep12(JSON.parse(JSON.parse(txt).choices[0].message.content));
    }
    return null;
  }
  const key = await voiceKey().catch(() => null); if (!key) return null;
  for (const m of ['gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash']) {
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema), temperature: 0.5 } };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
    if (r.status === 404 || r.status === 400) continue;
    if (!r.ok) return null;
    const j = await r.json(); return deep12(JSON.parse(j.candidates[0].content.parts.map(p => p.text || '').join('')));
  }
  return null;
}

/* ----- the popup ----- */
const briefCache = () => { try { return JSON.parse(localStorage.getItem(BRIEF_KEY) || '{}'); } catch (e) { return {}; } };
const saveBrief = o => { try { localStorage.setItem(BRIEF_KEY, JSON.stringify(o)); } catch (e) { } };
const brief = { tab: 'day', day: null, week: null, ai: { day: false, week: false } };
function briefSpeech() {
  if (brief.tab === 'week' && brief.week) { const w = brief.week; return [w.summary, ...w.days.map(x => `${x.day}: ${x.highlights.join('; ')}.`), ...(w.heads_up.length ? ['Heads up: ' + w.heads_up.join('. ')] : [])].join(' '); }
  const b = brief.day; if (!b) return '';
  return [b.greeting, b.summary, ...b.schedule.map(x => `${x.time}, ${x.what}.`), ...(b.heads_up.length ? ['Heads up: ' + b.heads_up.join('. ') + '.'] : []), b.focus ? `Focus: ${b.focus}.` : '', b.encouragement].filter(Boolean).join(' ');
}
function briefHTML() {
  const list = a => a && a.length ? `<ul style="margin:.2rem 0 0;padding-left:1.1rem">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  let body;
  if (brief.tab === 'week') {
    const w = brief.week;
    body = !w ? '<p class="muted">Putting the week together…</p>' : `<p style="margin:0 0 .6rem">${esc(w.summary)}</p>
      ${w.days.map(x => `<div style="padding:.45rem 0;border-top:1px solid var(--line)"><div class="sans small" style="font-weight:600;color:var(--accent2)">${esc(x.day)}</div>${list(x.highlights)}</div>`).join('') || '<p class="muted">A quiet week on paper.</p>'}
      ${w.heads_up.length ? `<div class="card flat" style="margin-top:.7rem;padding:.6rem .8rem;border-color:color-mix(in srgb,var(--warn) 45%,var(--line))"><b class="small sans">Heads up</b>${list(w.heads_up)}</div>` : ''}`;
  } else {
    const b = brief.day;
    body = `<h3 style="font-size:1.35rem;margin:0 0 .3rem">${esc(b.greeting)}</h3><p style="margin:0 0 .6rem">${esc(b.summary)}</p>
      ${b.schedule.length ? `<div class="stack" style="gap:.25rem">${b.schedule.map(x => `<div class="row" style="flex-wrap:nowrap;align-items:baseline;gap:.7rem"><span class="sans small" style="min-width:4.6rem;color:var(--accent2);font-weight:600">${esc(x.time)}</span><span>${esc(x.what)}</span></div>`).join('')}</div>` : ''}
      ${b.heads_up.length ? `<div class="card flat" style="margin-top:.7rem;padding:.6rem .8rem;border-color:color-mix(in srgb,var(--warn) 45%,var(--line))"><b class="small sans">Heads up</b>${list(b.heads_up)}</div>` : ''}
      ${b.focus ? `<p style="margin:.7rem 0 0"><b>Focus:</b> ${esc(b.focus)}</p>` : ''}${b.encouragement ? `<p class="muted" style="margin:.5rem 0 0;font-style:italic">${esc(b.encouragement)}</p>` : ''}`;
  }
  const working = brief.tab === 'week' ? !brief.ai.week && brief.loading : !brief.ai.day && brief.loading;
  return `<div class="mh"><div class="tabs" style="margin:0"><button aria-pressed="${brief.tab === 'day'}" data-btab="day">☀ Today</button><button aria-pressed="${brief.tab === 'week'}" data-btab="week">▦ This week</button></div><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
    <div class="mb">${body}${working ? '<p class="tiny muted sans" style="margin-top:.8rem">✨ Writing a personal rundown…</p>' : ''}</div>
    <div class="mf"><button class="btn" id="bSpeak">🔊 Read it to me</button><button class="btn" id="bDay">Open ${brief.tab === 'week' ? 'Week' : 'Today'}</button><button class="btn primary" data-act="close">Start my day</button></div>`;
}
function drawBrief() {
  const m = $('#dlgBody'); if (!m || !m.querySelector('[data-btab]')) return;
  m.innerHTML = briefHTML(); wireBrief(m);
}
function wireBrief(m) {
  $$('[data-btab]', m).forEach(b => b.onclick = () => { brief.tab = b.dataset.btab; drawBrief(); if (brief.tab === 'week' && !brief.ai.week) loadWeek(); });
  $('#bSpeak', m).onclick = () => { unlockSpeech(); speak(briefSpeech(), true); };
  $('#bDay', m).onclick = () => { const t = brief.tab; stopSpeaking(); closeModal(); go(t === 'week' ? 'week' : 'today', todayISO()); };
}
async function loadWeek() {
  const t0 = todayISO(), c = briefCache(), ws = weekStart(t0);
  if (c.weekOf === ws && c.week && c.weekDay === t0) { brief.week = c.week; brief.ai.week = true; return drawBrief(); }
  brief.week = brief.week || localWeek(t0); brief.loading = true; drawBrief();
  try { const w = await aiJSON(BRIEF_RULES, 'Her week (JSON):\n' + JSON.stringify(weekData(t0)) + '\n\nWrite the week-ahead rundown. Today is ' + t0 + '.', WEEK_SCHEMA, 'week_briefing'); if (w) { brief.week = w; brief.ai.week = true; saveBrief({ ...briefCache(), weekOf: ws, weekDay: t0, week: w }); } } catch (e) { console.warn('week briefing', e); }
  brief.loading = false; drawBrief();
}
async function openBriefing(manual) {
  const t0 = todayISO(), c = briefCache();
  brief.tab = 'day'; brief.ai = { day: false, week: false }; brief.week = null;
  if (c.date === t0 && c.day) { brief.day = c.day; brief.ai.day = true; } else { brief.day = localDay(t0); brief.loading = true; }
  openModal(briefHTML(), wireBrief);
  saveBrief({ ...briefCache(), shown: t0 });
  if (!brief.ai.day) {
    try {
      const d = await aiJSON(BRIEF_RULES, `It is ${fmtTime(nowMin())} on ${fmtDate(t0)}. Her name is ${firstName()}.\nToday (JSON):\n` + JSON.stringify(briefData(t0)) + '\n\nWrite today\'s briefing.', DAY_SCHEMA, 'day_briefing');
      if (d) { brief.day = d; brief.ai.day = true; saveBrief({ ...briefCache(), date: t0, day: d }); }
    } catch (e) { console.warn('day briefing', e); }
    brief.loading = false; drawBrief();
  }
}
ACT.briefing = () => openBriefing(true);

/* once a day, when the app opens */
setTimeout(() => {
  if (S.settings.briefingOn === false || dlg().open || location.hash.startsWith('#connect=')) return;
  if (!S.blocks.length && !S.tasks.length) return;                    // brand-new, empty plan
  if (briefCache().shown === todayISO()) return;
  openBriefing(false);
}, 1600);
