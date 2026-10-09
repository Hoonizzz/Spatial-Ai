# SoHo · Spatial Lab

A static three.js navigation prototype for **SoHo, Manhattan, New York**. All interface text is English. It renders 696 buildings from a historical NYC 3D building snapshot, randomly places one tourist on a modeled street, and computes a shortest walk to a chosen building's estimated entrance.

## Run

From the repository root:

```sh
python3 -m http.server 8000
```

Open the server in a WebGL-capable browser. There is no build step, external CDN, API key, or runtime dependency installation. All code and map data are bundled locally, including three.js 0.180.0.

## Use

1. Read Tourist T's local **X (east), Y (height), Z (south)** coordinates in meters and WGS84 latitude/longitude. Walking is on the local ground plane at Y = 0.
2. Click a 3D building or choose its ID from the destination list. The selected building is highlighted in purple.
3. Follow the orange route. The panel shows total distance, walking time at 1.4 m/s, and directional instructions.
4. **Start walk** plays the journey at 20× speed. Coordinates update continuously. Pause and choose another building to replan from the current position.
5. **↻** generates a new random street position and recalculates the selected route. Drag to rotate, use the wheel or +/− to zoom, and reset the map view when needed.

## Coordinate and routing model

- Local origin: **40.723450° N, 74.000600° W**. X increases east; Z increases south. Building height is Y, in meters. The conversion uses a local equirectangular projection suitable for this neighborhood-scale prototype.
- The study boundary is a polygon near West Broadway, Houston Street, Lafayette Street, and Canal Street. It is explicitly a study area, not an administrative boundary.
- The 6,201-node / 19,776-edge walking graph is sampled at 5m spacing on connected open ground, excluding building footprints with 0.8m clearance. Edges, including diagonals, are checked against buildings and the boundary. Only the largest connected component is retained.
- Tourist spawning is limited to graph edges near the bundled map-matched street sample. Random placement is weighted by edge length.
- Dijkstra's algorithm returns the shortest path **in this weighted graph to the chosen modeled entrance**. Fractional start and entrance positions are connected with virtual nodes, including direct connections on the same edge. Entrance connectors are included in the route distance. Replanning preserves the tourist's actual current location.
- Entrances are derived facade access points, not verified doors. There are 680 connected entrances; 16 buildings have no modeled access and explicitly report that condition.
- Historical building coverage, ground accessibility, pedestrian crossings, and door locations have not been validated against present-day conditions. This is a navigation demonstration, not live pedestrian directions. Tourist markers are enlarged for visibility; city geometry retains metric scale.

See [data sources](data/SOURCES.md) and [the semantic model](docs/semantic_model.md).

## Tests

```sh
node --test tests/model.test.mjs
```

The 13 model tests include rendering all building footprints and courtyard holes, an independent Floyd–Warshall shortest-path oracle, same-edge routing, disconnected destinations, movement-time replanning, entrance connectors, coordinate conversion, connected SoHo geometry, random street spawning, and readable directions that preserve exact route distances.

With Playwright and Chromium installed, serve the repository and run:

```sh
python3 tests/browser_smoke.py
```

Use `CHROMIUM_PATH` to select a browser executable or `SPATIAL_TEST_URL` to select a server URL, including a project subpath. Browser checks exercise real building clicks, English text, coordinates, route display, walking, pause, replanning, arrival, random respawn, inaccessible buildings, camera dragging, mobile controls, and browser errors. The optional `?test=1` interface exposes state and the same production playback function for deterministic arrival checks; it is absent on normal visits.

For full geometry validation, install the preprocessing tools below, then run `python3 tests/geometry_check.py`. It checks every graph edge and every modeled entrance connector against the bundled footprints and boundary.

## Rebuild the map snapshot

The bundled data is already ready to use. Only rebuilding it needs these Python tools:

```sh
python3 -m pip install numpy==2.5.3 shapely==2.1.2 pyproj==3.7.2
python3 scripts/prepare_soho.py
```

The preprocessing script downloads pinned GitHub source revisions using HTTPS verification, verifies the source building-mesh SHA-256, converts EPSG:2263 feet to WGS84/local meters, derives footprints and heights, clips the study area, and builds the walking graph. Source files are cached outside the checkout in `/tmp/soho-source-cache`. Data coordinates are rounded to centimeters; graph spacing is 5m.

## GitHub Pages

All paths are relative and support `/Spatial-Ai/`. Pages uses **Deploy from a branch → main → /(root)**. Push the static files to `main`; the existing Pages deployment publishes them. `.nojekyll` disables Jekyll processing. No deployment configuration change is needed.
