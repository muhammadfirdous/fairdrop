# FairDrop

**Share water, grow together.** A complete local community water fieldbook: requests, review, transparent allocation, feasible single-hose scheduling, immutable published plans, and reconciled actual deliveries.

The fictional demo is **Ak-Bulak Community Garden**, with six plots and the `Asia/Bishkek` timezone. No paid services, cloud account, API key, Docker, or external authentication is required. Data is stored on the server, not in browser storage.

## Quick start

Requires **Python 3.11+**, **Node.js 22.12+** (or 24 LTS), and **pnpm 11.25.0**. On macOS Apple Silicon, install native versions of these runtimes. If npm is available, install pnpm with `npm install -g pnpm@11.25.0`. The scripts prefer installed runtimes and can also use the Codex desktop bundled runtimes when available.

From this directory:

```bash
./scripts/setup.sh
.venv/bin/python -m backend.cli seed
./scripts/dev.sh
```

- Frontend: **http://127.0.0.1:5174**
- API: **http://127.0.0.1:8000/api/health**
- Interactive API reference: **http://127.0.0.1:8000/docs**

The development frontend uses port 5174 by default. Development uses Vite's `/api` proxy. The development supervisor checks both ports, waits for successful HTTP responses, prints the URLs, and terminates both service process groups on Ctrl-C. Stop an already-running FairDrop server before starting another copy. To use different development ports, set `FAIRDROP_API_PORT` and `FAIRDROP_WEB_PORT` when calling `dev.sh`; the proxy and printed URLs follow those values.

### Built application

```bash
./scripts/build.sh
./scripts/start.sh
```

The backend serves the compiled application and API together at **http://127.0.0.1:8000**. Direct frontend routes such as `/requests`, `/delivery`, and `/print` work. Unknown `/api` routes return JSON 404 errors rather than the frontend HTML. `start.sh` builds if no compiled frontend exists; after changing frontend source, explicitly run `build.sh` again.

### Demo logins

| Account | Email | Password |
| --- | --- | --- |
| Coordinator, Mira Asanova | `coordinator@fairdrop.local` | `GardenTogether!26` |
| Aida, Plot A | `grower.a@fairdrop.local` | `GardenTogether!26` |
| Bektur, Plot B | `grower.b@fairdrop.local` | `GardenTogether!26` |
| Cholpon, Plot C | `grower.c@fairdrop.local` | `GardenTogether!26` |
| Daniyar, Plot D | `grower.d@fairdrop.local` | `GardenTogether!26` |
| Elmira, Plot E | `grower.e@fairdrop.local` | `GardenTogether!26` |
| Farida, Plot F | `grower.f@fairdrop.local` | `GardenTogether!26` |

The login page labels these as fictional credentials. The seed command creates today's day in Asia/Bishkek unless `--date YYYY-MM-DD` is supplied. Seeding is idempotent: existing requests and results are not reset. Startup never seeds or resets automatically. Existing fictional delivery records remain unchanged when the seed command runs again.

## Persistence and migrations

The default database is **`data/fairdrop.sqlite3`**, with SQLite WAL/SHM sidecars while running. It survives page reloads, logout, and backend restarts. The project ignores databases, virtual environments, `.env`, installed dependencies, and generated build/test directories.

```bash
.venv/bin/alembic upgrade head
.venv/bin/alembic current
```

There are two versioned migrations: the initial schema and a global unique constraint for the single active hose. Tests also apply the migrations to a fresh database and verify persistence across termination and restart of an actual uvicorn process. To back up the data, stop the server and copy the database, or use SQLite's online backup facility; do not copy only the main file while ignoring an active WAL.

Copy `.env.example` to `.env` (setup does this if it is absent). `DATABASE_URL` can select another local SQLite database. Relative paths resolve from the project root when using the scripts. The data directory must already exist. Defaults are demo mode, localhost HTTP cookies, and Asia/Bishkek.

### Explicit demo reset

This permanently replaces **all users, sessions, plots, saved days, draft/published versions, deliveries, adjustments, and activity** in the selected demo database with a new fictional seed day. It is allowed only with `DEMO_MODE=true`.

```bash
.venv/bin/python -m backend.cli reset-demo --confirm 'RESET FICTIONAL DEMO'
```

The coordinator's **Reset demo** dialog requires typing the same confirmation and describes the full scope. Reset invalidates all current sessions. This is never called on application startup or reload.

### Non-demo use

Use a separate empty database and set `DEMO_MODE=false`. Migrate, then create accounts locally:

```bash
.venv/bin/python -m backend.cli create-user --email coordinator@example.org --name 'Garden coordinator'
.venv/bin/python -m backend.cli create-user --email grower@example.org --name 'Garden grower' --role grower
```

The command securely prompts for a matching password of at least 12 characters. Log in, open a day, then use **Requests → Manage plots** to create and assign plots. Public registration and password recovery are outside this version.

For HTTPS operation set `COOKIE_SECURE=true`. Deployment, TLS termination, backups, and operational monitoring are separate tasks; the supplied startup scripts bind to localhost.

## How a day works

