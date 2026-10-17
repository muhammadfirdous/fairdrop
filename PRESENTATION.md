# FairDrop Hackathon Presentation

**Share water, grow together.** FairDrop is a working community water-sharing application that turns limited water into an explainable allocation, a practical watering schedule, and an accountable delivery record.

## The problem and the people

Community gardens may share one water source and one hose, while growers have different needs and availability. A first-come arrangement can leave later growers without water. Informal plans also make it difficult to distinguish what was promised from what was actually delivered.

FairDrop serves growers who need to know their share and their turn, and coordinators who need to review requests, manage shortages, avoid overlapping turns, and explain decisions.

## How it works

1. A grower submits the requested litres, an availability window, and an optional note for their plot.
2. The coordinator approves, reduces, or rejects the request. Reductions and rejections require a reason. Edited requests require a new review.
3. The coordinator sets the available water, delivery rate, source hours, hose changeover time, and allocation policy.
4. The backend calculates each approved plot’s share and a complete schedule. Every allocation includes an explanation. An impossible schedule is clearly identified and cannot be published.
5. Publication saves a fixed snapshot. Growers see their allocation and watering turn; only one turn can use the hose at a time.
6. The assigned grower or coordinator records actual delivery. Partial deliveries, missed turns, overdelivery, source adjustments, and corrections are recorded explicitly.
7. After every turn is resolved, the coordinator closes the day. Historical plans, activity, CSV exports, and printable records remain available.

The lifecycle is **Planning → Ready → Active → Closed**. Starting execution locks the planning inputs, so later operational changes cannot silently rewrite the community’s agreement.

## A concrete example

The fictional Ak-Bulak garden has six plots requesting a total of **240 L**, with **160 L** available. Under proportional approved need, the budget covers two-thirds of approved demand.

| Plot | Approved need | Allocation |
| --- | ---: | ---: |
| A | 60 L | 40 L |
| B | 24 L | 16 L |
| C | 48 L | 32 L |
| D | 12 L | 8 L |
| E | 36 L | 24 L |
| F | 60 L | 40 L |
| Total | 240 L | 160 L |

At 2 L/min with two-minute hose changeovers, the seeded schedule runs from 16:00 to 17:30. Changing B’s availability produces a feasible alternative order, A–C–D–B–E–F. Giving F only ten minutes makes its 40 L allocation impossible to deliver at that rate: the app explains that it needs twenty minutes and blocks publication.

## What makes the allocation explainable

The community chooses between two explicit policies:

- **Proportional approved need:** distribute the available water in proportion to approved requests, without exceeding any approved quantity.
- **Agreed minimums first:** meet agreed minimums, then share the remaining budget in proportion to remaining approved need. If all minimums cannot be met, the app reports an infeasible policy instead of silently changing the rule.

The engine uses integer millilitres and deterministic rounding so totals reconcile exactly. It compares up to 720 plot orders to find a complete, non-overlapping schedule within grower and source windows. A first-come baseline lets people compare outcomes. Fairness here means a visible, community-selected rule; the software does not claim one policy is universally fair.

## Why actual delivery matters

The accounting equation is:

**Recorded balance = opening water + source adjustments − actual deliveries.**

If A is allocated 40 L but actually receives 50 L, the app records the full 50 L, leaving 110 L. Because the remaining allocations total 120 L, it shows a 10 L shortage. An explicitly recorded 10 L top-up restores the balance to 120 L without changing the published allocation.

The verified closure scenario records 132 L delivered and 28 L remaining after one missed turn and one reduced delivery. The finalized shortfall is also 28 L. Overdelivery to one plot never erases another plot’s shortfall.

## Why this is useful

Growers can answer four practical questions: **How much will I receive? When is my turn? Why did I receive that amount? What was actually delivered?** Coordinators get a shared record that reduces scheduling confusion, makes shortages visible before watering, and supports explanation and review of decisions.

