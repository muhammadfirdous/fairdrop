# Verification record

Run date: 17 October 2026. Local macOS Apple Silicon, Python 3.12.14 / Node 24.19.0.

## Executed checks

| Command/check | Observed result |
| --- | --- |
| `./scripts/check.sh` | 48 pytest tests passed; ESLint, TypeScript and Vite production build passed. |
| `./scripts/setup.sh` | Completed successfully using both locked dependency specifications. |
| Development supervision test | Started API and Vite on temporary ports, checked the Vite API proxy, terminated the supervisor, and confirmed both ports were released. Passed. |
| `.venv/bin/alembic upgrade head` | Both migrations applied successfully. |
| `.venv/bin/python -m backend.cli seed` | Seeded fictional demo; idempotency also tested. |
| Backend real-process restart test | Migrated a fresh database, seeded, published, delivered 25 L, terminated uvicorn, restarted it, and read an identical authenticated day payload. Passed. |
| API frontend serving | `/plan` and other frontend routes return the built app; unknown API routes return JSON 404. |
| Contrast calculation | Ink/surface 12.24:1; muted/canvas 5.46:1; water/pale water 4.82:1; complete/pale complete 5.54:1; attention/pale attention 5.17:1; error/pale error 5.31:1. |

The test runner emits one upstream Starlette warning that its httpx-based TestClient integration is deprecated in favor of httpx2. Tests complete successfully using the pinned supported integration.

## Browser workflows executed through the supported in-app browser

The app was actually rendered and operated using the browser's Playwright locator interface. These checks are separate from the standalone Playwright CLI suite below.

- Logged in as Plot A's grower, edited and saved its request; verified it became pending with zero approval.
- Logged out and logged in as coordinator, approved the request and 12 L minimum, generated the plan, and published it.
- Confirmed calculated allocations `[40,16,32,8,24,40]` L and the supplied 16:00–17:30 schedule.
- B's changed window produced A–C–D–B–E–F with a complete schedule ending 17:33.
- F's ten-minute window retained its 40 L allocation, displayed the 20-versus-10-minute error, returned no partial schedule, and disabled publication.
- Switched to grower A, started its own turn, and tried 170 L. The backend rejected overspending and the form retained 170 L and its reason.
- Changed that value to 50 L, recorded it, and reloaded. Verified 50 L delivered, 110 L balance, 120 L remaining planned water, and a 10 L remaining-plan shortfall.
- Switched to the coordinator and recorded an explicit 10 L top-up. Verified 120 L balance while the plan stayed unchanged.
- Recorded and inspected an 8 L partial delivery for Plot B. Verified its 8 L finalized shortfall remains visible despite Plot A’s 10 L overdelivery; total delivered 58 L and balance 112 L.
- Opened the comparison view and verified each plot’s allocation, first-come baseline, fulfillment percentage, and saved plan comparison.
- Opened and inspected the dedicated Print day view with the saved plan, actual deliveries, explanations, and activity.
- Inspected the rendered plan at **1440 × 1000** and **390 × 844**.
- Used an isolated temporary test database to exercise a long plot name, an empty/unopened date, and creation of a new day.
- Mobile DOM measurement: `scrollWidth = innerWidth = 390`; ledger → selected details → schedule → expandable schematic ordering was verified.
- Activated Plot C from the schematic using the keyboard. Corresponding ledger selection and explanation updated, with visible keyboard focus styling.
- Navigated as a grower to an unpublished day's CSV endpoint and verified the access-denied response in the browser. Backend tests additionally cover forbidden approval, publication, source changes, other-grower requests, and other-grower turns.

Follow-up browser inspection on a separate temporary database also verified:

- Published the six-plot plan, marked B missed, and reduced C's execution target to 20 L while retaining its 32 L published allocation.
- Recorded A/C/D/E/F as 40/20/8/24/40 L, closed the day, and reloaded. Observed **132 L delivered, 28 L recorded balance, and 28 L finalized shortfall**, with all six turns resolved.
- Opened the closed day's printable ledger and checked the six outcomes; evidence is saved in `docs/closed-day.png`.
- Opened two coordinator tabs, edited A to 55 L in one and saved a B update in the other. The stale A save was rejected without losing 55 L. After closing, refreshing, and reopening, A saved successfully as pending.
- Found and fixed a missed-turn display inconsistency: the Delivery view now shows **0 L** for a finalized missed turn, consistent with CSV and print, rather than the dash reserved for unfinished turns. Reloaded the built application and confirmed the fix.

Concrete repairs from inspection: SVG beds now have actual width/height attributes and selection borders; mobile masthead ordering was corrected; labels and hints were separated; small desktop operational text was enlarged; timeline narrow-turn labels no longer hide the wrong turn; touch targets were corrected; print output distinguishes unrecorded quantities from zero deliveries.

## Standalone Playwright passed

The final run on 17 October 2026 passed **all eight specs in 12.6 seconds**. This was verified from the saved HTML report's embedded `report.json`: total 8, expected 8, unexpected 0, flaky 0, skipped 0, and ok true. `frontend/test-results/.last-run.json` independently records `status: passed` and an empty failedTests list. The earlier browser-launch restriction is no longer an outstanding verification item.

The suite covers grower request → coordinator review → publication → own partial delivery → reload; unauthorized publication; alternative and impossible schedules; overdelivery validation/top-up/correction; mobile/long-name/empty-day layout and keyboard focus; failed-network retry; CSV contents; deep links and print-to-PDF; full closure with missed/reduced turns; unchanged published allocations; and concurrent edit rejection/recovery.

Run again with `./scripts/browser-test.sh`. It uses a disposable migrated/seeded database and cached version-matched Chromium, leaving the normal demo database intact. The HTML report is at `frontend/playwright-report/index.html`.

The follow-up also passed 48 backend tests, ESLint, TypeScript, and the production build. Screenshots and report artifacts document the rendered workflows. Presentation material is in PRESENTATION.md.

## Local presentation startup

Run `./scripts/dev.sh` to serve the development frontend at http://127.0.0.1:5174 and the API at http://127.0.0.1:8000. Alternatively, build and run `./scripts/start.sh` to serve both from port 8000. These are local startup addresses, not a hosted deployment.
