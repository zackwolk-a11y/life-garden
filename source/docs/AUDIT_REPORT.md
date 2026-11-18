# Life Garden — UX/UI audit, changes and verification

App version **2026.11.18-a** · audited 17 Nov 2026 · live at https://zackwolk-a11y.github.io/life-garden/

This report covers what was found, what changed, how it was tested, what protects the data, and what is still open. Screenshots with real plan content are kept out of this public repository; they are in the ZIP sent to Quest (`screens/before`, `screens/after`).

---

## 1. Audit findings (prioritized)

Each view was opened on a 375 × 812 phone (touch, 2× pixels) and a 1300 × 850 desktop, using a full copy of Jordan's plan (1,467 time blocks, 16 next steps, 136 day notes), and measured automatically (`docs/../tests`, `audit/shoot.py`).

| # | Priority | Area | Problem found | Status |
|---|---|---|---|---|
| 1 | P0 data | Whole app | No automatic copy of the plan before an app update, a restore, a reset, an import, or a large change arriving from the Sheet. A bad update or a mass deletion in the Sheet would have synced straight onto every phone with only manual backups to fall back on. | **Fixed** — restore points (§4) |
| 2 | P0 data | Sheet sync | If someone (or Gemini) deleted most rows in the Sheet, the phone adopted that silently. | **Fixed** — the change still syncs (the Sheet stays the shared truth), but a restore point of the earlier plan is saved first and a notice is shown |
| 3 | P1 time blocking | Today | No answer to "what am I doing now / what's next / how much open time is left". The phone had to scroll past the header, three buttons, quick add and the day strip to reach the timeline. | **Fixed** — Now / Next / Free / Done card at the top of the day, with "needs a decision" chips (overlaps, to-confirm, suggestions) |
| 4 | P1 time blocking | Blocks | Tapping a block opened the full edit form, and on phones the keyboard popped up immediately. No one-tap Done, move or delete. | **Fixed** — tap opens a quick-action sheet: Done, Edit, 15 min earlier/later, Move to tomorrow, Duplicate, Delete, plus Keep / Dismiss for suggestions. The edit form no longer autofocuses for existing blocks |
| 5 | P1 time blocking | Blocks | Deleting a fixed or protected block (or a confirmed one) happened with no question. | **Fixed** — asks first, with Undo after |
| 6 | P1 time blocking | Today | Fixed vs flexible vs suggested vs done wasn't explained anywhere on screen. | **Fixed** — legend under the timeline |
| 7 | P1 time blocking | Add | Two separate add buttons plus a quick-add bar; no way to see open slots. | **Fixed** — one **＋ Add** sheet: type-it-as-you'd-say-it, Time block, Next step, and the day's open gaps as one-tap buttons. The quick-add bar stays on desktop |
| 8 | P1 mobile | Money and every list | Tables were wider than the phone; the page was clipped on the right (stat cards and ledger columns cut off and unreachable). Cause: the main column could grow wider than the screen. | **Fixed** — main column constrained; every list table becomes stacked cards with labels on phones |
| 9 | P1 desktop | Week & month | Long event titles stretched the month grid to 2,014 px, so the whole page scrolled sideways at 1300 px. | **Fixed** — month columns can no longer grow (page is 1300 px wide) |
| 10 | P2 mobile | All | Many buttons and icons below the 44 × 44 touch-target guideline. | **Improved** — on touch screens buttons, tabs and icon buttons get 40–44 px minimums; checkboxes enlarged. Timeline blocks shorter than 44 px remain (they represent short time spans); they open the action sheet, which has full-size buttons |
| 11 | P2 mobile | Header | Hero artwork took 150 px plus a two-line subtitle on every screen. | **Improved** — 118 px on phones, subtitle hidden there (kept on desktop). Artwork, dancer, dog and the logo are unchanged |
| 12 | P2 mobile | Settings | Settings was the longest screen (3,478 px on phone); rarely used tools mixed with everyday ones. | **Improved** — calendar files, draft import and reset moved into a "More tools" group (2,895 px) |
| 13 | P2 a11y | All | No reduced-motion support; focus ring inconsistent. | **Fixed** — `prefers-reduced-motion` honoured; visible focus ring on every control |
| 14 | P2 mobile | Money / Capacity | Three stat cards stacked full-width on phones, pushing content down. | **Fixed** — three compact cards in a row |
| 15 | P3 | Opportunities, Well-being, Family prep, Move | Generally sound; the table→card change and touch targets above apply. No section-specific redesign beyond that this round. | Partly addressed (see §6) |

## 2. Before and after (measured)

Same data, same day (Wed 18 Nov), same automated script. "Small targets" counts visible controls under 44 px in either direction (timeline blocks included). "Sideways scroll" = page wider than the screen.

| View | Phone height before → after | Phone small targets before → after | Sideways scroll before → after |
|---|---|---|---|
| Today | 2,759 → 2,985 px (new Now card) | 101 → 97 | no → no |
| Money | 1,276 → 947 px | 11 → 6 | content clipped → fits |
| Capacity | 2,426 → 2,122 px | 19 → 18 | no → no |
| Settings | 3,478 → 2,895 px | 44 → 38 | no → no |
| Opportunities | 812 → 812 px | 8 → 3 | no → no |
| Well-being | 1,447 → 1,468 px | 13 → 9 | no → no |
| Family prep | 812 → 812 px | 4 → 1 | no → no |
| Move | 1,127 → 1,155 px | 8 → 4 | no → no |
| Desktop Week & month | 1,690 px | 5 → 5 | **yes (2,014 px wide) → no** |

