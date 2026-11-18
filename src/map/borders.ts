import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { type GeoJSONSource, Marker, type Map as MLMap } from 'maplibre-gl';
import type { Polity } from '../data/schema';
import type { Store } from '../store';
import { onFarSide } from './farSide';
import { morph } from './morph';

interface Snapshot {
  year: number;
  file: string;
  fine?: boolean;
}
type Kind = 'state' | 'culture' | 'hidden';
interface Label {
  name: string;
  kind: Kind;
  approx: boolean;
  lng: number;
  lat: number;
  w: number;
  h: number;
}
interface Loaded {
  fc: FeatureCollection;
  labels: Label[];
}

const CULTURE =
  /hunter|gatherer|farmer|nomad|culture|peoples|tribes|pastoral|fisher|ficher|foraging|shellfish|aboriginal|neolithic|semites|dravidians|bantu|austronesians|khoisan|berbers|arabs|celts|slavs|germans|amerindian/i;
const FADE_MS = 700;
const MORPH_MS = 1100;
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
// above these zooms the current snapshot is swapped for its unsimplified version, then for the one
// whose firm borders follow Natural Earth province edges
const DETAIL_ZOOM = 4.5;
const FINE_ZOOM = 6.5;
// from here on today's borders apply, so OpenStreetMap's own lines replace the snapshot's when zoomed in
const MODERN_YEAR = 2011;
type Level = '' | 'hi/' | 'fine/';

