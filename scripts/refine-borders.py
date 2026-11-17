# Writes public/geo/borders/fine/: the full-detail snapshots with their firm borders (BORDERPRECISION 2-3)
# moved onto Natural Earth 10m province edges wherever a polity covers nearly a whole province.
# Approximate borders are left exactly as drawn. Run after `npm run fetch-geo`; needs shapely.
#   python3 -m pip install shapely && python3 scripts/refine-borders.py
import io, json, math, subprocess, tempfile, urllib.request, zipfile
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
BORDERS = ROOT / 'public' / 'geo' / 'borders'
MAPSHAPER = ROOT / 'node_modules' / '.bin' / 'mapshaper'
NE = 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip'
# a province goes whole to the polity covering this share of it, unless the rest is a large area
WHOLE_SHARE, MAX_SPILL = 0.8, 1.5


def area(g):
    return 0.0 if g.is_empty else g.area * math.cos(math.radians(g.centroid.y))


def provinces(tmp: Path):
    with urllib.request.urlopen(NE) as r:
        zipfile.ZipFile(io.BytesIO(r.read())).extractall(tmp)
    out = tmp / 'prov.json'
    subprocess.run([MAPSHAPER, '-i', tmp / 'ne_10m_admin_1_states_provinces.shp', '-filter-fields', 'adm1_code',
                    '-simplify', 'interval=200', 'keep-shapes', '-o', out, 'format=geojson', 'precision=0.0001'],
                   check=True, capture_output=True)
    prov = []
    for f in json.loads(out.read_text())['features']:
        if f['geometry']:
            g = shapely.set_precision(shapely.make_valid(shape(f['geometry'])), 1e-5)
            if not g.is_empty:
                prov.append(g)
    return prov


def extend(prov):
    """Grow each province into the sea up to the nearest other province, so coasts never become edges."""
    land = unary_union(prov)
    sea = land.simplify(0.02).buffer(0.5, 4).simplify(0.05).difference(land)
    pts, owner = [], []
    for i, g in enumerate(prov):
        for c in shapely.get_coordinates(g.simplify(0.03)):
            pts.append(c)
            owner.append(i)
    arr = np.round(np.array(pts), 4)
    _, keep = np.unique(arr, axis=0, return_index=True)
    keep.sort()
    cells = shapely.get_parts(shapely.voronoi_polygons(
        shapely.multipoints(shapely.points(arr[keep])), ordered=True, extend_to=shapely.box(-200, -100, 200, 100)))
    groups = {}
    for c, k in zip(cells, keep):
        groups.setdefault(owner[k], []).append(c)
    ext = []
    for i, g in enumerate(prov):
        s = unary_union(groups.get(i, [])).intersection(sea)
        ext.append(g if s.is_empty else shapely.set_precision(g.union(s), 1e-5))
    return ext


def refine(fc, prov, ext, tree):
    feats = fc['features']
    geoms = [shapely.make_valid(shape(f['geometry'])) if f['geometry'] else None for f in feats]
    firm = [g is not None and int(f['properties'].get('precision') or 1) >= 2 for f, g in zip(feats, geoms)]
    ftree = STRtree([g if g is not None else shapely.Point() for g in geoms])
    parts = {i: [] for i in range(len(feats))}
    for pi, P in enumerate(prov):
        pa = area(P)
        hits = [i for i in ftree.query(P, predicate='intersects') if firm[i]]
        if pa <= 0 or not hits:
            continue
        covs = sorted(((area(geoms[i].intersection(P)), i) for i in hits), reverse=True)
        best, bi = covs[0]
        if best / pa >= WHOLE_SHARE and pa - best <= MAX_SPILL:
            parts[bi].append(ext[pi])
        else:
            for a, i in covs:
                if a > 0:
                    parts[i].append(geoms[i].intersection(ext[pi]))
    out, n = [], 0
    for i, f in enumerate(feats):
        g = geoms[i]
        if parts[i]:
            n += 1
            # whatever lies beyond the province cover (open sea, far islets) stays as drawn
            rest = g.difference(unary_union([ext[j] for j in tree.query(g)]))
            new = shapely.make_valid(unary_union(parts[i] + ([rest] if not rest.is_empty else [])))
            polys = [p for p in shapely.get_parts(new) if p.geom_type == 'Polygon' and area(p) > 1e-6]
            g = unary_union(polys) if polys else g
        if g is not None and not g.is_empty:
            out.append({'type': 'Feature', 'properties': f['properties'], 'geometry': mapping(g)})
    return {'type': 'FeatureCollection', 'features': out}, n


def main():
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        prov = provinces(tmp)
        ext = extend(prov)
        tree = STRtree(ext)
        index = json.loads((BORDERS / 'index.json').read_text())
        (BORDERS / 'fine').mkdir(exist_ok=True)
        for s in index:
            s.pop('fine', None)
            fc, n = refine(json.loads((BORDERS / 'hi' / s['file']).read_text()), prov, ext, tree)
            dest = BORDERS / 'fine' / s['file']
            # snapshots with only approximate borders have nothing to add over hi/
            if n < 10:
                dest.unlink(missing_ok=True)
                continue
            raw = tmp / s['file']
            raw.write_text(json.dumps(fc))
            subprocess.run([MAPSHAPER, '-i', raw, '-o', dest, 'format=geojson', 'precision=0.0001'],
                           check=True, capture_output=True)
            s['fine'] = True
            print('fine', s['file'], n)
        (BORDERS / 'index.json').write_text(json.dumps(index, separators=(',', ':')))


main()
