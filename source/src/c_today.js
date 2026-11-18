/* ================= Today: time blocking ================= */
const STATUS = { confirmed: ['Confirmed by Jordan', '✓'], source: ['Source-listed', 'ⓢ'], sourceproposed: ['Source + proposed', 'ⓢ'], needs: ['Needs confirmation', '?'], proposed: ['Proposed (draft)', '~'] };
const draftHidden = () => S.settings.showDraft === false;
const dayBlocks = (d, list = S.blocks) => list.filter(b => b.date === d && !(b.status === 'proposed' && draftHidden())).sort((a, b) => a.start - b.start || a.end - b.end);
const isMovable = b => b.kind === 'flexible' && !b.done;
function sleepZones() {
  const f = fromHHMM(S.settings.sleepFrom), t = fromHHMM(S.settings.sleepTo);
  if (f == null || t == null) return [];
  return f > t ? [{ s: 0, e: t, title: 'Sleep' }, { s: f, e: 1440, title: 'Sleep' }] : [{ s: f, e: t, title: 'Sleep' }];
}
function immovables(d, list = S.blocks, exceptId) {
  return [...dayBlocks(d, list).filter(b => b.id !== exceptId && !isMovable(b)).map(b => ({ s: b.start, e: b.end, title: b.title })), ...sleepZones()];
}
const overlaps = (a, b) => a.s < b.e && b.s < a.e;
function earliest(t, dur, occ, limit = 1440) {
  for (let guard = 0; guard < 500; guard++) {
    const c = occ.find(o => t < o.e && t + dur > o.s);
    if (!c) return t + dur <= limit ? t : null;
    t = c.e;
  }
  return null;
}
function conflictsOn(d, list = S.blocks) {
  const bl = dayBlocks(d, list), out = [], ids = new Set();
  for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) {
    if (bl[j].start >= bl[i].end) break;
    out.push([bl[i], bl[j]]); ids.add(bl[i].id); ids.add(bl[j].id);
  }
  return { pairs: out, ids };
}
/* Move one flexible block; push only the flexible blocks it now collides with, later, by the minimum. */
function ripple(d, id, ns, list = S.blocks) {
  const b = list.find(x => x.id === id); const dur = b.end - b.start;
  if (ns < 0 || ns + dur > 1440) return { ok: false, reason: 'That would cross midnight. Split the block or choose an earlier time.' };
  const imm = immovables(d, list, id);
  const hit = imm.find(o => overlaps(o, { s: ns, e: ns + dur }));
  if (hit) return { ok: false, reason: `It would overlap “${hit.title}” (${fmtTime(hit.s)}–${fmtTime(hit.e)}), which is protected.` };
  const placed = [{ s: ns, e: ns + dur }], changes = [{ id, title: b.title, from: b.start, to: ns, dur }];
  for (const f of dayBlocks(d, list).filter(x => x.id !== id && isMovable(x))) {
    const fd = f.end - f.start, iv = { s: f.start, e: f.end };
    if (placed.some(p => overlaps(p, iv))) {
      const t = earliest(f.start, fd, [...imm, ...placed]);
      if (t == null) return { ok: false, reason: `“${f.title}” would be pushed past the end of the day. Nothing was changed.` };
      placed.push({ s: t, e: t + fd }); changes.push({ id: f.id, title: f.title, from: f.start, to: t, dur: fd });
    } else placed.push(iv);
  }
  return { ok: true, changes };
}
/* Late start: re-flow unfinished flexible work from time T around protected time. */
function lateStart(d, T, trim) {
  const imm = immovables(d), placed = [], changes = [], issues = [];
  let cursor = T;
  for (const f of dayBlocks(d).filter(isMovable)) {
    let dur = f.end - f.start;
    const s0 = Math.max(f.start, cursor);
    let t = earliest(s0, dur, [...imm, ...placed]);
    if (t == null && trim) {
      const min = Math.max(f.minLen || 0, dur - trim);
      for (let dd = dur - 1; dd >= min && t == null; dd--) { t = earliest(s0, dd, [...imm, ...placed]); if (t != null) dur = dd; }
    }
    if (t == null) { issues.push(`“${f.title}” (${fmtDur(f.end - f.start)}) doesn't fit before the end of the day.`); continue; }
    placed.push({ s: t, e: t + dur }); cursor = t + dur;
    if (t !== f.start || dur !== f.end - f.start) changes.push({ id: f.id, title: f.title, from: f.start, fromEnd: f.end, to: t, toEnd: t + dur });
  }
  return { changes, issues };
}
function applyChanges(label, changes, d) {
  commit('blocks', label, bl => {
    for (const c of changes) { const b = bl.find(x => x.id === c.id); if (!b) continue; const dur = b.end - b.start; b.start = c.to; b.end = c.toEnd ?? c.to + dur; if (d) b.date = d; }
  }, { toast: label + ' — applied' });
}

/* ---------- timeline renderer ---------- */
function laneLayout(bl) {
  const out = new Map(); let cluster = [], clusterEnd = -1;
  const flush = () => { const lanes = []; for (const b of cluster) { let i = lanes.findIndex(e => e <= b.start); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = b.end; out.set(b.id, { lane: i }); } for (const b of cluster) out.get(b.id).n = lanes.length; cluster = []; };
  for (const b of bl) { if (b.start >= clusterEnd && cluster.length) { flush(); clusterEnd = -1; } cluster.push(b); clusterEnd = Math.max(clusterEnd, b.end); }
  if (cluster.length) flush();
  return out;
}
function range(bl) {
  let a = S.settings.dayStart * 60, b = S.settings.dayEnd * 60;
  for (const x of bl) { a = Math.min(a, Math.floor(x.start / 60) * 60); b = Math.max(b, Math.ceil(x.end / 60) * 60); }
  return [a, Math.min(b, 1440)];
}
function timelineHTML(d, list, opts = {}) {
  const px = opts.px || 1.1, bl = dayBlocks(d, list), [r0, r1] = range(bl), lay = laneLayout(bl), cf = conflictsOn(d, list).ids;
  let h = `<div class="tl" data-r0="${r0}" data-px="${px}" style="height:${(r1 - r0) * px + 12}px;margin-top:10px">`;
  for (const z of sleepZones()) { const s = Math.max(z.s, r0), e = Math.min(z.e, r1); if (e > s) h += `<div style="position:absolute;left:0;right:0;top:${(s - r0) * px}px;height:${(e - s) * px}px;background:repeating-linear-gradient(135deg,transparent 0 8px,color-mix(in srgb,var(--c-sleep) 14%,transparent) 8px 16px);border-radius:6px" aria-hidden="true"></div>`; }
  for (let m = r0; m <= r1; m += 30) h += `<div class="hr ${m % 60 ? 'half' : ''}" style="top:${(m - r0) * px}px">${m % 60 ? '' : `<span>${fmtTimeShort(m)}</span>`}</div>`;
  if (!opts.preview && d === todayISO()) { const n = nowMin(); if (n >= r0 && n <= r1) h += `<div class="now" style="top:${(n - r0) * px}px" title="Now"></div>`; }
  for (const b of bl) {
    const L = lay.get(b.id), w = 100 / L.n, c = catOf(b), short = (b.end - b.start) * px < 34;
    const cls = ['blk', b.kind, b.status ? 'st-' + b.status : '', b.done ? 'done' : '', cf.has(b.id) ? 'conflict' : '', opts.changed && opts.changed.has(b.id) ? 'preview' : ''].join(' '); const stl = b.status && STATUS[b.status];
    h += `<div class="${cls}" ${opts.preview ? '' : `tabindex="0" data-blk="${b.id}"`} role="button" aria-label="${esc(b.title)}, ${fmtTime(b.start)} to ${fmtTime(b.end)}, ${KINDS[b.kind]}, ${CATS[c].label}${stl ? ', ' + stl[0] : ''}${b.done ? ', done' : ''}"
      style="--bc:${catColor(c)};top:${(b.start - r0) * px}px;height:${Math.max(14, (b.end - b.start) * px - 2)}px;left:calc(${L.lane * w}% + 2px);width:calc(${w}% - 4px)">
      ${b.kind !== 'flexible' ? `<span class="lock" title="${KINDS[b.kind]}">🔒</span>` : ''}
      <div class="bt">${stl ? `<span class="stb" title="${stl[0]}">${stl[1]}</span> ` : ''}${esc(b.title)}${short ? ` <span class="bm">· ${fmtTimeShort(b.start)}</span>` : ''}</div>
      ${short ? '' : `<div class="bm">${fmtTimeShort(b.start)}–${fmtTimeShort(b.end)} · ${stl ? stl[0] : CATS[c].label}</div>`}
      ${!opts.preview && !b.done && (b.end - b.start) * px >= 40 ? '<div class="grip" data-grip="1" title="Drag to resize"></div>' : ''}
    </div>`;
  }
  return h + '</div>';
}

