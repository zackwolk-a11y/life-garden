# Jordan's Life Garden

A private daily planner that installs on iPhone as a full-screen Home Screen app and keeps its data in a Google Sheet, where Gemini can read and edit it.

- **App:** this folder, hosted as a static site (GitHub Pages). No personal data is stored here.
- **Data:** a Google Sheet in Drive with readable tabs: Time blocks, Next steps, Day notes, Money, Opportunities. `Code.gs` is the Apps Script that lets the app sync with it, protected by a passcode.
- **Privacy:** the plan lives only in the owner's Google Sheet and on connected devices. This site holds no personal data and is hidden from search engines. The Sheet script requires a passcode and locks for 30 minutes after 10 wrong guesses.
- **Backups:** a dated JSON backup is written daily to the "Life Garden backups" folder in Drive.

## Set up the Sheet (once, on a computer)
Open the app → **Settings & backup → Connect a Google Sheet → First-time setup** and follow the six steps.

## Put it on an iPhone
1. On the connected computer: Settings & backup → **Copy setup link for another phone**, and text it to the phone.
2. On the iPhone, open the link in **Safari** → tap **Copy setup code** → Share ⬆ → **Add to Home Screen**.
3. Open **Life Garden** from the Home Screen → Settings & backup → paste the code → **Connect** → **Use the Sheet's plan**.

## Voice assistant
Tap 🎙 on any screen and say what you want ("Move yoga to 4 tomorrow", "Dentist Tuesday at 10", "What's on Thursday?"). Proposed changes are shown for approval before anything is saved. It runs through the Sheet's script using a Gemini API key stored in the script's properties (Settings & backup → Voice assistant explains the 2-minute setup).

## Editing with Gemini
Open the Sheet and use Gemini in the side panel, e.g. *"Add a fixed block on 2026-11-24 from 10:00 to 11:00 called Dentist"*. The **How to edit (for Gemini)** tab explains the columns. Changes appear in the app within about a minute, or when it's reopened.

## Source, tests and audit report

- `source/src/` — the app's source files; `source/build.sh` rebuilds `index.html` from them.
- `source/tests/test_app.py` — end-to-end tests against the real app and the real `Code.gs` (synthetic data only). Run `python3 source/tests/test_app.py` (needs node, python3 and Playwright).
- `source/docs/AUDIT_REPORT.md` — UX/UI audit, before/after, testing report and limitations, data-integrity report, remaining issues.
