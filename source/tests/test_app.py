"""
End-to-end tests for Life Garden, run against the real built app (site/index.html)
and the real Apps Script backend (site/Code.gs) running inside a small Google-services stand-in.

  pip install playwright && playwright install chromium
  python3 tests/test_app.py            (needs node on PATH; starts its own servers)

Uses a synthetic plan only — never Jordan's real data.
"""
import asyncio, json, os, random, socket, subprocess, sys, time, urllib.request, functools, http.server, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_DIR = os.environ.get('SITE_DIR') or (os.path.join(ROOT, 'site') if os.path.isdir(os.path.join(ROOT, 'site')) else os.path.dirname(ROOT))  # ZIP layout: ./site ; GitHub repo layout: source/ inside the served folder
SURL = 'https://script.google.com/macros/s/TEST/exec'
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

# ---------- synthetic plan ----------
def fixture():
    random.seed(7)
    days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-01', '2027-03-14']
    blocks = []
    for d in days:
        t = 7 * 60
        for i in range(8):
            dur = random.choice([30, 45, 60, 90])
            kind = 'fixed' if i == 3 else 'protected' if i == 6 else 'flexible'
            st = random.choice([None, 'proposed', 'confirmed'])
            b = {'id': f'b{d}{i}', 'title': f'Test block {d} #{i}', 'date': d, 'start': t, 'end': t + dur, 'kind': kind, 'cat': 'auto', 'notes': ''}
            if st: b['status'] = st; b['src'] = 'draft'
            blocks.append(b); t += dur + 15
    tasks = [{'id': f't{i}', 'title': f'Test step {i}', 'area': 'Today', 'status': 'Confirmed', 'date': '2026-11-18', 'notes': '', 'mins': 30} for i in range(10)]
    money = [{'id': f'm{i}', 'type': 'income' if i % 2 else 'expense', 'desc': f'Entry {i}', 'cat': 'Test', 'date': '2026-11-2' + str(i), 'est': 100 + i, 'actual': '', 'settled': False} for i in range(5)]
    notes = {d: {'note': f'Note for {d}'} for d in days[:3]}
    return {'blocks': blocks, 'tasks': tasks, 'daynotes': notes, 'money': {'entries': money}}

results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail)); print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail and not cond else ''))

