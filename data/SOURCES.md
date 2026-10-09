# SoHo data sources and interpretation

## Buildings

- Original source: [New York City 3D building model](https://www.nyc.gov/site/doitt/initiatives/3d-building.page), a historical City of New York public-data model.
- Downloaded mirror: [All the Buildings in Manhattan](https://github.com/rolyatmax/nyc-buildings), revision `525fa4124af6582ade3bd3f0c1bdb900b34455e8`.
- Source file: `models/manhattan.building.triangles.binary.gz`.
- SHA-256: `46d1674554341bd1a92809709763b49290e4ca98db3b067d5963d2751b31c4ac`.
- Transformation: decode per-building triangles, convert EPSG:2263 US survey feet into geographic coordinates, union projected surface polygons into horizontal footprints, clip to the SoHo study boundary, simplify footprints by 0.18m, and extrude to each source building's height above its lowest surface. Courtyard holes are retained; source triangle cracks smaller than 0.25m² are discarded to avoid degenerate holes after coordinate rounding. Where a source building yields several disconnected footprint pieces, only the largest piece is retained.
- Rendered building IDs B001–B696 are stable IDs for this bundled snapshot, ordered geographically. They are not NYC BINs, addresses, business names, or official landmarks. Facade colors are illustrative. Individual roof detail is simplified to an extrusion.
- This dataset is a historical snapshot; it does not establish current building coverage or current heights. No original mirror application code is incorporated.

## Street sample

- Source: [vis.gl / deck.gl example data](https://github.com/visgl/deck.gl-data), revision `2de3d08585770105e1b84a6c0308c934fcce4878`.
- Source file: `examples/trips/trips-v7.json`, consisting of map-matched trip paths. The original license notice is retained in [DECK-GL-LICENSE.txt](DECK-GL-LICENSE.txt).
- Paths are clipped to the study boundary and exclude building intersections. They provide the illustrated primary street sample and eligible tourist-spawn areas. This is a sample, not a complete pedestrian street dataset.

## Study boundary and navigation

The explicit study polygon is approximately bounded by West Broadway, Houston Street, Lafayette Street, and Canal Street. Boundary corners are:

| Longitude | Latitude |
| --- | --- |
| -74.00555 | 40.72196 |
| -74.00005 | 40.71896 |
| -73.99553 | 40.72492 |
| -74.00063 | 40.72787 |

The boundary is a prototype study area within the SoHo vicinity, not an official neighborhood delineation. The local origin is longitude -74.0006, latitude 40.72345; X points east and Z points south. Distances are local metric distances, not geodesic measurements.

The walking graph is derived from connected open ground between the bundled buildings at 5m grid spacing. It assumes that connected ground is walkable. It does not encode verified sidewalks, crosswalks, private-access restrictions, accessibility, traffic, or live closures. It contains 6,201 nodes and 19,776 bidirectional edges; each stored edge is collision-checked against footprints and boundary. Courtyards disconnected from the main street-connected component are excluded.

Entrances are estimated points outside facades connected to this graph, rather than surveyed doors. 680 buildings have a connected estimated entrance and 16 do not. Dijkstra routing is shortest in the stored graph, including entrance connectors, and can differ from the real-world shortest legal pedestrian route. Unavailable access is reported rather than inventing a route.

These distinctions are shown in the interface. All map data is served locally with the site; no map-provider login or external API is required.
