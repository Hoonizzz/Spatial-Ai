"""Rebuild the bundled geographic snapshot; runtime needs no Python packages.

python -m pip install numpy==2.5.3 shapely==2.1.2 pyproj==3.7.2
python scripts/prepare_soho.py
"""
from pathlib import Path
import gzip
import hashlib
import json
import math
import urllib.request
import numpy as np
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union, nearest_points
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path('/tmp/soho-source-cache')
CACHE.mkdir(exist_ok=True)
SOURCES = {
    'buildings': 'https://raw.githubusercontent.com/rolyatmax/nyc-buildings/525fa4124af6582ade3bd3f0c1bdb900b34455e8/models/manhattan.building.triangles.binary.gz',
    'streets': 'https://raw.githubusercontent.com/visgl/deck.gl-data/2de3d08585770105e1b84a6c0308c934fcce4878/examples/trips/trips-v7.json',
}

def download(name):
    path = CACHE / name
    if not path.exists():
        with urllib.request.urlopen(SOURCES[name], timeout=60) as response:
            path.write_bytes(response.read())
    return path.read_bytes()

LON, LAT = -74.0006, 40.72345
EARTH = 6378137
MX = math.pi / 180 * EARTH * math.cos(math.radians(LAT))
MZ = math.pi / 180 * EARTH

def local(lon, lat):
    return (round((lon - LON) * MX, 2), round((LAT - lat) * MZ, 2))

def coords(point):
    return {'x': round(point[0], 2), 'z': round(point[1], 2)}

# Explicit SoHo study boundary: near West Broadway, Houston, Lafayette, Canal.
# This is a study-area polygon, not an administrative boundary.
boundary_geo = [[-74.00555, 40.72196], [-74.00005, 40.71896],
                [-73.99553, 40.72492], [-74.00063, 40.72787]]
boundary = Polygon([local(*p) for p in boundary_geo])
raw = download('buildings')
assert hashlib.sha256(raw).hexdigest() == '46d1674554341bd1a92809709763b49290e4ca98db3b067d5963d2751b31c4ac'
transform = Transformer.from_crs(2263, 4326, always_xy=True)
inverse = Transformer.from_crs(4326, 2263, always_xy=True)
state_bounds = np.array([inverse.transform(*p) for p in boundary_geo])
low, high = state_bounds.min(axis=0) - 200, state_bounds.max(axis=0) + 200
buildings = []
for block in gzip.decompress(raw).split(b'\xff\xff\xff\xff'):
    if not block:
        continue
    assert len(block) % 36 == 0, 'Unexpected source mesh encoding'
    vertices = np.frombuffer(block, dtype='<f4').reshape(-1, 3)
    center = (vertices[:, :2].min(axis=0) + vertices[:, :2].max(axis=0)) / 2
    if np.any(center < low) or np.any(center > high):
        continue
    lon, lat = transform.transform(*center)
    if not boundary.covers(Point(local(lon, lat))):
        continue
    # Collapse the source's 3D surfaces into their real horizontal footprint.
    triangles = []
    for triangle in vertices.reshape(-1, 3, 3):
        points = [local(*transform.transform(float(v[0]), float(v[1]))) for v in triangle]
        p = Polygon(points)
        if p.is_valid and p.area > .05:
            triangles.append(p)
    if not triangles:
        continue
    footprint = unary_union(triangles).buffer(0).intersection(boundary).simplify(.18, preserve_topology=True)
    if footprint.geom_type == 'MultiPolygon':
        footprint = max(footprint.geoms, key=lambda p: p.area)
    if footprint.geom_type != 'Polygon' or footprint.area < 10:
        continue
    buildings.append({
        'geometry': footprint,
        'height': round(float(vertices[:, 2].max() - vertices[:, 2].min()) * .3048006096, 1),
    })
buildings.sort(key=lambda b: (round(b['geometry'].centroid.y, 1), round(b['geometry'].centroid.x, 1)))
print('Buildings extracted:', len(buildings), flush=True)

footprints = unary_union([b['geometry'] for b in buildings])
obstacles = footprints.buffer(.8)
trips_raw = download('streets')
assert hashlib.sha256(trips_raw).hexdigest() == 'e5ec75520944b79731dfa3a316fd3b40f23d84685fef5fa5342816586b9d54f8'
trips = json.loads(trips_raw)
lines = []
for trip in trips:
    for a, b in zip(trip['path'], trip['path'][1:]):
        if not all(-74.009 < p[0] < -73.993 and 40.717 < p[1] < 40.730 for p in [a, b]):
            continue
        # Shared map-matched positions are snapped to a 2m grid before noding.
        line = LineString([tuple(round(v / 2) * 2 for v in local(*p)) for p in [a, b]])
        if not 1 < line.length < 350:
            continue
        line = line.intersection(boundary.buffer(-1)).difference(obstacles)
        if not line.is_empty:
            lines.extend(list(line.geoms) if line.geom_type == 'MultiLineString' else [line])