/* ---------- priorities (next steps) ---------- */
const AREAS = ['Today', 'Dance & Glimmer', 'Academic', 'Move', 'Life admin', 'Family planning', 'Opportunities', 'Money', 'Well-being'];
const TSTATUS = ['Idea', 'Needs decision', 'Needs verification', 'Confirmed', 'In progress'];
const isDraftQ = t => t.src === 'draft' && t.status === 'Needs verification' && !t.date;
function tasksFor(d) {
  return S.tasks.filter(t => {
    if (isDraftQ(t) && !t.done) return false;           // recovered open questions live in the draft card
    if (t.done) return t.doneAt === d;
    if (t.defer && t.defer[d]) return false;
    const t0 = todayISO();
    if (!t.date) return d >= t0;                       // undated backlog shows today and ahead
    return t.date === d || (t.date < d && d === t0);   // overdue items carry into today only
  }).sort((a, b) => (!!b.focus?.[d] - !!a.focus?.[d]) || (a.done - b.done) || ((a.order ?? 0) - (b.order ?? 0)));
}
function taskRow(t, d) {
  const f = t.focus && t.focus[d], linked = t.blockId && S.blocks.find(b => b.id === t.blockId);
  const proj = t.projectId && S.projects.find(p => p.id === t.projectId);
  const overdue = !t.done && t.date && t.date < d;
  return `<div class="pri ${t.done ? 'done' : ''} ${f ? 'focus' : ''}" data-task="${t.id}" draggable="${!t.done}">
    <span class="handle" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
    <button class="chk ${t.done ? 'on' : ''}" data-act="taskDone" data-id="${t.id}" aria-label="${t.done ? 'Mark unfinished' : 'Complete'}: ${esc(t.title)}">✓</button>
    <div class="t"><div class="ti">${esc(t.title)}</div>
      <div class="row tiny muted" style="gap:.35rem;margin-top:.15rem">
        ${f ? '<span class="chip warn">★ Focus</span>' : ''}<span class="chip">${esc(t.area || 'Today')}</span>
        ${t.mins ? `<span>~${fmtDur(t.mins)}</span>` : ''}${linked ? `<span class="chip good">⏱ ${fmtShort(linked.date)} ${fmtTimeShort(linked.start)}</span>` : ''}
        ${overdue ? `<span class="chip bad">from ${fmtShort(t.date)}</span>` : ''}${proj ? `<span class="chip">${esc(proj.name)}</span>` : ''}
        ${t.status && t.status !== 'Confirmed' ? `<span>${esc(t.status)}</span>` : ''}
      </div></div>
    <div class="acts">
      ${t.done ? '' : `<button class="iconbtn" data-act="taskFocus" data-id="${t.id}" title="${f ? 'Unpin focus' : 'Focus on this'}">${f ? '★' : '☆'}</button>
      <button class="iconbtn" data-act="taskSchedule" data-id="${t.id}" title="Schedule…">⏱</button>
      <button class="iconbtn" data-act="taskDefer" data-id="${t.id}" title="Not today — set aside for this day">⤼</button>`}
      <button class="iconbtn" data-act="taskEdit" data-id="${t.id}" title="Edit">✎</button>
    </div></div>`;
}

