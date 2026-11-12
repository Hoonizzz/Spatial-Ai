# SIMULATION_SPEC.md

## Project: Perception in a Maze
### 3D Spatial Agent Simulation — Human vs. Bat

## 1. Project Overview

Develop an interactive, real-time **3D agent-based simulation** in which two agents use different sensing mechanisms to navigate an unknown maze and locate a moving mouse.

The simulation investigates how different sensing systems and environmental material properties affect spatial perception, mapping, and navigation.

**Agents**
- Agent 1: Human — LiDAR
- Agent 2: Bat — Echolocation
- Target: Moving Mouse

**Primary Goal:** Find and capture the mouse.

**Research Question:**

How do different sensing mechanisms influence spatial perception, mapping, and navigation in an unknown 3D environment with varying material properties?

The simulation must visualize how both agents gradually construct different understandings of the same physical space.

---

## 2. Development Requirements

Build a working interactive 3D simulation.

**Preferred technologies:**
- TypeScript
- Three.js
- Vite
- HTML/CSS for UI

Use modular architecture separating:
- Environment generation
- Material properties
- Agent behavior
- LiDAR sensing
- Echolocation sensing
- Mouse behavior
- Spatial mapping
- Navigation
- Rendering
- Simulation controls and metrics

Prioritize working behavior over complex visual effects.

Do not implement computationally expensive full-wave acoustic physics. Use simplified, geometry-based sound propagation and material-dependent attenuation.

All simulation parameters should be configurable.

---

## 3. Three Experimental Environments

Create three experimental environments using exactly the **same underlying 3D maze geometry**.

Only material properties should change between environments during controlled comparisons.

### Environment A — LiDAR Advantage

**Material characteristics:**
- Predominantly sound-absorbing walls
- Optically detectable surfaces
- Weak acoustic reflection

**Expected behavior:**
- Human detects wall geometry reliably.
- Bat receives weaker echoes.
- Bat may require additional scans to reconstruct the environment.

### Environment B — Echolocation Advantage

**Material characteristics:**
- Predominantly transparent glass walls
- Optically challenging surfaces
- Strong acoustic reflection

**Expected behavior:**
- Human experiences occasional LiDAR detection failures.
- Bat detects acoustically reflective surfaces more reliably.
- Bat may navigate more effectively in this environment.

### Environment C — Balanced Baseline

**Material characteristics:**
- Predominantly ordinary concrete walls
- Reliable optical reflection
- Reliable acoustic reflection

**Expected behavior:**
- Both agents can detect surrounding walls.
- Sensor-specific precision and navigation differences remain measurable.

This environment is a neutral material baseline, not a guarantee of identical agent performance.

### Environment Rules

- Maintain identical maze geometry across A, B, and C.
- Maintain identical agent start positions.
- Maintain identical mouse initialization and movement random seed.
- Randomize wall material placement using a reproducible seed.
- Allow switching between environments.
- Reset agent maps when changing environments.
- Ensure material types are visually distinguishable.

---

## 4. 3D Maze Generation

Generate a navigable, maze-like 3D environment.

**Default dimensions:**
- Width: 30 m
- Length: 30 m
- Height: 12 m

Include:
- Corridors
- Intersections
- Dead ends
- Open chambers
- Walls with varying heights
- Ramps
- Elevated platforms
- Vertical connections where navigable

The maze must be spatially connected and support both ground and aerial movement.

### Navigation Constraints

**Human**
- Moves along walkable surfaces.
- Can traverse connected ramps and platforms.
- Cannot fly or pass through walls.

**Bat**
- Can fly freely in navigable 3D space.
- Can change altitude.
- Must avoid walls, ceilings, and obstacles.

**Mouse**
- Moves on walkable surfaces.
- Cannot fly.
- Avoids walls and inaccessible areas.

All objects must have collision geometry.

The environment's complete geometry is available to the simulation engine but must not be directly accessible to agent navigation or mapping algorithms.

---

## 5. Agent 1 — Human / LiDAR

### Identity
- Type: Human
- Sensor: LiDAR
- Color: Blue
- Movement: Ground-based navigation

### Sensor Behavior

Implement directional 3D raycasting to simulate LiDAR.

The sensor should:
- Emit multiple rays across horizontal and vertical angles.
- Detect surfaces within a limited range.
- Estimate surface positions using returned distances.
- Update the Human's internal 3D occupancy map.
- React to material-dependent measurement errors.

