/* ================= shared list helpers ================= */
function getArr(path) { const { k, walk } = resolvePath(path + '.x'); const [o] = walk(S[k]); return o; }
function field(path, c, it) {
  const b = `data-b="${path}.#${it.id}.${c.f}" ${c.rerender ? 'data-rerender="1"' : ''} aria-label="${esc(c.label)}"`, v = it[c.f];
  if (c.type === 'select') return `<select ${b}>${c.opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (c.type === 'check') return `<input type="checkbox" ${b} ${v ? 'checked' : ''}>`;
  if (c.type === 'area') return `<textarea ${b} rows="2">${esc(v)}</textarea>`;
  return `<input ${c.type ? `type="${c.type}"` : ''} ${c.type === 'number' ? 'step="any"' : ''} ${b} value="${esc(v ?? '')}" ${c.ph ? `placeholder="${esc(c.ph)}"` : ''}>`;
}
function tableEditor({ path, cols, items, addLabel, newItem, empty, rowClass }) {
  items = items || getArr(path);
  return `<div style="overflow-x:auto"><table class="t cards"><thead><tr>${cols.map(c => `<th style="${c.w ? 'width:' + c.w : ''}">${esc(c.label)}</th>`).join('')}<th style="width:2rem"></th></tr></thead><tbody>
  ${items.length ? items.map(it => `<tr class="${rowClass ? rowClass(it) : ''}">${cols.map(c => `<td class="${c.type === 'number' ? 'num' : ''} ${c.type === 'area' || c.wide || /descr|title|name|item|note|what|detail|task|step/i.test(c.label) ? 'wide' : ''}" data-label="${esc(c.label)}">${c.render ? c.render(it) : field(path, c, it)}</td>`).join('')}<td><button class="iconbtn" data-act="delRow" data-path="${path}" data-id="${it.id}" aria-label="Remove">✕</button></td></tr>`).join('')
      : `<tr><td colspan="${cols.length + 1}"><div class="empty small" style="border:0">${esc(empty || 'Nothing here yet.')}</div></td></tr>`}
  </tbody></table></div>${addLabel ? `<button class="btn sm" style="margin-top:.6rem" data-act="addRow" data-path="${path}" data-new='${esc(JSON.stringify(newItem || {}))}'>＋ ${esc(addLabel)}</button>` : ''}`;
}
Object.assign(ACT, {
  addRow: el => { const k = el.dataset.path.split('.')[0]; const n = { id: uid(), ...JSON.parse(el.dataset.new || '{}') }; for (const [a, v] of Object.entries(n)) if (v === '@today') n[a] = R.date; commit(k, 'add', () => getArr(el.dataset.path).push(n)); const ins = $$(`[data-b^="${el.dataset.path}.#${n.id}."]`); ins[0] && ins[0].focus(); },
  delRow: el => { const k = el.dataset.path.split('.')[0]; commit(k, 'remove', () => { const a = getArr(el.dataset.path); a.splice(a.findIndex(x => x.id === el.dataset.id), 1); }, { toast: 'Removed' }); },
  tab: el => { R.tab[el.dataset.g] = el.dataset.v; render(); },
  toTask: el => { const t = { id: uid(), title: el.dataset.title, area: el.dataset.area || 'Today', status: 'Confirmed', date: R.date >= todayISO() ? R.date : todayISO(), notes: el.dataset.notes || '', mins: '', projectId: el.dataset.pid || undefined, order: -1 }; commit('tasks', 'add step', ts => ts.push(t), { toast: 'Added to your next steps' }); },
});
const tabs = (g, opts, def) => { const cur = R.tab[g] || def || opts[0][0]; return [cur, `<div class="tabs" role="group">${opts.map(([v, l]) => `<button aria-pressed="${cur === v}" data-act="tab" data-g="${g}" data-v="${v}">${l}</button>`).join('')}</div>`]; };
const people = () => S.settings.people.filter(Boolean);
const whoOpts = () => [...people(), 'Both', 'Not specified'];

/* ================= Week & month ================= */
const narrow = () => matchMedia('(max-width: 860px)').matches;
let wasNarrow = narrow(); window.addEventListener('resize', () => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); if (R.view === 'week' && !dlg().open) render(); } });
function agendaItems(x) {
  const bl = dayBlocks(x).filter(b => !b.sleep && catOf(b) !== 'sleep'), cf = conflictsOn(x).ids;
  return bl.map(b => `<button class="ag ${b.status === 'proposed' ? 'prop' : ''} ${b.done ? 'done' : ''}" data-act="openBlock" data-id="${b.id}">
      <span class="ag-t">${fmtTimeShort(b.start)}<br><span class="muted">${fmtTimeShort(b.end)}</span></span>
      <span class="ag-bar" style="background:${catColor(catOf(b))}"></span>
      <span class="ag-w">${b.status && STATUS[b.status] ? `<span class="stb">${STATUS[b.status][1]}</span> ` : ''}${esc(b.title)}${b.kind !== 'flexible' ? ' <span title="locked">🔒</span>' : ''}${cf.has(b.id) ? ' <span class="chip bad">overlap</span>' : ''}</span>
    </button>`).join('') || '<div class="muted small" style="padding:.4rem 0">Nothing planned.</div>';
}
function weekAgenda(d, days) {
  const showProp = !draftHidden();
  return `<div class="row between" style="margin-bottom:.6rem"><span class="small muted sans">${days.reduce((n, x) => n + dayBlocks(x).filter(b => !b.sleep).length, 0)} blocks this week</span>
      <button class="btn sm" data-act="toggleDraft">${showProp ? 'Hide' : 'Show'} draft suggestions</button></div>
    ${days.map(x => `<section class="agday ${x === todayISO() ? 'is-today' : ''}">
      <button class="agday-h" data-act="openDay" data-d="${x}"><span><b>${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow(x)]}</b> ${fmtDate(x, { month: 'short', day: 'numeric' })}${x === todayISO() ? ' · Today' : ''}</span><span class="muted small">Open ›</span></button>
      ${(S.daynotes[x] || {}).phase ? `<div class="tiny muted sans" style="margin:-.1rem 0 .3rem">${esc(S.daynotes[x].phase)}</div>` : ''}
      ${agendaItems(x)}</section>`).join('')}`;
}
function monthMobile(d, cells) {
  const sel = R.date;
  return `<div class="month m-small">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<div class="mh">${x}</div>`).join('')}${cells.map(x => {
      const bl = dayBlocks(x).filter(b => !b.sleep), major = bl.filter(b => b.kind !== 'flexible' || b.status === 'confirmed' || !b.status);
      return `<button class="mc ${monthKey(x) !== monthKey(d) ? 'out' : ''} ${x === sel ? 'sel' : ''} ${x === todayISO() ? 'today' : ''}" data-act="pickMonthDay" data-d="${x}"><span class="n">${+x.slice(8)}</span>
        <span class="dots">${major.slice(0, 4).map(b => `<i style="background:${catColor(catOf(b))}"></i>`).join('')}</span>${bl.length ? `<span class="cnt">${bl.length}</span>` : ''}</button>`; }).join('')}</div>
    <section class="agday" style="margin-top:.8rem"><button class="agday-h" data-act="openDay" data-d="${sel}"><span><b>${fmtDate(sel, { weekday: 'long', month: 'long', day: 'numeric' })}</b></span><span class="muted small">Open day ›</span></button>${agendaItems(sel)}</section>`;
}
VIEWS.week = () => {
  const d = R.date, ws = weekStart(d), days = [...Array(7)].map((_, i) => addDays(ws, i)), px = .7;
  const all = days.flatMap(x => dayBlocks(x)); const [r0, r1] = range(all);
  let grid = `<div class="wk" data-r0="${r0}" data-px="${px}"><div class="wh" style="cursor:default"></div>${days.map(x => `<div class="wh ${x === d ? 'sel' : ''}" data-act="openDay" data-d="${x}">${DOW[dow(x)]} ${+x.slice(8)}${x === todayISO() ? ' •' : ''}</div>`).join('')}`;
  grid += `<div class="gut" style="height:${(r1 - r0) * px}px">${[...Array((r1 - r0) / 60 + 1)].map((_, i) => `<span style="top:${i * 60 * px}px">${fmtTimeShort(r0 + i * 60)}</span>`).join('')}</div>`;
  for (const x of days) {
    const bl = dayBlocks(x), lay = laneLayout(bl), cf = conflictsOn(x).ids;
    grid += `<div class="col" data-date="${x}" style="height:${(r1 - r0) * px}px">${[...Array((r1 - r0) / 60)].map((_, i) => `<div class="hl" style="top:${i * 60 * px}px"></div>`).join('')}${bl.map(b => { const L = lay.get(b.id), w = 100 / L.n; return `<div class="blk ${b.kind} ${b.status ? 'st-' + b.status : ''} ${b.done ? 'done' : ''} ${cf.has(b.id) ? 'conflict' : ''}" data-wblk="${b.id}" title="${esc(b.title)} ${fmtTimeShort(b.start)}–${fmtTimeShort(b.end)}" style="--bc:${catColor(catOf(b))};top:${(b.start - r0) * px}px;height:${Math.max(12, (b.end - b.start) * px - 2)}px;left:calc(${L.lane * w}% + 2px);width:calc(${w}% - 4px);right:auto"><div class="bt">${esc(b.title)}</div></div>`; }).join('')}</div>`;
  }
  grid += '</div>';
  // month
  const m0 = d.slice(0, 8) + '01', gs = weekStart(m0), cells = [...Array(42)].map((_, i) => addDays(gs, i));
  const month = `<div class="month">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div class="mh">${x}</div>`).join('')}${cells.map(x => { const bl = dayBlocks(x), maj = bl.filter(b => b.kind !== 'flexible'); return `<div class="mc ${monthKey(x) !== monthKey(d) ? 'out' : ''} ${x === d ? 'sel' : ''} ${x === todayISO() ? 'today' : ''}" data-act="openDay" data-d="${x}"><span class="n">${+x.slice(8)}</span>${maj.slice(0, 2).map(b => `<div class="ev"><span class="dot" style="background:${catColor(catOf(b))}"></span>${esc(b.title)}</div>`).join('')}${bl.length > maj.slice(0, 2).length ? `<div class="muted">+${bl.length - maj.slice(0, 2).length} more</div>` : ''}</div>`; }).join('')}</div>`;
  if (narrow()) return `<div class="sec-head"><div><h2>${R.tab.wkview === 'month' ? 'Month' : 'Week of ' + fmtDate(ws, { month: 'short', day: 'numeric' })}</h2></div>
      <div class="row">${R.tab.wkview === 'month' ? `<button class="btn sm" data-act="pickMonthDay" data-d="${todayISO()}">Today</button>` : `<button class="btn sm" data-act="weekNav" data-n="-7" aria-label="Previous week">‹</button><button class="btn sm" data-act="pickDay" data-d="${todayISO()}">Today</button><button class="btn sm" data-act="weekNav" data-n="7" aria-label="Next week">›</button>`}</div></div>
    <div class="tabs" role="group"><button aria-pressed="${(R.tab.wkview || 'week') === 'week'}" data-act="tab" data-g="wkview" data-v="week">Week</button><button aria-pressed="${R.tab.wkview === 'month'}" data-act="tab" data-g="wkview" data-v="month">Month</button></div>
    ${R.tab.wkview === 'month' ? `<div class="row between" style="margin-bottom:.5rem"><button class="btn sm" data-act="monNav" data-n="-1">‹</button><b>${fmtDate(m0, { month: 'long', year: 'numeric' })}</b><button class="btn sm" data-act="monNav" data-n="1">›</button></div>${monthMobile(d, cells)}` : weekAgenda(d, days)}`;
  return `<div class="sec-head"><div><h2>Week of ${fmtDate(ws, { month: 'long', day: 'numeric' })}</h2><p class="sans small">Same plan as Today — tap a block to edit it, drag it (press and hold on a phone) to move it to another time or day.</p></div>
    <div class="row"><button class="btn" data-act="weekNav" data-n="-7">‹ Previous</button><button class="btn" data-act="pickDay" data-d="${todayISO()}">This week</button><button class="btn" data-act="weekNav" data-n="7">Next ›</button></div></div>
    ${grid}
    <div class="sec-head" style="margin-top:2rem"><h2>${fmtDate(m0, { month: 'long', year: 'numeric' })}</h2><div class="row"><button class="btn" data-act="monNav" data-n="-1">‹</button><button class="btn" data-act="monNav" data-n="1">›</button></div></div>
    ${month}<p class="tiny muted sans">Month cells show fixed and protected commitments first. A quiet cell isn't proof of a free day.</p>
    <div class="row" style="margin-top:1rem;gap:1rem">${Object.entries(CATS).map(([k, c]) => `<span class="small sans row" style="gap:.3rem"><span class="dot" style="background:${catColor(k)}"></span>${c.label}</span>`).join('')}</div>`;
};
VIEWS.week_after = () => { if (!narrow()) wireWeekDrag(); };
Object.assign(ACT, {
  openDay: el => go('today', el.dataset.d),
  monNav: el => { const [y, m] = R.date.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1 + +el.dataset.n, 1)); go('week', iso(dt)); },
  pickMonthDay: el => { R.date = el.dataset.d; render(); },
});

/* ================= Capacity ================= */
function capacityFor(ws) {
  const days = [...Array(7)].map((_, i) => addDays(ws, i)), c = S.capacity;
  const all = days.flatMap(x => S.blocks.filter(b => b.date === x)).filter(b => catOf(b) !== 'sleep' && !b.sleep);
  const bl = all.filter(b => b.status !== 'proposed'), draftH = sum(all.filter(b => b.status === 'proposed').map(b => b.end - b.start)) / 60;
  const hrs = f => sum(bl.filter(f).map(b => b.end - b.start)) / 60;
  const routineH = sum(S.routines.map(r => (r.mins || 0) * r.days.length)) / 60;
  const projH = sum(S.projects.map(p => +p.weekH || 0)), downH = sum(S.downsize.map(x => +x.weekH || 0));
  const wellH = sum(S.well.routines.filter(r => r.count).map(r => (+r.mins || 0) * (+r.perWeek || 0))) / 60;
  const targetsH = sum(c.targets.map(t => +t.hours || 0));
  const rows = [
    ['Sleep', (+c.sleepH || 0) * 7, 'sleep'], ['Meals & personal care', (+c.careH || 0) * 7, 'meals'], ['Transitions & buffers', (+c.bufferH || 0) * 7, 'travel'],
    ['Fixed appointments (dated)', hrs(b => b.kind === 'fixed'), 'appointments'], ['Protected time (dated)', hrs(b => b.kind === 'protected'), 'together'],
    ['Daily care routines', routineH, 'routine'], ['Project reservations', projH, 'focus'], ['Downsizing reservations', downH, 'other'], ['Well-being routines', wellH, 'exercise'], ['Flexible targets', targetsH, 'rest'],
  ];
  const used = sum(rows.map(r => r[1]));
  return { rows, used, free: 168 - used, flexSched: hrs(b => b.kind === 'flexible'), days, bl, draftH };
}
VIEWS.capacity = () => {
  const ws = weekStart(R.date), cap = capacityFor(ws), c = S.capacity, tw = S.together[ws] || { pri: [{}, {}, {}] };
  const pct = h => (h / 168 * 100).toFixed(2);
  const togetherH = sum(cap.bl.filter(b => catOf(b) === 'together').map(b => b.end - b.start)) / 60;
  const wi = c.whatIf || {};
  let whatIf = '';
  if (wi.on && wi.day != null && wi.start != null && wi.end != null) {
    const dd = addDays(ws, (+wi.day + 6) % 7), hits = dayBlocks(dd).filter(b => b.start < wi.end && wi.start < b.end);
    whatIf = `<div class="small" style="margin-top:.6rem">On ${fmtDate(dd)}, a ${fmtTimeShort(wi.start)}–${fmtTimeShort(wi.end)} shift (${fmtDur(wi.end - wi.start)}) ${hits.length ? `would overlap: <b>${hits.map(b => esc(b.title)).join(', ')}</b>` : 'has no overlaps with this week’s blocks'}. Weekly unallocated time would go from <b>${cap.free.toFixed(1)}h</b> to <b>${(cap.free - (wi.end - wi.start) / 60 - (+wi.travel || 0)).toFixed(1)}h</b>${wi.travel ? ` including ${wi.travel}h travel` : ''}. Nothing in your actual plan changes.</div>`;
  }
  return `<div class="sec-head"><div><h2>Capacity · week of ${fmtShort(ws)}</h2><p class="sans small">How much of the 168-hour week is already spoken for. The remainder is a planning estimate, not bookable free time.</p></div>
    <div class="row"><button class="btn" data-act="weekNav" data-n="-7">‹</button><button class="btn" data-act="pickDay" data-d="${todayISO()}">This week</button><button class="btn" data-act="weekNav" data-n="7">›</button></div></div>
  <div class="grid3" style="margin-bottom:1rem">
    <div class="stat"><div class="k">Accounted for</div><div class="v">${cap.used.toFixed(1)}h</div><div class="s">of 168h</div></div>
    <div class="stat"><div class="k">Unallocated</div><div class="v" style="color:${cap.free < 0 ? 'var(--bad)' : cap.free < 10 ? 'var(--warn)' : 'var(--good)'}">${cap.free.toFixed(1)}h</div><div class="s">${cap.free < 0 ? 'Over-committed — something has to give' : '≈ ' + (cap.free / 7).toFixed(1) + 'h a day'}</div></div>
    <div class="stat"><div class="k">Flexible blocks scheduled</div><div class="v">${cap.flexSched.toFixed(1)}h</div><div class="s">already placed${cap.draftH ? ` · ${cap.draftH.toFixed(1)}h of draft proposals not counted` : ''}</div></div>
  </div>
  <div class="card" style="margin-bottom:1rem">
    <div style="display:flex;height:28px;border-radius:8px;overflow:hidden;border:1px solid var(--line)" role="img" aria-label="Week breakdown">${cap.rows.filter(r => r[1] > 0).map(r => `<div title="${r[0]}: ${r[1].toFixed(1)}h" style="width:${pct(r[1])}%;background:${catColor(r[2])}"></div>`).join('')}${cap.free > 0 ? `<div style="flex:1;background:var(--bg2)" title="Unallocated"></div>` : ''}</div>
    <table class="t" style="margin-top:.8rem"><tbody>${cap.rows.map(r => `<tr><td><span class="dot" style="background:${catColor(r[2])}"></span> ${r[0]}</td><td class="num">${r[1].toFixed(1)}h</td></tr>`).join('')}<tr><td><b>Unallocated after reserves</b></td><td class="num"><b>${cap.free.toFixed(1)}h</b></td></tr></tbody></table>
  </div>
  <div class="grid2">
    <div class="card stack"><h3>Protect the basics</h3><div class="fgrid">
      <label class="f">Sleep h / night<input type="number" step=".25" data-b="capacity.sleepH" data-rerender="1" value="${c.sleepH}"></label>
      <label class="f">Meals & care h / day<input type="number" step=".25" data-b="capacity.careH" data-rerender="1" value="${c.careH}"></label>
      <label class="f">Buffers h / day<input type="number" step=".25" data-b="capacity.bufferH" data-rerender="1" value="${c.bufferH}"></label></div>
      <h3 style="margin-top:1rem">Flexible weekly targets</h3>
      ${tableEditor({ path: 'capacity.targets', cols: [{ f: 'name', label: 'Priority' }, { f: 'hours', label: 'h / week', type: 'number', w: '6rem', rerender: 1 }, { f: 'days', label: 'Preferred days', ph: 'e.g. Mon, Thu' }], addLabel: 'Target', newItem: { name: '', hours: '', days: '' }, empty: 'e.g. Dance practice · 4h · Mon, Thu' })}
      <p class="tiny muted sans">Count each effort once: if a project already reserves hours, don't add it again here.</p></div>
    <div class="card stack"><h3>This week together</h3>
      ${[0, 1, 2].map(i => { const p = (tw.pri || [])[i] || {}; return `<div class="row"><input type="checkbox" aria-label="Done" data-tw="${i}" data-f="done" ${p.done ? 'checked' : ''}><input class="grow" placeholder="Shared priority ${i + 1}" data-tw="${i}" data-f="text" value="${esc(p.text || '')}"><select data-tw="${i}" data-f="owner" aria-label="Owner"><option value="">Unassigned</option>${[...people(), 'Both'].map(o => `<option ${p.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`; }).join('')}
      <div class="row between small sans" style="margin-top:.6rem"><span>Couple time this week: <b>${togetherH.toFixed(1)}h</b>${c.togetherTarget ? ` of ${c.togetherTarget}h target` : ''}</span><label class="row">Target h<input type="number" step=".5" style="width:4.5rem" data-b="capacity.togetherTarget" data-rerender="1" value="${c.togetherTarget ?? ''}"></label></div>
      ${c.togetherTarget ? `<div class="bar"><i style="width:${Math.min(100, togetherH / c.togetherTarget * 100)}%;background:var(--c-together)"></i></div>` : ''}
      <button class="btn sm" data-act="addTogether">＋ Protected couple-time block</button></div>
    <div class="card stack"><h3>By day</h3>${cap.days.map(x => { const h = sum(dayBlocks(x).filter(b => catOf(b) !== 'sleep').map(b => b.end - b.start)) / 60, wake = 24 - (+c.sleepH || 0) - (+c.careH || 0); return `<div class="row small sans" style="gap:.6rem"><span style="width:2.5rem">${DOW[dow(x)]}</span><div class="bar grow"><i style="width:${Math.min(100, h / wake * 100)}%"></i></div><span style="width:6.5rem;text-align:right">${h.toFixed(1)}h of ~${wake.toFixed(0)}h</span></div>`; }).join('')}</div>
    <div class="card stack"><h3>Job schedule · what-if</h3>
      <label class="row small sans"><input type="checkbox" data-b="capacity.whatIf.on" data-rerender="1" ${wi.on ? 'checked' : ''}> Compare a possible weekly shift</label>
      ${wi.on ? `<div class="fgrid"><label class="f">Weekday<select data-b="capacity.whatIf.day" data-t="num" data-rerender="1">${DOW.map((n, i) => `<option value="${i}" ${+wi.day === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="f">Start<input type="time" data-t="time" data-b="capacity.whatIf.start" data-rerender="1" value="${hhmm(wi.start)}"></label><label class="f">End<input type="time" data-t="time" data-b="capacity.whatIf.end" data-rerender="1" value="${hhmm(wi.end)}"></label>
      <label class="f">Round-trip travel h<input type="number" step=".25" data-b="capacity.whatIf.travel" data-rerender="1" value="${wi.travel ?? ''}"></label></div>${whatIf}` : ''}</div>
  </div>`;
};
VIEWS.capacity_after = () => {
  $$('[data-tw]').forEach(el => el.addEventListener('change', () => {
    const ws = weekStart(R.date), i = +el.dataset.tw, f = el.dataset.f, v = el.type === 'checkbox' ? el.checked : el.value;
    commit('together', 'together', tg => { tg[ws] = tg[ws] || { pri: [{}, {}, {}] }; tg[ws].pri[i] = { ...(tg[ws].pri[i] || {}), [f]: v }; }, { render: el.type === 'checkbox' });
  }));
  if (!S.capacity.whatIf) S.capacity.whatIf = {};
};
ACT.addTogether = () => openBlockEditor(null, { title: 'Together time', date: R.date, start: 18 * 60, end: 20 * 60, kind: 'protected', cat: 'together' });

/* ================= Money ================= */
function entryAmt(e) { const a = e.settled && e.actual !== '' && e.actual != null ? +e.actual : e.est !== '' && e.est != null ? +e.est : (e.actual !== '' && e.actual != null ? +e.actual : null); return a == null ? null : (e.type === 'expense' ? -a : a); }
function entryFlags(e) { const f = []; if (!e.date) f.push('no date'); if ((e.est === '' || e.est == null) && (e.actual === '' || e.actual == null)) f.push('no amount'); if (e.settled && (e.actual === '' || e.actual == null)) f.push(e.type === 'income' ? 'received but no actual' : 'paid but no actual'); return f; }
VIEWS.money = () => {
  const mk = S.money.month || monthKey(R.date); const M = S.money;
  const inMonth = M.entries.filter(e => e.date && monthKey(e.date) === mk).sort((a, b) => a.date.localeCompare(b.date));
  const undated = M.entries.filter(e => !e.date);
  const est = t => sum(inMonth.filter(e => e.type === t).map(e => Math.abs(entryAmt(e) ?? 0)));
  const settled = t => sum(inMonth.filter(e => e.type === t && e.settled).map(e => +e.actual || 0));
  const open = M.openings[mk];
  let run = open && open.amount !== '' && open.amount != null ? +open.amount : null, unknownFrom = null;
  const flow = inMonth.map(e => { const a = entryAmt(e); if (a == null && run != null) { unknownFrom = unknownFrom || e; run = null; } else if (run != null) run += a; return { e, a, run }; });
  const ref = M.reference.filter(r => r.month === mk);
  const [tab, tabsH] = tabs('money', [['ledger', 'Ledger'], ['flow', 'Cash flow'], ['budget', 'Reference budget'], ['funds', 'Funds'], ['rates', 'Rates']]);
  const cols = [
    { f: 'type', label: 'Type', type: 'select', opts: ['income', 'expense'], w: '8.5rem', rerender: 1 }, { f: 'desc', label: 'Description' }, { f: 'cat', label: 'Category', w: '9rem' },
    { f: 'date', label: 'Date', type: 'date', w: '9.5rem', rerender: 1 }, { f: 'est', label: 'Estimate', type: 'number', w: '7rem', rerender: 1 }, { f: 'actual', label: 'Actual', type: 'number', w: '7rem', rerender: 1 },
    { f: 'settled', label: 'Received / paid', type: 'check', w: '6rem', rerender: 1 },
  ];
  let body = '';
  if (tab === 'ledger') body = `<div class="card">${tableEditor({ path: 'money.entries', cols, items: inMonth, addLabel: 'Entry', newItem: { type: 'expense', desc: '', cat: '', date: mk + '-01', est: '', actual: '', settled: false }, empty: 'No dated entries this month.', rowClass: e => entryFlags(e).length ? 'flag' : '' })}
      <div class="row" style="margin-top:.6rem">${M.presets.map(p => `<button class="btn sm ghost" data-act="preset" data-id="${p.id}">＋ ${esc(p.name)}${p.amount !== '' ? ' · ' + money(p.amount) : ''}</button>`).join('')}</div>
      <p class="tiny muted sans">Rate buttons create an undated, unreceived estimate — not a booking, not income yet.</p></div>
      ${undated.length || inMonth.some(e => entryFlags(e).length) ? `<div class="card" style="margin-top:1rem;border-color:color-mix(in srgb,var(--warn) 45%,var(--line))"><h3>Needs details</h3>
      ${tableEditor({ path: 'money.entries', cols, items: [...undated, ...inMonth.filter(e => entryFlags(e).length && e.date)], empty: '' })}
      <p class="tiny muted sans">${[...undated, ...inMonth].filter(e => entryFlags(e).length).map(e => `${esc(e.desc || '(untitled)')}: ${entryFlags(e).join(', ')}`).join(' · ')}</p></div>` : ''}`;
  if (tab === 'flow') body = `<div class="card"><div class="row" style="margin-bottom:.6rem"><label class="f">Opening balance for ${fmtDate(mk + '-01', { month: 'long', year: 'numeric' })}<input type="number" step="any" id="openBal" value="${open ? open.amount : ''}" placeholder="unknown"></label><span class="tiny muted sans" style="max-width:28rem">Belongs to this month only. Unknown is not zero. Received/paid entries use the actual amount; everything else uses the estimate.</span></div>
      <table class="t"><thead><tr><th>Date</th><th>Entry</th><th class="num">Amount</th><th class="num">Running estimate</th></tr></thead><tbody>${flow.map(({ e, a, run }) => `<tr><td>${fmtShort(e.date)}</td><td>${esc(e.desc || '(untitled)')} ${e.settled ? '<span class="chip good">' + (e.type === 'income' ? 'received' : 'paid') + '</span>' : '<span class="chip">expected</span>'}</td><td class="num" style="color:${a > 0 ? 'var(--good)' : 'inherit'}">${a == null ? '?' : money(a)}</td><td class="num">${run == null ? '<span class="muted">unknown</span>' : money(run)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty small" style="border:0">No dated entries.</div></td></tr>'}</tbody></table>
      ${unknownFrom ? `<p class="tiny sans" style="color:var(--warn)">The running estimate becomes unknown at “${esc(unknownFrom.desc)}” because it has no amount.</p>` : ''}${run == null && !unknownFrom ? '<p class="tiny muted sans">Add an opening balance to see a running projection.</p>' : ''}</div>`;
  if (tab === 'budget') body = `<div class="card">${tableEditor({ path: 'money.reference', items: ref, cols: [{ f: 'kind', label: 'Type', type: 'select', opts: ['expense', 'income'], w: '7rem', rerender: 1 }, { f: 'label', label: 'Source line' }, { f: 'cat', label: 'Category', w: '9rem', rerender: 1 }, { f: 'amount', label: 'Amount', type: 'number', w: '8rem', rerender: 1 }, { f: 'q', label: 'Open question' }], addLabel: 'Source line', newItem: { month: mk, kind: 'expense', label: '', cat: '', amount: '', q: '' }, empty: 'No reference budget for this month.' })}
      ${ref.length ? `<p class="small sans">Source expenses: <b>${money(sum(ref.filter(r => r.kind === 'expense').map(r => r.amount)))}</b> · source income: <b>${money(sum(ref.filter(r => r.kind === 'income').map(r => r.amount)))}</b> · ledger expenses this month: <b>${money(est('expense'))}</b></p>` : ''}
      <p class="tiny muted sans">The reference budget is what a plan says; it never becomes ledger entries by itself. ${mk === '2026-10' ? 'The recovery archive only kept October’s totals (13 expense lines summing to $3,995, or $4,395 in the alternate utilities reading), not the lines — re-enter them here if you want the comparison.' : ''}</p></div>`;
  if (tab === 'funds') body = `<div class="grid3">${M.funds.map(f => { const rem = (+f.target || 0) - (+f.saved || 0), months = f.date ? Math.max(1, Math.ceil(daysBetween(todayISO(), f.date) / 30.4)) : null; return `<div class="card stack"><div class="row between"><input data-b="money.funds.#${f.id}.name" value="${esc(f.name)}" style="font-weight:600"><button class="iconbtn" data-act="delRow" data-path="money.funds" data-id="${f.id}" aria-label="Remove fund">✕</button></div>
      <div class="fgrid"><label class="f">Target<input type="number" data-b="money.funds.#${f.id}.target" data-rerender="1" value="${f.target}"></label><label class="f">Set aside<input type="number" data-b="money.funds.#${f.id}.saved" data-rerender="1" value="${f.saved}"></label><label class="f">By<input type="date" data-b="money.funds.#${f.id}.date" data-rerender="1" value="${f.date}"></label></div>
      ${f.target ? `<div class="bar"><i style="width:${Math.min(100, (+f.saved || 0) / f.target * 100)}%;background:var(--good)"></i></div><div class="small sans">${rem > 0 ? `${money(rem)} to go${months ? ` · about ${money(Math.ceil(rem / months))}/month` : ''}` : 'Fully funded ✓'}</div>` : '<div class="tiny muted sans">Set a target to track progress.</div>'}</div>`; }).join('')}
      <div class="card flat"><button class="btn" data-act="addRow" data-path="money.funds" data-new='{"name":"New fund","target":"","saved":"","date":""}'>＋ Fund</button><p class="tiny muted sans">Money set aside here isn't deducted from cash flow automatically.</p></div></div>`;
  if (tab === 'rates') body = `<div class="card">${tableEditor({ path: 'money.presets', cols: [{ f: 'name', label: 'Rate' }, { f: 'type', label: 'Type', type: 'select', opts: ['income', 'expense'], w: '7rem' }, { f: 'cat', label: 'Category', w: '9rem' }, { f: 'amount', label: 'Amount', type: 'number', w: '8rem', ph: 'confirm first' }], addLabel: 'Rate', newItem: { name: '', type: 'income', cat: '', amount: '' } })}<p class="tiny muted sans">Massage amounts are gross before expenses. The Thursday pay basis and tax treatment weren't confirmed in the archive.</p></div>`;
  return `<div class="sec-head"><div><h2>Money</h2><p class="sans small">Your own ledger, kept apart from source budgets and projections. No bank feed — every number here was entered by a person.</p></div>
    <label class="f">Planning month<input type="month" id="mMonth" value="${mk}"></label></div>
    <div class="grid3" style="margin-bottom:1rem">
      <div class="stat"><div class="k">Expected in</div><div class="v" style="color:var(--good)">${money(est('income'), '$0')}</div><div class="s">${money(settled('income'), '$0')} received</div></div>
      <div class="stat"><div class="k">Expected out</div><div class="v">${money(est('expense'), '$0')}</div><div class="s">${money(settled('expense'), '$0')} paid</div></div>
      <div class="stat"><div class="k">Estimated net</div><div class="v" style="color:${est('income') - est('expense') < 0 ? 'var(--bad)' : 'var(--ink)'}">${money(est('income') - est('expense'), '$0')}</div><div class="s">${run != null ? 'month-end ≈ ' + money(run) : 'add opening balance for month-end'}</div></div>
    </div>${tabsH}${body}`;
};
VIEWS.money_after = () => {
  const mm = $('#mMonth'); if (mm) mm.onchange = () => commit('money', 'month', M => { M.month = mm.value; });
  const ob = $('#openBal'); if (ob) ob.onchange = () => commit('money', 'opening balance', M => { const mk = M.month || monthKey(R.date); M.openings[mk] = { amount: ob.value === '' ? '' : +ob.value }; });
};
ACT.preset = el => { const p = S.money.presets.find(x => x.id === el.dataset.id); commit('money', 'add ' + p.name, M => M.entries.push({ id: uid(), type: p.type, desc: p.name, cat: p.cat, date: '', est: p.amount, actual: '', settled: false }), { toast: 'Added to “Needs details” — give it a date' }); };

/* ================= Projects ================= */
const PSTATUS = ['Idea', 'Planning', 'In progress', 'Waiting', 'Paused', 'Done'];
VIEWS.projects = () => {
  const [tab, tabsH] = tabs('proj', [['projects', 'Projects'], ['content', 'Glimmer content studio']]);
  if (tab === 'content') return `<div class="sec-head"><div><h2>Content studio</h2><p class="sans small">Draft → review → approved → posted by hand. Nothing here publishes anywhere.</p></div><button class="btn primary" data-act="addContent">＋ Idea</button></div>${tabsH}
    <div class="kan">${['Draft', 'Review', 'Approved', 'Posted'].map((st, si) => `<div class="col"><h4>${st} · ${S.content.filter(c => c.status === st).length}</h4>${S.content.filter(c => c.status === st).map(c => `<div class="kc stack">
      <input data-b="content.#${c.id}.title" value="${esc(c.title)}" placeholder="Title" style="width:100%;font-weight:600">
      <div class="row"><select data-b="content.#${c.id}.format" aria-label="Format">${['Reel', 'Post', 'Story', 'Carousel', 'Event listing', 'Email', 'Flyer'].map(o => `<option ${c.format === o ? 'selected' : ''}>${o}</option>`).join('')}</select><input type="date" data-b="content.#${c.id}.date" value="${c.date || ''}" aria-label="Planned date"></div>
      <textarea data-b="content.#${c.id}.caption" rows="3" placeholder="Caption / brief">${esc(c.caption || '')}</textarea>
      <div class="row between"><span>${si ? `<button class="btn sm ghost" data-act="cMove" data-id="${c.id}" data-n="-1">‹</button>` : ''}${si < 3 ? `<button class="btn sm ghost" data-act="cMove" data-id="${c.id}" data-n="1">${['Send for review', 'Approve', 'Mark posted'][si]} ›</button>` : ''}</span>
      <span><button class="iconbtn" data-act="cCopy" data-id="${c.id}" title="Copy caption">⧉</button><button class="iconbtn" data-act="delRow" data-path="content" data-id="${c.id}" aria-label="Remove">✕</button></span></div></div>`).join('') || '<div class="tiny muted sans">—</div>'}</div>`).join('')}</div>`;
  return `<div class="sec-head"><div><h2>Projects</h2><p class="sans small">Deliverables, effort, this week's reserved hours, and reviewable next steps.</p></div><button class="btn primary" data-act="addProject">＋ Project</button></div>${tabsH}
   <div class="stack">${S.projects.map(p => { const steps = S.tasks.filter(t => t.projectId === p.id), dn = steps.filter(t => t.done).length, dl = p.deadline ? daysBetween(todayISO(), p.deadline) : null; return `<details class="disc" ${R.tab['p_' + p.id] !== 'closed' ? 'open' : ''}><summary><span>${esc(p.name)} <span class="chip">${esc(p.status)}</span> ${dl != null ? `<span class="chip ${dl < 0 ? 'bad' : dl < 14 ? 'warn' : ''}">${dl < 0 ? Math.abs(dl) + ' days past' : dl + ' days left'}</span>` : ''} ${steps.length ? `<span class="chip good">${dn}/${steps.length} steps</span>` : ''}</span></summary><div class="in stack">
     <div class="fgrid"><label class="f">Name<input data-b="projects.#${p.id}.name" data-rerender="1" value="${esc(p.name)}"></label><label class="f">Area<input data-b="projects.#${p.id}.area" value="${esc(p.area)}"></label>
       <label class="f">Status<select data-b="projects.#${p.id}.status" data-rerender="1">${PSTATUS.map(s => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="f">Deadline<input type="date" data-b="projects.#${p.id}.deadline" data-rerender="1" value="${p.deadline || ''}"></label>
       <label class="f">Total effort h<input type="number" data-b="projects.#${p.id}.effortH" value="${p.effortH}"></label><label class="f">Reserve this week h<input type="number" data-b="projects.#${p.id}.weekH" value="${p.weekH}"></label></div>
     <label class="f">Deliverables<textarea data-b="projects.#${p.id}.deliverables" rows="2">${esc(p.deliverables)}</textarea></label>
     <div class="row"><label class="f grow">Next action<input data-b="projects.#${p.id}.next" value="${esc(p.next)}"></label>${p.next ? `<button class="btn sm" style="align-self:end" data-act="toTask" data-title="${esc(p.next)}" data-pid="${p.id}" data-area="${AREAS.includes(p.area) ? esc(p.area) : 'Life admin'}">→ Next steps</button>` : ''}</div>
     <label class="f">Notes / brain-dump<textarea data-b="projects.#${p.id}.notes" rows="3" placeholder="Paste a plan, one idea per line, then turn it into steps">${esc(p.notes)}</textarea></label>
     <div class="row"><button class="btn sm" data-act="reviewSteps" data-id="${p.id}">Review notes into steps…</button><span class="grow"></span><button class="btn sm danger" data-act="delProject" data-id="${p.id}">Remove project</button></div>
     ${steps.length ? `<div>${steps.map(t => `<div class="row small" style="padding:.2rem 0"><button class="iconbtn" data-act="taskDone" data-id="${t.id}">${t.done ? '✅' : '◻️'}</button><span class="grow" style="${t.done ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.title)}</span>${t.mins ? `<span class="tiny muted">${fmtDur(t.mins)}</span>` : ''}<button class="iconbtn" data-act="taskEdit" data-id="${t.id}">✎</button></div>`).join('')}</div>` : ''}
   </div></details>`; }).join('') || '<div class="empty">No projects yet.</div>'}</div>`;
};
Object.assign(ACT, {
  addProject: () => commit('projects', 'add project', ps => ps.unshift({ id: uid(), name: 'New project', area: '', deadline: '', status: 'Idea', next: '', effortH: '', weekH: '', deliverables: '', notes: '', steps: [] })),
  delProject: async el => { if (await confirmBox('Remove this project? Its next steps stay in your list.')) commit('projects', 'remove project', ps => ps.splice(ps.findIndex(p => p.id === el.dataset.id), 1), { toast: 'Project removed' }); },
  addContent: () => commit('content', 'add idea', cs => cs.push({ id: uid(), title: '', format: 'Post', status: 'Draft', date: '', caption: '' })),
  cMove: el => commit('content', 'move card', cs => { const c = cs.find(x => x.id === el.dataset.id); const L = ['Draft', 'Review', 'Approved', 'Posted']; c.status = L[clamp(L.indexOf(c.status) + +el.dataset.n, 0, 3)]; }),
  cCopy: el => { const c = S.content.find(x => x.id === el.dataset.id); navigator.clipboard?.writeText(c.caption || '').then(() => toast('Caption copied — check placeholders before posting'), () => toast('Copy not allowed here')); },
  reviewSteps: el => {
    const p = S.projects.find(x => x.id === el.dataset.id);
    const ta = $(`[data-b="projects.#${p.id}.notes"]`); if (ta && ta.value !== p.notes) { p.notes = ta.value; markDirty('projects'); }
    if (!p.notes.trim()) return toast('Write or paste some notes first');
    const lines = p.notes.split(/\n|(?<=\.)\s+(?=[A-Z])/).map(s => s.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(s => s.length > 2);
    openModal(`<div class="mh"><h3>Turn notes into steps</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div><div class="mb"><p class="small muted">Edit, untick, or add. Only ticked steps join your next steps — they don't inherit the deadline or reserve time.</p>
      <div id="rsl">${lines.map((l, i) => `<div class="row" style="margin:.3rem 0"><input type="checkbox" checked data-i="${i}"><input class="grow" value="${esc(l)}" data-l="${i}"><input type="number" placeholder="min" style="width:4.5rem" data-m="${i}"></div>`).join('')}</div>
      <button class="btn sm" id="rsAdd">＋ Another step</button></div><div class="mf"><button class="btn" data-act="close">Cancel</button><button class="btn primary" id="rsOk">Accept reviewed steps</button></div>`, m => {
      let n = lines.length; $('#rsAdd', m).onclick = () => { $('#rsl', m).insertAdjacentHTML('beforeend', `<div class="row" style="margin:.3rem 0"><input type="checkbox" checked data-i="${n}"><input class="grow" data-l="${n}"><input type="number" placeholder="min" style="width:4.5rem" data-m="${n}"></div>`); n++; };
      $('#rsOk', m).onclick = () => {
        const add = $$('[data-i]', m).filter(c => c.checked).map(c => ({ title: $(`[data-l="${c.dataset.i}"]`, m).value.trim(), mins: $(`[data-m="${c.dataset.i}"]`, m).value })).filter(x => x.title);
        closeModal(); commit('tasks', 'accept steps', ts => add.forEach((a, i) => ts.push({ id: uid(), title: a.title, mins: a.mins === '' ? '' : +a.mins, area: AREAS.includes(p.area) ? p.area : 'Life admin', status: 'Confirmed', date: null, projectId: p.id, notes: '', order: 1000 + i })), { toast: `${add.length} step${add.length === 1 ? '' : 's'} added` });
      };
    });
  },
});

/* ================= Move & downsizing ================= */
const DECISIONS = ['Undecided', 'Keep', 'Sell', 'Donate', 'Discard'], DSTATUS = ['Not started', 'Sorting', 'Ready to leave', 'Gone', 'Packed'];
VIEWS.move = () => {
  const [tab, tabsH] = tabs('move', [['plan', 'Transition plan'], ['down', 'Downsizing'], ['pack', 'Packing order'], ['roles', 'Income directions']]);
  const mv = S.move; let body = '';
  if (tab === 'plan') body = `<div class="card" style="margin-bottom:1rem"><label class="f">Move timing<input data-b="move.when" value="${esc(mv.when)}"></label></div><div class="grid3">${mv.phases.map((ph, pi) => `<div class="card stack"><div class="tiny muted sans">PHASE ${pi + 1}</div><h3>${esc(ph.name)}</h3>
     ${ph.items.map(it => { const t = it.taskId && S.tasks.find(x => x.id === it.taskId); return `<div class="row small"><input type="checkbox" data-b="move.phases#${ph.id}.items#${it.id}.done" data-rerender="1" ${it.done || (t && t.done) ? 'checked' : ''} aria-label="Done"><input class="grow" data-b="move.phases#${ph.id}.items#${it.id}.title" value="${esc(it.title)}">${t ? '<span class="chip good" title="In your next steps">in plan</span>' : `<button class="iconbtn" title="Add to my plan" data-act="msTask" data-ph="${ph.id}" data-id="${it.id}">→</button>`}<button class="iconbtn" data-act="delRow" data-path="move.phases#${ph.id}.items" data-id="${it.id}" aria-label="Remove">✕</button></div>`; }).join('') || '<div class="tiny muted sans">No milestones yet.</div>'}
     <button class="btn sm ghost" data-act="addRow" data-path="move.phases#${ph.id}.items" data-new='{"title":"","done":false}'>＋ Milestone</button></div>`).join('')}</div>
     <p class="tiny muted sans">The archive kept the three phases but not the twelve milestone titles — add yours here. Adding one to your plan creates a next step; it doesn't sign, book or contact anything.</p>`;
  if (tab === 'down') {
    const exp = sum(S.downsize.map(x => +x.expected || 0)), rec = sum(S.downsize.map(x => +x.received || 0)), gone = S.downsize.filter(x => x.status === 'Gone' || x.status === 'Packed').length;
    body = `<div class="grid3" style="margin-bottom:1rem"><div class="stat"><div class="k">Batches</div><div class="v">${S.downsize.length}</div><div class="s">${gone} gone or packed</div></div><div class="stat"><div class="k">Expected proceeds</div><div class="v">${money(exp, '$0')}</div></div><div class="stat"><div class="k">Actually received</div><div class="v" style="color:var(--good)">${money(rec, '$0')}</div></div></div>
    <div class="card">${tableEditor({ path: 'downsize', cols: [{ f: 'space', label: 'Space', w: '8rem' }, { f: 'desc', label: 'What' }, { f: 'decision', label: 'Decision', type: 'select', opts: DECISIONS, w: '7.5rem' }, { f: 'status', label: 'Status', type: 'select', opts: DSTATUS, w: '8.5rem', rerender: 1 }, { f: 'expected', label: 'Expected $', type: 'number', w: '6rem', rerender: 1 }, { f: 'received', label: 'Received $', type: 'number', w: '6rem', rerender: 1 }, { f: 'weekH', label: 'h this wk', type: 'number', w: '5rem' }, { f: 'target', label: 'By', type: 'date', w: '9rem' }, { f: 'next', label: 'Next action' }], addLabel: 'Batch', newItem: { space: '', desc: '', decision: 'Undecided', status: 'Not started', expected: '', received: '', weekH: '', target: '', next: '' }, empty: 'Start with one small space — a drawer, a shelf, one box.' })}
    <p class="tiny muted sans">Choosing “Sell” or “Gone” doesn't sell anything. When a Sell batch is marked Gone with a received amount, you'll be offered a Money entry to confirm.</p></div>
    <details class="disc" style="margin-top:1rem"><summary>A gentle sorting guide</summary><div class="in small"><p>Pick one small space and a short session (20–30 minutes). Give everything a destination before you start: keep, sell, donate, discard, or “decide later” — a box with a date on it.</p><p>Hard decisions: photograph sentimental items, keep the best one of a set, and park anything you're stuck on in “Undecided” instead of forcing it.</p><p>Safe stopping points: bag and label what's sorted, put the Undecided box back, and write the next action in the batch before you stop. Check local acceptance rules before a donation or recycling run.</p></div></details>`;
  }
  if (tab === 'pack') body = `<div class="card stack">${mv.packing.map((p, i) => `<div class="row"><span class="chip">${i + 1}</span><input type="checkbox" data-b="move.packing#${p.id}.done" ${p.done ? 'checked' : ''} aria-label="Done"><b class="grow">${esc(p.title)}</b><input data-b="move.packing#${p.id}.notes" value="${esc(p.notes)}" placeholder="notes" style="flex:1"></div>`).join('')}<p class="tiny muted sans">Relative phases, not deadlines — the move month isn't settled. Protect the next workday: pack the work kit last and unpack it first.</p></div>`;
  if (tab === 'roles') body = `<div class="stack">${mv.roles.map((r, i) => `<div class="card row" style="align-items:flex-start"><div class="stack" style="gap:.2rem"><button class="iconbtn" data-act="roleMv" data-i="${i}" data-n="-1" aria-label="Move up" ${i ? '' : 'disabled'}>▲</button><button class="iconbtn" data-act="roleMv" data-i="${i}" data-n="1" aria-label="Move down" ${i < mv.roles.length - 1 ? '' : 'disabled'}>▼</button></div>
     <div class="grow stack"><div class="row"><input data-b="move.roles#${r.id}.title" value="${esc(r.title)}" class="grow" style="font-weight:600"><select data-b="move.roles#${r.id}.status">${['Proposal', 'Discussing', 'Agreed', 'Paused', 'Dropped'].map(s => `<option ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><textarea data-b="move.roles#${r.id}.notes" rows="2">${esc(r.notes)}</textarea></div></div>`).join('')}
     <button class="btn sm" data-act="addRow" data-path="move.roles" data-new='{"title":"New direction","notes":"","status":"Proposal"}'>＋ Direction</button><p class="tiny muted sans">Order is your own priority. “Agreed” is a label you set — the planner doesn't treat anything as a signed agreement.</p></div>`;
  return `<div class="sec-head"><div><h2>Move & downsizing</h2><p class="sans small">Moving with continuity of work: milestones, possessions, packing order and income directions.</p></div></div>${tabsH}${body}`;
};
Object.assign(ACT, {
  msTask: el => { const ph = S.move.phases.find(p => p.id === el.dataset.ph), it = ph.items.find(i => i.id === el.dataset.id); if (!it.title) return toast('Give the milestone a title first'); const t = { id: uid(), title: it.title, area: 'Move', status: 'Confirmed', date: null, notes: 'From move plan: ' + ph.name, mins: '', order: 500 }; commit('tasks', 'add milestone', ts => ts.push(t)); commit('move', 'link', m => { m.phases.find(p => p.id === ph.id).items.find(i => i.id === it.id).taskId = t.id; }, { toast: 'Added to your next steps' }); },
  roleMv: el => commit('move', 'reorder', m => { const i = +el.dataset.i, j = i + +el.dataset.n; [m.roles[i], m.roles[j]] = [m.roles[j], m.roles[i]]; }),
});
/* follow-through: a Sell batch marked Gone with money received → offer a Money entry */
document.addEventListener('change', e => {
  const b = e.target.dataset && e.target.dataset.b; if (!b || !/^downsize\.#/.test(b) || !/\.(status|received)$/.test(b)) return;
  setTimeout(() => {
    const id = b.split('#')[1].split('.')[0], x = S.downsize.find(y => y.id === id);
    if (x && x.decision === 'Sell' && x.status === 'Gone' && +x.received > 0 && !x.offered) {
      S.downsize.find(y => y.id === id).offered = true; markDirty('downsize');
      toast(`Record ${money(x.received)} from “${x.desc || x.space}” as received income?`, 'Add to Money', () => commit('money', 'downsizing income', M => M.entries.push({ id: uid(), type: 'income', desc: 'Sold: ' + (x.desc || x.space), cat: 'Downsizing', date: todayISO(), est: +x.received, actual: +x.received, settled: false })), 9000);
    }
  }, 30);
});

/* ================= Opportunities ================= */
const OKIND = ['Job', 'Practice space', 'Grant', 'Gig / venue', 'Class / training', 'Other'], OSTAT = ['New', 'Shortlist', 'Applied', 'Not for me'];
VIEWS.opps = () => {
  const [st, stH] = tabs('ostat', [['open', 'Open'], ['Shortlist', 'Shortlist'], ['Applied', 'Applied'], ['Not for me', 'Not for me'], ['all', 'All']]);
  const q = (R.tab.oq || '').toLowerCase(), kind = R.tab.okind || '';
  const list = S.opps.filter(o => (st === 'all' || (st === 'open' ? o.status === 'New' || o.status === 'Shortlist' : o.status === st)) && (!kind || o.kind === kind) && (!q || (o.title + ' ' + o.org + ' ' + o.location).toLowerCase().includes(q)))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.deadline || '9').localeCompare(b.deadline || '9'));
  return `<div class="sec-head"><div><h2>Opportunities</h2><p class="sans small">Jobs, practice spaces, grants and gigs — each with the date it was last checked. Marking “Applied” only records your status.</p></div><button class="btn primary" data-act="addOpp">＋ Opportunity</button></div>
  <div class="row" style="margin-bottom:.6rem"><input id="oq" placeholder="Search title, organization, place" value="${esc(R.tab.oq || '')}" style="flex:1;min-width:200px"><select id="okind"><option value="">All kinds</option>${OKIND.map(k => `<option ${kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>${stH}
  <div class="grid2">${list.map(o => { const age = o.checked ? daysBetween(o.checked, todayISO()) : null, dl = o.deadline ? daysBetween(todayISO(), o.deadline) : null; return `<div class="card stack">
    <div class="row between"><input data-b="opps.#${o.id}.title" value="${esc(o.title)}" placeholder="Role / space / grant" style="font-weight:600;flex:1"><button class="iconbtn" data-act="oStar" data-id="${o.id}" title="Priority" style="color:${o.priority ? 'var(--accent2)' : ''}">${o.priority ? '★' : '☆'}</button></div>
    <div class="row">${age == null ? '<span class="chip warn">never checked</span>' : `<span class="chip ${age > 14 ? 'warn' : 'good'}">checked ${age === 0 ? 'today' : age + 'd ago'}</span>`}${dl != null ? `<span class="chip ${dl < 0 ? 'bad' : dl <= 7 ? 'warn' : ''}">${dl < 0 ? 'closed ' + fmtShort(o.deadline) : 'due ' + fmtShort(o.deadline)}</span>` : '<span class="chip">no verified deadline</span>'}${o.url ? `<a class="chip" href="${esc(o.url)}" target="_blank" rel="noopener">source ↗</a>` : ''}</div>
    <div class="fgrid"><label class="f">Organization<input data-b="opps.#${o.id}.org" value="${esc(o.org)}"></label><label class="f">Kind<select data-b="opps.#${o.id}.kind">${OKIND.map(k => `<option ${o.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="f">Status<select data-b="opps.#${o.id}.status" data-rerender="1">${OSTAT.map(k => `<option ${o.status === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="f">Pay / cost<input data-b="opps.#${o.id}.pay" value="${esc(o.pay)}"></label><label class="f">Hours / schedule<input data-b="opps.#${o.id}.hours" value="${esc(o.hours)}"></label><label class="f">Location<input data-b="opps.#${o.id}.location" value="${esc(o.location)}"></label>
      <label class="f">Deadline<input type="date" data-b="opps.#${o.id}.deadline" data-rerender="1" value="${o.deadline || ''}"></label><label class="f">Last checked<input type="date" data-b="opps.#${o.id}.checked" data-rerender="1" value="${o.checked || ''}"></label><label class="f">Source link<input type="url" data-b="opps.#${o.id}.url" data-rerender="1" value="${esc(o.url)}"></label></div>
    <label class="f">Fit, gaps & notes<textarea data-b="opps.#${o.id}.notes" rows="2">${esc(o.notes)}</textarea></label>
    <div class="row"><button class="btn sm" data-act="oChecked" data-id="${o.id}">✓ Checked today</button><button class="btn sm" data-act="toTask" data-title="${esc('Follow up: ' + (o.title || 'opportunity'))}" data-area="Opportunities">→ Next step</button><span class="grow"></span><button class="btn sm danger" data-act="delRow" data-path="opps" data-id="${o.id}">Remove</button></div></div>`; }).join('') || '<div class="empty">Nothing in this view.</div>'}</div>`;
};
VIEWS.opps_after = () => {
  const q = $('#oq'); if (q) q.oninput = () => { R.tab.oq = q.value; clearTimeout(q._t); q._t = setTimeout(() => { render(); const n = $('#oq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  const k = $('#okind'); if (k) k.onchange = () => { R.tab.okind = k.value; render(); };
};
Object.assign(ACT, {
  addOpp: () => { R.tab.ostat = 'open'; commit('opps', 'add opportunity', os => os.unshift({ id: uid(), title: '', org: '', kind: 'Job', status: 'New', pay: '', hours: '', location: '', deadline: '', checked: todayISO(), url: '', notes: '', priority: 0 })); },
  oStar: el => commit('opps', 'priority', os => { const o = os.find(x => x.id === el.dataset.id); o.priority = o.priority ? 0 : 1; }),
  oChecked: el => commit('opps', 'checked', os => { os.find(x => x.id === el.dataset.id).checked = todayISO(); }),
});

/* ================= Well-being ================= */
const TRACK = { nutrition: ['Nutrition', '🥕'], movement: ['Movement', '🌿'], clarity: ['Mental clarity & inspiration', '✨'] };
const IDEAS = {
  nutrition: ['Add one extra vegetable to lunch', 'Cook a pot of beans or lentils for the week', 'Ginger or peppermint tea after dinner', 'Prep a snack box before a long shift', 'Drink a glass of water before coffee'],
  movement: ['10-minute walk with the dog', 'Gentle hip-opening stretch', 'Practice one dance combination', 'Take the stairs', 'Five minutes of yoga before bed'],
  clarity: ['Write three lines in a journal', 'Phone-free first 20 minutes', 'Step outside and notice five things', 'Tidy one surface', 'Read a few pages of something you love'],
};
VIEWS.well = () => {
  const [tr, trH] = tabs('well', Object.entries(TRACK).map(([k, v]) => [k, v[1] + ' ' + v[0]]));
  const W = S.well, logs = W.logs.filter(l => l.tracker === tr && !l.undone).sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
  const start = addDays(weekStart(todayISO()), -7 * 15), cells = [...Array(16 * 7)].map((_, i) => addDays(start, i));
  const per = {}; for (const l of logs) per[l.date] = (per[l.date] || 0) + 1;
  let streak = 0; for (let x = todayISO(); per[x]; x = addDays(x, -1)) streak++;
  const ideas = IDEAS[tr], idea = ideas[(+todayISO().slice(8) + (R.tab.ideaN || 0)) % ideas.length];
  const goals = W.goals.filter(g => g.tracker === tr && !g.archived);
  return `<div class="sec-head"><div><h2>Well-being</h2><p class="sans small">Optional, personal, and never a score. A star means something was logged — nothing more.</p></div></div>${trH}
  <div class="grid2">
    <div class="card stack"><h3>Log an activity</h3>
      <form id="wlf" class="stack"><input name="what" placeholder="What did you do?" required>
      <div class="fgrid"><label class="f">Date<input type="date" name="date" value="${R.date > todayISO() ? todayISO() : R.date}"></label><label class="f">Who<select name="who">${whoOpts().map(p => `<option>${esc(p)}</option>`).join('')}</select></label><label class="f">Minutes<input type="number" name="mins" min="0" placeholder="optional"></label></div>
      <input name="note" placeholder="Note (optional)"><button class="btn primary" style="align-self:start">Log activity</button></form>
      <div class="card flat small" style="padding:.6rem .8rem"><div class="tiny muted sans">IDEA</div><div class="row between"><span>${esc(idea)}</span><span><button class="btn sm ghost" data-act="ideaUse" data-t="${esc(idea)}">Use</button><button class="btn sm ghost" data-act="ideaNext">Another</button></span></div></div>
    </div>
    <div class="card stack"><div class="row between"><h3>Last 16 weeks</h3><span class="small sans">${streak ? `${streak}-day run` : ''} · ${logs.length} logged</span></div>
      <div class="heat" role="img" aria-label="Activity calendar">${cells.map(x => `<i title="${fmtShort(x)}: ${per[x] || 0}" style="${per[x] ? `background:color-mix(in srgb,var(--accent2) ${Math.min(100, 35 + per[x] * 22)}%,var(--bg2));border-color:transparent` : ''}${x > todayISO() ? ';opacity:.3' : ''}"></i>`).join('')}</div>
      <h3 style="margin-top:.8rem">Goals</h3>
      ${goals.map(g => { const n = W.logs.filter(l => l.tracker === tr && !l.undone && l.date >= (g.from || '0') && (!g.by || l.date <= g.by) && (g.who === 'Anyone' || l.who === g.who || l.who === 'Both')).length; return `<div class="stack" style="gap:.2rem"><div class="row between small"><span><b>${esc(g.title)}</b> <span class="muted">${esc(g.who)}${g.by ? ' · by ' + fmtShort(g.by) : ''}</span></span><span><span class="sans">${n}/${g.sessions || '?'}</span> <button class="iconbtn" data-act="goalArch" data-id="${g.id}" title="Archive goal">⌫</button></span></div>${g.sessions ? `<div class="bar"><i style="width:${Math.min(100, n / g.sessions * 100)}%;background:var(--good)"></i></div>` : ''}</div>`; }).join('') || '<div class="tiny muted sans">No goals — that is a perfectly good choice.</div>'}
      <button class="btn sm ghost" data-act="addGoal" data-tr="${tr}" style="align-self:start">＋ Optional goal</button></div>
  </div>
  <div class="card" style="margin-top:1rem"><h3>History</h3>${logs.slice(0, 40).map(l => `<div class="row small" style="padding:.3rem 0;border-bottom:1px solid var(--line)"><span class="stars">★</span><span style="width:5.5rem" class="sans">${fmtShort(l.date)}</span><span class="grow">${esc(l.what)}${l.note ? ` <span class="muted">— ${esc(l.note)}</span>` : ''}</span><span class="muted sans">${esc(l.who)}${l.mins ? ' · ' + fmtDur(l.mins) : ''}</span><button class="iconbtn" data-act="logUndo" data-id="${l.id}" aria-label="Remove log">✕</button></div>`).join('') || '<div class="empty small">Nothing logged yet.</div>'}</div>
  <details class="disc" style="margin-top:1rem"><summary>Routines that count toward Capacity</summary><div class="in">${tableEditor({ path: 'well.routines', cols: [{ f: 'name', label: 'Routine' }, { f: 'type', label: 'Type', type: 'select', opts: ['Movement', 'Nutrition', 'Clarity'], w: '8rem' }, { f: 'mins', label: 'Min / session', type: 'number', w: '7rem' }, { f: 'perWeek', label: 'Sessions / wk', type: 'number', w: '7rem' }, { f: 'count', label: 'Count in capacity', type: 'check', w: '7rem' }], addLabel: 'Routine', newItem: { name: '', type: 'Movement', mins: 30, perWeek: 3, count: true } })}</div></details>
  <p class="tiny muted sans" style="margin-top:1rem">These are private shared records and gentle prompts — not diagnosis, a diet, or a workout prescription.</p>`;
};
VIEWS.well_after = () => {
  const f = $('#wlf'); if (!f) return;
  f.onsubmit = e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(f)); if (!fd.what.trim()) return; const tr = R.tab.well || 'nutrition'; commit('well', 'log', W => W.logs.push({ id: uid(), tracker: tr, date: fd.date, who: fd.who, what: fd.what.trim(), mins: fd.mins === '' ? '' : +fd.mins, note: fd.note, at: Date.now() }), { toast: '★ Logged' }); };
};
Object.assign(ACT, {
  ideaNext: () => { R.tab.ideaN = (R.tab.ideaN || 0) + 1; render(); },
  ideaUse: el => { const i = $('#wlf [name=what]'); i.value = el.dataset.t; i.focus(); },
  logUndo: el => commit('well', 'remove log', W => { W.logs.find(l => l.id === el.dataset.id).undone = true; }, { toast: 'Log removed' }),
  goalArch: el => commit('well', 'archive goal', W => { W.goals.find(g => g.id === el.dataset.id).archived = true; }, { toast: 'Goal archived' }),
  addGoal: el => openModal(`<div class="mh"><h3>Optional goal · ${TRACK[el.dataset.tr][0]}</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div><form class="mb stack" id="gf"><input name="title" placeholder="e.g. Walk with the dog" required autofocus><div class="fgrid"><label class="f">Who<select name="who"><option>Anyone</option>${whoOpts().slice(0, -1).map(p => `<option>${esc(p)}</option>`).join('')}</select></label><label class="f">Sessions<input type="number" name="sessions" min="1"></label><label class="f">By<input type="date" name="by"></label></div></form><div class="mf"><button class="btn" data-act="close">Cancel</button><button class="btn primary" id="gOk">Add goal</button></div>`, m => {
    $('#gOk', m).onclick = () => { const fd = Object.fromEntries(new FormData($('#gf', m))); if (!fd.title.trim()) return; closeModal(); commit('well', 'add goal', W => W.goals.push({ id: uid(), tracker: el.dataset.tr, ...fd, sessions: +fd.sessions || '', from: todayISO() })); };
  }),
});

/* ================= Family prep ================= */
VIEWS.prep = () => {
  const [tab, tabH] = tabs('prep', [['plan', 'Our plan'], ['care', 'Care & questions'], ['notes', 'Our notes']]);
  const P = S.prep; let body = '';
  if (tab === 'plan') body = tableEditor({ path: 'prep.tasks', cols: [{ f: 'done', label: '✓', type: 'check', w: '2.5rem' }, { f: 'title', label: 'Task' }, { f: 'group', label: 'Group', type: 'select', opts: ['Before trying', 'Together', 'Care & costs', 'Move planning', 'Other'], w: '9rem' }, { f: 'who', label: 'Who', type: 'select', opts: whoOpts(), w: '8rem' }, { f: 'date', label: 'When', type: 'date', w: '9.5rem' }], addLabel: 'Task', newItem: { done: false, title: '', group: 'Before trying', who: 'Both', date: '' }, empty: 'Nothing planned yet — and that’s fine.' });
  if (tab === 'care') body = `<h3>Appointments</h3>${tableEditor({ path: 'prep.appts', cols: [{ f: 'date', label: 'Date', type: 'date', w: '9.5rem' }, { f: 'with', label: 'With' }, { f: 'where', label: 'Where' }, { f: 'notes', label: 'Notes' }], addLabel: 'Appointment record', newItem: { date: '', with: '', where: '', notes: '' } })}<p class="tiny muted sans">A record here doesn't book a visit. Add it to Today as a fixed block if it's confirmed.</p>
    <h3 style="margin-top:1.2rem">Questions to bring</h3>${tableEditor({ path: 'prep.qs', items: P.qs || (P.qs = []), cols: [{ f: 'asked', label: 'Asked', type: 'check', w: '3.5rem' }, { f: 'q', label: 'Question' }, { f: 'answer', label: 'What we heard' }], addLabel: 'Question', newItem: { asked: false, q: '', answer: '' } })}`;
  if (tab === 'notes') body = tableEditor({ path: 'prep.notes', cols: [{ f: 'kind', label: 'Kind', type: 'select', opts: ['Health / conversation', 'Medicines & supplements', 'Research / reading'], w: '11rem' }, { f: 'text', label: 'Note', type: 'area' }, { f: 'source', label: 'Source', w: '10rem' }, { f: 'unsure', label: 'Still uncertain', w: '10rem' }], addLabel: 'Note', newItem: { kind: 'Health / conversation', text: '', source: '', unsure: '' } }) + '<p class="tiny muted sans">Record where something came from and what is still unclear. This space never suggests doses — that conversation belongs with a clinician who knows you.</p>';
  return `<div class="sec-head"><div><h2>Family prep</h2><p class="sans small">Optional preparation and conversations. Nothing here assumes a pregnancy, a timeline, or a diagnosis.</p></div></div>${tabH}<div class="card">${body}</div>`;
};

/* ================= Settings & backup ================= */
function toICS(from, to) {
  const pad = n => String(n).padStart(2, '0'), stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const dt = (d, m) => d.replace(/-/g, '') + 'T' + pad(Math.floor(m / 60)) + pad(m % 60) + '00';
  const escI = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, x => '\\' + x);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Garden//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:America/Los_Angeles', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  const ny = d => /New Jersey/i.test((S.daynotes[d] || {}).basis || '');
  const blocks = S.blocks.filter(b => b.date >= from && b.date <= to && !b.icsUid && !b.sleep && (b.status !== 'proposed' || S.settings.icsDraft));
  if (blocks.some(b => ny(b.date))) L.push('BEGIN:VTIMEZONE', 'TZID:America/New_York', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE');
  for (const b of blocks) {
    const tz = ny(b.date) ? 'America/New_York' : 'America/Los_Angeles';
    const endD = b.end === 1440 ? addDays(b.date, 1) : b.date, endM = b.end === 1440 ? 0 : b.end;
    L.push('BEGIN:VEVENT', `UID:${b.id}@lifegarden`, `DTSTAMP:${stamp}`, `DTSTART;TZID=${tz}:${dt(b.date, b.start)}`, `DTEND;TZID=${tz}:${dt(endD, endM)}`, `SUMMARY:${escI(b.title)}`, `CATEGORIES:${escI(CATS[catOf(b)].label)}`, ...(b.status ? [`X-LIFEGARDEN-STATUS:${escI(STATUS[b.status][0])}`] : []), `TRANSP:${b.kind === 'flexible' ? 'TRANSPARENT' : 'OPAQUE'}`);
    if (b.notes) L.push(`DESCRIPTION:${escI(b.notes)}`);
    if (S.settings.icsAlarm) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escI(b.title)}`, `TRIGGER:-PT${+S.settings.icsAlarm}M`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR'); return L.join('\r\n');
}
function fromICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); const evs = []; let cur = null;
  for (const ln of lines) {
    if (ln === 'BEGIN:VEVENT') cur = {}; else if (ln === 'END:VEVENT') { cur && evs.push(cur); cur = null; }
    else if (cur) { const i = ln.indexOf(':'); if (i < 0) continue; const [k, ...params] = ln.slice(0, i).split(';'); cur[k] = { v: ln.slice(i + 1), p: params.join(';') }; }
  }
  const conv = f => {
    if (!f) return null; const v = f.v;
    if (/VALUE=DATE/.test(f.p) || /^\d{8}$/.test(v)) return { allDay: true, date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` };
    const m = v.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)/); if (!m) return null;
    if (v.endsWith('Z')) { const p = pacificParts(new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]))); return p; }
    return { date: `${m[1]}-${m[2]}-${m[3]}`, min: +m[4] * 60 + +m[5] }; // TZID or floating: treated as Pacific
  };
  const out = []; let skipped = 0;
  for (const e of evs) {
    const s = conv(e.DTSTART), en = conv(e.DTEND); if (!s || s.allDay) { skipped++; continue; }
    let end = en && !en.allDay ? (en.date === s.date ? en.min : 1440) : s.min + 60; if (end <= s.min) end = Math.min(1440, s.min + 30);
    const title = (e.SUMMARY ? e.SUMMARY.v : 'Event').replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ');
    out.push({ id: uid(), icsUid: e.UID ? e.UID.v : uid(), title, date: s.date, start: s.min, end, kind: 'fixed', cat: 'auto', notes: 'Imported from calendar file' });
  }
  return { out, skipped };
}
VIEWS.backup = () => {
  const st = S.settings, counts = `${S.blocks.length} blocks · ${S.tasks.length} next steps · ${S.money.entries.length} money entries · ${S.opps.length} opportunities`;
  const syncLine = `<div class="card flat small sans" style="margin-bottom:1rem;padding:.6rem .9rem"><b>This device</b> · app version ${APP_VERSION} · ${S.blocks.length} time blocks · ${S.tasks.length} next steps · ${sync.cfg ? 'connected to the Sheet' + (sync.lastPull ? ', last synced ' + new Date(sync.lastPull).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ', not synced yet this visit') : '<span style="color:var(--warn)">not connected — this is a separate plan</span>'}<br><span class="muted">Every device showing the same version and the same counts has the same plan.</span></div>`;
  return syncLine + `<div class="sec-head"><div><h2>Settings & backup</h2><p class="sans small">${sync.cfg ? 'Synced with your Google Sheet — every phone connected to it, and Gemini in Sheets, works on the same plan.' : 'Saving on this device only. Connect a Google Sheet to share the plan between phones and let Gemini edit it.'}</p></div></div>
  <div class="grid2">
    ${sheetCard()}
    ${voiceCard()}
    <div class="card stack"><h3>Look & day</h3><div class="fgrid">
      <label class="f">Theme<select data-b="settings.theme" data-rerender="1"><option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>Dark (warm)</option><option value="light" ${st.theme === 'light' ? 'selected' : ''}>Light</option></select></label>
      <label class="f">Season art<select data-b="settings.season" data-rerender="1">${['auto', 'spring', 'summer', 'autumn', 'winter'].map(s => `<option value="${s}" ${st.season === s ? 'selected' : ''}>${s === 'auto' ? 'Automatic (Pacific month)' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
      <label class="f">Timeline starts (hour)<input type="number" min="0" max="12" data-b="settings.dayStart" data-rerender="1" value="${st.dayStart}"></label>
      <label class="f">Timeline ends (hour)<input type="number" min="13" max="24" data-b="settings.dayEnd" data-rerender="1" value="${st.dayEnd}"></label>
      <label class="f">Sleep from<input type="time" data-b="settings.sleepFrom" value="${st.sleepFrom}"></label><label class="f">Sleep until<input type="time" data-b="settings.sleepTo" value="${st.sleepTo}"></label></div>
      <p class="tiny muted sans">Sleep is shown shaded on the timeline and is never moved by drags or Late start.</p>
      <h3>People</h3><div class="row">${[0, 1, 2].map(i => `<input data-pp="${i}" value="${esc(st.people[i] || '')}" placeholder="Name" style="width:9rem">`).join('')}</div></div>
    <div class="card stack"><h3>Backup & restore</h3><p class="small">The original Life Garden couldn't be exported — that's why this archive only had guides. Keep a copy now and then.</p><p class="tiny muted sans">${counts}</p>
      <div class="row"><button class="btn primary" data-act="exportJson">⇩ Download backup (.json)</button><button class="btn" data-act="copyJson">Copy backup text</button></div>
      <details class="disc"><summary>Restore from a backup</summary><div class="in stack"><input type="file" id="impFile" accept=".json,application/json"><textarea id="impText" placeholder="…or paste backup text here" rows="3"></textarea><button class="btn" data-act="importJson">Restore (replaces current plan)</button></div></details></div>
    <div class="card stack"><h3>Restore points</h3><p class="small">Automatic copies of the whole plan kept on this device: one before every app update, one a day, and one before any restore, reset, import or large change from the Sheet. Restoring saves the current plan as a restore point first, so it can always be undone.</p>
      <div id="snapList" class="stack small sans"><span class="muted">Loading…</span></div>
      <div class="row"><button class="btn sm" data-act="snapNow">Save a restore point now</button></div></div>
  </div>
  <details class="disc" style="margin-top:1rem"><summary>More tools — calendar files, recovered draft, start over</summary><div class="grid2" style="margin-top:.8rem">
    <div class="card stack"><h3>Calendar files</h3><p class="small">Send your blocks to Google Calendar, Apple Calendar or Outlook as an .ics file, or bring events in from one.</p>
      <div class="fgrid"><label class="f">From<input type="date" id="icsFrom" value="${todayISO()}"></label><label class="f">To<input type="date" id="icsTo" value="${addDays(todayISO(), 30)}"></label><label class="f">Reminder (min before)<input type="number" min="0" data-b="settings.icsAlarm" value="${st.icsAlarm ?? ''}" placeholder="none"></label></div>
      <label class="row small sans"><input type="checkbox" data-b="settings.icsDraft" ${st.icsDraft ? 'checked' : ''}> Include proposed draft blocks</label>
      <div class="row"><button class="btn" data-act="exportIcs">⇩ Export .ics</button></div>
      <label class="f">Import an .ics file (timed events become fixed blocks; repeats are skipped)<input type="file" id="icsFile" accept=".ics,text/calendar"></label></div>
    <div class="card stack"><h3>Recovered working draft</h3><p class="small">Load a Life Garden recovery pack (.json) built from the old hourly working draft. You'll choose what comes in before anything changes.</p>
      <p class="tiny muted sans">${(() => { const r = S.blocks.filter(b => b.src === 'draft'); return r.length ? `${r.length} recovered blocks in the plan · ${r.filter(b => b.edited).length} edited by you` : 'Nothing imported yet.'; })()}</p>
      <label class="f">Recovery pack<input type="file" id="recFile" accept=".json,application/json"></label>
      <div class="row"><label class="row small sans"><input type="checkbox" data-b="settings.showDraft" data-rerender="1" ${st.showDraft !== false ? 'checked' : ''}> Show proposed blocks on the calendar</label></div>
      <button class="btn danger sm" data-act="removeDraft" style="align-self:start">Remove untouched recovered blocks</button></div>
    <div class="card stack"><h3>Start over</h3><p class="small">Clears every section back to the starting setup. Download a backup first.</p><button class="btn danger" data-act="resetAll" style="align-self:start">Reset the whole plan</button></div>
  </div></details>`;
};
VIEWS.backup_after = () => {
  fillSnapList();
  $$('[data-pp]').forEach(el => el.onchange = () => commit('settings', 'people', st => { st.people[+el.dataset.pp] = el.value.trim(); st.people = st.people.filter((p, i) => p || i < 2); }));
  const rf = $('#recFile'); if (rf) rf.onchange = async () => {
    const file = rf.files[0]; if (!file) return; let o;
    try { o = JSON.parse(await file.text()); } catch (e) { rf.value = ''; return toast('That file isn’t valid JSON'); }
    rf.value = '';
    if (o.kind !== 'recovery-pack' || !Array.isArray(o.blocks)) return toast(o.data && o.data.blocks ? 'That’s a full backup — use Restore instead' : 'That isn’t a Life Garden recovery pack');
    openRecoveryImport(o);
  };
  const f = $('#icsFile'); if (f) f.onchange = async () => {
    const file = f.files[0]; if (!file) return; const { out, skipped } = fromICS(await file.text());
    const have = new Set(S.blocks.map(b => b.icsUid + '|' + b.date)); const add = out.filter(b => !have.has(b.icsUid + '|' + b.date));
    commit('blocks', 'import calendar', bl => bl.push(...add), { toast: `Imported ${add.length} event${add.length === 1 ? '' : 's'}${out.length - add.length ? `, ${out.length - add.length} already here` : ''}${skipped ? `, ${skipped} all-day skipped` : ''}` });
  };
};
const setupCode = c => btoa(unescape(encodeURIComponent(JSON.stringify({ u: c.url, k: c.key }))));
const readSetupCode = s => { s = String(s || '').trim(); const m = s.match(/connect=([A-Za-z0-9+/=_-]+)/); if (m) s = m[1]; try { const o = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))); return o.u && o.k ? { url: o.u, key: o.k } : null; } catch (e) { return null; } };
const setupLink = c => location.origin + location.pathname + '#connect=' + setupCode(c).replace(/\+/g, '-').replace(/\//g, '_');
let scriptText = '';
const WORDS = 'amber,anchor,apple,aspen,autumn,basil,beacon,birch,bloom,breeze,brook,canyon,cedar,cello,clover,comet,coral,cosmos,dahlia,dawn,delta,ember,fable,fern,fiddle,fjord,flint,garnet,ginger,glade,harbor,hazel,heron,indigo,iris,ivy,jasmine,juniper,kestrel,lantern,laurel,lilac,linen,lotus,lumen,maple,marigold,meadow,mint,moss,nectar,nutmeg,oasis,olive,opal,orchid,otter,pebble,pepper,pine,plum,poppy,prism,quartz,quill,raven,reed,river,saffron,sage,sequoia,sierra,sparrow,spruce,sunny,tango,thistle,thyme,topaz,tulip,velvet,violet,willow,wren,yarrow,zephyr'.split(',');
function newPasscode() { const r = new Uint32Array(5); crypto.getRandomValues(r); return [0, 1, 2, 3].map(i => WORDS[r[i] % WORDS.length]).join('-') + '-' + (r[4] % 90 + 10); }
function pendingPasscode() { let k = null; try { k = localStorage.getItem('lifegarden.newkey'); } catch (e) { } if (!k) { k = newPasscode(); try { localStorage.setItem('lifegarden.newkey', k); } catch (e) { } } return k; }
const scriptWithKey = k => scriptText.replace("const PASSCODE = 'CHANGE-ME-to-a-private-phrase';", `const PASSCODE = '${k.replace(/'/g, '')}';`);
function sheetCard() {
  const c = sync.cfg;
  if (!scriptText) fetch('Code.gs').then(r => r.ok ? r.text() : '').then(t => { scriptText = t; }).catch(() => { });
  if (c) return `<div class="card stack" style="grid-column:1/-1"><div class="row between"><h3>Google Sheet sync</h3><span class="chip good">connected</span></div>
    <p class="small" style="margin:0">Changes sync about a minute after you make them, and whenever the app opens. Edits made in the Sheet — by you or Gemini — appear here the same way. A dated backup is saved daily to the “Life Garden backups” folder in Drive.</p>
    <div class="row">${c.sheetUrl ? `<a class="btn" href="${esc(c.sheetUrl)}" target="_blank" rel="noopener">Open the Sheet ↗</a>` : ''}<button class="btn primary" data-act="syncNow">Sync now</button><button class="btn" data-act="copySetupLink">Copy setup link for another phone</button><button class="btn ghost danger" data-act="disconnect">Disconnect this device</button></div>
    <p class="tiny muted sans">The setup link contains the passcode. Send it only to devices that should see the plan, and delete the message afterwards.</p>
    <details class="disc"><summary>Troubleshooting</summary><div class="in small stack">
      <p style="margin:0">This device has <b>${S.blocks.length}</b> time blocks, <b>${S.tasks.length}</b> next steps and <b>${Object.keys(S.daynotes).length}</b> day notes. Last sync: ${sync.lastPull ? new Date(sync.lastPull).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'not yet this session'} · status: ${esc($('#savePill') ? $('#savePill').textContent : '')}</p>
      <div class="row"><button class="btn sm" data-act="pushAll">Send this device's whole plan to the Sheet</button><button class="btn sm" data-act="pullAll">Reload the plan from the Sheet</button></div>
      <p class="tiny muted sans">“Send” adds or updates every item from this device in the Sheet and deletes nothing. “Reload” replaces this device's copy with what's in the Sheet.</p>
    </div></details></div>`;
  return `<div class="card stack" style="grid-column:1/-1"><h3>Connect a Google Sheet</h3>
    <p class="small" style="margin:0">Got a setup link or code from someone who already connected? Paste it here:</p>
    <div class="row"><input id="setupCode" placeholder="Setup link or code" class="grow" autocomplete="off"><button class="btn primary" data-act="connectCode">Connect</button></div>
    <details class="disc"><summary>First-time setup (about 5 minutes, on a computer)</summary><div class="in small stack">
      <p><b>1.</b> In Google Drive, make a new Google Sheet and name it “Jordan’s Life Garden” (or open <a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a>).</p>
      <p><b>2.</b> In the Sheet: <b>Extensions → Apps Script</b>. Select all the sample code, delete it, and paste the Life Garden script: <button class="btn sm primary" data-act="copyScript">Copy the script</button> <span class="tiny muted sans">(it already contains a private passcode, shown below)</span>. Click Save 💾.</p>
      <p><b>3.</b> In the toolbar's function menu choose <b>setup</b>, press <b>▶ Run</b>, and allow access when Google asks. If it says Google hasn't verified the app: <b>Advanced → Go to (project name)</b> → Allow. New tabs appear in the Sheet.</p>
      <p><b>4.</b> <b>Deploy → New deployment</b> → gear ⚙ → <b>Web app</b>. Execute as: <b>Me</b>. Who has access: <b>Anyone</b>. Deploy, then copy the <b>Web app URL</b> (ends in <code>/exec</code>).</p>
      <p><b>5.</b> Paste it here and Connect:</p>
      <div class="fgrid"><label class="f">Web app URL<input id="sheetUrl" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label><label class="f">Passcode (already in the script)<input id="sheetKey" autocomplete="off" value="${esc(pendingPasscode())}"></label></div>
      <button class="btn primary" data-act="connectSheet" style="align-self:start">Connect</button>
      <p class="tiny muted sans">If this device already has a plan and the Sheet is empty, this device's plan becomes the starting point. Only someone with both the Web app URL <i>and</i> the passcode can reach the plan, and the Sheet locks itself after repeated wrong guesses. For Jordan-only access, do these steps signed in to <b>Jordan's</b> Google account so the Sheet is hers.</p>
    </div></details></div>`;
}
async function doConnect(cfg) {
  setStatus('saving', 'Connecting…');
  try { const r = await connectSheet(cfg.url, cfg.key); try { localStorage.removeItem('lifegarden.newkey'); } catch (e) { } render(); toast(r === 'pushed' ? 'Connected — your plan is now in the Sheet' : r === 'used' ? 'Connected — loaded the plan from the Sheet' : 'Connected and merged'); }
  catch (e) { setStatus(sync.cfg ? 'error' : 'local', sync.cfg ? 'Sync problem' : 'Saved on this device'); toast(e.message || 'Couldn’t connect'); }
}
Object.assign(ACT, {
  syncNow: () => syncNow(),
  pushAll: async () => {
    if (!(await confirmBox(`Send all ${S.blocks.length} blocks and the rest of this device's plan to the Google Sheet? Nothing in the Sheet is deleted.`, 'Send'))) return;
    sync.base = null; saveSyncState(); sync.localRev++; await syncNow();
    render(); toast(sync.status === 'saved' ? 'Sent — open the Sheet’s “Time blocks” tab to check' : 'Couldn’t send yet — see the status at the top');
  },
  pullAll: async () => {
    if (!(await confirmBox('Replace this device’s copy with the plan in the Google Sheet?', 'Reload'))) return;
    try { setStatus('saving', 'Loading from the Sheet…'); const d = await api('GET', {}); const theme = S.settings.theme; adoptServer(d); S.settings.theme = theme; sync.base = snapshotRows(); sync.hash = d.hash; saveLocal(); saveSyncState(); setStatus('saved', 'Synced with Google Sheet'); render(); toast(`Loaded ${S.blocks.length} blocks from the Sheet`); }
    catch (e) { setStatus('error', e.message || 'Couldn’t load'); toast(e.message || 'Couldn’t load from the Sheet'); }
  },
  connectSheet: () => doConnect({ url: $('#sheetUrl').value, key: $('#sheetKey').value }),
  connectCode: () => { const c = readSetupCode($('#setupCode').value); if (!c) return toast('That doesn’t look like a setup link or code'); doConnect(c); },
  copySetupLink: () => navigator.clipboard?.writeText(setupLink(sync.cfg)).then(() => toast('Setup link copied — text it to Jordan'), () => openModal(`<div class="mh"><h3>Setup link</h3></div><div class="mb"><textarea rows="4" readonly>${esc(setupLink(sync.cfg))}</textarea></div><div class="mf"><button class="btn" data-act="close">Done</button></div>`)),
  copyScript: () => {
    if (!scriptText) return toast('Script still loading — try again in a second');
    const k = (sync.cfg && sync.cfg.key) || ($('#sheetKey') && $('#sheetKey').value.trim()) || pendingPasscode(), txt = scriptWithKey(k);
    navigator.clipboard?.writeText(txt).then(() => toast('Script copied, with your passcode inside — paste it into Apps Script'), () => openModal(`<div class="mh"><h3>Copy this script</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div><div class="mb"><textarea rows="12" readonly>${esc(txt)}</textarea></div><div class="mf"><button class="btn" data-act="close">Done</button></div>`));
  },
  disconnect: async () => { if (await confirmBox('Stop syncing this device? The plan stays on this phone; the Sheet keeps its copy.', 'Disconnect')) { disconnectSheet(); render(); } },
});
const backupText = () => JSON.stringify({ app: 'life-garden', version: 1, exported: new Date().toISOString(), data: S }, null, 1);
async function restore(txt, label = 'Backup restored') {
  let o; try { o = JSON.parse(txt); } catch (e) { return toast('That isn’t valid backup text'); }
  const d = o.data || o; if (!d.blocks || !d.settings) return toast('That doesn’t look like a Life Garden backup');
  await takeSnapshot('Before restoring a backup');
  undoStack.push(...SECTIONS.map(k => ({ k, prev: JSON.stringify(S[k]), label: 'restore' })));
  const base = defaults(); for (const k of SECTIONS) { S[k] = d[k] !== undefined ? d[k] : base[k]; markDirty(k); }
  render(); toast(label, 'Undo', () => { for (let i = 0; i < SECTIONS.length; i++) undo(); });
}
Object.assign(ACT, {
  exportJson: () => downloadFile(`life-garden-backup-${todayISO()}.json`, backupText(), 'application/json'),
  copyJson: () => navigator.clipboard?.writeText(backupText()).then(() => toast('Backup copied — paste it somewhere safe'), () => toast('Clipboard not allowed here')),
  importJson: async () => { const f = $('#impFile').files[0]; const txt = f ? await f.text() : $('#impText').value; if (!txt.trim()) return toast('Choose a file or paste backup text'); if (await confirmBox('Replace the whole current plan with this backup?', 'Restore')) restore(txt); },
  exportIcs: () => { const a = $('#icsFrom').value, b = $('#icsTo').value; const n = S.blocks.filter(x => x.date >= a && x.date <= b && !x.icsUid && !x.sleep && (x.status !== 'proposed' || S.settings.icsDraft)).length; if (!n) return toast('No planner blocks in that range'); downloadFile(`life-garden-${a}-to-${b}.ics`, toICS(a, b), 'text/calendar'); toast(`${n} block${n === 1 ? '' : 's'} exported`); },
  resetAll: async () => { if (!(await confirmBox('Reset everything? A restore point of the current plan is saved first (Settings → Restore points).', 'Reset'))) return; await takeSnapshot('Before reset'); const base = defaults(); for (const k of SECTIONS) { undoStack.push({ k, prev: JSON.stringify(S[k]), label: 'reset' }); S[k] = base[k]; markDirty(k); } render(); toast('Plan reset'); },
});

/* ================= recovered working-draft import ================= */
const qArea = t => /academ|lesley|reading|school/i.test(t) ? 'Academic' : /reloc|move|travel/i.test(t) ? 'Move' : /glimmer|festival|post-move|showcase|film/i.test(t) ? 'Dance & Glimmer' : /sleep|wednesday|thursday|cafe|cycle|roster/i.test(t) ? 'Well-being' : 'Life admin';
function applyRecovery(pack, opts, extraSettings) {
  const have = new Set(S.blocks.map(b => b.id));
  const add = opts.blocks.filter(b => !have.has(b.id)).map(b => ({ ...b, cat: b.sleep ? 'sleep' : 'auto' }));
  let steps = 1;
  commit('blocks', 'import recovered draft', bl => bl.push(...add), { render: false });
  if (opts.notes) { steps++; commit('daynotes', 'import day notes', dn => { for (const [k, v] of Object.entries(pack.dayNotes || {})) dn[k] = { ...v, src: 'draft' }; }, { render: false }); }
  let nq = 0;
  if (opts.qs) { steps++; commit('tasks', 'import open questions', ts => {
    const ids = new Set(ts.map(t => t.id));
    for (const q of (pack.questions || []).filter(q => q.item && q.item !== 'Item')) {
      const id = 'rq-' + q.item.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (ids.has(id)) continue; nq++;
      ts.push({ id, title: 'Confirm: ' + q.item, area: qArea(q.item + ' ' + q.handling), status: 'Needs verification', date: null, mins: '', notes: `${q.detail}\n${q.handling}\nSource: ${q.source} (recovered working draft)`, order: 900 + nq, src: 'draft' });
    }
  }, { render: false }); }
  if (opts.sleepWin || extraSettings) { steps++; commit('settings', 'sleep window', st => { if (opts.sleepWin) { st.sleepFrom = '22:30'; st.sleepTo = '07:00'; } Object.assign(st, extraSettings || {}); }, { render: false }); }
  render();
  toast(`Added ${add.length} recovered blocks${nq ? ` and ${nq} open questions` : ''}`, 'Undo', () => { for (let i = 0; i < steps; i++) undo(); }, 9000);
  return add.length;
}
function openRecoveryImport(pack) {
  const all = pack.blocks || [], have = new Set(S.blocks.map(b => b.id));
  const dates = all.map(b => b.date).sort(), d0 = dates[0], d1 = dates[dates.length - 1];
  const cnt = st => all.filter(b => b.status === st && !b.sleep).length;
  openModal(`<div class="mh"><h3>Bring in the recovered working draft</h3><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
  <div class="mb stack small">
    <p style="margin:0">${esc(pack.source?.name || 'Recovered draft')} · ${fmtShort(d0)} – ${fmtShort(d1)}, ${all.length} blocks rebuilt from hourly rows. Nothing here was verified against the old live site — every block keeps its draft status, and proposals look dashed so they can't be mistaken for bookings.</p>
    <fieldset class="card flat" style="padding:.6rem .8rem"><legend class="tiny sans muted">Which blocks</legend>
      ${Object.entries(STATUS).map(([k, v]) => `<label class="row sans"><input type="checkbox" name="st" value="${k}" checked> ${v[1]} ${v[0]} <span class="muted">(${cnt(k)})</span></label>`).join('')}
      <label class="row sans"><input type="checkbox" id="riSleep"> Also add sleep-target blocks <span class="muted">(${all.filter(b => b.sleep).length} — usually better as the shaded sleep window)</span></label>
      <div class="fgrid" style="margin-top:.4rem"><label class="f">From<input type="date" id="riFrom" value="${d0}"></label><label class="f">To<input type="date" id="riTo" value="${d1}"></label></div></fieldset>
    <label class="row sans"><input type="checkbox" id="riNotes" checked> Day notes, phases and the week's suggested priority (${Object.keys(pack.dayNotes || {}).length} days)</label>
    <label class="row sans"><input type="checkbox" id="riQs" checked> Open questions as next steps marked “Needs verification” (${(pack.questions || []).filter(q => q.item !== 'Item').length})</label>
    <label class="row sans"><input type="checkbox" id="riSleepWin" checked> Use the draft's sleep target (22:30–07:00) as the shaded sleep window</label>
    <p class="tiny muted sans" id="riSum"></p>
  </div><div class="mf"><button class="btn" data-act="close">Cancel</button><button class="btn primary" id="riGo">Add to my plan</button></div>`, m => {
    const pick = () => {
      const sts = new Set($$('[name=st]:checked', m).map(x => x.value)), sl = $('#riSleep', m).checked, f = $('#riFrom', m).value, t = $('#riTo', m).value;
      return all.filter(b => (b.sleep ? sl : sts.has(b.status)) && b.date >= f && b.date <= t);
    };
    const upd = () => { const p = pick(), dup = p.filter(b => have.has(b.id)).length; $('#riSum', m).textContent = `${p.length - dup} blocks will be added${dup ? `, ${dup} already in your plan are skipped` : ''}. You can undo this, or later remove every untouched recovered block from Settings & backup.`; };
    m.addEventListener('change', upd); upd();
    $('#riGo', m).onclick = async () => {
      const opts = { blocks: pick(), notes: $('#riNotes', m).checked, qs: $('#riQs', m).checked, sleepWin: $('#riSleepWin', m).checked };
      closeModal(); await takeSnapshot('Before importing the recovery pack'); applyRecovery(pack, opts);
    };
  });
}
Object.assign(ACT, {
  removeDraft: async () => {
    const n = S.blocks.filter(b => b.src === 'draft' && !b.edited && !b.done).length;
    if (!n) return toast('No untouched recovered blocks to remove');
    if (await confirmBox(`Remove ${n} recovered draft blocks you haven't edited or marked done? Blocks you changed stay.`, 'Remove')) { await takeSnapshot('Before removing recovered draft blocks'); commit('blocks', 'remove recovered draft', bl => { for (let i = bl.length - 1; i >= 0; i--) if (bl[i].src === 'draft' && !bl[i].edited && !bl[i].done) bl.splice(i, 1); }, { toast: `Removed ${n} recovered blocks` }); }
  },
});


/* ---------- restore points UI ---------- */
async function fillSnapList() {
  const box = $('#snapList'); if (!box) return;
  const all = await snapList();
  if (!$('#snapList')) return;
  box.innerHTML = all.length ? all.map(o => `<div class="snaprow"><div><b>${new Date(o.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b> · ${esc(o.reason)}<br><span class="muted tiny">${o.counts.blocks} blocks · ${o.counts.tasks} next steps · ${o.counts.money} money entries · ${o.counts.notes} day notes · v${esc(o.version)}</span></div>
    <div class="row"><button class="btn sm" data-act="snapDownload" data-t="${o.t}">Download</button><button class="btn sm" data-act="snapRestore" data-t="${o.t}">Restore</button></div></div>`).join('')
    : '<span class="muted">No restore points yet — one is made the first time the plan has something in it.</span>';
}
Object.assign(ACT, {
  snapNow: async () => { toast(await takeSnapshot('Saved by hand') ? 'Restore point saved' : 'Couldn’t save a restore point on this device'); fillSnapList(); },
  snapDownload: async el => { const o = await snapGet(el.dataset.t); if (o) downloadFile(`life-garden-restore-point-${o.day}.json`, JSON.stringify({ app: 'life-garden', version: 1, exported: new Date(o.t).toISOString(), reason: o.reason, data: JSON.parse(o.data) }, null, 1), 'application/json'); },
  snapRestore: async el => {
    const o = await snapGet(el.dataset.t); if (!o) return toast('That restore point is gone');
    const c = snapCounts(S);
    if (!(await confirmBox(`Go back to the plan from ${new Date(o.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}? It has ${o.counts.blocks} blocks and ${o.counts.tasks} next steps (now: ${c.blocks} and ${c.tasks}). The current plan is saved as a restore point first${sync.cfg ? ', and the Sheet will be updated to match' : ''}.`, 'Restore'))) return;
    await restore(JSON.stringify({ data: JSON.parse(o.data) }), 'Restore point loaded'); fillSnapList();
  },
});