/* ---------- view ---------- */
VIEWS.today = () => {
  const d = R.date, ws = weekStart(d), t0 = todayISO(), bl = dayBlocks(d), cf = conflictsOn(d);
  const fixed = bl.filter(b => b.kind === 'fixed');
  const sched = sum(bl.map(b => b.end - b.start));
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const tasks = tasksFor(d), open = tasks.filter(t => !t.done), done = tasks.filter(t => t.done);
  const deferred = S.tasks.filter(t => !t.done && t.defer && t.defer[d]);
  const routines = S.routines.filter(r => r.days.includes(dow(d)));
  const tw = S.together[ws];
  const isPast = d < t0;
  const dn = S.daynotes[d], dr = S.blocks.filter(b => b.date === d && b.src === 'draft'), hidden = draftHidden();
  const drc = st => dr.filter(b => b.status === st).length, draftQs = S.tasks.filter(t => isDraftQ(t) && !t.done);
  const draftCard = (dn || dr.length || draftQs.length) ? `<div class="card draftcard"><div class="row between"><h3>Recovered working draft</h3><span class="chip warn">not live-verified</span></div>
      ${dn ? `<div class="small" style="margin:.3rem 0">${dn.phase ? `<span class="chip">${esc(dn.phase)}</span> ` : ''}${dn.cycle ? `<span class="chip">${esc(dn.cycle)}</span> ` : ''}${dn.media ? `<span class="chip">${esc(dn.media)}</span> ` : ''}${dn.basis && !/^Portland/.test(dn.basis) ? `<span class="chip bad">Times: ${esc(dn.basis)}</span>` : ''}</div>
        ${dn.note ? `<p class="small" style="margin:.3rem 0">${esc(dn.note)}</p>` : ''}${dn.priority ? `<p class="small" style="margin:.3rem 0"><span class="muted">Week's suggested priority:</span> ${esc(dn.priority)}</p>` : ''}` : ''}
      ${dr.length ? `<div class="tiny sans muted" style="margin:.3rem 0">${Object.keys(STATUS).filter(drc).map(k => `${STATUS[k][1]} ${drc(k)} ${STATUS[k][0]}`).join(' · ')}</div>
      <div class="row" style="margin-top:.4rem"><button class="btn sm" data-act="toggleDraft">${hidden ? 'Show proposed blocks' : 'Hide proposed blocks'}</button>${drc('proposed') && !hidden ? `<button class="btn sm" data-act="keepDraftDay" title="Turn this day's proposals into your own plan">Keep this day's proposals</button><button class="btn sm ghost" data-act="clearDraftDay">Clear this day's proposals</button>` : ''}</div>` : ''}
      ${draftQs.length ? `<details style="margin-top:.6rem"><summary class="small sans" style="cursor:pointer">Open questions from the draft (${draftQs.length})</summary>${draftQs.map(t => taskRow(t, d)).join('')}</details>` : ''}
    </div>` : '';
  return `
  <div class="sec-head"><div><h2>${fmtDate(d)}${d === t0 ? ' · Today' : ''}</h2>
    <p class="sans small">${bl.length ? `${bl.length} block${bl.length > 1 ? 's' : ''} · ${fmtDur(sched)} planned` : 'Nothing scheduled yet'}${cf.pairs.length ? ` · <span style="color:var(--bad)">${cf.pairs.length} overlap${cf.pairs.length > 1 ? 's' : ''}</span>` : ''}${isPast ? ' · past day' : ''}</p></div>
    <div class="row">${d !== t0 ? `<button class="btn" data-act="pickDay" data-d="${t0}">↩ Today</button>` : ''}<button class="btn" data-act="briefing">☀ Briefing</button><button class="btn primary" data-act="addMenu">＋ Add</button></div></div>
  ${!sync.cfg && !S.settings.hideConnectHint ? `<div class="connectbar"><span>📱 Saved on this device only. Connect the Google Sheet to share this plan with every phone and with Gemini.</span><span class="row"><button class="btn sm primary" data-act="nav" data-v="backup">Connect</button><button class="btn sm ghost" data-act="hideHint">Not now</button></span></div>` : ''}
  <form class="cmdbar wide-only" id="cmdForm" autocomplete="off"><input id="cmd" aria-label="Quick add" placeholder="Quick add — “Yoga 9–10am tomorrow”, “Call landlord”, “move Homework to 2pm”   ( / )"><button class="btn primary">Add</button></form>
  <div class="daystrip" role="group" aria-label="Choose day">
    <button class="btn ghost sm" data-act="weekNav" data-n="-7" aria-label="Previous week">‹</button>
    ${days.map(x => { const load = sum(dayBlocks(x).map(b => b.end - b.start)); return `<button class="d ${x === t0 ? 'today' : ''}" aria-pressed="${x === d}" data-act="pickDay" data-d="${x}">${DOW[dow(x)]}<b>${+x.slice(8)}</b><span class="load"><i style="width:${Math.min(100, load / 6)}%"></i></span></button>`; }).join('')}
    <button class="btn ghost sm" data-act="weekNav" data-n="7" aria-label="Next week">›</button>
  </div>
  <div class="today-grid">
    <section aria-labelledby="tbH">
      ${nowCard(d)}
      <div class="row between" style="margin-bottom:.5rem"><h3 id="tbH">Time blocking</h3>
        <div class="row"><button class="btn sm" data-act="lateStart" ${bl.some(isMovable) ? '' : 'disabled'} title="Preview a gentler version of this day">☕ Late start…</button></div></div>
      <div class="tl-wrap"><div class="tl-scroll" id="tlScroll">${bl.length || true ? timelineHTML(d) : ''}</div></div>
      <p class="tiny muted sans" style="margin:.4rem .2rem">${matchMedia('(pointer:coarse)').matches ? 'Tap a block for quick actions. Press and hold, then drag to move it (you’ll review any knock-on changes first). Drag the bottom handle to resize.' : 'Click a block for quick actions. Drag it to move (you’ll review any knock-on changes first); drag its bottom edge to resize.'} Double-click empty space to add a block there.</p>
      ${LEGEND}
      ${cf.pairs.length ? `<div class="card" id="overlapCard" style="border-color:color-mix(in srgb,var(--bad) 45%,var(--line));margin-top:.6rem"><h3>Overlaps to decide</h3><ul class="small sans" style="margin:.2rem 0;padding-left:1.1rem">${cf.pairs.map(([a, b]) => `<li><a href="#" data-act="openBlock" data-id="${a.id}">${esc(a.title)}</a> (${fmtTimeShort(a.start)}–${fmtTimeShort(a.end)}) and <a href="#" data-act="openBlock" data-id="${b.id}">${esc(b.title)}</a> (${fmtTimeShort(b.start)}–${fmtTimeShort(b.end)})</li>`).join('')}</ul><p class="tiny muted sans" style="margin:.3rem 0 0">The planner never decides which one matters more.</p></div>` : ''}
      ${fixed.length ? `<details class="disc" style="margin-top:.75rem"><summary>Fixed appointments (${fixed.length})</summary><div class="in small sans">${fixed.map(b => `<div class="row between" style="padding:.25rem 0;border-bottom:1px solid var(--line)"><span><span class="dot" style="background:${catColor(catOf(b))}"></span> ${esc(b.title)}</span><span class="muted">${fmtTime(b.start)} – ${fmtTime(b.end)} <button class="btn sm ghost" data-act="seeBlock" data-id="${b.id}">See in timeline</button></span></div>`).join('')}</div></details>` : ''}
    </section>
    <aside class="stack">
      ${draftCard}
      <div class="card">
        <div class="row between"><h3>Priorities for this day</h3><span class="tiny muted sans">${open.length} open</span></div>
        <div id="taskList">${open.length ? open.map(t => taskRow(t, d)).join('') : `<div class="empty small">No next steps here. Add one above, or pull from a project.</div>`}</div>
        ${done.length ? `<details style="margin-top:.4rem"><summary class="small sans muted" style="cursor:pointer">Completed (${done.length})</summary>${done.map(t => taskRow(t, d)).join('')}</details>` : ''}
        ${deferred.length ? `<details style="margin-top:.4rem"><summary class="small sans muted" style="cursor:pointer">Set aside for this day (${deferred.length})</summary>${deferred.map(t => `<div class="row between small" style="padding:.3rem 0">${esc(t.title)} <button class="btn sm" data-act="taskBringBack" data-id="${t.id}">Bring back</button></div>`).join('')}</details>` : ''}
      </div>
      <div class="card">
        <div class="row between"><h3>Daily care</h3><button class="btn sm ghost" data-act="editRoutines">Edit</button></div>
        ${routines.length ? routines.map(r => { const on = r.done && r.done[d]; return `<div class="pri ${on ? 'done' : ''}"><button class="chk ${on ? 'on' : ''}" data-act="routineDone" data-id="${r.id}" aria-label="${on ? 'Undo' : 'Done for this day'}: ${esc(r.title)}">✓</button><div class="t"><div class="ti">${esc(r.title)}</div><div class="tiny muted sans">${esc(r.who || '')}${r.mins ? ` · ~${fmtDur(r.mins)}` : ''}</div></div></div>`; }).join('') : `<div class="empty small">No routines on ${DOW[dow(d)]}s.</div>`}
        <p class="tiny muted sans" style="margin:.4rem 0 0">Checkmarks belong to this date only — tomorrow starts fresh.</p>
      </div>
      <div class="card">
        <div class="row between"><h3>This week together</h3><button class="btn sm ghost" data-act="nav" data-v="capacity">Open</button></div>
        ${tw && tw.pri && tw.pri.some(p => p.text) ? tw.pri.filter(p => p.text).map(p => `<div class="small" style="padding:.15rem 0">${p.done ? '✅' : '◻️'} ${esc(p.text)} <span class="muted tiny sans">${esc(p.owner || '')}</span></div>`).join('') : '<p class="small muted" style="margin:0">No shared priorities set for this week yet.</p>'}
      </div>
    </aside>
  </div>`;
};
VIEWS.today_after = keep => {
  const sc = $('#tlScroll'); if (!sc) return;
  if (keep != null) sc.scrollTop = keep;
  else { const tl = $('.tl', sc), r0 = +tl.dataset.r0, px = +tl.dataset.px; const first = dayBlocks(R.date)[0]; const target = R.date === todayISO() ? nowMin() - 60 : first ? first.start - 30 : 8 * 60; sc.scrollTop = Math.max(0, (target - r0) * px); }
  wireTimeline(sc); wireTaskDnD();
  $('#cmdForm').onsubmit = e => { e.preventDefault(); const v = $('#cmd').value.trim(); if (v) { quickAdd(v); } };
};