source_streets = unary_union(lines)
# Connected walkable ground at 5m spacing, excluding footprints and courtyards
# disconnected from public street samples. Every diagonal is collision checked.
STEP = 5
node_map, nodes, edges = {}, [], []
inside, blocked = prep(boundary.buffer(-1)), prep(obstacles)
minx, minz, maxx, maxz = boundary.bounds
for x in range(math.ceil(minx / STEP) * STEP, math.floor(maxx / STEP) * STEP + 1, STEP):
    for z in range(math.ceil(minz / STEP) * STEP, math.floor(maxz / STEP) * STEP + 1, STEP):
        point = Point(x, z)
        if inside.covers(point) and not blocked.intersects(point):
            node_map[(x, z)] = len(nodes)
            nodes.append({'x': x, 'z': z})
for (x, z), i in node_map.items():
    for dx, dz in [(STEP, 0), (0, STEP), (STEP, STEP), (STEP, -STEP)]:
        j = node_map.get((x + dx, z + dz))
        if j is None:
            continue
        line = LineString([(x, z), (x + dx, z + dz)])
        if inside.covers(line) and not blocked.intersects(line):
            edges.append({'a': i, 'b': j, 'length': math.hypot(dx, dz)})
# Retain the largest connected network; discarded fragments cannot spawn people.
adj = [[] for _ in nodes]
for e in edges:
    adj[e['a']].append(e['b']); adj[e['b']].append(e['a'])
components, visited = [], set()
for i in range(len(nodes)):
    if i in visited:
        continue
    group, todo = set(), [i]
    while todo:
        n = todo.pop()
        if n in visited:
            continue
        visited.add(n); group.add(n); todo.extend(adj[n])
    components.append(group)
keep = max(components, key=lambda g: sum(e['length'] for e in edges if e['a'] in g))
mapping = {old: new for new, old in enumerate(sorted(keep))}
nodes = [nodes[i] for i in sorted(keep)]
edges = [{**e, 'a': mapping[e['a']], 'b': mapping[e['b']]} for e in edges if e['a'] in keep]
street_lines = [LineString([(nodes[e[k]]['x'], nodes[e[k]]['z']) for k in ['a', 'b']]) for e in edges]
tree = STRtree(street_lines)
spawn_edges = [i for i, line in enumerate(street_lines)
               if source_streets.distance(line.interpolate(.5, normalized=True)) < 3]

output_buildings = []
for i, building in enumerate(buildings):
    shape = building['geometry']
    candidates = sorted(((int(j), street_lines[j]) for j in tree.query(shape.buffer(18))),
                        key=lambda pair: shape.distance(pair[1]))
    access = None
    other = footprints.difference(shape.buffer(.3)).buffer(.2)
    for edge_id, line in candidates:
        if line.distance(shape) > 85:
            break
        door, road = nearest_points(shape.boundary, line)
        # End just outside the facade, rather than placing the tourist in a wall.
        length = road.distance(door)
        if length < .85:
            continue
        door = Point(door.x + (road.x-door.x) * .8 / length,
                     door.y + (road.y-door.y) * .8 / length)
        connector = LineString([road, door])
        if boundary.covers(connector) and not other.intersects(connector) and connector.intersection(shape).length < .5:
            access = {'edge': edge_id, 't': round(line.project(road, normalized=True), 8),
                      'point': coords(road.coords[0]), 'door': coords(door.coords[0])}
            break
    center = shape.centroid
    output_buildings.append({'id': f'B{i + 1:03}', 'name': f'Building {i + 1:03}',
        'center': coords(center.coords[0]), 'height': max(2, building['height']),
        'footprint': [[round(x, 2), round(z, 2)] for x, z in list(shape.exterior.coords)[:-1]],
        # Sub-centimeter cracks between source triangles can round to zero-area
        # holes. Drop those artifacts; retain real courtyard polygons.
        'holes': [[[round(x, 2), round(z, 2)] for x, z in list(ring.coords)[:-1]]
                  for ring in shape.interiors if Polygon(ring).area > .25],
        'entrance': access})

data = {'origin': {'longitude': LON, 'latitude': LAT}, 'metersPerDegree': {'x': MX, 'z': MZ},
        'boundary': [coords(p) for p in boundary.exterior.coords[:-1]],
        'boundaryGeo': boundary_geo, 'buildings': output_buildings,
        'nodes': [[n['x'], n['z']] for n in nodes],
        'edges': [[e['a'], e['b'], round(e['length'], 8)] for e in edges],
        'spawnEdges': spawn_edges, 'gridSpacing': STEP,
        'streetSegments': [[coords(a), coords(b)] for line in source_streets.geoms
                           for a, b in zip(line.coords, list(line.coords)[1:])],
        'sources': {k: {'url': url, 'sha256': hashlib.sha256(raw if k == 'buildings' else trips_raw).hexdigest()}
                    for k, url in SOURCES.items()}}
(ROOT / 'data').mkdir(exist_ok=True)
(ROOT / 'data/soho.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
print('Connected network:', len(nodes), 'nodes,', len(edges), 'edges; routable entrances:', sum(bool(b['entrance']) for b in output_buildings), flush=True)
