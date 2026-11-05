# Office Hierarchy · Spatial Lab

A standalone, English-language Canvas 2D simulation of 22 fictional office agents. Existing Central Park and SoHo applications stay available. The source specification is preserved in [docs/SIMULATION_SPEC.md](docs/SIMULATION_SPEC.md); this document describes the implemented model and interpretation choices.

## Open or develop

The checked-in `dist/` runs on GitHub Pages without a runtime API, CDN, credentials or package installation. From the repository root:

```sh
python3 -m http.server 8000
# Open http://localhost:8000/office-hierarchy-sim/dist/
```

Development requires Node 22.12+ (tested on Node 24):

```sh
cd office-hierarchy-sim
npm ci
npm run dev
npm test
npm run build
```

Commit the rebuilt `dist/` when changing source. Vite uses relative assets, including the comparison worker, so `/Spatial-Ai/office-hierarchy-sim/dist/` works with branch-based GitHub Pages. The Central Park introduction links to this page. `npm run build` runs strict TypeScript checking before bundling.

## Implemented model

- Exactly 1 CEO, 3 Leads, 6 Associates and 12 Juniors; fixed radius 0.30 m and initial separation ≥0.75 m. Seeded initial positions use the specified room distribution; CEO starts in the upper work area. Scenario changes preserve starting coordinates and headings for the same seed.
- Shared 110° FOV, attention radii 3/5/7/9 m. Observer-specific angle, distance and line-of-sight checks are independent in each direction. Walls and furniture block sight; desks are optionally opaque. Detection starts after 0.15 s and ends after a 0.7 s grace period. The inspector and detection metrics include that grace period.
- CEO base/approach speed levels 1/2; Junior base/escape levels 3/5. Levels map to 0.5–2.5 m/s before the adjustable speed multiplier. Displayed actual mean speed includes pauses.
- Higher ranks approach the nearest seen lower rank. A seen superior takes priority, ordered by rank then distance. Each superior-detection episode draws the 45% pretend / 55% escape decision once. An episode ends when no superior remains detected. Ongoing WC trips retain their reservation and are not rerolled.
- Phone behavior alternates short pauses and patrol movement when no superior is detected. CEO never phones. Pretend-work chooses a reachable desk anchor using routed distance and avoids another agent's occupied/targeted anchor where possible. Holding lasts 3–6 s, then ends when superior detection clears. An explicit **12 s maximum stationary work hold** also ends it to prevent indefinite freeze under persistent observation.
- A pursuit lasts at most 8 s, stops at 1.2 m, and loses its target after 2 s unseen. Arrival causes a 2 s stop. **The same target is excluded for 8 s after pursuit**, allowing patrol to resume rather than reacquiring it while standing still. These two safeguards extend the source's anti-stagnation rules and are modeling choices, not empirical parameters.
- WC slots are assigned to deterministically sorted reservation requests (reaction timestamp, then ID). Occupants plus reservations never exceed 4. Reservations expire after 12 s if the agent has not entered the room; failed routes cancel bookings. Entry transfers reservation to occupancy; hide lasts 4–8 s after reaching its slot. **Occupancy remains held until the agent physically exits WC**, protecting actual room capacity while another reservation is granted. This refines the source's suggestion to release occupancy before choosing an exit waypoint.
- Full/unreachable WC causes immediate in-office escape, with no queue state. Escape evaluates 30 reachable WORK candidates using superior distance, occlusion, routed travel length and nearby crowding. Minimum escape duration is configurable (≥2 s); detection must remain absent for 2 s before ending.
- Exact 22 × 14 m floorplan and six specified doors. 22 physical desk obstacles, meeting table, lounge furniture and WC partitions. Meeting/lounge chair markers are decorative anchors rather than extra collision obstacles. Navigation uses 0.25 m cells, radius-inflated obstacles, eight-neighbor A* and collision-checked path smoothing. Non-escape patrol destinations exclude WC. Physical walls remain even in High visibility.
- All perception and movement intentions use a common position snapshot. Separation steering and simultaneous, repeatedly checked swept-motion rejection preserve ≥0.60 m center separation. A 2 s blocked-path watchdog attempts a local reachable detour, without teleporting. Congestion can still reduce realized speed; it is an observed outcome rather than a forced arrival guarantee.

## Controls, outputs and experiments

Run/Pause/Reset, 1×/2×/4× simulation time, seed, speed multiplier, shared FOV, four attention radii, reaction probability, minimum escape and pursuit duration all work. Model changes apply with **Apply settings & restart**; the selected seed remains fixed. View layers and agent selection do not reset the simulation. The selected FOV is clipped to sight blockers and the external boundary. Every agent has the same rendered physical radius.

The inspector shows actual state, target, perceived ranks, desired speed and realized average speed. Paths, 20 s trails, approach/escape relationship lines, sight blockers and a 1 m dwell heatmap can be toggled. A straight relationship line is not a navigation path; the path layer shows the routed polyline. WC occupied and reserved counts are separate.

Metrics report role-level phone time, state-entry event counts, average speed, traveled distance, superior-detection time, mean distance to CEO, current room counts, cumulative room person-seconds, WC utilization and reservation success. WC escape event counts include unsuccessful attempts; office-escape events include full, failed and expired reservations. The event panel shows the most recent 30 transitions; JSON retains the most recent 500. Cumulative counts cover the full run even when old event details are dropped. Trails retain 20 s; heat and dwell totals cover the full run.

CSV exports per-role metrics, seed and duration. JSON exports configuration, per-agent time/distance/room totals, WC metrics, 1 m heat cells and recent events. Seed and configuration reproduce a run by advancing the same count of 0.05 s steps; exports are reports, not resumable checkpoints.

Five scenarios are available: Baseline, Equal vision, Strong hierarchy, No WC escape, and High visibility. A separate browser worker compares all five over **20–100 consecutive seeds**, reporting means and **sample variances** for escape-state entries (including both a WC attempt and its fallback), phone time and total distance. The baseline radii are normalized to 3/5/7/9 and capacity/visibility to baseline; other current behavior controls remain fixed. Only the named scenario variable changes. Cancel terminates the worker. Comparison CSV includes each run’s seed, duration, actual model settings and metrics, so aggregate statistics can be independently calculated.

CLI comparison (results to stdout, progress to stderr):

```sh
npm run --silent experiment -- 20 60 > comparison.json
```

The default 60 s observation window is short; longer runs are available up to 1,800 s and can take several minutes. Numerical results are generated by the model. No workplace observations or calibrated behavioral distributions are claimed.

## Verification

`npm test` covers perception angles/ranges/occlusion, all desk anchors and doors, hierarchy priority, once-per-episode decisions, deterministic reservations, full/expired/cancelled bookings, swept collision avoidance, identical 1,000-step runs and a 30-minute virtual run checking wall clearance, physical WC capacity, pairwise separation and prolonged immobilization.

With Python Playwright and Chromium installed, serve the repository and run:

```sh
python3 office-hierarchy-sim/tests/browser.py
```

This exercises the built application, playback, reset/seed reproducibility, scenarios, parameter application, selection/layers, downloads, comparison-worker progress/cancel and mobile overflow. `?test=1` exposes the same production simulation for deterministic stepping; it is absent on ordinary visits.

## Structure

`src/world/` owns geometry, navigation and occupancy; `src/agents/` owns spawning, perception and movement; `src/simulation.ts` owns behavior, fixed-step sequencing and metrics; `src/render/` draws the world; `src/main.ts` connects controls and exports; `src/experiment-*.ts` implements isolated comparisons.