/* ---------- timeline pointer interactions ---------- */
function wireTimeline(sc) {
  const tl = $('.tl', sc); const r0 = +tl.dataset.r0, px = +tl.dataset.px;
  const yToMin = y => Math.round((y / px + r0) / 15) * 15;
  tl.addEventListener('dblclick', e => {
    if (e.target.closest('.blk')) return;
    const y = e.clientY - tl.getBoundingClientRect().top; const s = clamp(yToMin(y), 0, 1410);
    openBlockEditor(null, { date: R.date, start: s, end: s + 60 });
  });
  $$('.blk[data-blk]', tl).forEach(el => {
    const b = S.blocks.find(x => x.id === el.dataset.blk);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBlockActions(b.id); }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && isMovable(b)) { e.preventDefault(); reviewMove(b.id, b.start + (e.key === 'ArrowUp' ? -15 : 15)); }
    });
    const startDrag = (grip, y0) => {
      const top0 = el.offsetTop, h0 = el.offsetHeight; let moved = false, tag = null, val = null;
      return {
        move(y) {
          const dy = y - y0; if (!moved && Math.abs(dy) < 5) return;
          if (b.done) return;
          moved = true; el.classList.add('dragging');
          if (!tag) { tag = document.createElement('div'); tag.className = 'droptime'; tl.appendChild(tag); }
          if (grip) { val = Math.min(1440, Math.max(b.start + 15, yToMin(top0 + h0 + dy))); el.style.height = (val - b.start) * px - 2 + 'px'; tag.style.top = (val - r0) * px - 10 + 'px'; tag.textContent = 'ends ' + fmtTime(val); }
          else { val = clamp(yToMin(top0 + dy), 0, 1440 - (b.end - b.start)); el.style.top = (val - r0) * px + 'px'; tag.style.top = (val - r0) * px - 18 + 'px'; tag.textContent = fmtTime(val) + ' – ' + fmtTime(val + b.end - b.start); }
        },
        end(tapOpens = true) {
          tag && tag.remove(); el.classList.remove('dragging', 'lifted');
          if (!moved) { if (tapOpens) openBlockActions(b.id); return; }
          if (grip) {
            if (val === b.end) return render();
            const hit = immovables(b.date, S.blocks, b.id).find(o => overlaps(o, { s: b.start, e: val }));
            commit('blocks', 'resize ' + b.title, bl => { bl.find(x => x.id === b.id).end = val; }, { toast: `${b.title} now ends ${fmtTime(val)}${hit ? ` — overlaps ${hit.title}` : ''}` });
          } else { if (val === b.start) return render(); render(); reviewMove(b.id, val); }
        },
      };
    };
    // mouse / pen: drag straight away
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      R.interacting = true; const d = startDrag(!!e.target.dataset.grip, e.clientY); el.setPointerCapture(e.pointerId);
      const mv = ev => d.move(ev.clientY);
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); R.interacting = false; d.end(); flushPendingRender(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    // touch: a quick tap opens the editor, press-and-hold lifts the block, the bottom handle resizes at once; a normal swipe scrolls the day
    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const t0 = e.touches[0], grip = !!e.target.dataset.grip && !b.done; R.interacting = true;
      let d = null, cancelled = false, x0 = t0.clientX, y0 = t0.clientY, timer = null;
      const lift = () => { d = startDrag(grip, y0); el.classList.add('lifted'); if (navigator.vibrate) navigator.vibrate(12); };
      if (grip) lift(); else if (!b.done) timer = setTimeout(lift, 380);
      const mv = ev => { const t = ev.touches[0]; if (d) { ev.preventDefault(); d.move(t.clientY); } else if (Math.hypot(t.clientX - x0, t.clientY - y0) > 8) { cancelled = true; clearTimeout(timer); R.interacting = false; } };
      const end = ev => { clearTimeout(timer); R.interacting = false; el.removeEventListener('touchmove', mv); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); setTimeout(flushPendingRender, 0);
        if (d) { ev.preventDefault(); d.end(false); if (!el.classList.contains('dragging')) el.classList.remove('lifted'); }
        else if (!cancelled && ev.type === 'touchend') { ev.preventDefault(); openBlockActions(b.id); } };
      el.addEventListener('touchmove', mv, { passive: false }); el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    }, { passive: true });
  });
}
function reviewMove(id, ns, nd) {
  const b = S.blocks.find(x => x.id === id); nd = nd || b.date;
  const sim = nd === b.date ? S.blocks : clone(S.blocks).map(x => x.id === id ? { ...x, date: nd } : x);
  const r = ripple(nd, id, ns, sim), dayTxt = nd !== b.date ? `${fmtDate(nd, { weekday: 'short', month: 'short', day: 'numeric' })}, ` : '';
  const list = r.ok ? r.changes.map(c => `<li><b>${esc(c.title)}</b>: <span class="from">${c.id === id && nd !== b.date ? fmtDate(b.date, { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' : ''}${fmtTime(c.from)}</span> → <span class="to">${c.id === id ? dayTxt : ''}${fmtTime(c.to)}</span>–${fmtTime(c.to + c.dur)}</li>`).join('') : '';
  const lockNote = b.kind !== 'flexible' ? `<p class="small" style="color:var(--warn)">🔒 “${esc(b.title)}” is ${b.kind === 'fixed' ? 'a fixed appointment' : 'protected time'} — if it's a real booking, remember to change it with whoever it's with too.</p>` : '';
  openModal(`<div class="mh"><h3>Review move</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
   <div class="mb">${lockNote}${r.ok ? `<p class="small">${r.changes.length > 1 ? `Moving <b>${esc(b.title)}</b> pushes ${r.changes.length - 1} later flexible block${r.changes.length > 2 ? 's' : ''} by the minimum needed. Durations stay the same; locked time doesn't move.` : 'Only this block changes.'}</p><ul class="diff">${list}</ul>`
      : `<p><b>This move can't be applied as-is.</b></p><p class="small">${esc(r.reason)}</p><p class="tiny muted sans">Choose a different time, or move it anyway and keep the overlap visible to decide later.</p>`}</div>
   <div class="mf"><button class="btn" data-act="close">Cancel</button><button class="btn ${r.ok ? '' : 'primary'}" id="mvForce">${r.ok ? 'Move only this block' : 'Move anyway (keep overlap)'}</button>${r.ok ? `<button class="btn primary" id="mvApply">Apply ${r.changes.length > 1 ? r.changes.length + ' changes' : 'move'}</button>` : ''}</div>`, m => {
    if (r.ok) $('#mvApply', m).onclick = () => { closeModal(); applyChanges('move ' + b.title, r.changes, nd); };
    $('#mvForce', m).onclick = () => { closeModal(); applyChanges('move ' + b.title, [{ id, to: ns }], nd); };
  });
}

/* ---------- week grid: drag a block to another time or day ---------- */
function wireWeekDrag() {
  const wk = $('.wk'); if (!wk) return;
  const r0 = +wk.dataset.r0, px = +wk.dataset.px;
  $$('.blk[data-wblk]', wk).forEach(el => {
    const b = S.blocks.find(x => x.id === el.dataset.wblk); if (!b) return;
    const start = (x0, y0) => {
      const rect0 = el.getBoundingClientRect(), grabOff = y0 - rect0.top, label = el.querySelector('.bt'), orig = label.textContent;
      let target = null; el.classList.add('dragging');
      return {
        move(x, y) {
          el.style.transform = `translate(${x - x0}px, ${y - y0}px)`;
          el.style.pointerEvents = 'none';
          const col = document.elementsFromPoint(x, y).map(n => n.closest && n.closest('.col[data-date]')).find(Boolean);
          el.style.pointerEvents = '';
          if (!col) return;
          const top = y - grabOff - col.getBoundingClientRect().top, ns = clamp(Math.round((top / px + r0) / 15) * 15, 0, 1440 - (b.end - b.start));
          target = { date: col.dataset.date, start: ns }; label.textContent = `${DOW[dow(target.date)]} ${fmtTimeShort(ns)} · ${b.title}`;
        },
        end() {
          el.classList.remove('dragging'); el.style.transform = ''; label.textContent = orig;
          if (!target || (target.date === b.date && target.start === b.start)) return false;
          reviewMove(b.id, target.start, target.date); return true;
        },
      };
    };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || e.button !== 0 || b.done) return;
      const x0 = e.clientX, y0 = e.clientY; let d = null; el.setPointerCapture(e.pointerId);
      const mv = ev => { if (!d && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; d = d || start(x0, y0); d.move(ev.clientX, ev.clientY); };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (!(d && d.end())) openBlockActions(b.id); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0], x0 = t.clientX, y0 = t.clientY; let d = null, cancelled = false;
      const timer = b.done ? null : setTimeout(() => { d = start(x0, y0); el.classList.add('lifted'); if (navigator.vibrate) navigator.vibrate(12); }, 380);
      const mv = ev => { const p = ev.touches[0]; if (d) { ev.preventDefault(); d.move(p.clientX, p.clientY); } else if (Math.hypot(p.clientX - x0, p.clientY - y0) > 8) { cancelled = true; clearTimeout(timer); } };
      const end = ev => { clearTimeout(timer); el.removeEventListener('touchmove', mv); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); el.classList.remove('lifted');
        if (d) { ev.preventDefault(); d.end(); } else if (!cancelled && ev.type === 'touchend') { ev.preventDefault(); openBlockActions(b.id); } };
      el.addEventListener('touchmove', mv, { passive: false }); el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    }, { passive: true });
  });
}

/* ---------- block editor ---------- */
function openBlockEditor(id, preset = {}) {
  const ex = id && S.blocks.find(b => b.id === id);
  const b = ex ? clone(ex) : { id: uid(), title: preset.title || '', date: preset.date || R.date, start: preset.start ?? 9 * 60, end: preset.end ?? 10 * 60, kind: preset.kind || 'flexible', cat: preset.cat || 'auto', notes: '', taskId: preset.taskId };
  const catOpts = `<option value="auto">Automatic (${CATS[autoCat(b.title)].label})</option>` + Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${b.cat === k ? 'selected' : ''}>${c.label}</option>`).join('');
  openModal(`<div class="mh"><h3>${ex ? 'Edit block' : 'New block'}</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
  <form class="mb stack" id="bf">
    <label class="f">Activity<input name="title" value="${esc(b.title)}" required ${ex ? '' : 'autofocus'}></label>
    <div class="fgrid"><label class="f">Date<input type="date" name="date" value="${b.date}"></label>
      <label class="f">Start<input type="time" name="start" step="300" value="${hhmm(b.start)}"></label>
      <label class="f">End <span class="tiny">(12:00 AM = midnight)</span><input type="time" name="end" step="300" value="${b.end === 1440 ? '00:00' : hhmm(b.end)}"></label></div>
    <div class="fgrid"><label class="f">Scheduling kind<select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${b.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f">Activity colour<select name="cat">${catOpts}</select></label>
      <label class="f">Shortest acceptable (min)<input type="number" name="minLen" min="0" step="5" value="${b.minLen ?? ''}" placeholder="for Late start"></label></div>
    <label class="f">Notes<textarea name="notes" rows="2">${esc(b.notes || '')}</textarea></label>
    ${b.src === 'draft' || b.status ? `<div class="fgrid"><label class="f">Status<select name="status"><option value="">My own plan</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${b.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
      <div class="tiny muted sans" style="align-self:end">${b.src === 'draft' ? 'From the recovered working draft — not verified against the live site.' + (b.orig && b.orig !== b.title ? ` Original cell: “${esc(b.orig)}”.` : '') : ''}</div></div>` : ''}
    ${ex ? `<label class="row small sans"><input type="checkbox" name="done" ${b.done ? 'checked' : ''}> Done — this actually happened</label>` : ''}
    <div id="bfWarn" class="small sans" style="color:var(--warn)"></div>
    ${ex && b.kind === 'flexible' ? `<details class="disc"><summary>Split into two parts</summary><div class="in fgrid">
      <label class="f">First part ends<input type="time" name="splitAt" step="300" value="${hhmm(Math.round((b.start + b.end) / 2 / 15) * 15)}"></label>
      <label class="f">Rest goes on<input type="date" name="splitDate" value="${b.date}"></label>
      <label class="f">Rest starts<input type="time" name="splitStart" step="300" value=""></label>
      <div class="row" style="align-items:end"><button type="button" class="btn" id="bfSplit">Split</button></div></div></details>` : ''}
  </form>
  <div class="mf">${ex ? `<button class="btn danger" id="bfDel">Remove</button><button class="btn" id="bfDup">Duplicate</button>` : ''}<span class="grow"></span><button class="btn" data-act="close">Cancel</button><button class="btn primary" id="bfSave">${ex ? 'Save' : 'Create block'}</button></div>`, m => {
    const f = $('#bf', m);
    const read = () => { const fd = Object.fromEntries(new FormData(f)); let e = fromHHMM(fd.end); if (e === 0) e = 1440; return { ...b, title: fd.title.trim(), date: fd.date, start: fromHHMM(fd.start), end: e, kind: fd.kind, cat: fd.cat, notes: fd.notes, minLen: fd.minLen === '' ? undefined : +fd.minLen, done: !!fd.done, status: fd.status !== undefined ? (fd.status || undefined) : b.status }; };
    const check = () => {
      const n = read(); const w = $('#bfWarn', m);
      if (n.start == null || n.end == null || n.end <= n.start) { w.textContent = 'End must be after start on the same date. For overnight plans, use two blocks.'; return false; }
      const hits = dayBlocks(n.date).filter(x => x.id !== n.id && x.start < n.end && n.start < x.end);
      w.textContent = hits.length ? 'Overlaps: ' + hits.map(x => `${x.title} (${fmtTimeShort(x.start)}–${fmtTimeShort(x.end)})`).join(', ') + ' — saved anyway if you continue.' : '';
      return true;
    };
    f.addEventListener('input', check); check();
    f.onsubmit = e => { e.preventDefault(); $('#bfSave', m).click(); };
    $('#bfSave', m).onclick = () => {
      if (!check()) return; const n = read(); if (!n.title) { f.title.focus(); return; }
      closeModal(); if (ex && n.src === 'draft' && JSON.stringify(n) !== JSON.stringify(ex)) n.edited = true;
      commit('blocks', (ex ? 'edit ' : 'add ') + n.title, bl => { const i = bl.findIndex(x => x.id === n.id); if (i >= 0) bl[i] = n; else bl.push(n); });
      if (n.taskId) commit('tasks', 'link', ts => { const t = ts.find(x => x.id === n.taskId); if (t) t.blockId = n.id; }, { render: true });
      if (n.date !== R.date) toast(`Added to ${fmtShort(n.date)}`, 'Go there', () => go('today', n.date));
    };
    if (ex) {
      $('#bfDel', m).onclick = async () => { closeModal(); if (b.kind !== 'flexible' && !(await confirmBox(`Delete the locked block “${b.title}”? You can undo right after.`, 'Delete'))) return; commit('blocks', 'remove ' + b.title, bl => bl.splice(bl.findIndex(x => x.id === b.id), 1), { toast: `Removed “${b.title}”` }); };
      $('#bfDup', m).onclick = () => { closeModal(); openBlockEditor(null, { ...b, title: b.title, date: b.date, start: b.end, end: b.end + (b.end - b.start) }); };
      const sp = $('#bfSplit', m); if (sp) sp.onclick = () => {
        const at = fromHHMM(f.splitAt.value), sd = f.splitDate.value, ssRaw = fromHHMM(f.splitStart.value);
        if (at == null || at <= b.start || at >= b.end) { $('#bfWarn', m).textContent = 'Pick a split time inside the block.'; return; }
        const rest = b.end - at, ss = ssRaw ?? at; if (ss + rest > 1440) { $('#bfWarn', m).textContent = 'The remainder would cross midnight.'; return; }
        closeModal();
        commit('blocks', 'split ' + b.title, bl => { const o = bl.find(x => x.id === b.id); o.end = at; bl.push({ ...clone(o), id: uid(), title: o.title + ' (part 2)', date: sd, start: ss, end: ss + rest, done: false }); }, { toast: 'Split into two linked parts' });
      };
    }
  });
}

/* ---------- task editor ---------- */
function openTaskEditor(id, preset = {}) {
  const ex = id && S.tasks.find(t => t.id === id);
  const t = ex ? clone(ex) : { id: uid(), title: '', area: 'Today', status: 'Confirmed', date: R.date, notes: '', mins: '', prereq: '', ...preset };
  openModal(`<div class="mh"><h3>${ex ? 'Edit next step' : 'New next step'}</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
  <form class="mb stack" id="tf"><label class="f">What's the next step?<input name="title" value="${esc(t.title)}" autofocus required></label>
   <div class="fgrid"><label class="f">Area<select name="area">${AREAS.map(a => `<option ${t.area === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
   <label class="f">Status<select name="status">${TSTATUS.map(a => `<option ${t.status === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
   <label class="f">Show from<input type="date" name="date" value="${t.date || ''}"></label>
   <label class="f">Estimated minutes<input type="number" name="mins" min="0" step="5" value="${t.mins ?? ''}" placeholder="unknown"></label></div>
   <label class="f">Waiting on (prerequisite)<input name="prereq" value="${esc(t.prereq || '')}"></label>
   <label class="f">Notes<textarea name="notes">${esc(t.notes || '')}</textarea></label></form>
  <div class="mf">${ex ? '<button class="btn danger" id="tfDel">Remove</button>' : ''}<span class="grow"></span><button class="btn" data-act="close">Cancel</button><button class="btn primary" id="tfSave">${ex ? 'Save' : 'Add'}</button></div>`, m => {
    const f = $('#tf', m); f.onsubmit = e => { e.preventDefault(); $('#tfSave', m).click(); };
    $('#tfSave', m).onclick = () => {
      const fd = Object.fromEntries(new FormData(f)); if (!fd.title.trim()) return;
      const n = { ...t, ...fd, title: fd.title.trim(), mins: fd.mins === '' ? '' : +fd.mins, date: fd.date || null };
      closeModal(); commit('tasks', (ex ? 'edit ' : 'add ') + n.title, ts => { const i = ts.findIndex(x => x.id === n.id); if (i >= 0) ts[i] = n; else { n.order = Math.max(0, ...ts.map(x => x.order || 0)) + 1; ts.push(n); } });
    };
    if (ex) $('#tfDel', m).onclick = () => { closeModal(); commit('tasks', 'remove ' + t.title, ts => ts.splice(ts.findIndex(x => x.id === t.id), 1), { toast: `Removed “${t.title}”` }); };
  });
}
function firstFreeSlot(d, dur) {
  const occ = [...dayBlocks(d).map(b => ({ s: b.start, e: b.end })), ...sleepZones()];
  const from = d === todayISO() ? Math.ceil((nowMin() + 5) / 15) * 15 : S.settings.dayStart * 60 + 60 * 2;
  return earliest(from, dur, occ) ?? from;
}

/* ---------- reorder priorities ---------- */
function wireTaskDnD() {
  const list = $('#taskList'); if (!list) return; let dragId = null;
  list.addEventListener('dragstart', e => { const r = e.target.closest('.pri'); if (!r) return; dragId = r.dataset.task; e.dataTransfer.effectAllowed = 'move'; });
  list.addEventListener('dragover', e => { const r = e.target.closest('.pri'); if (!r || !dragId) return; e.preventDefault(); $$('.pri.over', list).forEach(x => x.classList.remove('over')); r.classList.add('over'); });
  list.addEventListener('drop', e => {
    e.preventDefault(); const r = e.target.closest('.pri'); if (!r || !dragId || r.dataset.task === dragId) return;
    const ids = $$('.pri', list).map(x => x.dataset.task).filter(x => x !== dragId); ids.splice(ids.indexOf(r.dataset.task), 0, dragId);
    commit('tasks', 'reorder', ts => ids.forEach((id, i) => { const t = ts.find(x => x.id === id); if (t) t.order = i; }));
  });
}

/* ---------- quick add ---------- */
const cutAt = (s, l, frag) => { const i = l.indexOf(frag); return i < 0 ? s : (s.slice(0, i) + ' ' + s.slice(i + frag.length)).replace(/\b(on|for|this|next)\s*$/i, '').replace(/\s+(on|this|next)\s+(?=\S)/i, ' '); };
function parseDateWord(s, base) {
  let m; const l = s.toLowerCase();
  if (/\btoday\b/.test(l)) return [todayISO(), s.replace(/\btoday\b/i, '')];
  if (/\btomorrow\b|\btmrw\b/.test(l)) return [addDays(base, 1), s.replace(/\btomorrow\b|\btmrw\b/i, '')];
  const wd = l.match(/\b(?:next |on )?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (wd) { const tgt = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(wd[1]); let x = base; for (let i = 0; i < 7; i++) { if (dow(x) === tgt) break; x = addDays(x, 1); } return [x, cutAt(s, l, wd[0])]; }
  if ((m = l.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})\b/))) {
    const mo = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1]) + 1; let y = +base.slice(0, 4);
    let r = `${y}-${String(mo).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`; if (r < addDays(todayISO(), -60)) r = `${y + 1}${r.slice(4)}`; return [r, cutAt(s, l, m[0])];
  }
  if ((m = l.match(/\b(\d{1,2})\/(\d{1,2})\b/))) { const y = +base.slice(0, 4); return [`${y}-${String(+m[1]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`, s.replace(m[0], '')]; }
  return [null, s];
}
function toMin(h, mm, ap, hint) {
  h = +h; mm = +(mm || 0); if (h > 23 || mm > 59) return null;
  if (ap) { ap = ap.toLowerCase(); if (ap.startsWith('p') && h < 12) h += 12; if (ap.startsWith('a') && h === 12) h = 0; }
  else if (h <= 12) { if (hint === 'pm' && h < 12) h += 12; else if (!hint && h >= 1 && h <= 6) h += 12; }
  return h * 60 + mm;
}
function parseTimes(s) {
  const T = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a|p)?';
  let m = s.match(new RegExp(`\\b(?:from\\s+)?${T}\\s*(?:-|–|—|to|until)\\s*${T}\\b`, 'i'));
  if (m) { const eap = m[6] && m[6].toLowerCase().startsWith('p') ? 'pm' : null; let a = toMin(m[1], m[2], m[3], m[3] ? null : eap), b = toMin(m[4], m[5], m[6], null); if (a != null && b != null && !m[3] && a > b && a >= 720) a -= 720; if (b === 0) b = 1440; if (a != null && b > a) return { start: a, end: b, rest: s.replace(m[0], '') }; }
  m = s.match(new RegExp(`\\b(?:at|@)\\s*${T}\\b|\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b`, 'i'));
  if (m) {
    const a = m[1] ? toMin(m[1], m[2], m[3]) : toMin(m[4], m[5], m[6]); let rest = s.replace(m[0], ''), dur = 60;
    const dm = rest.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\b/i);
    if (dm) { dur = /^h/i.test(dm[2]) ? +dm[1] * 60 : +dm[1]; rest = rest.replace(dm[0], ''); }
    if (a != null) return { start: a, end: Math.min(1440, a + Math.round(dur)), rest };
  }
  return null;
}
function quickAdd(text) {
  let m = text.match(/^move\s+(.+?)\s+to\s+(.+)$/i);
  if (m) {
    const name = m[1].toLowerCase(); const hits = dayBlocks(R.date).filter(b => isMovable(b) && b.title.toLowerCase().includes(name));
    const tm = parseTimes('at ' + m[2]);
    if (hits.length !== 1) return toast(hits.length ? `${hits.length} flexible blocks match “${m[1]}” — be more specific` : `No flexible block matches “${m[1]}” on this day`);
    if (!tm) return toast(`Couldn't read the time “${m[2]}”`);
    if ($('#cmd')) $('#cmd').value = ''; return reviewMove(hits[0].id, tm.start);
  }
  let [date, rest] = parseDateWord(text, R.date); date = date || R.date;
  const tm = parseTimes(rest);
  if (tm) {
    const title = tm.rest.replace(/\b(on|at|from|for)\s*$/i, '').replace(/\s{2,}/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '').replace(/\s+(on|at|from|for)$/i, '') || 'Untitled';
    const cat = autoCat(title), kind = cat === 'appointments' ? 'fixed' : cat === 'travel' || cat === 'together' ? 'protected' : 'flexible';
    const b = { id: uid(), title: title[0].toUpperCase() + title.slice(1), date, start: tm.start, end: tm.end, kind, cat: 'auto', notes: '' };
    commit('blocks', 'add ' + b.title, bl => bl.push(b), { toast: `Added “${b.title}” ${fmtShort(date)} ${fmtTimeShort(b.start)}–${fmtTimeShort(b.end)} (${KINDS[kind].split(' (')[0].toLowerCase()})` });
  } else {
    const title = rest.replace(/\s{2,}/g, ' ').trim();
    const t = { id: uid(), title: title[0].toUpperCase() + title.slice(1), area: 'Today', status: 'Confirmed', date, notes: '', mins: '', order: -Date.now() / 1e13 };
    commit('tasks', 'add ' + t.title, ts => ts.push(t), { toast: `Next step added${date !== R.date ? ' for ' + fmtShort(date) : ''}` });
  }
  const c = $('#cmd'); if (c) { c.value = ''; if (!narrow()) c.focus(); }
}