The intended environmental benefit is more deliberate stewardship of a scarce shared resource. FairDrop measures allocations and recorded deliveries; it does not claim a measured percentage of water savings or simulate sensor readings.

## Fit with the supplied Solarpunk hackathon brief

| Requirement | Implemented evidence |
| --- | --- |
| Community cooperation and resource stewardship | Shared requests, community-selected policies, visible shortages, and accountable delivery records |
| Complete working product | Request → review → calculation → publication → execution → closure |
| Real allocation and scheduling logic | Two backend allocation policies, deterministic rounding, exhaustive single-hose scheduling, infeasibility checks |
| Transparent decisions | Per-plot explanations, first-come comparison, saved versions, actor/time/reason activity history |
| Honest water accounting | Separate planned and actual volumes; partial, missed, zero, and excess delivery; explicit adjustments and corrections |
| Permissions and integrity | Grower/coordinator access, server-side authorization, CSRF protection, stale-revision checks, duplicate-operation protection, one active hose |
| Persistent local operation | SQLite database, SQLAlchemy, Alembic migrations, restart persistence; no paid service, cloud account, or API key required |
| Required stack | React, TypeScript, Vite, Tailwind CSS, FastAPI, SQLAlchemy, SQLite, Pytest, and Playwright |
| Deliberate visual design | Warm fieldbook surfaces, custom garden schematic, operational ledger, timeline, and a mobile layout with keyboard support |
| Demonstrable quality | 48 backend tests passed; 8/8 browser tests passed with no skips or flaky tests; lint, TypeScript, and production build passed |
| Reproducible handoff | Setup/start/build/test scripts, locked dependencies, demo credentials, README, CSV export, and printable records |

This mapping addresses the supplied project requirements; no separate event judging rubric was provided.

## Three minute live demonstration

Use a fresh fictional demo database if showing the entire lifecycle. The current saved demo may already have delivery history; do not reset records you want to keep.

1. **0:00–0:30:** Introduce the 240 L demand versus 160 L budget. Show the schematic, ledger, and explanations.
2. **0:30–1:10:** Show a grower request, coordinator review, and plan generation. Explain C’s 32 of 48 L allocation.
3. **1:10–1:45:** Preview B’s alternative order and F’s impossible window. Show that publication is disabled for the conflict. Return to the saved plan and publish.
4. **1:45–2:30:** Record A’s 50 L actual delivery and show the 10 L remaining-plan shortage. Record the genuine demo top-up and show the reconciled balance.
5. **2:30–3:00:** Open Activity and Print day. Finish with the passing tests and local, API-key-free operation.

Open the development demo at http://127.0.0.1:5174. Coordinator: `coordinator@fairdrop.local`; grower A: `grower.a@fairdrop.local`. Both use the fictional demo password `GardenTogether!26`.

## One minute pitch

“FairDrop helps a community share limited water transparently. Imagine six garden plots needing 240 litres when only 160 litres are available. Who receives what, and when?

Growers submit their needs and availability. A coordinator reviews them and chooses a visible sharing rule. FairDrop calculates each plot’s allocation, explains the result, and creates a schedule for one shared hose. If the schedule is impossible, it explains why and prevents publication.

The work continues after planning. We record what was actually delivered, expose shortages, and preserve a history of corrections without rewriting the original agreement.

FairDrop is a working React and FastAPI application with local persistent storage, mobile access, and no paid API dependency. It has passed 48 backend tests and all eight browser workflow tests. It brings the Solarpunk idea of community stewardship into a practical daily tool: share water, grow together.”

## Scope and next steps

This version supports one community, one source, one hose, up to six active plots, one continuous availability window per request, and manually recorded deliveries. It does not include hardware control, weather prediction, crop diagnosis, multiple hoses, or active-session replanning. The next validation step is a real community-garden pilot to assess usability and operational benefit. Public deployment is separate from the completed local hackathon build.
