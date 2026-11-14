import type { StyleSpecification } from 'maplibre-gl'

// Globe while zoomed out, flat web mercator once zoomed in past ~6.5.
export const FLAT_ZOOM = 6.5

export const style: StyleSpecification = {
  version: 8,
  projection: { type: ['interpolate', ['linear'], ['zoom'], 4.8, 'vertical-perspective', FLAT_ZOOM, 'mercator'] },
  sky: {
    'sky-color': '#05070d',
    'horizon-color': '#1c2c48',
    'fog-color': '#0b1424',
    'sky-horizon-blend': 0.6,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
  },
  sources: {
    omt: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 12,
      attribution: 'Terrain: Mapzen / AWS Open Data',
    },
  },
  layers: [
    { id: 'land', type: 'background', paint: { 'background-color': '#262a2a' } },
    {
      id: 'hillshade', type: 'hillshade', source: 'dem',
      paint: {
        'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 2, 0.55, 8, 0.4],
        'hillshade-shadow-color': '#0b0d10',
        'hillshade-highlight-color': '#6b6250',
        'hillshade-accent-color': '#1a1c1e',
      },
    },
    {
      id: 'desert', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'sand'],
      paint: { 'fill-color': '#4a3f2c', 'fill-opacity': 0.45 },
    },
    {
      id: 'ice', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'ice'],
      paint: { 'fill-color': '#c9d2db', 'fill-opacity': 0.18 },
    },
    {
      id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
      paint: { 'fill-color': '#0b1626', 'fill-opacity': 0.94 },
    },
    {
      id: 'rivers', type: 'line', source: 'omt', 'source-layer': 'waterway',
      filter: ['==', ['get', 'class'], 'river'],
      minzoom: 3,
      paint: {
        'line-color': '#24476e',
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0.4, 8, 1.6, 12, 4],
        'line-opacity': 0.85,
      },
    },
  ],
}