1. **Planning.** Growers submit one request per plot/day with one availability window. Editing clears the review, approved amount, minimum, reviewer, and timestamp. Coordinators approve, reduce with a reason, or reject with a reason. Only approved requests enter calculations.
2. **Generate plan.** The server saves a draft at the current input revision, with allocations, explanation text, first-come comparison, and either a complete schedule or explicit conflicts. Changing a planning input invalidates old drafts.
3. **Ready.** Publication checks the revision and recalculates feasibility inside a transaction. It preserves a snapshot of source settings, requests, windows, minimums, policy, allocations, schedule, and explanations, with creator and publication metadata. Reopening is allowed only before execution; it preserves the old snapshot as superseded.
4. **Active.** The first started or missed turn freezes planning. Only the next unresolved scheduled turn can start. There is one active hose across **all saved days**, not one per browser. Growers can operate only their assigned turns; the coordinator can operate any turn.
5. **Closed.** Close after every turn is Completed or Missed. Historical plans and actual records remain readable. Audited delivery/source corrections remain possible without rewriting the plan.

Every protected mutation enforces permissions on the server. Passwords use Argon2 via `pwdlib`. Random, hashed server-side session tokens expire after 12 hours. The browser receives only an HTTP-only SameSite cookie; CSRF tokens are held in memory. Authenticated writes require that token and validate browser origins. There are no credentials in local storage.

## Allocation and scheduling

Volumes are integer **millilitres**. The interface accepts litres to three decimal places; the API accepts strictly validated integers in millilitres. Times are integer seconds from local midnight. Overnight windows are rejected.

### Proportional approved need

For approved quantities `q_i`, total `Q`, and water `W`, distribute `min(W,Q) × q_i / Q`. Take integer floors, then allocate remaining millilitres by descending fractional remainder; ties use the stable plot identifier. Zero total demand gives zero allocation. Surplus stays unallocated, and nobody receives more than their approved demand.

### Agreed minimums, then proportional remainder

If the budget covers all minimums, grant each floor and distribute the remainder in proportion to `approved − minimum` using the same rounding. If the budget is below the minimum total, the draft is **infeasible**: no replacement policy is chosen silently. For the supplied minimum test, 150 L produces `[36,15,30,9,21,39]` L; 30 L cannot cover the 60 L agreed minimums.

The first-come baseline orders by the actual submission timestamp, with stable plot ID as tie-break. It is a volume comparison, not a replacement schedule or a universal fairness score.

### Exhaustive scheduling

Each positive allocation takes `ceil(60 × allocated_ml / flow_ml_min)` seconds. The engine enumerates every permutation (at most 720), places each turn at its earliest allowed start, includes hose changeover gaps, and rejects any order missing a request window or source closing time. It chooses earliest completion, then lexicographically stable plot order. Zero allocations have no turns. An infeasible schedule preserves allocations but returns **no partial schedule** and cannot be published.

The seeded 160 L example calculates `[40,16,32,8,24,40]` L, 80 L unmet demand, and the supplied A–F schedule ending at 17:30. None of these results are hardcoded responses.

Scenario presets cover adequate supply, the 160 L shortage, B's later window, and F's impossible ten-minute window. Custom source scenarios use the same engines. **Adequate supply changes water only**; at 2 L/min the original time constraints can still make the full 240 L schedule infeasible. The UI explains this explicitly. Previews never overwrite saved data and stale responses are ignored. To apply an idea during Planning, edit the source/request records, review requests, and generate a fresh draft.

## Actual water accounting

`recorded balance = published opening water + signed source adjustments − finalized actual deliveries`

Planning and publication consume no water. Starting/finishing timestamps are separate from planned times; early/late execution stays visible. Completion records the **total actual volume for that turn**. Zero deliveries and overdeliveries require reasons. Missed turns require reasons. The server never silently clamps actual water or invents a top-up.

If a delivery exceeds the recorded balance, the form keeps its input and explains the reconciliation needed. A coordinator can authorize a smaller execution target for an unstarted turn, record a genuine source adjustment, or mark it missed. The original allocation remains unchanged.

- Plan unmet demand: `sum(approved − allocated)`.
- Whole-plan delivery shortfall: `sum(max(allocated − actual, 0))`, including unfinished turns while Active.
- Finalized-turn shortfall: the same calculation restricted to Completed/Missed turns.
- Remaining-plan supply gap: `max(sum(original allocation of unresolved turns) − recorded balance, 0)`.

Overdelivery never offsets another plot's shortfall. Corrections retain the previous value, new value, reason, actor, and timestamp in activity. Source adjustments preserve the original published opening budget.

SQLite `BEGIN IMMEDIATE` serializes writes before validation reads. Revision checks reject stale edits. Critical operations require a unique operation ID; retrying identical data returns the original result, and reusing an ID with different data fails. A partial unique index additionally enforces one active hose. The UI retains an operation ID while retrying a failed identical mutation.

## Screens and records