### LiDAR Parameters

| Parameter | Default |
|---|---|
| Maximum Range | 12 m |
| Adjustable Range | 3–20 m |
| Horizontal Field of View | 120° |
| Vertical Field of View | 60° |
| Scan Interval | 0.2 s |
| Measurement Noise | Configurable |

These are initial simulation values, not claims about actual LiDAR hardware.

### Material Behavior

- Concrete: Reliable detection.
- Acoustic Foam: Reliable optical detection.
- Glass: Reduced detection probability, partial misses, or false depth measurements.
- Metal: Reliable detection with configurable angle-dependent noise.

A failed LiDAR detection must not automatically reveal the obstacle.

---

## 6. Agent 2 — Bat / Echolocation

### Identity
- Type: Bat
- Sensor: Echolocation
- Color: Orange
- Movement: Free 3D flight

### Sensor Behavior

Implement simplified active echolocation.

The Bat should:
- Emit directional acoustic pulses periodically.
- Detect echoes reflected by surrounding surfaces.
- Estimate obstacle distance and approximate direction.
- Update its independent spatial map.
- Experience reduced detection accuracy around acoustically absorptive surfaces.

### Echolocation Parameters

| Parameter | Default |
|---|---|
| Maximum Range | 8 m |
| Adjustable Range | 3–20 m |
| Horizontal Emission Angle | 100° |
| Vertical Emission Angle | 80° |
| Pulse Interval | 0.5 s |
| Spatial Accuracy | Lower than LiDAR by default |

Use ray-based acoustic approximation with:
- Distance attenuation
- Material absorption
- Reflection intensity
- Detection threshold
- Configurable measurement noise

Use a fixed air environment with an approximate sound speed of 343 m/s.

The maximum sensing range represents effective detectable echo distance, not unlimited sound propagation.

### Material Behavior

- Concrete: Reliable acoustic reflection.
- Glass: Strong reflection under favorable incidence angles.
- Acoustic Foam: Weak reflection and high absorption.
- Metal: Strong reflection, potentially including ambiguous multipath echoes.

The Bat must not detect every object inside its maximum range automatically. Detection depends on received echo strength and material properties.

---

## 7. Limited Sensor Range

**Critical Requirement: Both agents have strictly finite sensing ranges.**

The LiDAR and Echolocation systems must never reveal unknown geometry beyond their configured effective detection limits.

### Range Rules

1. Sensor rays and pulses terminate at the maximum configured range.
2. Detection probability may decrease with distance.
3. Material characteristics modify effective detection reliability.
4. Undetected obstacles remain unknown.
5. Sensor range affects actual sensing calculations, not only visualization.
6. Previously discovered geometry remains stored in memory even when outside the current sensing range.

### Range Visualization

Display:
- Blue translucent sensing volume for Human.
- Orange translucent sensing volume for Bat.
- Visible LiDAR rays during scanning.
- Expanding acoustic pulse effects for Echolocation.

Visual effects must correspond to actual sensor activity.

### Mapping Distinction

Maintain two separate concepts:

**Current Perception**
- Geometry detected by the latest sensor observations.
- Updated continuously.
- Limited by current sensor range.

**Accumulated Knowledge**
- Geometry discovered throughout the simulation.
- Stored in agent memory.
- Persists after leaving sensor range.

Current perception may be displayed with stronger colors or highlights, while accumulated knowledge remains visible at lower opacity.

---

## 8. Target — Moving Mouse

### Identity
- Type: Mouse
- Role: Moving target
- Movement: Ground-based
- Sound: Produced only during movement

### Movement Behavior

The Mouse should:
- Navigate accessible ground paths.
- Move autonomously.
- Occasionally stop.
- Change direction at intersections.
- Avoid walls.
- Avoid agents when nearby.
- Use smooth, continuous movement.

Avoid completely random direction changes every frame.

### Mouse Sound System

The Mouse emits detectable sound **only while moving**.

**Default parameters:**

| Parameter | Default |
|---|---|
| Sound Detection Radius | 6 m |
| Adjustable Radius | 1–15 m |
| Sound Emission | Movement only |
| Sound Intensity | Distance-dependent |
| Sound Attenuation | Material-dependent |

### Sound Propagation Rules

- When the Mouse moves, it produces intermittent sound events.
- When it stops, no new sound events are produced.
- Previously emitted sounds may persist briefly according to propagation time.
- Sound intensity decreases with distance.
- Walls attenuate, reflect, or block sound according to material properties.
- Sound does not reveal the exact Mouse position automatically.
- The Bat estimates a probable sound direction or location based on received cues.