/* ---------- late start ---------- */
function openLateStart() {
  const d = R.date; const def = d === todayISO() ? Math.ceil(nowMin() / 15) * 15 : (dayBlocks(d).find(isMovable)?.start ?? 9 * 60) + 60;
  const draw = (T, trim) => {
    const r = lateStart(d, T, trim);
    const sim = clone(S.blocks); for (const c of r.changes) { const b = sim.find(x => x.id === c.id); b.start = c.to; b.end = c.toEnd; }
    $('#lsCal').innerHTML = timelineHTML(d, sim, { preview: true, px: .7, changed: new Set(r.changes.map(c => c.id)) });
    $('#lsList').innerHTML = (r.changes.length ? `<ul class="diff">${r.changes.map(c => `<li><b>${esc(c.title)}</b>: <span class="from">${fmtTimeShort(c.from)}–${fmtTimeShort(c.fromEnd)}</span> → <span class="to">${fmtTimeShort(c.to)}–${fmtTimeShort(c.toEnd)}</span>${c.toEnd - c.to < c.fromEnd - c.from ? ` <span class="chip warn">trimmed ${c.fromEnd - c.from - (c.toEnd - c.to)}m</span>` : ''}</li>`).join('')}</ul>` : '<p class="small muted">Nothing needs to move for that start time.</p>')
      + (r.issues.length ? `<div class="small" style="color:var(--bad)">${r.issues.map(esc).join('<br>')}</div>` : '');
    $('#lsApply').disabled = !r.changes.length || r.issues.length > 0; $('#lsApply').onclick = () => { closeModal(); applyChanges('late start', r.changes); };
  };
  openModal(`<div class="mh"><h3>Late start — a gentler version of ${DOW[dow(d)]}</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
   <div class="mb"><div class="row" style="margin-bottom:.6rem"><label class="f">I'm starting at<input type="time" id="lsT" step="900" value="${hhmm(def)}"></label>
   <label class="f">Trim flexible tasks by up to<select id="lsTrim"><option value="0">0 min</option><option value="5" selected>5 min</option><option value="10">10 min</option><option value="15">15 min</option></select></label></div>
   <p class="tiny muted sans">Unfinished flexible work re-flows around fixed, protected and sleep time. Nothing is saved until you apply.</p>
   <div class="grid2"><div class="tl-wrap"><div class="tl-scroll" id="lsCal" style="max-height:48vh"></div></div><div id="lsList" class="small"></div></div></div>
   <div class="mf"><button class="btn" data-act="close">Keep my day as is</button><button class="btn primary" id="lsApply">Apply late-start schedule</button></div>`, m => {
    const upd = () => draw(fromHHMM($('#lsT', m).value) ?? def, +$('#lsTrim', m).value); $('#lsT', m).oninput = upd; $('#lsTrim', m).onchange = upd; upd();
  }, true);
}