function hashColor(name: string) {
  let h = 0;
  for (const c of name) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360}, 32%, 58%)`;
}

function ringArea(r: Position[]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
function ringCentroid(r: Position[]): [number, number] {
  let x = 0,
    y = 0,
    a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    x += (r[j][0] + r[i][0]) * f;
    y += (r[j][1] + r[i][1]) * f;
    a += f;
  }
  return a ? [x / (3 * a), y / (3 * a)] : [r[0][0], r[0][1]];
}

/** Historical borders from snapshot files, morphed from one snapshot into the next. */
export class Borders {
  private index: Snapshot[] = [];
  private cache = new Map<string, Promise<Loaded>>();
  private current = '';
  private shownLevel: Level = '';
  private modern = false;
  private front: 'a' | 'b' = 'a';
  private fade = { a: 0, b: 0 };
  private geo = { a: 0, b: 0 };
  private shown = { a: EMPTY, b: EMPTY };
  private morphId = 0;
  private morphing = false;
  private markers: { label: Label; marker: Marker; el: HTMLElement; owner: 'a' | 'b' }[] = [];
  private lookup = new Map<string, Polity>();

  constructor(
    private map: MLMap,
    private store: Store,
    private base: string,
  ) {
    for (const p of store.data.polities) for (const m of [p.match].flat()) this.lookup.set(m, p);
  }

  async init(beforeLayer: string) {
    this.index = await (await fetch(`${this.base}/index.json`)).json();
    for (const k of ['a', 'b'] as const) {
      this.map.addSource(`borders-${k}`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      this.map.addLayer(
        {
          id: `borders-${k}-fill`,
          type: 'fill',
          source: `borders-${k}`,
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0, 'fill-antialias': false },
        },
        beforeLayer,
      );
      for (const approx of [false, true])
        this.map.addLayer(
          {
            id: `borders-${k}-line${approx ? '-approx' : ''}`,
            type: 'line',
            source: `borders-${k}`,
            filter: ['all', ['==', ['get', 'kind'], 'state'], ['==', ['get', 'approx'], approx]],
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 5, 1.4, 9, 2.4],
              'line-opacity': 0,
              ...(approx ? { 'line-dasharray': [3, 2] } : {}),
            },
          },
          beforeLayer,
        );
    }
    this.map.addLayer(
      {
        id: 'borders-modern',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        minzoom: FINE_ZOOM,
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: {
          'line-color': '#d8cfb8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.6, 12, 2.6],
          'line-opacity': 0,
        },
      },
      beforeLayer,
    );
    this.applyUncertain();
    this.store.on('uncertain', () => {
      this.applyUncertain();
      this.placeLabels();
    });
    this.store.on('year', () => {
      void this.update();
      if (this.store.year >= MODERN_YEAR !== this.modern) this.applyOpacity();
    });
    this.store.on('borders', () => {
      this.applyOpacity();
      this.placeLabels();
    });
    this.map.on('move', () => this.placeLabels());
    this.map.on('zoomend', () => void this.refreshDetail());
    await this.update();
  }

  // approximate borders belong to the "uncertain" layer: dashed when shown, hidden when it is off
  private applyUncertain() {
    const show = this.store.uncertain;
    for (const k of ['a', 'b'] as const) {
      this.map.setFilter(`borders-${k}-fill`, show ? null : ['!', ['get', 'approx']]);
      this.map.setLayoutProperty(`borders-${k}-line-approx`, 'visibility', show ? 'visible' : 'none');
    }
  }

  private snapshotFor(y: number) {
    let s = this.index[0];
    for (const x of this.index) if (x.year <= y) s = x;
    return s;
  }

  private load(file: string) {
    let p = this.cache.get(file);
    if (!p) {
      p = fetch(`${this.base}/${file}`)
        .then(r => r.json())
        .then((fc: FeatureCollection) =>
          this.decorate(fc, this.index.find(s => s.file === file.replace(/^(hi|fine)\//, ''))?.year ?? 0),
        );
      p.catch(() => this.cache.delete(file));
      this.cache.set(file, p);
      // detailed files are large, keep only the one in use
      const dir = file.match(/^(hi|fine)\//)?.[0];
      if (dir) for (const k of this.cache.keys()) if (k.startsWith(dir) && k !== file) this.cache.delete(k);
    }
    return p;
  }

  private levelAt(file: string): Level {
    const z = this.map.getZoom();
    if (z >= FINE_ZOOM && this.index.find(s => s.file === file)?.fine) return 'fine/';
    return z >= DETAIL_ZOOM ? 'hi/' : '';
  }

  private async refreshDetail() {
    const file = this.current;
    const level = this.levelAt(file);
    if (!file || level === this.shownLevel || this.morphing) return;
    const loaded = await this.load(level + file).catch(() => null);
    if (!loaded || file !== this.current || this.morphing || level !== this.levelAt(file)) return;
    this.setData(this.front, loaded.fc);
    this.shownLevel = level;
  }

  private decorate(fc: FeatureCollection, year: number): Loaded {
    const best = new Map<string, Label & { area: number }>();
    const features: Feature[] = [];
    for (const f of fc.features) {
      if (!f.geometry) continue;
      const raw = String(f.properties?.name ?? '');
      const p = this.lookup.get(raw);
      const kind: Kind = p?.kind ?? (p ? 'state' : CULTURE.test(raw) ? 'culture' : 'state');
      if (kind === 'hidden' || (p?.from !== undefined && year < p.from)) continue;
      const civ = p?.civ ? this.store.civ.get(p.civ) : undefined;
      const name = p?.name ?? this.store.data.polityNames?.[raw] ?? raw;
      const color = p?.color ?? civ?.color ?? hashColor(raw);
      // historical-basemaps BORDERPRECISION: 1 approximate, 2 moderately precise, 3 determined by law
      const approx = Number(f.properties?.precision ?? 1) <= 1;
      features.push({ ...f, properties: { name, kind, color, approx } });

      const g = f.geometry as Polygon | MultiPolygon;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) {
        const outer = poly[0];
        const area = ringArea(outer);
        if ((best.get(name)?.area ?? 0) >= area) continue;
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        for (const [x, y] of outer) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        const [lng, lat] = ringCentroid(outer);
        best.set(name, { name, kind, approx, lng, lat, w: maxX - minX, h: maxY - minY, area });
      }
    }
    return { fc: { type: 'FeatureCollection', features }, labels: [...best.values()] };
  }

  private async update() {
    const snap = this.snapshotFor(this.store.year);
    if (!snap || snap.file === this.current) return;
    this.current = snap.file;
    const loaded = await this.load(snap.file);
    if (this.current !== snap.file) return;
    // prefetch neighbours so scrubbing stays smooth
    const i = this.index.indexOf(snap);
    for (const n of [this.index[i - 1], this.index[i + 1]]) if (n) void this.load(n.file);

    const from = this.shown[this.front],
      back = this.front === 'a' ? 'b' : 'a';
    this.setLabels(back, loaded.labels);
    this.front = back;
    this.shownLevel = '';
    this.animate();
    this.morphTo(back, from, loaded.fc);
  }

  private setData(k: 'a' | 'b', fc: FeatureCollection) {
    this.shown[k] = fc;
    (this.map.getSource(`borders-${k}`) as GeoJSONSource).setData(fc);
  }

  /** Reshape the old borders into the new ones on the back source, then swap in the real geometry. */
  private morphTo(k: 'a' | 'b', from: FeatureCollection, to: FeatureCollection) {
    const other = k === 'a' ? 'b' : 'a';
    const id = ++this.morphId;
    const finish = () => {
      this.morphing = false;
      this.setData(k, to);
      this.geo[k] = 1;
      this.geo[other] = 0;
      this.applyOpacity();
      void this.refreshDetail();
    };
    if (!from.features.length || !this.store.borders || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return finish();
    const frame = morph(from, to);
    this.morphing = true;
    this.setData(k, frame(0));
    const start = performance.now();
    const step = () => {
      if (id !== this.morphId) return;
      const t = Math.min(1, (performance.now() - start) / MORPH_MS);
      const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      // the old layer starts identical to frame 0, so drop it quickly once the new one is drawn
      this.geo[k] = 1;
      this.geo[other] = Math.max(0, 1 - t * 6);
      this.applyOpacity();
      if (t < 1) {
        this.setData(k, frame(e));
        requestAnimationFrame(step);
      } else finish();
    };
    requestAnimationFrame(step);
  }

  private animate() {
    const start = performance.now();
    const from = { ...this.fade };
    const to = { a: this.front === 'a' ? 1 : 0, b: this.front === 'b' ? 1 : 0 };
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / FADE_MS);
      this.fade.a = from.a + (to.a - from.a) * t;
      this.fade.b = from.b + (to.b - from.b) * t;
      this.applyOpacity();
      if (t < 1) requestAnimationFrame(step);
      else this.dropLabels(this.front === 'a' ? 'b' : 'a');
    };
    requestAnimationFrame(step);
  }

  private applyOpacity() {
    for (const k of ['a', 'b'] as const) {
      const f = this.store.borders ? this.geo[k] : 0;
      // fade the fill once zoomed into a city so the terrain and buildings stay readable
      const state = ['==', ['get', 'kind'], 'state'];
      this.map.setPaintProperty(`borders-${k}-fill`, 'fill-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        5,
        ['case', state, 0.2 * f, 0.06 * f],
        8,
        ['case', state, 0.05 * f, 0.015 * f],
      ] as never);
      for (const id of [`borders-${k}-line`, `borders-${k}-line-approx`])
        this.map.setPaintProperty(id, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.75 * f, 8, 0.35 * f]);
    }
    // snapshot lines hand over to the base map's own lines between zoom 7 and 8
    this.modern = this.store.year >= MODERN_YEAR;
    const modern = this.store.borders && this.modern;
    this.map.setPaintProperty(
      'borders-modern',
      'line-opacity',
      modern ? ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.55] : 0,
    );
    if (modern)
      for (const k of ['a', 'b'] as const)
        this.map.setPaintProperty(`borders-${k}-line`, 'line-opacity', [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          0.75 * this.geo[k],
          7,
          0.4 * this.geo[k],
          8,
          0,
        ]);
    for (const m of this.markers) m.el.style.opacity = String(this.store.borders ? this.fade[m.owner] : 0);
  }

  private setLabels(owner: 'a' | 'b', labels: Label[]) {
    this.dropLabels(owner);
    for (const label of labels) {
      const el = document.createElement('div');
      el.className = `polity polity-${label.kind}${/[\u0E00-\u0E7F]/.test(label.name) ? ' th' : ''}${label.approx ? ' approx' : ''}`;
      el.textContent = label.name;
      el.style.opacity = '0';
      const marker = new Marker({ element: el, opacityWhenCovered: '0' })
        .setLngLat([label.lng, label.lat])
        .addTo(this.map);
      this.markers.push({ label, marker, el, owner });
    }
    this.placeLabels();
  }

  private dropLabels(owner: 'a' | 'b') {
    this.markers = this.markers.filter(m => {
      if (m.owner !== owner) return true;
      m.marker.remove();
      return false;
    });
  }

  /** Show a polity's name only when its area is wide enough on screen to hold it. */
  private placeLabels() {
    const z = this.map.getZoom();
    const pxPerDeg = (512 * 2 ** z) / 360;
    for (const m of this.markers) {
      const { label } = m;
      if (onFarSide(this.map, label.lng, label.lat)) {
        m.el.hidden = true;
        continue;
      }
      const wpx = label.w * pxPerDeg * Math.cos((label.lat * Math.PI) / 180);
      const hpx = label.h * pxPerDeg;
      const need = label.name.length * 6.5 + 16;
      const ok =
        this.store.borders &&
        (this.store.uncertain || !label.approx) &&
        wpx > need * (label.kind === 'culture' ? 2.2 : 1.1) &&
        hpx > 22 &&
        (label.kind === 'state' || z > 3.2);
      m.el.hidden = !ok;
    }
  }
}
