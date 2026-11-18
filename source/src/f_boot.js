/* ================= boot ================= */
loadLocal();
if (!S.capacity.whatIf) S.capacity.whatIf = {};
parseHash();

render();
/* Show 24-hour times written inside saved text (titles, notes from the recovered draft) as normal 12-hour times.
   Display only: the saved text and the edit boxes keep exactly what was typed. */
(function show12hTimes() {
  const SKIP = /^(TEXTAREA|SCRIPT|STYLE|INPUT|SELECT|OPTION|PRE|CODE)$/;
  const fix = root => {
    if (root.nodeType === 3) { if (!SKIP.test(root.parentNode && root.parentNode.nodeName)) { const t = to12Typed(root.data); if (t !== root.data) root.data = t; } return; }
    if (root.nodeType !== 1 || SKIP.test(root.nodeName)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => SKIP.test(n.parentNode.nodeName) || !/\d:\d\d/.test(n.data) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    for (const n of list) { const t = to12Typed(n.data); if (t !== n.data) n.data = t; }
  };
  fix(document.body);
  new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(fix); }).observe(document.body, { childList: true, subtree: true });
})();
$('#heroTitle') && $('#heroTitle').addEventListener('click', showStatus);   // tap the title to see the sync status again
bootSnapshots().catch(e => console.warn('restore points', e));
(function handleConnectLink() {
  const m = location.hash.match(/^#connect=(.+)$/); if (!m) return;
  const cfg = readSetupCode(m[1]); history.replaceState(null, '', '#today'); R.view = 'today';
  if (!cfg) return toast('That setup link is incomplete');
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !standalone) {
    openModal(`<div class="mh"><h3>Put Life Garden on your Home Screen</h3></div><div class="mb small stack">
      <p><b>1.</b> Tap <b>Copy setup code</b> below.</p><p><b>2.</b> Tap the Share button <span class="kbd">⬆</span> at the bottom of Safari, then <b>Add to Home Screen</b> → <b>Add</b>.</p>
      <p><b>3.</b> Open <b>Life Garden</b> from your Home Screen, go to <b>Settings & backup</b>, paste the code in “Connect a Google Sheet”, and tap Connect.</p>
      <p class="tiny muted sans">The Home Screen app keeps its own storage, which is why the code is pasted there rather than here.</p></div>
      <div class="mf"><button class="btn" data-act="close">Later</button><button class="btn primary" id="cpy">Copy setup code</button></div>`, mm => { $('#cpy', mm).onclick = () => navigator.clipboard?.writeText(setupCode(cfg)).then(() => { toast('Code copied'); }, () => { $('#cpy', mm).replaceWith(Object.assign(document.createElement('textarea'), { value: setupCode(cfg), readOnly: true, rows: 3 })); }); });
    return;
  }
  confirmBox('Connect this device to the shared Life Garden Google Sheet?', 'Connect').then(ok => ok && doConnect(cfg));
})();
if (sync.cfg) syncNow({ quiet: true }); else setStatus('local', 'Saved on this device');
setInterval(() => { if (R.view === 'today' && R.date === todayISO() && !dlg().open && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { const n = $('.tl .now'); const tl = $('.tl'); if (n && tl) n.style.top = (nowMin() - +tl.dataset.r0) * +tl.dataset.px + 'px'; } }, 60000);
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !dlg().open) { reloaded = true; location.reload(); } });   // a new version arrived: load it once
  navigator.serviceWorker.register('sw.js').then(r => { r.update().catch(() => { }); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update().catch(() => { }); }); }).catch(() => { });
}