/* ---------- routines editor ---------- */
function openRoutines() {
  const rows = () => S.routines.map(r => `<tr><td><input data-b="routines.#${r.id}.title" value="${esc(r.title)}"></td>
    <td><div class="row" style="gap:.15rem">${DOW.map((n, i) => `<label class="tiny sans" style="display:flex;flex-direction:column;align-items:center"><input type="checkbox" data-rd="${r.id}" data-i="${i}" ${r.days.includes(i) ? 'checked' : ''}>${n[0]}</label>`).join('')}</div></td>
    <td><input data-b="routines.#${r.id}.who" value="${esc(r.who || '')}" style="width:6rem"></td><td><input type="number" data-b="routines.#${r.id}.mins" value="${r.mins ?? ''}" style="width:4.5rem"></td>
    <td><button class="iconbtn" data-rdel="${r.id}" aria-label="Remove">✕</button></td></tr>`).join('');
  openModal(`<div class="mh"><h3>Daily care routines</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
   <div class="mb"><table class="t"><thead><tr><th>Routine</th><th>Days</th><th>Who</th><th>Min</th><th></th></tr></thead><tbody id="rtb">${rows()}</tbody></table>
   <button class="btn sm" id="radd" style="margin-top:.6rem">＋ Routine</button><p class="tiny muted sans">Minutes count toward weekly Capacity.</p></div><div class="mf"><button class="btn primary" data-act="close">Done</button></div>`, m => {
    const re = () => { $('#rtb', m).innerHTML = rows(); };
    m.addEventListener('change', e => { const c = e.target; if (c.dataset.rd) commit('routines', 'routine days', rs => { const r = rs.find(x => x.id === c.dataset.rd); const i = +c.dataset.i; r.days = c.checked ? [...new Set([...r.days, i])].sort() : r.days.filter(x => x !== i); }); });
    m.addEventListener('click', e => { const x = e.target.closest('[data-rdel]'); if (x) { commit('routines', 'remove routine', rs => rs.splice(rs.findIndex(r => r.id === x.dataset.rdel), 1)); re(); } });
    $('#radd', m).onclick = () => { commit('routines', 'add routine', rs => rs.push({ id: uid(), title: 'New routine', days: [0, 1, 2, 3, 4, 5, 6], who: '', mins: 15, done: {} })); re(); };
  });
}