- **Plan:** selected date/state/revision, continuous summary, keyboard-selectable schematic and ledger, explanations, scenario exploration, plan versions, source/policy settings, publication/reopening, and desktop/mobile schedule views.
- **Requests:** own-grower requests, coordinator reviews with minimums/reasons, plot assignments, crops, area, positions, and archive management. At most six active plots; existing open-day requests must finish before a plot is archived. Assignment changes are blocked while any day is Ready or Active.
- **Delivery:** current/next turn, planned versus actual quantities/times, partial/zero/overdelivery, smaller targets, missed turns, source adjustments, corrections, and closure.
- **Activity:** chronological decisions and changes with actor/timestamp/reason. CSV export includes plan/actual rows, accounting totals, and activity; text cells are protected against spreadsheet formula injection.
- **Print day:** a dedicated readable view of the selected day, with a print/save-PDF button and print CSS.

Views refresh after mutations and poll every seven seconds while the browser is visible. Open forms preserve their input on recoverable errors. Revision conflicts require reviewing current records and reopening the form rather than silently overwriting changes.

## Verification

```bash
./scripts/check.sh          # pytest, strict ESLint, TypeScript, Vite production build
./scripts/browser-test.sh   # matched Chromium install/cache, build, eight browser specs
```

The browser suite starts a separate migrated/seeded temporary SQLite database on port 8001. It never resets the normal demo database. The script installs Playwright’s version-matched Chromium headless shell in the ignored `.cache/ms-playwright/` directory and reuses it on later runs. The first run needs internet access for the browser download; system Google Chrome is not required. Set `PLAYWRIGHT_BROWSERS_PATH` to use another cache. Pass test-runner options through the script, for example `./scripts/browser-test.sh --grep "concurrent edits"`.

The eight specs cover the grower/coordinator journey, unauthorized publication, alternate and impossible schedules, actual-volume validation, overdelivery/top-up/correction, mobile/long-name/empty-day layout, network retry with preserved input, CSV contents, deep links, print-to-PDF, missed turns, reduced execution targets, complete day closure, and concurrent edit conflicts. Each test resets only the disposable database. Desktop/mobile screenshots, CSV, and PDF evidence are attached to the HTML report at `frontend/playwright-report/index.html`; failures also retain screenshots and traces under `frontend/test-results/`. Example inspection screenshots are in `docs/`.

The final saved Playwright report confirms **8/8 passed**, with no failures, skipped tests, or flaky tests, in 12.6 seconds. All **48 backend tests**, ESLint, TypeScript, and the production build also passed. See **[VERIFICATION.md](VERIFICATION.md)** for evidence and **[PRESENTATION.md](PRESENTATION.md)** for the hackathon brief, requirement mapping, live demo sequence, and one-minute pitch.

## Hackathon demonstration (about five minutes)

1. Seed the fictional day. Log in as grower A, edit the note in Requests, and save. Show that approval clears.
2. Log in as coordinator. Review A, approve 60 L with a 12 L agreed minimum. Generate the plan.
3. Select Plot C: 32 of 48 L, 66.7% fulfilled, with the generated explanation. Compare its first-come volume.
4. Explore B's later window: the engine finds A–C–D–B–E–F. Explore F's short window: 40 L needs 20 minutes, but only 10 are available. Return to the saved draft.
5. Publish, then start A's turn as its grower or the coordinator. Record 50 L with a reason. Show 110 L recorded balance against 120 L remaining planned allocations.
6. As coordinator record a 10 L top-up with a reason. The balance becomes 120 L and the published plan remains unchanged. Reload, inspect Activity, export CSV, and open Print day.

## Structure and actual tool versions

- `backend/`: FastAPI endpoints, authentication, SQLAlchemy models, pure engines, seed/admin CLI.
- `migrations/`: Alembic database migrations.
- `frontend/src/`: React/TypeScript fieldbook; Tailwind integration and a deliberately defined CSS system.
- `tests/`: backend unit/integration/concurrency/restart tests.
- `frontend/e2e/`: Playwright workflow specs.
- `scripts/`: setup, development supervision, build, built-app startup, and checks.

Verified environment: Python **3.12.14**, Node **24.19.0**, pnpm **11.25.0**. Installed key packages: React **19.3.1**, Vite **7.3.7**, TypeScript **5.9.3**, Tailwind **4.3.3**, FastAPI **0.143.3**, SQLAlchemy **2.0.55**, Alembic **1.20.0**, pwdlib **0.3.1**, pytest **9.1.1**, Playwright **1.64.1**. All Python transitive versions are pinned in `requirements.lock`; JavaScript resolution and integrity are recorded in `frontend/pnpm-lock.yaml`.

Implementation references: [Vite runtime requirements](https://vite.dev/guide/), [FastAPI password hashing guidance](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/). Authentication here uses server-side sessions rather than JWTs.

## Deliberate limits

One community, one source, one hose, six active plots, one continuous window and uninterrupted turn per allocation. This version records manual outcomes; it does not control hardware, predict weather, diagnose crops, measure tanks, run overnight schedules, or replace an active plan. No public registration, email recovery, external authentication, or public deployment is included. All times are Asia/Bishkek; a timezone-switching interface is outside this version.