async def main():
    port, mport = free_port(), free_port()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=SITE_DIR)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler); threading.Thread(target=httpd.serve_forever, daemon=True).start()
    mock_src = open(os.path.join(ROOT, 'tests', 'mock-apps-script.js')).read().replace('.listen(8790', f'.listen({mport}')
    mock_path = os.path.join(ROOT, 'tests', '.mock-run.js'); open(mock_path, 'w').write(mock_src)
    mock = subprocess.Popen(['node', mock_path, os.path.join(SITE_DIR, 'Code.gs')], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(1.2)
    SITE = f'http://127.0.0.1:{port}/index.html'
    def mock_call(path, body=None):
        req = urllib.request.Request(f'http://127.0.0.1:{mport}' + path, data=body.encode() if body else None, method='POST' if body else 'GET')
        return urllib.request.urlopen(req).read().decode()
    async def route(r):
        req = r.request; q = req.url.split('?', 1)[1] if '?' in req.url else ''
        txt = await asyncio.get_event_loop().run_in_executor(None, lambda: mock_call('/exec?' + q, req.post_data if req.method == 'POST' else None))
        await r.fulfill(status=200, body=txt, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'})
    fx = fixture()
    try:
        async with async_playwright() as p:
            br = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox']) if CHROME else await p.chromium.launch()
            errs = []
            ctx = await br.new_context(viewport={'width': 375, 'height': 812}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id='America/Los_Angeles')
            await ctx.route(SURL + '*', route)
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
            # 1. Upgrade from an older version keeps every record and makes a restore point first
            await pg.goto(SITE); await pg.wait_for_timeout(300)
            stored = await pg.evaluate("""fx => { const base = defaults(); const o = {}; for (const k of SECTIONS) o[k] = base[k];
                o.blocks = fx.blocks; o.tasks = fx.tasks; o.daynotes = fx.daynotes; o.money = { ...base.money, entries: fx.money.entries };
                o.settings = { ...base.settings, briefingOn: false };
                localStorage.setItem(LS_KEY, JSON.stringify(o)); localStorage.setItem('lifegarden.appver', '2026.01.01-old'); return JSON.stringify(o); }""", fx)
            await pg.reload(); await pg.wait_for_timeout(900)
            # every stored value must still be there unchanged (start-up may only ADD empty defaults, e.g. capacity.whatIf = {})
            same = await pg.evaluate("""s => { const o = JSON.parse(s), sub = (a, b) => a === b || (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length) && Object.keys(a).every(k => sub(a[k], b[k])));
                return SECTIONS.filter(k => !sub(o[k], S[k])); }""", stored)
            check('upgrade: every stored record loads unchanged', same == [], f'changed sections: {same}')
            snaps = await pg.evaluate("snapList().then(a => a.map(o => ({ reason: o.reason, counts: o.counts, data: o.data })))")
            up = [s for s in snaps if s['reason'].startswith('Before app update')]
            check('upgrade: restore point taken before the update', len(up) == 1 and json.loads(up[0]['data'])['blocks'] == fx['blocks'], str([s['reason'] for s in snaps]))
            check('upgrade: restore point counts match', up and up[0]['counts']['blocks'] == len(fx['blocks']) and up[0]['counts']['tasks'] == 10 and up[0]['counts']['money'] == 5)
            await pg.reload(); await pg.wait_for_timeout(700)
            n2 = await pg.evaluate("snapList().then(a => a.filter(o => o.reason.startsWith('Before app update')).length)")
            check('upgrade: no duplicate restore point on the next open', n2 == 1, f'{n2}')

            # 2. Block quick actions on a phone, verified in storage after a reload (not by the button click)
            await pg.evaluate("go('today', '2026-11-18'); S.settings.showDraft = true; render()"); await pg.wait_for_timeout(300)
            flex = next(b for b in fx['blocks'] if b['date'] == '2026-11-18' and b['kind'] == 'flexible' and not b.get('status'))
            await pg.evaluate(f"openBlockActions('{flex['id']}')"); await pg.wait_for_timeout(200)
            check('actions sheet opens with quick actions', await pg.locator('#baDone').count() == 1 and await pg.locator('#baTomorrow').count() == 1)
            await pg.click('#baDone'); await pg.wait_for_timeout(300)
            await pg.reload(); await pg.wait_for_timeout(600)
            done = await pg.evaluate(f"JSON.parse(localStorage.getItem(LS_KEY)).blocks.find(b => b.id === '{flex['id']}').done")
            check('Done is saved and survives a reload', done is True)
            prop = next(b for b in fx['blocks'] if b['date'] == '2026-11-18' and b.get('status') == 'proposed')
            await pg.evaluate(f"go('today','2026-11-18'); openBlockActions('{prop['id']}')"); await pg.wait_for_timeout(200)
            await pg.click('#baKeep'); await pg.wait_for_timeout(300)
            st = await pg.evaluate(f"JSON.parse(localStorage.getItem(LS_KEY)).blocks.find(b => b.id === '{prop['id']}').status")
            check('Keep it confirms a suggestion', st == 'confirmed', st)
            mv = next(b for b in fx['blocks'] if b['date'] == '2026-11-19' and b['kind'] == 'flexible' and b['id'] != flex['id'])
            fixed20 = [b for b in fx['blocks'] if b['date'] == '2026-11-20' and b['kind'] != 'flexible']
            await pg.evaluate(f"openBlockActions('{mv['id']}')"); await pg.wait_for_timeout(200)
            await pg.click('#baTomorrow'); await pg.wait_for_timeout(300)
            check('Move to tomorrow shows a review first', await pg.locator('#mvForce').count() == 1)
            btn = '#mvApply' if await pg.locator('#mvApply').count() else '#mvForce'
            await pg.click(btn); await pg.wait_for_timeout(300)
            after = await pg.evaluate("JSON.parse(localStorage.getItem(LS_KEY)).blocks")
            moved = next(b for b in after if b['id'] == mv['id'])
            check('block moved to the next day', moved['date'] == '2026-11-20')
            locked_ok = all(next(x for x in after if x['id'] == f['id'])['start'] == f['start'] and next(x for x in after if x['id'] == f['id'])['end'] == f['end'] for f in fixed20)
            check('fixed/protected blocks were not moved by the knock-on changes', locked_ok)
            lk = next(b for b in fx['blocks'] if b['date'] == '2026-11-21' and b['kind'] == 'fixed')
            await pg.evaluate(f"openBlockActions('{lk['id']}')"); await pg.wait_for_timeout(200)
            await pg.click('#baDel'); await pg.wait_for_timeout(300)
            asked = await pg.locator('dialog[open]').count() == 1 and 'Delete' in (await pg.inner_text('dialog[open]'))
            check('deleting a locked block asks first', asked)
            await pg.click('dialog[open] button:has-text("Cancel")'); await pg.wait_for_timeout(200)
            still = await pg.evaluate(f"S.blocks.some(b => b.id === '{lk['id']}')")
            check('cancelling keeps the locked block', still)
            nb = await pg.evaluate("S.blocks.length")
            await pg.evaluate(f"commit('blocks','remove', bl => bl.splice(bl.findIndex(b => b.id === '{lk['id']}'), 1))"); await pg.evaluate("undo()")
            check('undo brings a deleted block back', await pg.evaluate(f"S.blocks.some(b => b.id === '{lk['id']}')") and await pg.evaluate("S.blocks.length") == nb)

            # 3. Free time
            gaps = await pg.evaluate("""() => { S.settings.dayStart = 6; S.settings.dayEnd = 24; S.settings.sleepFrom = '23:00'; S.settings.sleepTo = '07:00';
               const list = [{ id: 'g1', date: '2030-01-02', start: 540, end: 600, kind: 'flexible' }, { id: 'g2', date: '2030-01-02', start: 780, end: 840, kind: 'fixed' }];
               return freeGaps('2030-01-02', list); }""")
            check('free time = gaps inside the waking day', gaps == [[420, 540], [600, 780], [840, 1380]], str(gaps))

            # 4. Dates across daylight-saving changes
            dst = await pg.evaluate("[addDays('2026-10-31', 1), addDays('2026-11-01', 1), addDays('2027-03-13', 1), addDays('2027-03-14', 1), weekStart('2026-11-01'), weekStart('2027-03-14')]")
            check('day arithmetic is DST-safe', dst == ['2026-11-01', '2026-11-02', '2027-03-14', '2027-03-15', '2026-10-26', '2027-03-08'], str(dst))
            ics = await pg.evaluate("toICS('2026-11-01','2026-11-01')")
            first = next(b for b in fx['blocks'] if b['date'] == '2026-11-01' and b.get('status') != 'proposed')
            hh = f"{first['start'] // 60:02d}{first['start'] % 60:02d}00"
            check('calendar export keeps wall-clock time on the DST day', f'DTSTART;TZID=America/Los_Angeles:20261101T{hh}' in ics or f'20261101T{hh}' in ics, ics[:300])

            # 5. Restore point round trip through the Settings screen
            base = await pg.evaluate("JSON.stringify(S.blocks)")
            await pg.evaluate("takeSnapshot('test point')"); await pg.wait_for_timeout(200)
            await pg.evaluate("commit('blocks','wipe', bl => bl.splice(0, 20))")
            await pg.evaluate("go('backup')"); await pg.wait_for_timeout(600)
            t = await pg.evaluate("snapList().then(a => a.find(o => o.reason === 'test point').t)")
            await pg.click(f'[data-act=snapRestore][data-t="{t}"]'); await pg.wait_for_timeout(200)
            await pg.click('dialog[open] .btn.primary, dialog[open] button:has-text("Restore")'); await pg.wait_for_timeout(700)
            check('restoring a restore point brings the plan back exactly', await pg.evaluate("JSON.stringify(S.blocks)") == base)
            pre = await pg.evaluate("snapList().then(a => a.find(o => o.reason === 'Before restoring a backup'))")
            check('the plan being replaced is kept as a restore point too', pre and pre['counts']['blocks'] == len(json.loads(base)) - 20)
            await pg.reload(); await pg.wait_for_timeout(600)
            check('restored plan is what is saved on the device', await pg.evaluate("JSON.stringify(JSON.parse(localStorage.getItem(LS_KEY)).blocks)") == base)

            # 6. Real sync to the Sheet backend, verified on the server
            await pg.evaluate(f"connectSheet('{SURL}', 'tucker')"); await pg.wait_for_timeout(4000)
            insp = json.loads(mock_call('/inspect'))
            rows = insp.get('Time blocks', {}).get('rows', 0) - 1
            check('every block reached the Sheet', rows == await pg.evaluate("S.blocks.length"), f'sheet rows {rows}')
            mock_call('/gemini', json.dumps({'tab': 'Time blocks', 'keepFirst': 3}))
            await pg.evaluate("syncNow()"); await pg.wait_for_timeout(2500)
            big = await pg.evaluate("snapList().then(a => a.find(o => o.reason.startsWith('Before a large change from the Sheet')))")
            check('a mass deletion in the Sheet leaves a restore point of the earlier plan', big and big['counts']['blocks'] == len(json.loads(base)), str(big and big['reason']))

            # 7. Phone layout: nothing wider than the screen, tab bar present
            over = {}
            for v in ['today', 'week', 'capacity', 'money', 'projects', 'move', 'opps', 'well', 'prep', 'backup']:
                await pg.evaluate(f"go('{v}', '2026-11-18')"); await pg.wait_for_timeout(250)
                over[v] = await pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            check('no sideways scrolling on a 375px phone', not any(over.values()), str({k: v for k, v in over.items() if v}))
            check('bottom tab bar visible on phone', await pg.is_visible('#tabbar'))
            check('no JavaScript errors', not errs, '; '.join(errs[:3]))
            await br.close()
    finally:
        mock.terminate(); httpd.shutdown()
        try: os.remove(mock_path)
        except OSError: pass
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    sys.exit(1 if failed else 0)

asyncio.run(main())