/* ---------- actions ---------- */
Object.assign(ACT, {
  close: () => closeModal(),
  hideHint: () => commit('settings', 'hide hint', st => { st.hideConnectHint = true; }),
  toggleDraft: () => commit('settings', 'show/hide proposals', st => { st.showDraft = st.showDraft === false; }),
  keepDraftDay: () => commit('blocks', 'keep proposals', bl => bl.forEach(b => { if (b.date === R.date && b.status === 'proposed') { b.status = undefined; b.edited = true; } }), { toast: 'This day’s proposals are now your plan' }),
  clearDraftDay: () => commit('blocks', 'clear proposals', bl => { for (let i = bl.length - 1; i >= 0; i--) if (bl[i].date === R.date && bl[i].status === 'proposed' && !bl[i].edited && !bl[i].done) bl.splice(i, 1); }, { toast: 'Cleared this day’s untouched proposals' }),
  nav: el => go(el.dataset.v),
  pickDay: el => go(R.view === 'week' ? 'week' : 'today', el.dataset.d),
  weekNav: el => go(R.view, addDays(R.date, +el.dataset.n)),
  addBlock: () => openBlockEditor(null, { date: R.date, start: firstFreeSlot(R.date, 60), end: firstFreeSlot(R.date, 60) + 60 }),
  addTask: () => openTaskEditor(null),
  openBlock: el => openBlockActions(el.dataset.id),
  seeBlock: el => { const b = $(`.blk[data-blk="${el.dataset.id}"]`); if (b) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.focus({ preventScroll: true }); } },
  lateStart: () => openLateStart(),
  editRoutines: () => openRoutines(),
  taskEdit: el => openTaskEditor(el.dataset.id),
  taskFocus: el => commit('tasks', 'focus', ts => { const t = ts.find(x => x.id === el.dataset.id); t.focus = t.focus || {}; if (t.focus[R.date]) delete t.focus[R.date]; else t.focus[R.date] = true; }),
  taskDefer: el => commit('tasks', 'set aside', ts => { const t = ts.find(x => x.id === el.dataset.id); t.defer = t.defer || {}; t.defer[R.date] = true; }, { toast: 'Set aside for this day' }),
  taskBringBack: el => commit('tasks', 'bring back', ts => { const t = ts.find(x => x.id === el.dataset.id); delete t.defer[R.date]; }),
  taskDone: el => {
    const t = S.tasks.find(x => x.id === el.dataset.id); const was = t.done;
    commit('tasks', was ? 'reopen' : 'complete', ts => { const x = ts.find(y => y.id === t.id); x.done = !was; x.doneAt = was ? null : R.date; }, { toast: was ? 'Marked unfinished' : `Done: ${t.title}` });
    if (!was && t.blockId) { const b = S.blocks.find(x => x.id === t.blockId); if (b && !b.done) toast('Also mark its time block as done?', 'Yes', () => commit('blocks', 'block done', bl => { bl.find(x => x.id === b.id).done = true; })); }
  },
  taskSchedule: el => { const t = S.tasks.find(x => x.id === el.dataset.id); const dur = +t.mins || 30; const s = firstFreeSlot(R.date, dur); openBlockEditor(null, { title: t.title, date: R.date, start: s, end: Math.min(1440, s + dur), taskId: t.id }); },
  routineDone: el => commit('routines', 'routine check', rs => { const r = rs.find(x => x.id === el.dataset.id); r.done = r.done || {}; if (r.done[R.date]) delete r.done[R.date]; else r.done[R.date] = true; }),
});

/* ================= Today: at-a-glance, free time, quick actions ================= */
function dayWindow(d) {
  const st = S.settings, sf = fromHHMM(st.sleepFrom), stt = fromHHMM(st.sleepTo);
  let w0 = Math.max((+st.dayStart || 6) * 60, stt != null && sf != null && sf > stt ? stt : 0), w1 = Math.min((+st.dayEnd || 24) * 60, sf != null && sf > w0 ? sf : 1440);
  if (d === todayISO()) w0 = Math.max(w0, Math.ceil(nowMin() / 15) * 15);
  return [w0, w1];
}
/* gaps of 15+ minutes inside the waking window that no block covers */
function freeGaps(d, list = S.blocks) {
  const [w0, w1] = dayWindow(d); if (w1 <= w0) return [];
  const busy = dayBlocks(d, list).filter(b => !b.sleep).map(b => [b.start, b.end]).sort((a, b) => a[0] - b[0]);
  const out = []; let t = w0;
  for (const [s, e] of busy) { if (e <= t) continue; if (s > t) out.push([t, Math.min(s, w1)]); t = Math.max(t, e); if (t >= w1) break; }
  if (t < w1) out.push([t, w1]);
  return out.filter(([s, e]) => e - s >= 15);
}
function nowCard(d) {
  const t0 = todayISO(), bl = dayBlocks(d).filter(b => !b.sleep && catOf(b) !== 'sleep'), gaps = freeGaps(d), free = sum(gaps.map(([s, e]) => e - s));
  const big = gaps.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  const cf = conflictsOn(d).pairs.length, needs = bl.filter(b => b.status === 'needs').length, sugg = bl.filter(b => b.status === 'proposed').length;
  const decide = [cf ? `<button class="chip bad" data-act="seeOverlaps">${cf} overlap${cf > 1 ? 's' : ''}</button>` : '', needs ? `<span class="chip warn">${needs} to confirm</span>` : '', sugg ? `<span class="chip">${sugg} suggestion${sugg > 1 ? 's' : ''}</span>` : ''].filter(Boolean).join(' ');
  const freeTxt = free ? `${fmtDur(free)} ${d === t0 ? 'still open today' : 'open'}${big ? ` · longest ${fmtTimeShort(big[0])}–${fmtTimeShort(big[1])}` : ''}` : 'No open time left in the waking day';
  const blkBtn = b => `<button class="nc-b" data-act="openBlock" data-id="${b.id}"><span class="dot" style="background:${catColor(catOf(b))}"></span><span>${b.status && STATUS[b.status] ? `<span class="stb">${STATUS[b.status][1]}</span> ` : ''}${esc(b.title)}${b.kind !== 'flexible' ? ' 🔒' : ''}</span></button>`;
  let main = '';
  if (d === t0) {
    const n = nowMin(), cur = bl.filter(b => b.start <= n && n < b.end), next = bl.find(b => b.start > n);
    main = `<div class="nc-row"><span class="nc-k">Now</span><div class="nc-v">${cur.length ? cur.map(b => `${blkBtn(b)}<span class="tiny muted sans">until ${fmtTimeShort(b.end)}</span>`).join('') : '<span class="muted">Open time</span>'}</div></div>
      <div class="nc-row"><span class="nc-k">Next</span><div class="nc-v">${next ? `${blkBtn(next)}<span class="tiny muted sans">${fmtTimeShort(next.start)} · in ${fmtDur(next.start - n)}</span>` : '<span class="muted">Nothing else planned today</span>'}</div></div>`;
  } else if (bl.length) {
    main = `<div class="nc-row"><span class="nc-k">Starts</span><div class="nc-v">${blkBtn(bl[0])}<span class="tiny muted sans">${fmtTimeShort(bl[0].start)}</span></div></div>`;
  }
  const doneN = bl.filter(b => b.done).length;
  return `<div class="card nowcard">${main}
    <div class="nc-row"><span class="nc-k">Free</span><div class="nc-v small sans">${freeTxt}</div></div>
    <div class="nc-row"><span class="nc-k">Done</span><div class="nc-v small sans">${bl.length ? `${doneN} of ${bl.length} blocks` : 'Nothing planned yet'}${decide ? `<span class="nc-dec">${decide}</span>` : ''}</div></div>
  </div>`;
}
const LEGEND = `<div class="legend tiny sans" aria-label="What the block styles mean">
  <span><i class="lg lg-flex"></i>Flexible — can shift</span><span><i class="lg lg-lock">🔒</i>Fixed or protected — never moved for you</span>
  <span><i class="lg lg-prop"></i>Dashed = suggestion, not confirmed</span><span><i class="lg lg-done"></i>Faded = done</span><span><i class="lg lg-now"></i>Now</span></div>`;

