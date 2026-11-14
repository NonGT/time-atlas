import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { MultiPolygon, Polygon, Position } from 'geojson'

export type IsLand = (lon: number, lat: number) => boolean

// Edges bucketed into latitude rows, so a point only meets the coastline near its own latitude
// instead of every vertex of a continent.
const ROW = 0.1

/** Natural Earth 10m land as a point-in-polygon test, used to keep generated buildings off the water. */
export async function loadLandMask(url: string): Promise<IsLand> {
  const topo = (await (await fetch(url)).json()) as Topology<{ land: GeometryCollection }>
  const fc = feature(topo, topo.objects.land)
  const rows = new Map<number, number[]>()
  const addRing = (ring: Position[], id: number) => {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j], [x2, y2] = ring[i]
      if (y1 === y2) continue
      for (let r = Math.floor(Math.min(y1, y2) / ROW), end = Math.floor(Math.max(y1, y2) / ROW); r <= end; r++) {
        let row = rows.get(r)
        if (!row) rows.set(r, (row = []))
        row.push(x1, y1, x2, y2, id)
      }
    }
  }
  let id = 0
  for (const f of fc.features) {
    const g = f.geometry as Polygon | MultiPolygon
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      for (const ring of poly) addRing(ring, id)
      id++
    }
  }
  // parity is kept per polygon (holes are lakes); some land polygons overlap, so a global count would cancel out
  return (x, y) => {
    const e = rows.get(Math.floor(y / ROW))
    if (!e) return false
    const odd = new Set<number>()
    for (let k = 0; k < e.length; k += 5) {
      const xi = e[k], yi = e[k + 1], xj = e[k + 2], yj = e[k + 3]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        if (odd.has(e[k + 4])) odd.delete(e[k + 4])
        else odd.add(e[k + 4])
      }
    }
    return odd.size > 0
  }
}