Use simplified acoustic path estimation rather than an unlimited Euclidean-radius detector.

The sound radius represents a maximum detection limit under favorable conditions.

### Passive Hearing

Implement Mouse sound detection as a separate system from the Bat's active echolocation.

- Active echolocation detects surrounding geometry.
- Passive hearing detects sounds produced by the Mouse.

The Human uses LiDAR for geometric perception and can identify the Mouse when it is directly detected by LiDAR or within capture distance.

The Human should not automatically receive the Bat's passive hearing information.

---

## 9. Primary Goal — Find the Mouse

Both agents share the same objective:

**Locate and capture the moving Mouse.**

### Win Condition

An agent successfully captures the Mouse when:
- It reaches the Mouse within a configurable capture radius.
- The Mouse is physically accessible.
- Collision and distance conditions are satisfied.

Default capture radius: 0.8 m.

The first agent to capture the Mouse wins.

Pause the simulation when a winner is declared.

Display:
- Winning agent
- Capture time
- Total distance traveled
- Explored area percentage
- Mapping accuracy

If neither agent succeeds within the time limit, mark the experiment as incomplete.

Default simulation time limit: 300 seconds.

---

## 10. Spatial Perception and Mapping

Each agent maintains its own independent 3D occupancy map.

### Map Systems

Maintain:
1. Ground Truth Map — Full actual maze geometry.
2. Human Map — Geometry detected through LiDAR.
3. Bat Map — Geometry inferred through Echolocation.

Agents must never share maps.

### Color Coding

| Spatial Knowledge | Color |
|---|---|
| Human / LiDAR | Blue |
| Bat / Echolocation | Orange |
| Detected by Both | Purple |
| Unknown Space | Dark Gray / Transparent |

### Visualization Rules

- Color the spatial geometry discovered by each agent.
- Use purple where both agents have detected the same region.
- Keep unexplored space visually neutral.
- Update map colors progressively as agents explore.
- Do not reveal the entire maze immediately through the perceived-map visualization.

Use an occupancy grid, voxel grid, or equivalent 3D spatial representation.

Distinguish:
- Known occupied cells
- Known free cells
- Unknown cells

Do not mark an entire sensor sphere as explored without actual ray or pulse observations.

### Map Accuracy

Compare each agent's reconstructed occupancy map with the ground truth using:
- Correctly classified cells
- False occupied cells
- False free cells
- Unknown cells

Calculate map accuracy separately from exploration coverage.

---

## 11. Memory and Landmarks

Agents should maintain spatial memory.

Store:
- Discovered obstacles
- Accessible corridors
- Dead ends
- Previously visited locations
- Mouse sound observations
- Suspected Mouse positions
- Important intersections

### Landmark Behavior

When an agent discovers an important spatial feature, create a landmark in its internal map.

Examples:
- Intersection
- Dead end
- Vertical connection
- Strong Mouse sound location
- Confirmed Mouse sighting

Landmarks should influence future navigation decisions.

Each agent must use only its own landmarks.

---

## 12. Autonomous Navigation

Implement goal-oriented navigation rather than random wandering.

### Shared Behavior States

1. **Explore** — Search unknown areas.
2. **Investigate** — Move toward suspected Mouse locations.
3. **Pursue** — Approach the Mouse after a confirmed detection.
4. **Replan** — Select a new route after encountering obstacles or losing the target.
5. **Capture** — Reach the Mouse within the capture radius.

### Navigation Logic

Agents should:
- Prioritize reachable unexplored regions.
- Avoid known obstacles.
- Avoid repeatedly entering dead ends.
- Use previously recorded landmarks.
- Update paths when new information appears.
- Investigate detected Mouse movement or sound cues.

Use A*, Dijkstra, frontier-based exploration, or other appropriate navigation algorithms.

The Human should use a ground-navigation graph.

The Bat should use 3D navigation nodes or voxel-based pathfinding.

Neither navigation system may use unrevealed maze geometry to plan its path.

Known obstacles should affect navigation immediately.

Unknown areas may be explored cautiously.

---

## 13. Material Properties

Define materials using explicit sensor-related parameters.

Suggested starting values:

