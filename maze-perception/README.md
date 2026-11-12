# Perception in a Maze

A working TypeScript / Three.js simulation of a ground-based human using LiDAR and a flying bat using echolocation and passive hearing, searching for a moving mouse. The repository homepage runs this application. The previous Office simulation remains at `office-hierarchy-sim/dist/`; Central Park and SoHo are preserved.

## Develop and verify

Requires Node 22.12+ (validated with Node 24) and Python 3 for static hosting.

```sh
cd maze-perception
npm ci
npm run dev
npm test
npm run build
```

The build type-checks, bundles local assets into `dist/`, and updates repository-root `index.html`. Commit both deployment outputs. No external CDN, API key, server database or runtime network access is needed. GitHub Pages uses `main` / repository root, as in the existing project.

From the repository root, run `python3 -m http.server 8000`. With Python Playwright and Chromium installed, run `python3 maze-perception/tests/browser.py`. `CHROMIUM_PATH` overrides `/usr/bin/chromium`; `MAZE_TEST_URL` selects another production URL, including the project subpath. `?test=1` exposes deterministic stepping for tests and is absent on ordinary visits.

## Controls

Start, pause, resume, reset and 1–10× playback use fixed 50 ms steps. Reset replays the seed. New maze selects a cryptographic random seed. Selecting A/B/C resets maps and time but preserves geometry, spawn coordinates and initial mouse random stream. Sensor changes restart the experiment to keep results interpretable. Adjustable ranges affect computations, not just drawing. Advanced controls expose angles, intervals, noise, threshold, speeds, capture radius, time limit and material coefficients. Orbit, top and three follow cameras are available. Geometry, independent map overlays, scan rays, pulses, sound, range envelopes, trails and landmarks have separate toggles.

Export JSON includes the seed, settings, coefficient table, outcome, each agent's metrics, reconstructed voxel map, landmarks and sampled trails. Blue means human knowledge, orange bat knowledge and purple knowledge present in both maps. Brighter voxels belong to current observations; dim voxels are retained memory. Observed ground cells form continuous filled regions; occupied cells form merged boundary surfaces, with internal faces removed. Unknown gaps are never filled. Full maze geometry is an observer-only layer and can be hidden without changing agent knowledge.

## Model and boundaries

- `world.ts` builds a connected seeded 30 × 30 × 36 m maze with corridors, dead ends, intersections, an open chamber, walls of varying height, a walkable ramp and an elevated platform. Physical collision queries are separate from agent planning. The deck is a solid slab; the ramp is solid below its sloping surface. The mouse and human are constrained to connected support surfaces and cannot jump down from the deck. The bat can move vertically and fly over low walls.
- Material placement uses the same random draws for A/B/C, with foam/glass/concrete/metal proportions from the specification. Material colors and transparency identify assignments. Material coefficients are explicitly editable modeling assumptions, not empirical hardware predictions. Model parameters describe this simplified experiment, not measured animal or human behavior.
- LiDAR and echo use horizontal and vertical directional ray fans, plus short downward support observations. Marching terminates at the first surface or the finite range. Reliability depends on material, distance and incidence. Acoustic strength includes reflection, absorption, distance attenuation and a detection threshold. Glass produces more optical misses, foam weaker echoes; metal increases positional noise. A missed surface ray contributes no map observation. Noise may introduce false occupied/free classifications. Sensor endpoint noise is clamped to range. No whole sensor sphere is marked explored.
- Each agent owns a 1 m 3D occupancy grid, latest-scan cell set, observed supports, visit memory, landmarks and contact restrictions. `navigation.ts` receives only this memory and an agent's estimated target; it cannot read `World`. Breadth-first frontier search scores unexplored regions and penalizes visited regions and remembered dead ends; target pursuit searches toward a remembered sighting or uncertain sound cue. Human planning uses ground nodes; bat planning uses six-neighbor 3D nodes. Unknown cells are traversable hypotheses. Physical contact prevents penetration and records only contact geometry; rejected transitions are retained separately from occupied voxels.
- The mouse makes seeded choices at junctions, can pause, and favors moves away from nearby agents. It emits intermittent events only while physically moving. Passive hearing belongs to the bat: it is range limited, waits for arrival at 343 m/s, attenuates through distinct intervening wall tiles, and provides an uncertain cue rather than exact coordinates. Stopped mice emit no new events; recent events can remain in flight briefly. The renderer exaggerates the lifetime of pulse/ring effects so scans are visible; these are activity illustrations, not full-wave acoustics. Geometry sensing is processed within the fixed step (maximum echo round trip at 8 m is about 47 ms). Active target detections require directional sensor coverage and unobstructed line of sight, separately from passive hearing.
- Captures require finite 3D distance and a clear physical segment. First capture pauses; simultaneous equal-distance captures report a tie. Timeouts are incomplete. Coverage is correctly observed free voxel volume divided by ground-truth free volume; accuracy is correct known voxel classification divided by all known cells. Unknown cells and false occupied/free counts remain separate. Evaluation can read ground truth; navigation cannot.
- Different speeds, flight and ground movement mean this compares complete agent systems, not sensing alone. Only initial mouse conditions are identical: subsequent mouse motion can diverge if agents approach it differently. One seed cannot establish a statistical advantage. The dashboard reports actual results without forcing a winner.
- Approximation limits: 1 m mapping, 2 m aerial route nodes, 16 cm ray marching, finite ray sampling, no diffraction/full-wave acoustics, and increased metal noise rather than full multipath reconstruction. The structure is fully 3D, but small geometric detail below those resolutions is not modeled. At high simulation speeds, playback slows to available compute rather than skipping fixed steps.

## Source organization

`world.ts`: seeded geometry, materials, collision. `simulation.ts`: sensors, hearing, mouse, state machine, fixed updates, capture and metrics. `mapping.ts`: independent voxel memory and evaluation. `navigation.ts`: memory-only pathfinding. `scene.ts`: Three.js actors, camera, material geometry and map/sensor overlays. `main.ts`: controls and dashboard. `tests/`: model invariants and production browser interactions. The supplied source specification is retained in `SIMULATION_SPEC.md`.

## Display modes and readability

The pastel diorama style uses opaque concrete, pink acoustic foam and blue metal; only framed glass is transparent. Wall heights are tripled: inner walls are 6–30 m and boundary walls/ceiling are 36 m. The X/Z footprint, ramp and existing deck stay unchanged; no additional floor was introduced. Front cutaway shortens only the two front boundary walls to 4 m for viewing; all internal walls remain tall. Full physical heights apply to sensing and collisions. Turn it off to inspect the complete boundary.

The All / Human / Bat / Shared toggle selects the displayed knowledge without resetting the simulation. Human and Bat modes hide physical truth, the other agent, and the mouse. By default they render only the selected agent's latest scan: merged occupied boundary surfaces and filled observed ground regions. Enable Accumulated memory to include retained observations. Geometry is derived strictly from recorded cells, without convex hulls or interpolation through unknown space. Shared shows only voxels recorded by both agents. These views do not modify the actual maps. Independent dashboard plans show the 0–2 m slice of each agent's memory: strong regions are occupied, pale regions free, and gray unknown. Higher occupied voxels remain available in individual 3D views.

UI size defaults to 150%, half of the former 300% default. The header offers 100%, 150%, 200% and 300%. Mobile layouts use a readable fixed size to prevent horizontal clipping. Header links jump to Controls and Agent maps when panels stack below the scene.
