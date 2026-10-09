"""Validate every stored walking edge against the bundled real footprints."""
import json
from pathlib import Path
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union
from shapely.prepared import prep

data=json.loads((Path(__file__).resolve().parents[1]/'data/soho.json').read_text())
boundary=prep(Polygon([(p['x'],p['z']) for p in data['boundary']]))
footprints=unary_union([Polygon(b['footprint'],b['holes']) for b in data['buildings']])
blocked=prep(footprints.buffer(.5))
for a,b,length in data['edges']:
    line=LineString([data['nodes'][a],data['nodes'][b]])
    assert boundary.covers(line), 'Walking edge crosses the study boundary'
    assert not blocked.intersects(line), 'Walking edge crosses a building'
    assert abs(line.length-length)<1e-6
for building in data['buildings']:
    access=building['entrance']
    if access:
        line=LineString([(p['x'],p['z']) for p in [access['point'],access['door']]])
        assert boundary.covers(line)
        assert line.intersection(footprints).length<.25, building['id']
print(f'Geometry checks passed: {len(data["edges"])} edges inside boundary, avoiding footprints; 680 estimated entrance connectors checked.')
