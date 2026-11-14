import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'

type Pt = [number, number]
interface Part { ring: Pt[]; c: Pt; area: number }
interface Shape { key: string; props: Record<string, unknown>; parts: Part[]; box: [number, number, number, number] }
interface Track { props: Record<string, unknown>; from?: number[]; to?: number[]; pairs: { a: Pt[]; b: Pt[] }[] }

const MAX_PTS = 300

/** '#rrggbb' or 'hsl(h, s%, l%)' to rgb, the two forms borders.ts produces. */
function rgb(c: unknown): number[] | undefined {
  const s = String(c)
  if (s.startsWith('#')) return [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16))
  const m = s.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/)
  if (!m) return undefined
  const h = +m[1] / 360, sat = +m[2] / 100, l = +m[3] / 100
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q
  const f = (t: number) => {
    t = (t + 1) % 1
    return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p)
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)]
}

function signedArea(r: Pt[]) {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1])
  return a / 2
}

function centroid(r: Pt[]): Pt {
  let x = 0, y = 0, a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]
    x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; a += f
  }
  return a ? [x / (3 * a), y / (3 * a)] : r[0]
}

/** Outer rings grouped by display name, so a polity split across several raw features moves as one. */
function shapes(fc: FeatureCollection) {
  const out = new Map<string, Shape>()
  for (const f of fc.features) {
    const g = f.geometry as Polygon | MultiPolygon | null
    if (!g) continue
    const key = `${f.properties?.kind}|${f.properties?.name}`
    let s = out.get(key)
    if (!s) out.set(key, (s = { key, props: f.properties ?? {}, parts: [], box: [Infinity, Infinity, -Infinity, -Infinity] }))
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      let ring = poly[0].slice(0, -1).map(p => [p[0], p[1]] as Pt)
      if (ring.length < 3) continue
      const a = signedArea(ring)
      if (a < 0) ring = ring.reverse()
      for (const [x, y] of ring) {
        s.box[0] = Math.min(s.box[0], x); s.box[1] = Math.min(s.box[1], y)
        s.box[2] = Math.max(s.box[2], x); s.box[3] = Math.max(s.box[3], y)
      }
      s.parts.push({ ring, c: centroid(ring), area: Math.abs(a) })
    }
    if (!s.parts.length) out.delete(key)
  }
  return out
}

function resample(r: Pt[], n: number): Pt[] {
  const d = [0]
  for (let i = 1; i <= r.length; i++) {
    const p = r[i - 1], q = r[i % r.length]
    d.push(d[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]))
  }
  const total = d[r.length] || 1, out: Pt[] = []
  for (let k = 0, i = 0; k < n; k++) {
    const t = (k / n) * total
    while (d[i + 1] < t) i++
    const p = r[i], q = r[(i + 1) % r.length], s = (t - d[i]) / (d[i + 1] - d[i] || 1)
    out.push([p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s])
  }
  return out
}

/** Rotate b's start point so corresponding vertices are as close as possible, which keeps the morph from twisting. */
function align(a: Pt[], b: Pt[]) {
  const n = a.length, stride = Math.max(1, Math.floor(n / 40))
  let best = 0, bestD = Infinity
  for (let off = 0; off < n; off++) {
    let s = 0
    for (let i = 0; i < n && s < bestD; i += stride) {
      const p = a[i], q = b[(i + off) % n]
      s += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
    }
    if (s < bestD) { bestD = s; best = off }
  }
  return best ? [...b.slice(best), ...b.slice(0, best)] : b
}

function pair(a: Pt[], b: Pt[]) {
  const n = Math.min(MAX_PTS, Math.max(12, a.length, b.length))
  const ra = resample(a, n)
  return { a: ra, b: align(ra, resample(b, n)) }
}

const collapse = (r: Pt[], c: Pt) => r.map(() => [c[0], c[1]] as Pt)

function iou(a: Shape['box'], b: Shape['box']) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  if (w <= 0 || h <= 0) return 0
  const i = w * h, area = (x: Shape['box']) => (x[2] - x[0]) * (x[3] - x[1])
  return i / (area(a) + area(b) - i)
}

/** Each target part grows out of the nearest source part; source parts left over shrink away. */
function trackFor(from: Shape | undefined, to: Shape | undefined): Track {
  const pairs: Track['pairs'] = []
  if (from && to) {
    const used = new Set<Part>()
    for (const t of to.parts) {
      let best = from.parts[0], bd = Infinity
      for (const s of from.parts) {
        const d = (s.c[0] - t.c[0]) ** 2 + (s.c[1] - t.c[1]) ** 2
        if (d < bd) { bd = d; best = s }
      }
      used.add(best)
      // a tiny island morphing out of a far-off mainland looks wrong, grow it in place instead
      const near = bd < Math.max(best.area, t.area) * 4
      pairs.push(near ? pair(best.ring, t.ring) : { a: collapse(resample(t.ring, Math.min(MAX_PTS, t.ring.length)), t.c), b: resample(t.ring, Math.min(MAX_PTS, t.ring.length)) })
    }
    for (const s of from.parts) if (!used.has(s)) { const r = resample(s.ring, Math.min(MAX_PTS, s.ring.length)); pairs.push({ a: r, b: collapse(r, s.c) }) }
    const a = rgb(from.props.color), b = rgb(to.props.color)
    return { props: to.props, pairs, ...(a && b && from.props.color !== to.props.color ? { from: a, to: b } : {}) }
  }
  const s = (from ?? to)!
  for (const p of s.parts) {
    const r = resample(p.ring, Math.min(MAX_PTS, Math.max(12, p.ring.length)))
    pairs.push(from ? { a: r, b: collapse(r, p.c) } : { a: collapse(r, p.c), b: r })
  }
  return { props: s.props, pairs }
}

/** Builds a function that returns the in-between borders for t in [0, 1]. */
export function morph(fromFc: FeatureCollection, toFc: FeatureCollection) {
  const A = shapes(fromFc), B = shapes(toFc)
  const tracks: Track[] = []
  const leftA = new Set(A.values())
  const leftB: Shape[] = []
  for (const [k, b] of B) {
    const a = A.get(k)
    if (a) { tracks.push(trackFor(a, b)); leftA.delete(a) } else leftB.push(b)
  }
  // renamed polities (e.g. republic to empire) still occupy roughly the same box
  for (const b of leftB) {
    let best: Shape | undefined, bi = 0.3
    for (const a of leftA) { const v = iou(a.box, b.box); if (v > bi) { bi = v; best = a } }
    if (best) leftA.delete(best)
    tracks.push(trackFor(best, b))
  }
  for (const a of leftA) tracks.push(trackFor(a, undefined))

  return (t: number): FeatureCollection => ({
    type: 'FeatureCollection',
    features: tracks.map((tr): Feature => ({
      type: 'Feature',
      properties: tr.from ? { ...tr.props, color: `rgb(${tr.from.map((v, i) => Math.round(v + (tr.to![i] - v) * t)).join(',')})` } : tr.props,
      geometry: {
        type: 'MultiPolygon',
        coordinates: tr.pairs.map(({ a, b }) => {
          const ring: Position[] = a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t])
          ring.push(ring[0])
          return [ring]
        }),
      },
    })),
  })
}
