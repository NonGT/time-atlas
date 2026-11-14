import type { Map as MLMap } from 'maplibre-gl'

const RAD = Math.PI / 180

// MapLibre projects points on the back of the globe onto the visible side, so HTML markers there need hiding by hand
export function onFarSide(map: MLMap, lng: number, lat: number) {
  const c = map.getCenter()
  const cosD = Math.sin(c.lat * RAD) * Math.sin(lat * RAD) + Math.cos(c.lat * RAD) * Math.cos(lat * RAD) * Math.cos((lng - c.lng) * RAD)
  return cosD < 0.3
}
