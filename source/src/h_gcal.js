/* ================= Google Calendar → Life Garden (read only) =================
   The Sheet script reads her Google Calendar (where Vagaro puts appointments) and the app keeps
   matching fixed blocks: new events are added, moved/renamed ones updated, cancelled ones removed.
   Only blocks that came from the calendar are ever touched, and nothing is written to the calendar. */
const GCAL_EVERY = 15 * 60e3;
const gcal = { busy: false, last: 0, state: '', err: '', cals: null, at: 0 };
try { const g = JSON.parse(localStorage.getItem('lifegarden.gcal') || 'null'); if (g) { gcal.cals = g.cals; gcal.at = g.at; } } catch (e) { }
const vagaroOnly = () => S.settings.gcalVagaroOnly !== false;
const gcalOn = () => !!sync.cfg && S.settings.gcalOn === true;
const gcalHash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
async function gcalMaybe(force) {
  if (!gcalOn()) { if (force) toast('Tick “Bring in Google Calendar appointments” first'); return; }
  if (gcal.busy && !(force && Date.now() - gcal.last > 30000)) { if (force) toast('Still checking the calendar — give it a few more seconds'); return; }
  if (!force && Date.now() - gcal.last < GCAL_EVERY) return;
  gcal.busy = true; gcal.last = Date.now();
  if (force) { toast('Checking the calendar…'); const b = $('[data-act="gcalNow"]'); if (b) { b.disabled = true; b.textContent = 'Checking…'; } }
  try {
    const o = await api('POST', { op: 'calendar', back: 2, days: 60, cals: S.settings.gcalCals || null });
    if (!Array.isArray(o.events)) { gcal.state = 'oldscript'; if (force) toast('The Sheet script needs the calendar update first — see the steps under Google Calendar'); return; }
    gcal.state = 'ok'; gcal.err = ''; gcal.cals = o.calendars || []; gcal.at = Date.now();
    try { localStorage.setItem('lifegarden.gcal', JSON.stringify({ cals: gcal.cals, at: gcal.at })); } catch (e) { }
    gcal.total = o.events.length; gcal.vg = o.events.filter(e => e.vg).length;
    if (vagaroOnly()) o.events = o.events.filter(e => e.vg);
    const n = gcalMerge(o);
    if (force) toast(n ? `Calendar: ${n} change${n === 1 ? '' : 's'} brought in` : 'Calendar is up to date');
  } catch (e) {
    const msg = String(e.message || e);
    gcal.state = /authoriz|permission|calendar:/i.test(msg) ? 'auth' : 'error'; gcal.err = msg;
    if (force) toast(gcal.state === 'auth' ? 'Google Calendar isn’t allowed yet — run connectCalendar in the script (steps in Settings)' : 'Couldn’t read the calendar: ' + msg.slice(0, 90));
  } finally { gcal.busy = false; if (R.view === 'backup') render(); }
}
function gcalMerge(o) {
  const want = new Map(o.events.map(e => ['gcal:' + e.id, e]));
  let n = 0; const keep = [];
  for (const b of S.blocks) {
    if (!String(b.icsUid || '').startsWith('gcal:') || b.date < o.from || b.date > o.to) { keep.push(b); continue; }
    const e = want.get(b.icsUid);
    if (!e) { n++; continue; }                                   // cancelled or moved out of the calendar
    want.delete(b.icsUid);
    if (b.title !== e.title || b.date !== e.date || b.start !== e.start || b.end !== e.end) { Object.assign(b, { title: e.title, date: e.date, start: e.start, end: e.end }); n++; }
    keep.push(b);
  }
  for (const [u, e] of want) {
    if (keep.some(b => b.icsUid === u)) continue;
    keep.push({ id: 'gc' + gcalHash(u), icsUid: u, src: 'gcal', title: e.title, date: e.date, start: e.start, end: e.end, kind: 'fixed', cat: 'auto', notes: 'From Google Calendar' + (e.cal ? ` (${e.cal})` : '') + (e.loc ? ' · ' + e.loc : '') });
    n++;
  }
  if (n) { S.blocks.splice(0, S.blocks.length, ...keep); markDirty('blocks'); render(); }
  return n;
}
function gcalCard() {
  if (!sync.cfg) return `<div class="card stack"><h3>Google Calendar</h3><p class="small">Connect the Google Sheet first — the calendar is read through it.</p></div>`;
  const on = S.settings.gcalOn === true, sel = S.settings.gcalCals;
  const stateLine = !on ? '' : gcal.state === 'oldscript' ? '<p class="small" style="color:var(--warn)">The Sheet script is the old one — do the 3 steps below.</p>'
    : gcal.state === 'auth' ? '<p class="small" style="color:var(--warn)">Calendar access isn’t allowed yet — do steps 2 and 3 below.</p>'
    : gcal.state === 'error' ? `<p class="small" style="color:var(--warn)">Last try failed: ${esc(gcal.err.slice(0, 140))}</p>`
    : gcal.at ? `<p class="small sans">${gcal.total == null ? '' : vagaroOnly() ? `Found <b>${gcal.vg}</b> Vagaro appointment${gcal.vg === 1 ? '' : 's'} in the next 60 days (skipped ${gcal.total - gcal.vg} other event${gcal.total - gcal.vg === 1 ? '' : 's'}).${!gcal.vg && gcal.total ? ' None of her events mention Vagaro — if Vagaro puts appointments on a calendar of its own, untick this and tick only that calendar below.' : ''}` : `Bringing in all ${gcal.total} events in the next 60 days.`}</p><p class="tiny muted sans">Last checked ${new Date(gcal.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · checks every 15 minutes while the app is open.</p>` : '';
  const list = on && gcal.cals && gcal.cals.length ? `<div class="stack small sans"><b>Calendars to bring in</b>${gcal.cals.map(c => `<label class="row"><input type="checkbox" data-gcal="${esc(c.id)}" ${(sel ? sel.includes(c.id) : c.on) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>` : '';
  return `<div class="card stack"><div class="row between"><h3>Google Calendar</h3>${on && gcal.state === 'ok' ? '<span class="chip good">connected</span>' : ''}</div>
    <p class="small" style="margin:0">Brings appointments from Google Calendar — including ones Vagaro adds — into the plan as fixed blocks, so everything else is planned around them. Read only: nothing is changed on the calendar.</p>
    <label class="row small sans"><input type="checkbox" id="gcalOn" ${on ? 'checked' : ''}> Bring in Google Calendar appointments</label>
    ${on ? `<label class="row small sans"><input type="checkbox" id="gcalVg" ${vagaroOnly() ? 'checked' : ''}> Only Vagaro appointments (events that mention Vagaro)</label>` : ''}
    ${stateLine}${list}
    ${on ? '<div class="row"><button class="btn" data-act="gcalNow">Check calendar now</button></div>' : ''}
    <details class="disc"${on && gcal.state && gcal.state !== 'ok' ? ' open' : ''}><summary>One-time setup in the Sheet</summary><div class="in stack small">
      <p style="margin:0"><b>1.</b> <button class="btn sm primary" data-act="copyScript">Copy the updated script</button> → in the Sheet open <b>Extensions → Apps Script</b>, select all of <b>Code.gs</b>, paste over it, and Save 💾.</p>
      <p style="margin:0"><b>2.</b> In the function menu at the top choose <b>connectCalendar</b>, press <b>▶ Run</b>, and allow access when Google asks. Use the Google account whose calendar Vagaro syncs to — it must be the Sheet owner’s calendar, or one shared with that account.</p>
      <p style="margin:0"><b>3.</b> <b>Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.</b> Then tap “Check calendar now”.</p>
    </div></details></div>`;
}
function bindGcal() {
  const t = $('#gcalOn'); if (t) t.onchange = () => { commit('settings', 'calendar setting', st => { st.gcalOn = t.checked; }, { render: false }); if (t.checked) gcalMaybe(true); else render(); };
  const v = $('#gcalVg'); if (v) v.onchange = () => { commit('settings', 'calendar setting', st => { st.gcalVagaroOnly = v.checked; }, { render: false }); gcal.last = 0; gcalMaybe(true); };
  $$('[data-gcal]').forEach(cb => cb.onchange = () => {
    const ids = $$('[data-gcal]').filter(x => x.checked).map(x => x.dataset.gcal);
    commit('settings', 'calendar list', st => { st.gcalCals = ids; }, { render: false }); gcal.last = 0; gcalMaybe(true);
  });
}
ACT.gcalNow = () => { gcal.last = 0; gcalMaybe(true); };