Today got slightly taller on phones because the Now/Next/Free card was added above the timeline; the first timeline block now starts at about 590 px instead of 520 px on a connected phone. That trade is deliberate: the card answers "what now" without scrolling, and every block is reachable from it.

## 3. Testing report

**Automated (in this repository, `tests/test_app.py`)** — runs the real built app in Chromium as a touch phone (375 px, Pacific time zone) against the real `Code.gs` backend inside a Google-services stand-in (`tests/mock-apps-script.js`). Uses synthetic data only. Result on 17 Nov 2026: **24 / 24 passed.**

- Upgrade from an older version: every stored record loads unchanged; exactly one "Before app update" restore point is taken, with matching counts, and none on the next open.
- Done, Keep-it and Move-to-tomorrow are checked **in device storage after a reload**, not by the button click.
- Moving a block shows the review first; fixed and protected blocks are never shifted by knock-on changes.
- Deleting a locked block asks; Cancel keeps it; Undo restores a deletion.
- Free-time gaps are computed correctly inside the waking day.
- Day arithmetic and calendar export across both 2026–27 daylight-saving changes.
- Restore point round trip through the Settings screen restores the plan byte-for-byte, keeps the replaced plan as its own restore point, and is what's saved after a reload.
- Sync: every block reaches the Sheet (row count checked on the server side); a mass deletion in the Sheet leaves a restore point of the earlier plan.
- No sideways scrolling on any view at 375 px; tab bar present; no JavaScript errors.

Earlier suites (not in this repo because they use private data or API keys) were re-run where relevant: drag-and-drop on desktop and phone (week grid and timeline, locked-block warning) and the daily briefing — all behaved as before, except that a plain click on a block now opens the quick-action sheet instead of the editor, as intended.

**Screens checked by eye:** every view on phone and desktop, before and after (ZIP: `screens/`).

**Not tested — limitations**
- No real iPhone or Android device was available. Touch behaviour, Safari's Home Screen mode, safe-area insets, the iOS keyboard and microphone permissions were checked only in Chromium's phone emulation. Please try the build on Jordan's iPhone: tap a block, mark it done, use ＋ Add, rotate the phone.
- The live Google Sheet and Apps Script deployment were not touched by these tests; sync was tested against the same `Code.gs` running in a local stand-in.
- Voice (ChatGPT/Gemini) wasn't re-run with live keys this round; the voice code wasn't changed.
- VoiceOver/TalkBack screen readers weren't tried; labels exist on blocks and controls but haven't been checked with a real reader.

## 4. Data-integrity report

- **No data model change.** The stored shape (`lifegarden.v1` in device storage, the Sheet tabs, and the "App data" JSON tab) is unchanged. No migration was needed, and the upgrade test proves an older stored plan loads record-for-record.
- **Nothing was replaced with sample data.** Jordan's plan was only read (from a backup copy) to take screenshots locally; no test touches her device or Sheet.
- **Restore points (new).** A full copy of the plan is saved on the device (IndexedDB, newest 14 kept):
  - before the app updates to a new version (first open of the new version, before syncing);
  - once a day;
  - before restoring a backup, resetting, importing the recovery pack, removing recovered draft blocks, or adopting the Sheet's plan when connecting;
  - before applying a sync that removes 10% or more of blocks, steps, money entries or day notes at once.
  - Each restore point shows its time, reason and counts, and can be **downloaded** or **restored** (Settings → Restore points). Restoring first saves the current plan as another restore point, so it's reversible, and then syncs to the Sheet like any edit.
- **Existing protections kept:** Undo for every change; daily Drive backup in the "Life Garden backups" folder (when connected); manual JSON backup/restore; passcode with lockout on the Sheet; the Sheet stays the shared copy.
- **Authentication and authorization unchanged:** same passcode-protected Apps Script, same setup link, no new services, no data leaves the device except to that Sheet (and, for voice, to the AI provider Jordan chose).
- **Reversibility:** every change in this round is in git history; the previous version is commit `f9ee7b1`. Rolling back is a single revert and doesn't affect stored data, because the data shape is unchanged.

## 5. Portability

The app is a static site: it runs from any web host (or from the ZIP's `site/` folder served locally) and works offline on the device. It is **not fully portable** in one respect: sharing between phones depends on a Google Sheet + Apps Script deployment in Quest's Google account, and voice depends on an OpenAI or Gemini key. Without those, everything works on a single device, saved locally.

## 6. Remaining issues and next steps

1. **Real-device check** on Jordan's iPhone (see limitations above).
2. **Update the Sheet script** if not already done (Settings → Google Sheet sync → Update the Sheet script: copy, paste over Code.gs in Apps Script, save, then Deploy → Manage deployments → ✎ → New version). Needed for the faster sync and the ChatGPT key menu.
3. **Re-add the Home Screen icon** to pick up the new logo (iOS caches icons).
4. Section-specific redesigns not done this round: Opportunities pipeline view, Well-being trends, Pregnancy-prep timeline, Move checklist by date. These sections now fit phones but keep their existing structure.
5. "Advice & Research" and "Shared Planning" from the brief don't exist as separate sections in this rebuild (shared planning is "This week together" on Today and in Capacity); the original live site and its saved data were never available to compare against.
6. Short timeline blocks stay under 44 px tall by design; an option for a taller "comfortable" timeline scale would help.
7. Screen-reader pass (VoiceOver) not yet done.

## 7. How to build and test

```
./build.sh                       # concatenates src/ into site/index.html and syntax-checks it
python3 tests/test_app.py        # needs node, python3, playwright (pip install playwright; playwright install chromium)
```
Publishing: copy `site/` to the GitHub Pages repository root, bump `CACHE` in `site/sw.js` and `APP_VERSION` in `src/b_core.js` together.