function openBlockActions(id) {
  const b = S.blocks.find(x => x.id === id); if (!b) return;
  const st = b.status && STATUS[b.status], locked = b.kind !== 'flexible', tomorrow = addDays(b.date, 1);
  const kindTxt = { fixed: 'Fixed appointment — only moves if you move it', protected: 'Protected time — only moves if you move it', flexible: 'Flexible — can shift when the day changes' }[b.kind];
  openModal(`<div class="mh"><h3>${esc(b.title)}</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
  <div class="mb stack">
    <p class="small sans" style="margin:0">${fmtDate(b.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(b.start)}–${fmtTime(b.end)} · ${fmtDur(b.end - b.start)}</p>
    <p class="tiny muted sans" style="margin:0">${locked ? '🔒 ' : ''}${kindTxt}${st ? ` · ${st[0]}` : ''}${b.src === 'draft' ? ' · from the recovered draft' : ''}</p>
    ${b.notes ? `<p class="small" style="margin:0;white-space:pre-wrap">${esc(b.notes)}</p>` : ''}
    ${b.status === 'proposed' || b.status === 'needs' ? `<div class="card flat" style="padding:.6rem .8rem"><p class="small" style="margin:0 0 .5rem">This is ${b.status === 'proposed' ? 'a suggestion' : 'waiting for confirmation'} — it isn't part of your confirmed plan yet.</p><div class="row"><button class="btn primary sm" id="baKeep">✓ Keep it</button><button class="btn sm ghost" id="baDismiss">Dismiss suggestion</button></div></div>` : ''}
    <div class="actgrid">
      <button class="btn" id="baDone">${b.done ? '↺ Not done' : '✓ Done'}</button>
      <button class="btn" id="baEdit">✎ Edit details</button>
      <button class="btn" id="baEarlier" ${b.done ? 'disabled' : ''}>↑ 15 min earlier</button>
      <button class="btn" id="baLater" ${b.done ? 'disabled' : ''}>↓ 15 min later</button>
      <button class="btn" id="baTomorrow" ${b.done ? 'disabled' : ''}>→ Move to tomorrow</button>
      <button class="btn" id="baDup">⧉ Duplicate</button>
    </div>
    ${locked && !b.done ? '<p class="tiny muted sans" style="margin:0">Moving a locked block shows you a preview first, with a reminder to change the real booking too.</p>' : ''}
  </div>
  <div class="mf"><button class="btn danger" id="baDel">Delete</button><span class="grow"></span><button class="btn" data-act="close">Close</button></div>`, m => {
    const done = () => { closeModal(); commit('blocks', (b.done ? 'undo done ' : 'done ') + b.title, bl => { const o = bl.find(x => x.id === id); o.done = !o.done; if (o.src === 'draft') o.edited = true; }, { toast: b.done ? `“${b.title}” marked not done` : `Done: ${b.title}` }); };
    $('#baDone', m).onclick = done;
    $('#baEdit', m).onclick = () => { closeModal(); setTimeout(() => openBlockEditor(id), 30); };
    $('#baEarlier', m).onclick = () => { closeModal(); setTimeout(() => reviewMove(id, Math.max(0, b.start - 15)), 30); };
    $('#baLater', m).onclick = () => { closeModal(); setTimeout(() => reviewMove(id, Math.min(1440 - (b.end - b.start), b.start + 15)), 30); };
    $('#baTomorrow', m).onclick = () => { closeModal(); setTimeout(() => reviewMove(id, b.start, tomorrow), 30); };
    $('#baDup', m).onclick = () => { closeModal(); setTimeout(() => openBlockEditor(null, { ...b, title: b.title, date: b.date, start: b.end, end: Math.min(1440, b.end + (b.end - b.start)) }), 30); };
    const k = $('#baKeep', m); if (k) k.onclick = () => { closeModal(); commit('blocks', 'keep ' + b.title, bl => { const o = bl.find(x => x.id === id); o.status = 'confirmed'; o.edited = true; }, { toast: `Kept “${b.title}” in your plan` }); };
    const dm = $('#baDismiss', m); if (dm) dm.onclick = () => { closeModal(); commit('blocks', 'dismiss ' + b.title, bl => bl.splice(bl.findIndex(x => x.id === id), 1), { toast: `Dismissed “${b.title}”` }); };
    $('#baDel', m).onclick = async () => {
      if (locked || b.status === 'confirmed') { closeModal(); if (!(await confirmBox(`Delete “${b.title}” (${fmtTimeShort(b.start)}–${fmtTimeShort(b.end)}, ${locked ? 'locked' : 'confirmed'})? You can undo right after.`, 'Delete'))) return; }
      else closeModal();
      commit('blocks', 'remove ' + b.title, bl => bl.splice(bl.findIndex(x => x.id === id), 1), { toast: `Deleted “${b.title}”` });
    };
  });
}
function openAddSheet() {
  const d = R.date, gaps = freeGaps(d).slice(0, 4);
  openModal(`<div class="mh"><h3>Add to ${d === todayISO() ? 'today' : fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
  <div class="mb stack">
    <form id="addQ" class="stack" autocomplete="off"><label class="f">Type it the way you'd say it<input id="addQi" enterkeyhint="done" placeholder="Yoga 9–10am tomorrow · Call landlord · move Homework to 2pm"></label><button class="btn primary" style="align-self:start">Add</button></form>
    <div class="row"><button class="btn" id="addBlk">＋ Time block…</button><button class="btn" id="addTsk">＋ Next step…</button></div>
    ${gaps.length ? `<div><div class="tiny muted sans" style="margin-bottom:.35rem">Open time${d === todayISO() ? ' left today' : ''} — tap to fill it</div><div class="row">${gaps.map(([s, e]) => `<button class="btn sm" data-gs="${s}" data-ge="${Math.min(e, s + 60)}">${fmtTimeShort(s)}–${fmtTimeShort(e)}</button>`).join('')}</div></div>` : ''}
  </div>`, m => {
    $('#addQ', m).onsubmit = e => { e.preventDefault(); const v = $('#addQi', m).value.trim(); if (!v) return; closeModal(); quickAdd(v); };
    $('#addBlk', m).onclick = () => { closeModal(); setTimeout(() => ACT.addBlock(), 30); };
    $('#addTsk', m).onclick = () => { closeModal(); setTimeout(() => openTaskEditor(null), 30); };
    $$('[data-gs]', m).forEach(x => x.onclick = () => { closeModal(); setTimeout(() => openBlockEditor(null, { date: d, start: +x.dataset.gs, end: +x.dataset.ge }), 30); });
  });
}
Object.assign(ACT, {
  addMenu: () => openAddSheet(),
  seeOverlaps: () => { const o = $('#overlapCard'); if (o) o.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
});
