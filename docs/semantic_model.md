# Semantic Model — SoHo Tourist Navigation

## SPACE

- Location: SoHo, Manhattan, New York.
- Boundary: the explicit study polygon near West Broadway, Houston, Lafayette, and Canal streets in `data/soho.json`.
- Coordinate origin: longitude -74.0006, latitude 40.72345.
- Local axes: X east, Z south, Y height; units are meters.
- Display local metric coordinates and WGS84 latitude/longitude for the tourist and destination.

## BUILDING

- `id`, `name`: stable snapshot IDs and descriptive numbered labels.
- `footprint`, `holes`, `height`, `center`: derived from the historical NYC 3D building model.
- `entrance`: estimated facade access with a graph-edge ID, fractional location, and an outside-facade arrival point; may be absent when access is unmodeled.
- All 696 buildings appear in 3D. A building is selectable through its geometry or the destination list.
- A selected building is highlighted. Its height and destination coordinates are shown.

## TOURIST

- Exactly one tourist, `T`, initially generated at a random connected modeled street position.
- Appearance: Hawaiian shirt and backpack. The navigation marker is enlarged for visibility.
- `point`, `edge`, `t`, `accessId`: retain the exact position and its attachment to the walking network.
- `movement`: idle, walking, paused, or arrived.
- Respawning places the same single tourist at a new random street position.

## WALKING NETWORK

- A connected bidirectional graph sampled on open ground between building footprints.
- 5m spacing; edge weights are metric segment lengths.
- All edge segments and entrance connectors remain inside the boundary and avoid buildings.
- The stored graph assumes ground accessibility and does not establish real-world legal pedestrian access.

## NAVIGATION

1. Select a building.
2. Attach the tourist's current fractional position and the destination entrance to the graph with temporary nodes.
3. Use Dijkstra's algorithm to find the shortest weighted graph route, including entrance connectors.
4. Show the route in orange, the destination in purple, distance, walking-time estimate, and directional steps.
5. Optionally play the walk at 20× speed, updating coordinates continuously. The walking-time estimate uses 1.4 m/s.
6. Pause and select another building to recalculate from the actual current position.
7. On arrival, preserve the final location so another journey can begin there.

Unavailable entrances or disconnected destinations produce an explicit no-route state. Do not fabricate a route or move the tourist into a building. Random respawn recalculates an existing selected destination. Camera rotation and zoom do not select a new destination or alter geographic coordinates.

## Interface and publication

All visible text, accessible labels, status messages, and geographic labels are English. The application is static vanilla JavaScript / three.js, uses relative asset URLs, bundles its source data and attribution, and remains compatible with GitHub Pages at `/Spatial-Ai/`.