| Material | LiDAR Detection Reliability | Acoustic Reflection |
|---|---:|---:|
| Concrete | 0.95 | 0.80 |
| Glass | 0.30 | 0.85 |
| Acoustic Foam | 0.95 | 0.15 |
| Metal | 0.85 | 0.90 |

These numbers are configurable simulation assumptions, not experimentally validated material coefficients.

Apply additional effects for:
- Distance
- Incident angle
- Sensor noise
- Acoustic attenuation
- Reflection thresholds

The sensing systems should behave differently because of actual material parameters, not simply because an environment is labeled as favorable to one agent.

### Random Material Distribution

Use a seeded procedural system.

Suggested initial material distributions:

| Material | Env. A | Env. B | Env. C |
|---|---:|---:|---:|
| Acoustic Foam | 70% | 10% | 10% |
| Glass | 10% | 70% | 10% |
| Concrete | 15% | 15% | 75% |
| Metal | 5% | 5% | 5% |

Every environment uses the same wall positions.

Only wall material assignments and resulting sensing properties differ.

---

## 14. Visualization and Graphics

Create a clean, architectural, diagrammatic 3D visualization.

### Scene Appearance

- Minimal geometric forms.
- Isometric perspective by default.
- Orbit camera with zoom and pan.
- Semi-transparent walls when appropriate.
- Distinguishable material textures or surface treatments.
- Clear separation between physical geometry and perceived-map overlays.

### Agent Appearance

**Human**
- Simple human-shaped figure.
- Blue accent.
- Visible LiDAR sensor indicator.

**Bat**
- Recognizable simplified bat geometry.
- Orange accent.
- Visible echolocation pulse effect.

**Mouse**
- Small recognizable moving mouse.
- Distinct neutral or green accent.
- Sound emission visualization while moving.

### Sensor Effects

**LiDAR**
- Thin directional blue scan rays.
- Scanned surface highlights.

**Echolocation**
- Orange pulse or expanding wavefront visualization.
- Echo hit markers.
- Avoid rendering unlimited waves.

**Mouse Sound**
- Small expanding sound rings while moving.
- Rings stop being emitted when the Mouse stops.

### Spatial Map Overlay

Show:
- Blue discovered regions.
- Orange discovered regions.
- Purple overlapping regions.
- Unknown regions in dark gray or transparent.

The map overlay must reflect the actual internal map state of the agents.

---

## 15. User Interface

Create a control panel that allows users to configure and observe the experiment.

### Simulation Controls

- Start
- Pause
- Resume
- Reset
- Simulation Speed: 1×–10×
- Regenerate Maze
- Random Seed Input

### Environment Controls

- Environment A — LiDAR Advantage
- Environment B — Echolocation Advantage
- Environment C — Balanced Baseline

### Sensor Controls

- LiDAR Range: 3–20 m
- Echolocation Range: 3–20 m
- Mouse Sound Radius: 1–15 m
- LiDAR Scan Frequency
- Echolocation Pulse Frequency

### Visualization Toggles

- Show / Hide LiDAR Rays
- Show / Hide Echolocation Pulses
- Show / Hide Mouse Sound
- Show / Hide Sensor Range Volumes
- Show / Hide Perceived Maps
- Show / Hide Movement Trails
- Show / Hide Landmarks
- Show / Hide Full Maze Geometry

### Camera Options

- Orbit View
- Top View
- Follow Human
- Follow Bat
- Follow Mouse

---

## 16. Performance Metrics

Track each agent independently.

### Required Metrics

| Metric | Description |
|---|---|
| Capture Time | Time required to find and capture Mouse |
| Distance Traveled | Total traveled distance |
| Exploration Coverage | Percentage of navigable environment observed |
| Mapping Accuracy | Accuracy compared with ground truth |
| Collision Count | Number of obstacle collisions |
| Failed Detections | Sensor detection failures |
| Mouse Detections | Number of target detections |
| Landmarks Recorded | Number of spatial landmarks |

Display metrics in a live dashboard.

After the simulation:
- Show the winner.
- Compare both agents.
- Display their reconstructed spatial maps.
- Highlight major differences in exploration routes.

### Experimental Fairness

Both agents should have:
- The same simulation start time.
- The same mouse trajectory initialization.
- The same maze geometry.
- The same underlying material environment.
- The same simulation time limit.

Keep their different movement capabilities and sensing mechanisms explicit.

Because Human and Bat have different mobility, the experiment compares complete agent systems rather than isolating sensing performance alone.

---

## 17. Suggested UI Layout

Use a three-part interface.

