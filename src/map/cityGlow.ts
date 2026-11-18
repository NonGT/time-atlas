import type { FeatureCollection, Point } from 'geojson';
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import type { Store } from '../store';

const SRC = 'city-points';
// compressed above ~500k so modern megacities don't swallow the whole continent
const sqrtPop: ExpressionSpecification = [
  'min',
  ['sqrt', ['get', 'pop']],
  ['+', 20, ['*', 0.12, ['sqrt', ['get', 'pop']]]],
];
const alpha: ExpressionSpecification = ['get', 'a'];

/** Cities as glowing light on the ground. Fades into a faint ground glow once 3D buildings take over. */
export function addCityGlow(map: MLMap, store: Store, onClick: (cityId: string) => void) {
  const cities = store.data.cities;
  const a = new Map(cities.map(c => [c.id, store.pop(c) > 0.5 ? 1 : 0]));

  const data = (): FeatureCollection<Point> => ({
    type: 'FeatureCollection',
    features: cities.map(c => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      properties: { id: c.id, color: store.colorOfCity(c), pop: store.pop(c), a: a.get(c.id)! },
    })),
  });

  map.addSource(SRC, { type: 'geojson', data: data() });
  map.addLayer({
    id: 'city-halo',
    type: 'circle',
    source: SRC,
    paint: {
      'circle-color': ['get', 'color'],
      'circle-blur': 1,
      'circle-pitch-alignment': 'map',
      'circle-radius': [
        'interpolate',
        ['exponential', 1.6],
        ['zoom'],
        1,
        ['+', 3, ['*', 0.8, sqrtPop]],
        4,
        ['+', 6, ['*', 2, sqrtPop]],
        7,
        ['+', 16, ['*', 5, sqrtPop]],
        11,
        ['+', 80, ['*', 18, sqrtPop]],
      ],
    },
  });
  map.addLayer({
    id: 'city-core',
    type: 'circle',
    source: SRC,
    paint: {
      'circle-color': '#fff4dc',
      'circle-blur': 0.6,
      'circle-pitch-alignment': 'map',
      'circle-radius': [
        'interpolate',
        ['exponential', 1.6],
        ['zoom'],
        1,
        ['+', 1.2, ['*', 0.22, sqrtPop]],
        5,
        ['+', 2, ['*', 0.6, sqrtPop]],
        9,
        ['+', 4, ['*', 1.6, sqrtPop]],
      ],
    },
  });

  const applyMode = () => {
    const city = store.mode === 'city';
    map.setPaintProperty(
      'city-halo',
      'circle-opacity',
      city ? ['interpolate', ['linear'], ['zoom'], 5.5, ['*', 0.9, alpha], 7.5, ['*', 0.3, alpha]] : ['*', 0.9, alpha],
    );
    map.setPaintProperty(
      'city-core',
      'circle-opacity',
      city ? ['interpolate', ['linear'], ['zoom'], 5.5, alpha, 7, 0] : alpha,
    );
  };
  applyMode();
  store.on('mode', applyMode);

  // Ease each city's light in and out instead of popping when the year changes.
  let raf = 0;
  const tick = () => {
    let busy = false;
    for (const c of cities) {
      const t = store.pop(c) > 0.5 ? 1 : 0;
      const v = a.get(c.id)!;
      const nv = Math.abs(t - v) < 0.02 ? t : v + (t - v) * 0.12;
      if (nv !== t) busy = true;
      a.set(c.id, nv);
    }
    (map.getSource(SRC) as GeoJSONSource).setData(data());
    raf = busy ? requestAnimationFrame(tick) : 0;
  };
  store.on('year', () => {
    if (!raf) raf = requestAnimationFrame(tick);
  });

  for (const layer of ['city-halo', 'city-core']) {
    map.on('click', layer, e => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onClick(id);
    });
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
}
