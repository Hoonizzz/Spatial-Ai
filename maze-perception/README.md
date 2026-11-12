# Perception in a Maze · 2D

A fully planar comparison of human LiDAR and bat echolocation/passive hearing, searching a 30 × 30 m maze for a moving mouse. Canvas 2D replaces WebGL: no perspective, flight, wall height, ramps or upper floors remain in the active model.

## Run and verify

Requires Node 22.12+ (validated on Node 24). No API keys, CDN, GPU or external runtime services are needed.

```sh
cd maze-perception
npm ci
npm run dev
npm test
npm run build
```

The build type-checks and writes `dist/` plus repository-root `index.html`. Commit both outputs for GitHub Pages (`main`, repository root). From repository root, serve with `python3 -m http.server 8000`; run `python3 maze-perception/tests/browser.py` with Python Playwright and Chromium installed. `CHROMIUM_PATH` and `MAZE_TEST_URL` override browser path and app URL. `?test=1` exposes deterministic testing; ordinary visits do not.

## Read the plan

- Blue circle: human. Orange diamond: bat. Green marker: mouse. Both agents start at the same point; labels sit above/below that shared position until paths diverge.
- Concrete is cream, foam pink with hatching, metal blue-gray with rivets, and glass cyan with a dashed blue frame. All walls, including glass, block movement. Optical transparency does not mean an empty passage.
- Blue/orange filled regions show observed free floor and obstacles; purple means both recorded the same cells. Unknown space stays gray in individual views. Neighboring cells merge into regions without filling unknown holes.
- All / Human / Bat / Shared filters the view without resetting or changing scale. Individual views hide physical truth, other agents and the mouse. A 2 m scale bar keeps areas comparable. Current scan is the default; Accumulated memory includes retained observations. Dashboard maps always show independent retained knowledge.
- Drag to pan, scroll or use +/− to zoom, and select Fit whole maze to reset the view. Follow modes are available. Rays, pulses, sounds, range sectors, trails and landmarks have separate toggles. Optional sectors are guides; actual observations remain ray-based. Rays/pulses/sound effects start hidden for readability.

## Experiment and model

Start/pause/resume/reset use deterministic 50 ms steps at 1–10× speed. Seeds reproduce layouts, materials and initial random streams. A/B/C change only materials (foam / glass / concrete dominated). Environment or sensor changes reset the run. Controls expose finite ranges, intervals, noise, horizontal FOV, echo threshold, speeds, capture radius, time limit and material coefficients. UI size defaults to 150%, with 100/150/200/300% options.

Both agents use the same plane and default 1.8 m/s speed. Neither flies over walls. The bat retains active echolocation and exclusive passive hearing. The mouse follows connected corridors, sometimes stops, and emits new sound only while moving. Navigation uses each agent's own map for frontier exploration, investigation and pursuit. Ground truth is used only for physical collision and evaluation. Accessible proximity captures pause the run; timeouts are incomplete. Winners are calculated, never forced by material labels.

LiDAR uses finite horizontal rays with material/distance/incidence dependent reliability. Echoes use reflection, absorption, attenuation, a threshold and noise. Failed returns do not reveal obstacles. Passive hearing waits for propagation at 343 m/s, attenuates through intervening wall tiles and supplies an uncertain cue. Coefficients are model assumptions, not measured hardware or animal performance.

Each agent stores independent 1 m occupancy cells, latest observations, visits, landmarks and contact restrictions. Coverage measures correctly observed free floor area divided by true free floor area. Accuracy measures correct known classifications; false occupied/free and unknown cells remain separate. JSON export includes settings, coefficients, results, maps, trails and metrics. For internal data compatibility, positions retain `{x,y,z}` with the middle coordinate fixed at 0.5; display X/Y correspond to x/z. There is no hidden altitude simulation.

## Source and tests

`world.ts`: planar geometry/materials/collision. `simulation.ts`: sensing/hearing/movement/capture. `navigation.ts`: memory-only 2D search. `mapping.ts`: independent grid/evaluation. `regions.ts`: knowledge filters and hole-preserving region merging. `scene.ts`: Canvas drawing/pan/zoom/follow. `main.ts`: controls/dashboard.

Model tests cover material and seed fairness, finite rays, independent memory, hearing, moving-only sound, flat routing/collision, map metrics, replay and complete capture/timeout runs. Region tests cover connected fills and unknown holes. Browser tests sample an actual material pixel and exercise controls, replay, ranges, isolated views, scale, zoom/follow, export and mobile layout.

The original 3D specification remains in `SIMULATION_SPEC.md` for provenance; this version follows the later request for a planar model. Office, Central Park and SoHo remain unchanged at their existing paths.