### Main View — Center
Large interactive 3D maze visualization.

### Control Panel — Left
- Environment selection
- Sensor settings
- Mouse settings
- Simulation controls
- Visualization toggles

### Analytics Panel — Right
- Human status
- Bat status
- Mouse status
- Live metrics
- Current simulation time
- Winner/result

Use a professional, minimal visual style.

Avoid excessive decorative UI.

---

## 18. Simulation Update Loop

Use a deterministic simulation update loop.

Suggested order:

1. Advance simulation time.
2. Update Mouse movement.
3. Generate Mouse sound events when moving.
4. Update Human LiDAR scan.
5. Update Bat echolocation pulses.
6. Process Bat passive hearing.
7. Update each agent's internal map.
8. Update landmarks and memory.
9. Update navigation decisions.
10. Move agents.
11. Resolve collisions.
12. Check Mouse capture conditions.
13. Update performance metrics.
14. Render scene and UI.

Use fixed simulation time steps where practical.

Use seeded randomness to make experiments reproducible.

---

## 19. Implementation Priorities

Develop the project in stages.

### Phase 1 — Core Environment
- Working Three.js scene.
- Procedural 3D maze.
- Human, Bat, and Mouse entities.
- Three material environments.
- Camera controls.

### Phase 2 — Sensing
- Functional finite-range LiDAR.
- Functional finite-range Echolocation.
- Material-dependent sensing behavior.
- Mouse sound emission and passive hearing.

### Phase 3 — Mapping
- Independent occupancy maps.
- Progressive mapping.
- Blue / Orange / Purple visualization.
- Spatial memory and landmarks.

### Phase 4 — Navigation
- Autonomous exploration.
- Pathfinding.
- Mouse investigation and pursuit.
- Collision avoidance.
- Capture condition.

### Phase 5 — Interaction and Evaluation
- UI controls.
- Sensor range sliders.
- Environment switching.
- Live performance dashboard.
- Experiment results.

Complete the core functional simulation before adding advanced visual effects.

---

## 20. Acceptance Criteria

The initial implementation is complete only if:

- [ ] A functional 3D maze is generated.
- [ ] The Human and Bat move autonomously.
- [ ] The Mouse moves and occasionally stops.
- [ ] The Mouse emits new sound only when moving.
- [ ] The Human uses finite-range LiDAR detection.
- [ ] The Bat uses finite-range echolocation.
- [ ] The Bat can detect the Mouse's movement sounds.
- [ ] Glass reduces LiDAR detection reliability.
- [ ] Acoustic Foam reduces echo detection reliability.
- [ ] Both agents maintain independent maps.
- [ ] Discovered space appears progressively in different colors.
- [ ] Overlapping discovered areas appear purple.
- [ ] Previously mapped areas remain in memory.
- [ ] Unknown geometry is not used for navigation.
- [ ] Agents use goal-directed exploration instead of purely random wandering.
- [ ] Three experimental environments are selectable.
- [ ] Sensor ranges are adjustable through the UI.
- [ ] Capture time and other metrics are recorded.
- [ ] The simulation can be reset and reproduced using a random seed.

---

## 21. Final Design Intent

The simulation should demonstrate that **different sensing systems produce different spatial knowledge, even when agents inhabit the same physical environment**.

The Human interprets the maze through LiDAR.

The Bat interprets the maze through echolocation and passive hearing.

Different material conditions alter how each agent detects surrounding geometry.

As both agents search for the moving Mouse, their distinct perceptions produce different maps, navigation decisions, and search outcomes.

The final simulation must make these differences visible, measurable, and interactive.

---

## 22. Codex Execution Instructions

Implement this project as a working application.

If the repository is empty:
1. Initialize a Vite + TypeScript project.
2. Install Three.js and required dependencies.
3. Build the simulation using the specifications above.
4. Add scripts for local development and production builds.
5. Provide a README with setup and usage instructions.

If the repository already contains a project:
1. Inspect the existing structure.
2. Reuse compatible dependencies and architecture.
3. Avoid overwriting unrelated files.
4. Integrate the simulation into the existing project.

Work incrementally and verify functionality after each major phase.

Do not replace functional sensing or navigation with purely decorative animations.

Prioritize:
1. Accurate simulation state
2. Functional sensing and navigation
3. Independent mapping
4. Interactive visualization
5. Visual refinement

The final deliverable should be a runnable, interactive 3D simulation rather than a static demonstration.
