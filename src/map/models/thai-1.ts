import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { gable, staged, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
const SQ2 = Math.SQRT2

const PAL = {
  gold: ['#d9a93a', '#3a2a08'], white: ['#efe9dc', '#2a2620'], cream: ['#e6d9bd', '#2a2416'],
  orange: ['#c8622e', '#2e1206'], green: ['#2f7a4a', '#0a1e10'], red: ['#a8322a', '#2a0806'],
  blue: ['#4f7fb0', '#0e1c2c'], yellow: ['#d8b84a', '#2e2408'], dark: ['#2d2a2a', '#000000'],
  lawn: ['#6f8f4a', '#18220c'], tree: ['#3f6034', '#0e180a'], pave: ['#cfc6b4', '#26221a'],
  marble: ['#f4f1ea', '#2c2a26'], amber: ['#d98f2a', '#33200a'], ochre: ['#a86a22', '#221406'],
  grey: ['#9a958c', '#1c1a18'], water: ['#6b8fa6', '#0e1c26'], dome: ['#7f9a8a', '#141e18'],
  bronze: ['#5a4a3a', '#120c08'], pink: ['#c9787a', '#2a1212'],
} as const
type K = keyof typeof PAL
type Sink = { push(...g: G[]): unknown }
type P = Record<K, Sink>

const parts = () => Object.fromEntries(Object.keys(PAL).map(key => [key, [] as G[]])) as unknown as Record<K, G[]>

function finish(k: Kit, p: Record<K, G[]>) {
  for (const key of Object.keys(p) as K[]) {
    const gs = p[key]
    if (!gs.length) continue
    const mixed = gs.some(g => !g.index)
    const merged = mergeGeometries(mixed ? gs.map(g => (g.index ? g.toNonIndexed() : g)) : gs)!
    k.add(merged, 0, 0, 0, new THREE.MeshLambertMaterial({ color: PAL[key][0], emissive: PAL[key][1] }))
  }
}

/** Same sinks, but everything pushed is turned by rot and moved to (x, z) first. */
function sub(p: P, x: number, z: number, rot = 0): P {
  const q = {} as P
  for (const key of Object.keys(PAL) as K[])
    q[key] = { push: (...gs: G[]) => { for (const g of gs) { if (rot) g.rotateY(rot); p[key].push(g.translate(x, 0, z)) } } }
  return q
}

const flat = (g: G) => { const f = g.toNonIndexed(); f.computeVertexNormals(); return f }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 8) =>
  new THREE.CylinderGeometry(rt, rb, h, n).translate(x, y + h / 2, z)
/** Square frustum by half-widths. */
const sq = (b: number, t: number, h: number, x: number, y: number, z: number) =>
  flat(new THREE.CylinderGeometry(t * SQ2, b * SQ2, h, 4).rotateY(Math.PI / 4).translate(x, y + h / 2, z))
function lathe(pts: number[][], seg: number, sr: number, sh: number, x: number, y: number, z: number, rot = 0) {
  let g: G = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)), seg)
  if (rot) g.rotateY(rot)
  if (seg <= 8) g = flat(g)
  return g.translate(x, y, z)
}
/** Single triangle in the z-y plane at x, facing +x (s = 1) or -x: a gable pediment. */
function tri(w: number, h: number, x: number, y: number, s: number) {
  const g = new THREE.BufferGeometry()
  const a = (s * w) / 2
  g.setAttribute('position', new THREE.Float32BufferAttribute([x, y, a, x, y, -a, x, y + h, 0], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))
  g.computeVertexNormals()
  return g
}
/** Flat panel (window, door) facing +z, or -z / +x / -x by face. */
function pane(w: number, h: number, x: number, y: number, z: number, face: 'n' | 's' | 'e' | 'w') {
  const g = new THREE.PlaneGeometry(w, h)
  g.rotateY({ s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face])
  return g.translate(x, y + h / 2, z)
}

/** Border strips continuing both slopes past the eaves, tucked only a little under the tiles. */
function eaves(o: Sink, L: number, W: number, H: number, y: number) {
  const th = Math.atan2(H, W / 2), e = Math.max(0.007, W * 0.11), c = Math.cos(th), sn = Math.sin(th)
  for (const s of [-1, 1]) {
    const d = e / 2 - 0.002
    o.push(new THREE.PlaneGeometry(L, e).rotateX(-Math.PI / 2).rotateX(s * th).translate(0, y - d * sn - 0.0008, s * (W / 2 + d * c)))
  }
}

/**
 * Tiered Thai gable roof along x: the top tier is shortest and highest, each lower tier steps out and
 * down at the gable ends. Green-edged orange tiles, gold pediments and chofa at the ridge ends.
 */
function thaiRoof(p: P, l: number, w: number, h: number, y: number, o: { tiers?: number, tile?: K, edge?: K, ped?: K, chofa?: boolean, skirt?: number, step?: number } = {}) {
  const t = o.tiers ?? 3, step = o.step ?? l * 0.09, drop = h * 0.24
  const tile = o.tile ?? 'orange', edge = o.edge ?? 'green', ped = o.ped ?? 'gold'
  for (let i = 0; i < t; i++) {
    const n = t - 1 - i
    const L = l - 2 * step * n, W = w * (1 - 0.05 * n), H = h * (1 - 0.05 * n), yy = y + drop * n
    p[tile].push(gable(L, W, H).translate(0, yy, 0))
    eaves(p[edge], L + 0.006, W, H, yy)
    for (const s of [-1, 1]) {
      p[ped].push(tri(W * 0.84, H * 0.84, s * (L / 2 + 0.0035), yy + H * 0.04, s))
      if (o.chofa !== false) {
        const c = Math.max(0.008, H * 0.32)
        p.gold.push(flat(new THREE.CylinderGeometry(c * 0.04, c * 0.13, c, 3, 1, true).rotateZ(-s * 0.45)).translate(s * (L / 2 + 0.004 + c * 0.2), yy + H + c * 0.35, 0))
      }
    }
  }
  if (o.skirt) {
    const W = w * (1 + o.skirt), H = h * 0.42, yy = y - h * 0.3
    p[tile].push(gable(l * 0.98, W, H).translate(0, yy, 0))
    eaves(p[edge], l * 0.98 + 0.004, W, H, yy)
  }
}

/** Prasat spire (ยอดปราสาท): receding square tiers, a bell, then a needle. */
function prasatSpire(p: P, key: K, x: number, y: number, z: number, w: number, h: number) {
  const pts: number[][] = [[1, 0]]
  for (let i = 0; i < 6; i++) {
    const r = 1 - i * 0.12, y0 = i * 0.07
    pts.push([r, y0 + 0.05], [r * 0.84, y0 + 0.058], [r * 0.86, y0 + 0.07])
  }
  pts.push([0.38, 0.44], [0.42, 0.48], [0.28, 0.56], [0.16, 0.66], [0.13, 0.7], [0.05, 0.84], [0.015, 1], [0, 1])
  p[key].push(lathe(pts, 4, w * SQ2, h, x, y, z, Math.PI / 4))
}

/** Square hip roof in receding tiers, each with a green eave. */
function tierRoof(p: P, x: number, y: number, z: number, hw: number, tiers: number, th: number, tile: K = 'orange', edge: K = 'green') {
  for (let i = 0; i < tiers; i++) {
    const r = hw * (1 - (0.55 * i) / tiers)
    p[edge].push(sq(r * 1.08, r * 1.04, th * 0.12, x, y, z))
    p[tile].push(sq(r, r * 0.62, th, x, y + th * 0.12, z))
    y += th * 0.8
  }
  return y
}

/** Ringed spire (ปล้องไฉน), unit radius and height. */
function spirePts(n = 7) {
  const pts: number[][] = []
  for (let i = 0; i < n; i++) {
    const r0 = 1 - 0.7 * (i / n), y0 = (0.6 * i) / n
    pts.push([r0, y0], [r0 * 0.86, y0 + (0.6 / n) * 0.95])
  }
  pts.push([0.24, 0.62], [0.12, 0.76], [0.07, 0.86], [0.1, 0.89], [0.03, 0.93], [0, 1])
  return pts
}

/** Bell chedi (ทรงระฆัง): three rings, bell, harmika, ringed spire. */
function bellChedi(p: P, key: K, x: number, y: number, z: number, R: number, H: number, seg = 12) {
  const pts = [[1, 0], [1, 0.035], [0.92, 0.05], [0.92, 0.075], [0.84, 0.09], [0.84, 0.115], [0.76, 0.13],
    [0.7, 0.14], [0.72, 0.2], [0.7, 0.27], [0.61, 0.34], [0.46, 0.39], [0.28, 0.415], [0, 0.42]]
  p[key].push(lathe(pts, seg, R, H, x, y, z))
  p[key].push(bx(R * 0.52, H * 0.05, R * 0.52, x, y + H * 0.41, z), bx(R * 0.6, H * 0.012, R * 0.6, x, y + H * 0.46, z))
  p[key].push(lathe(spirePts(5), 6, R * 0.2, H * 0.49, x, y + H * 0.51, z))
}

/** Redented chedi (ย่อมุม) as at Wat Pho: two crossed square lathes, then a round ringed spire. */
function redentChedi(p: P, key: K, x: number, y: number, z: number, R: number, H: number) {
  const pts = [[1, 0], [1, 0.05], [0.86, 0.055], [0.86, 0.1], [0.74, 0.105], [0.74, 0.15], [0.64, 0.155], [0.64, 0.19],
    [0.6, 0.2], [0.63, 0.25], [0.6, 0.31], [0.5, 0.37], [0.36, 0.41], [0.26, 0.42], [0.26, 0.46], [0.3, 0.47], [0.3, 0.49], [0.2, 0.5], [0, 0.5]]
  for (const [sx, sz] of [[1, 0.7], [0.7, 1]]) {
    const g = lathe(pts, 4, R * SQ2, H, 0, 0, 0, Math.PI / 4)
    p[key].push(g.scale(sx, 1, sz).translate(x, y, z))
  }
  p[key].push(lathe(spirePts(5), 6, R * 0.2, H * 0.46, x, y + H * 0.5, z))
  p.gold.push(cyl(R * 0.035, 0.0005, H * 0.08, x, y + H * 0.93, z, 4))
}

function smallChedi(p: P, key: K, x: number, z: number, R: number, H: number, y = 0) {
  p[key].push(lathe([[1, 0], [1, 0.12], [0.75, 0.3], [0.45, 0.45], [0.1, 0.75], [0, 1]], 6, R, H, x, y, z, Math.PI / 6))
}

/** Prang: corn-cob spire, unit radius and height. */
function prangPts(tiers = 5, top = 0.8) {
  const pts: number[][] = [[1, 0]]
  const r = (t: number) => 1 - 0.84 * Math.pow(t, 2.3)
  for (let i = 0; i < tiers; i++) {
    const y0 = (i / tiers) * top, y1 = ((i + 1) / tiers) * top, r0 = r(i / tiers), r1 = r((i + 1) / tiers)
    pts.push([r0 * 1.1, y0 + 0.004], [r0 * 1.1, y0 + 0.02], [r0 * 0.97, y0 + 0.03], [r1 * 0.98, y1])
  }
  pts.push([0.2, top + 0.03], [0.1, top + 0.08], [0.04, top + 0.1], [0.012, 1], [0, 1])
  return pts
}

/** Gallery (พระระเบียง) along x: white back wall, single-tier tiled roof. */
function gallery(p: P, l: number, w: number, h: number, outer: 1 | -1, tile: K = 'orange', edge: K = 'green', wall: K = 'white') {
  p[wall].push(bx(l, h, 0.008, 0, 0, outer * (w / 2 - 0.004)))
  p.red.push(bx(l - 0.01, h * 0.8, 0.002, 0, 0, outer * (w / 2 - 0.009)))
  thaiRoof(p, l, w + 0.008, w * 0.42, h, { tiers: 1, tile, edge, chofa: false, ped: wall, step: 0 })
}

/** Rectangular ring of galleries, x from -a to a and z from -b to b (centre lines). */
function cloister(p: P, a: number, b: number, w: number, h: number, tile: K = 'orange', edge: K = 'green', wall: K = 'white') {
  gallery(sub(p, 0, -b), 2 * a + w, w, h, -1, tile, edge, wall)
  gallery(sub(p, 0, b), 2 * a + w, w, h, 1, tile, edge, wall)
  gallery(sub(p, -a, 0, Math.PI / 2), 2 * b - w, w, h, -1, tile, edge, wall)
  gallery(sub(p, a, 0, Math.PI / 2), 2 * b - w, w, h, 1, tile, edge, wall)
}

/** Square posts in a row from (x0, z0) to (x1, z1). */
function posts(p: P, key: K, n: number, x0: number, z0: number, x1: number, z1: number, s: number, h: number, y = 0) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    p[key].push(bx(s, h, s, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t))
  }
}

/**
 * Ubosot or vihara along x on a raised base: veranda posts round the walls, tiered roof with a lower skirt.
 * Returns the roof's base height.
 */
function hall(p: P, o: { l: number, w: number, base: number, wallH: number, wall: K, col?: K, ncol?: number, tiers?: number, roofH?: number, tile?: K, edge?: K, doors?: number, baseKey?: K }) {
  const { l, w, base, wallH } = o
  const bk = o.baseKey ?? 'white'
  p[bk].push(bx(l + 0.03, base * 0.5, w + 0.03, 0, 0, 0), bx(l + 0.012, base * 0.5, w + 0.012, 0, base * 0.5, 0))
  p[o.wall].push(bx(l * 0.86, wallH, w * 0.66, 0, base, 0))
  const nc = o.ncol ?? 8
  if (o.col) {
    for (const s of [-1, 1]) posts(p, o.col, nc, -l / 2 + 0.006, s * (w / 2 - 0.004), l / 2 - 0.006, s * (w / 2 - 0.004), 0.006, wallH, base)
    for (const s of [-1, 1]) posts(p, o.col, 2, s * (l / 2 - 0.006), -w * 0.18, s * (l / 2 - 0.006), w * 0.18, 0.006, wallH, base)
  }
  const nd = o.doors ?? 2
  for (const s of [-1, 1]) for (let i = 0; i < nd; i++) {
    const zz = nd === 1 ? 0 : (i - (nd - 1) / 2) * w * 0.22
    p.dark.push(pane(w * 0.09, wallH * 0.6, s * (l * 0.43 + 0.001), base, zz, s > 0 ? 'e' : 'w'))
  }
  const nw = Math.max(2, Math.round(l / 0.04))
  for (const s of [-1, 1]) for (let i = 0; i < nw; i++)
    p.dark.push(pane(0.008, wallH * 0.4, -l * 0.36 + (i * l * 0.72) / (nw - 1), base + wallH * 0.3, s * (w * 0.33 + 0.001), s > 0 ? 's' : 'n'))
  const ry = base + wallH
  thaiRoof(p, l + 0.02, w * 0.92, o.roofH ?? w * 0.7, ry, { tiers: o.tiers ?? 3, skirt: 0.32, tile: o.tile, edge: o.edge })
  return ry
}

// Wat Phra Kaew, about 200 m to a unit. The ubosot of the Emerald Buddha in the south part facing east; north of it
// the upper terrace: Phra Si Rattana Chedi (1855, ~40 m) west, Phra Mondop, Prasat Phra Thep Bidon east, the Angkor
// model behind; the eight colour-tiled prangs along the east side; Ramakien galleries round it all.
const watPhraKaew = staged([1855], (k, year) => {
  const R = parts(), p = R as P
  p.pave.push(bx(0.96, 0.004, 0.72, 0, 0, 0))
  cloister(p, 0.46, 0.34, 0.04, 0.026)
  // gates with crown tops and their yaksha guardians
  const gates: [number, number, number][] = [[0.46, 0.17, Math.PI / 2], [0.46, -0.13, Math.PI / 2], [-0.46, 0, Math.PI / 2], [0.08, 0.34, 0], [-0.1, -0.34, 0]]
  const yk: K[] = ['green', 'red', 'white', 'blue', 'pink', 'yellow']
  gates.forEach(([x, z, r], i) => {
    const q = sub(p, x, z, r)
    q.white.push(bx(0.045, 0.045, 0.05, 0, 0, 0))
    q.dark.push(bx(0.02, 0.03, 0.052, 0, 0, 0))
    const top = tierRoof(q, 0, 0.045, 0, 0.022, 2, 0.012)
    q.gold.push(sq(0.007, 0.0005, 0.035, 0, top, 0))
    for (const s of [-1, 1]) {
      const c = yk[(i * 2 + (s > 0 ? 1 : 0)) % yk.length], dz = r ? -Math.sign(x) * 0.04 : -Math.sign(z) * 0.04
      q[c].push(bx(0.012, 0.03, 0.009, s * 0.018, 0.004, dz))
      q.gold.push(cyl(0.006, 0.0005, 0.016, s * 0.018, 0.034, dz, 5))
    }
  })
  // the eight prangs (Phra Atsada Maha Chedi), each in its own colour
  const pc: K[] = ['white', 'blue', 'pink', 'green', 'red', 'yellow', 'blue', 'pink']
  const pp = [[1, 0], [1, 0.25], [0.88, 0.27], [0.95, 0.4], [0.78, 0.42], [0.74, 0.55], [0.55, 0.58], [0.45, 0.7], [0.25, 0.78], [0.08, 0.9], [0, 1]]
  for (let i = 0; i < 8; i++) {
    const z = -0.29 + i * 0.083, x = 0.405
    p.white.push(bx(0.034, 0.012, 0.034, x, 0, z))
    p[pc[i]].push(lathe(pp, 6, 0.013, 0.07, x, 0.012, z, Math.PI / 6))
  }

  // ubosot of the Emerald Buddha: gilded walls and pillars inside a colonnade, three-tier roof
  {
    const q = sub(p, 0.09, 0.16)
    hall(q, { l: 0.26, w: 0.12, base: 0.02, wallH: 0.05, wall: 'gold', col: 'gold', ncol: 11, roofH: 0.075, doors: 3 })
    // sema stones round it
    for (const [x, z] of [[-0.16, -0.08], [0, -0.09], [0.16, -0.08], [-0.16, 0.08], [0, 0.09], [0.16, 0.08], [-0.17, 0], [0.17, 0]])
      q.gold.push(bx(0.008, 0.012, 0.008, x, 0, z))
  }

  // upper terrace
  const tz = -0.13, ty = 0.022
  p.white.push(bx(0.72, ty, 0.12, -0.04, 0, tz), bx(0.74, 0.006, 0.124, -0.04, ty, tz))
  // Phra Mondop (1789): green-glass body, gold corner posts, gold and green stepped roof under a spire
  {
    const x = -0.12, y = ty + 0.006
    p.gold.push(bx(0.075, 0.012, 0.075, x, y, tz), bx(0.06, 0.012, 0.075, x, y, tz), bx(0.075, 0.012, 0.06, x, y, tz))
    p.green.push(bx(0.052, 0.045, 0.052, x, y + 0.012, tz))
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.gold.push(bx(0.008, 0.045, 0.008, x + dx * 0.026, y + 0.012, tz + dz * 0.026))
    for (const f of ['n', 's', 'e', 'w'] as const) {
      const [dx, dz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[f]
      p.gold.push(pane(0.014, 0.03, x + dx * 0.0265, y + 0.012, tz + dz * 0.0265, f))
    }
    const top = tierRoof(p, x, y + 0.057, tz, 0.036, 4, 0.016, 'gold', 'green')
    prasatSpire(p, 'gold', x, top, tz, 0.012, 0.09)
  }
  if (year >= 1855) {
    // Phra Si Rattana Chedi, gold-tiled
    bellChedi(p, 'gold', -0.31, ty + 0.006, tz, 0.052, 0.22)
    // Prasat Phra Thep Bidon: cruciform, two-tier roofs both ways, a prang over the crossing
    const x = 0.12, y = ty + 0.006, q = sub(p, x, tz)
    q.white.push(bx(0.13, 0.008, 0.06, 0, y, 0), bx(0.06, 0.008, 0.11, 0, y, 0))
    q.cream.push(bx(0.11, 0.038, 0.044, 0, y + 0.008, 0), bx(0.044, 0.038, 0.095, 0, y + 0.008, 0))
    posts(q, 'gold', 4, -0.052, -0.024, -0.052, 0.024, 0.005, 0.038, y + 0.008)
    posts(q, 'gold', 4, 0.052, -0.024, 0.052, 0.024, 0.005, 0.038, y + 0.008)
    q.dark.push(pane(0.012, 0.024, 0.0555, y + 0.008, 0, 'e'), pane(0.012, 0.024, -0.0555, y + 0.008, 0, 'w'))
    thaiRoof(q, 0.12, 0.05, 0.034, y + 0.046, { tiers: 2 })
    thaiRoof(sub(q, 0, 0, Math.PI / 2), 0.1, 0.05, 0.034, y + 0.046, { tiers: 2 })
    q.cream.push(lathe(prangPts(5), 8, 0.017, 0.12, 0, y + 0.075, 0, Math.PI / 8))
    q.gold.push(cyl(0.002, 0.0003, 0.02, 0, y + 0.19, 0, 4))
    // the two golden chedis in front of it
    for (const s of [-1, 1]) smallChedi(p, 'gold', 0.205, tz + s * 0.03, 0.012, 0.075, ty + 0.006)
    // the Angkor Wat model north of the Mondop
    p.grey.push(bx(0.07, 0.008, 0.055, -0.12, 0, -0.245))
    for (const [dx, dz, h] of [[0, 0, 0.03], [-0.022, -0.017, 0.018], [0.022, -0.017, 0.018], [-0.022, 0.017, 0.018], [0.022, 0.017, 0.018]])
      p.grey.push(flat(new THREE.ConeGeometry(0.006, h, 5, 1, true).translate(-0.12 + dx, 0.008 + h / 2, -0.245 + dz)))
  }
  finish(k, R)
})

// Grand Palace, 200 m to a unit around the Middle Court. Chakri Maha Prasat (1882) faces north over the lawn:
// a three-storey European body with three Thai roofs and prasat spires; Dusit Maha Prasat to the west,
// Amarin Winitchai to the east; white crenellated walls with gates and corner forts. Wat Phra Kaew is next door.
const grandPalace = staged([1882], (k, year) => {
  const R = parts(), p = R as P
  const A = 0.49, B = 0.35
  p.pave.push(bx(2 * A, 0.004, 2 * B, 0, 0, 0))
  p.lawn.push(bx(0.46, 0.008, 0.2, 0.03, 0, -0.2))
  // clipped trees on the lawn
  for (const x of [-0.17, -0.07, 0.07, 0.17]) for (const z of [-0.26, -0.14]) {
    p.tree.push(flat(new THREE.SphereGeometry(0.011, 6, 4).scale(1, 1.4, 1).translate(x + 0.03, 0.022, z)))
    p.tree.push(cyl(0.002, 0.002, 0.012, x + 0.03, 0.006, z, 4))
  }

  // walls: bai sema crenels along the top, gates in the north wall, forts at the corners
  const wh = 0.035, wt = 0.014
  p.white.push(bx(2 * A, wh, wt, 0, 0, -B), bx(2 * A, wh, wt, 0, 0, B), bx(wt, wh, 2 * B, -A, 0, 0), bx(wt, wh, 2 * B, A, 0, 0))
  const cren = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.036)
    for (let i = 0; i <= n; i++) p.white.push(flat(new THREE.ConeGeometry(0.006, 0.013, 4, 1, true).rotateY(Math.PI / 4).translate(x0 + ((x1 - x0) * i) / n, wh + 0.0065, z0 + ((z1 - z0) * i) / n)))
  }
  cren(-A + 0.03, -B, A - 0.03, -B); cren(-A + 0.03, B, A - 0.03, B); cren(-A, -B + 0.03, -A, B - 0.03); cren(A, -B + 0.03, A, B - 0.03)
  for (const gx of [-0.12, 0.24]) {
    p.white.push(bx(0.055, 0.06, 0.03, gx, 0, -B))
    p.dark.push(pane(0.022, 0.035, gx, 0, -B - 0.0155, 'n'))
    p.red.push(bx(0.06, 0.004, 0.034, gx, 0.06, -B))
    const top = tierRoof(p, gx, 0.064, -B, 0.024, 2, 0.014)
    prasatSpire(p, 'gold', gx, top, -B, 0.009, 0.045)
  }
  for (const [x, z] of [[-A, -B], [A, -B], [-A, B], [A, B]]) {
    p.white.push(cyl(0.03, 0.028, 0.05, x, 0, z, 8))
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      p.white.push(flat(new THREE.ConeGeometry(0.005, 0.012, 4, 1, true).translate(x + Math.cos(a) * 0.024, 0.056, z + Math.sin(a) * 0.024)))
    }
    p.white.push(bx(0.016, 0.018, 0.016, x, 0.05, z))
    p.orange.push(sq(0.016, 0.002, 0.022, x, 0.068, z))
    p.gold.push(cyl(0.002, 0.0003, 0.012, x, 0.088, z, 4))
  }

  if (year >= 1882) {
    // Chakri Maha Prasat: front to the north (−z)
    const z0 = 0.05
    const body = (x: number, w: number, d: number, h: number, floors: number) => {
      p.white.push(bx(w, h, d, x, 0.004, z0))
      p.cream.push(bx(w + 0.004, 0.004, d + 0.004, x, 0.004 + h, z0))
      for (let f = 0; f < floors; f++) {
        const fy = 0.012 + f * (h / floors), n = Math.max(2, Math.round(w / 0.017))
        if (f) p.cream.push(bx(w + 0.002, 0.002, d + 0.002, x, fy - 0.006, z0))
        for (let i = 0; i < n; i++) for (const s of [-1, 1])
          p.dark.push(pane(0.0065, h / floors * 0.5, x - w / 2 + (i + 0.5) * (w / n), fy, z0 + s * (d / 2 + 0.001), s > 0 ? 's' : 'n'))
      }
    }
    const pav = (x: number, w: number, d: number, h: number, sh: number) => {
      body(x, w, d, h, 3)
      thaiRoof(sub(p, x, z0), w + 0.024, d * 0.62, 0.034, 0.004 + h, { tiers: 3, step: 0.008 })
      thaiRoof(sub(p, x, z0, Math.PI / 2), d + 0.012, w * 0.78, 0.034, 0.004 + h, { tiers: 3, step: 0.008 })
      prasatSpire(p, 'gold', x, 0.004 + h + 0.03, z0, w * 0.2, sh)
    }
    pav(0, 0.1, 0.15, 0.1, 0.135)
    for (const s of [-1, 1]) {
      pav(s * 0.18, 0.07, 0.12, 0.09, 0.1)
      for (const [x0, x1] of [[0.05, 0.145], [0.215, 0.27]]) {
        const cx = s * (x0 + x1) / 2
        body(cx, x1 - x0, 0.075, 0.075, 2)
        thaiRoof(sub(p, cx, z0), x1 - x0 + 0.01, 0.07, 0.03, 0.079, { tiers: 2, step: 0.006, chofa: false })
      }
    }
    // portico with pediment and steps on the north front
    const zf = z0 - 0.075
    p.white.push(bx(0.06, 0.05, 0.03, 0, 0.004, zf - 0.012))
    posts(p, 'white', 4, -0.024, zf - 0.028, 0.024, zf - 0.028, 0.005, 0.05, 0.004)
    p.white.push(gable(0.006, 0.064, 0.02).rotateY(Math.PI / 2).translate(0, 0.054, zf - 0.026))
    for (let i = 0; i < 4; i++) p.white.push(bx(0.07, 0.003, 0.012 * (4 - i), 0, i * 0.003, zf - 0.035 - 0.006 * (4 - i)))
    p.dark.push(pane(0.016, 0.03, 0, 0.004, zf - 0.0275, 'n'))
  } else {
    // older timber halls of the Middle Court
    const q = sub(p, 0, 0.12)
    hall(q, { l: 0.24, w: 0.1, base: 0.01, wallH: 0.04, wall: 'white', col: 'white', roofH: 0.06 })
  }

  // Dusit Maha Prasat: cruciform on a white base, four-tier roofs, tall gold spire over the crossing
  {
    const q = sub(p, -0.34, 0.06)
    q.white.push(bx(0.2, 0.008, 0.08, 0, 0.004, 0), bx(0.08, 0.008, 0.2, 0, 0.004, 0), bx(0.17, 0.008, 0.07, 0, 0.012, 0), bx(0.07, 0.008, 0.17, 0, 0.012, 0))
    q.white.push(bx(0.15, 0.045, 0.055, 0, 0.02, 0), bx(0.055, 0.045, 0.15, 0, 0.02, 0))
    for (const f of ['n', 's', 'e', 'w'] as const) {
      const [dx, dz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[f]
      q.dark.push(pane(0.014, 0.028, dx * 0.0755, 0.02, dz * 0.0755, f))
    }
    for (const s of [-1, 1]) {
      posts(q, 'gold', 4, -0.07, s * 0.03, -0.035, s * 0.03, 0.004, 0.045, 0.02)
      posts(q, 'gold', 4, 0.035, s * 0.03, 0.07, s * 0.03, 0.004, 0.045, 0.02)
    }
    thaiRoof(q, 0.16, 0.06, 0.04, 0.065, { tiers: 4, step: 0.01 })
    thaiRoof(sub(q, 0, 0, Math.PI / 2), 0.16, 0.06, 0.04, 0.065, { tiers: 4, step: 0.01 })
    const top = tierRoof(q, 0, 0.1, 0, 0.026, 3, 0.014)
    prasatSpire(q, 'gold', 0, top - 0.004, 0, 0.012, 0.13)
  }
  // Amarin Winitchai hall, east
  hall(sub(p, 0.36, 0.0, Math.PI / 2), { l: 0.22, w: 0.1, base: 0.012, wallH: 0.045, wall: 'white', col: 'white', roofH: 0.065 })
  finish(k, R)
})

// Wat Pho, 200 m to a unit. Wihan Phra Non (1832, the 46 m reclining Buddha) in the north-west, the four great
// chedis of the first reigns south of it (green Rama I, white Rama II, yellow Rama III, blue Rama IV), the ubosot
// inside its double cloister to the east, small chedis all round.
const watPho = staged([1832, 1855], (k, year) => {
  const R = parts(), p = R as P
  p.pave.push(bx(1, 0.004, 0.86, 0, 0, 0))
  p.white.push(bx(1, 0.025, 0.008, 0, 0, -0.43), bx(1, 0.025, 0.008, 0, 0, 0.43), bx(0.008, 0.025, 0.86, -0.5, 0, 0), bx(0.008, 0.025, 0.86, 0.5, 0, 0))

  // ubosot in the double cloister, four viharas at the cardinal points
  const cx = 0.2, cz = 0.06, q = sub(p, cx, cz)
  cloister(q, 0.2, 0.2, 0.035, 0.022)
  cloister(q, 0.14, 0.14, 0.03, 0.02)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = sub(q, dx * 0.2, dz * 0.2, dx ? 0 : Math.PI / 2)
    hall(v, { l: 0.1, w: 0.06, base: 0.008, wallH: 0.03, wall: 'white', roofH: 0.04, tiers: 2, doors: 1 })
  }
  hall(q, { l: 0.18, w: 0.09, base: 0.018, wallH: 0.045, wall: 'white', col: 'white', ncol: 9, roofH: 0.065, doors: 3 })
  // small chedis between the two galleries
  const sc: K[] = ['white', 'green', 'blue', 'yellow']
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) smallChedi(q, sc[(dx + 1 + (dz + 1) / 2) % 4], dx * 0.17, dz * 0.17, 0.014, 0.065)
  for (const s of [-1, 1]) for (const t of [-0.08, 0.08]) {
    smallChedi(q, sc[(t > 0 ? 1 : 0) + (s > 0 ? 2 : 0)], s * 0.17, t, 0.01, 0.05)
    smallChedi(q, sc[(t > 0 ? 2 : 3) + (s > 0 ? 0 : 0)], t, s * 0.17, 0.01, 0.05)
  }

  // the four great chedis in their walled court
  const gx = -0.27
  p.grey.push(bx(0.27, 0.012, 0.36, gx - 0.03, 0, 0.13))
  p.white.push(bx(0.27, 0.02, 0.006, gx - 0.03, 0, -0.05), bx(0.27, 0.02, 0.006, gx - 0.03, 0, 0.31), bx(0.006, 0.02, 0.36, gx + 0.105, 0, 0.13))
  redentChedi(p, 'green', gx, 0.012, 0.13, 0.044, 0.23)
  if (year >= 1832) {
    redentChedi(p, 'white', gx, 0.012, 0.01, 0.042, 0.22)
    redentChedi(p, 'yellow', gx, 0.012, 0.25, 0.042, 0.22)
  }
  if (year >= 1855) {
    redentChedi(p, 'blue', gx - 0.11, 0.012, 0.13, 0.04, 0.21)
  }

  // Wihan Phra Non, running north-south
  if (year >= 1832) {
    const v = sub(p, -0.29, -0.27, Math.PI / 2)
    hall(v, { l: 0.3, w: 0.11, base: 0.014, wallH: 0.06, wall: 'white', col: 'white', ncol: 12, roofH: 0.08, doors: 1 })
  }
  // more small chedis along the outer court
  for (let i = 0; i < 4; i++) smallChedi(p, sc[i], 0.5 - 0.06 - i * 0.12, -0.36, 0.012, 0.055)
  for (let i = 0; i < 3; i++) smallChedi(p, sc[(i + 1) % 4], -0.08, -0.32 + i * 0.1, 0.012, 0.055)
  finish(k, R)
})

// Wat Suthat, 150 m to a unit. The great vihara (Wihan Luang) on its high base, gable front to the north, inside a
// square gallery; the red Giant Swing (21 m) in the square in front.
function watSuthat(k: Kit) {
  const R = parts(), p = R as P
  p.pave.push(bx(0.66, 0.004, 0.8, 0, 0, 0.04))
  const vz = 0.07
  {
    const q = sub(p, 0, vz)
    cloister(q, 0.27, 0.3, 0.04, 0.03)
    for (const [x, z, r] of [[0, -0.3, 0], [0, 0.3, 0], [-0.27, 0, Math.PI / 2], [0.27, 0, Math.PI / 2]] as const) {
      const g = sub(q, x, z, r)
      g.white.push(bx(0.06, 0.045, 0.05, 0, 0, 0))
      g.dark.push(bx(0.022, 0.03, 0.052, 0, 0, 0))
      thaiRoof(g, 0.07, 0.05, 0.03, 0.045, { tiers: 2, step: 0.006 })
    }
    // Chinese stone pagodas in the court
    for (const [x, z] of [[-0.17, -0.2], [0.17, -0.2], [-0.17, 0.2], [0.17, 0.2]])
      for (let i = 0; i < 4; i++) q.grey.push(bx(0.022 - i * 0.004, 0.009, 0.022 - i * 0.004, x, i * 0.01, z))
  }
  // the vihara along z, front stairs to the north
  {
    const q = sub(p, 0, vz, Math.PI / 2)
    hall(q, { l: 0.36, w: 0.17, base: 0.032, wallH: 0.068, wall: 'white', col: 'white', ncol: 11, roofH: 0.1, tiers: 2, doors: 3 })
    for (let i = 0; i < 5; i++) q.white.push(bx(0.008 * (5 - i), 0.0064, 0.06, 0.195 + 0.004 * (5 - i) - 0.004, i * 0.0064, 0))
  }
  // temple wall and gate facing the square
  p.white.push(bx(0.66, 0.026, 0.008, 0, 0, -0.32))
  p.white.push(bx(0.06, 0.04, 0.02, 0, 0, -0.32))
  thaiRoof(p as P, 0.07, 0.03, 0.022, 0.04, { tiers: 1, step: 0 })

  // Giant Swing: two teak posts on a stepped white base, carved crossbar on top, braces at the foot
  const sz = -0.42
  p.white.push(bx(0.1, 0.008, 0.045, 0, 0, sz), bx(0.08, 0.008, 0.035, 0, 0.008, sz))
  for (const s of [-1, 1]) {
    p.red.push(cyl(0.0055, 0.0042, 0.16, s * 0.024, 0.016, sz, 6))
    for (const t of [-1, 1]) p.red.push(new THREE.CylinderGeometry(0.0025, 0.0028, 0.04, 4).rotateX(t * 0.5).translate(s * 0.024, 0.032, sz + t * 0.009))
  }
  p.red.push(bx(0.075, 0.008, 0.009, 0, 0.17, sz), bx(0.058, 0.004, 0.007, 0, 0.162, sz))
  p.gold.push(bx(0.006, 0.012, 0.011, -0.04, 0.166, sz), bx(0.006, 0.012, 0.011, 0.04, 0.166, sz))
  finish(k, R)
}

// Wat Benchamabophit, 80 m to a unit. The cruciform Carrara marble ubosot (1899) faces east across the canal,
// under tiered roofs of golden Chinese tiles; the cloister of Buddha images wraps round the back.
function watBenchamabophit(k: Kit) {
  const R = parts(), p = R as P
  p.pave.push(bx(0.84, 0.004, 0.96, -0.08, 0, 0))
  p.lawn.push(bx(0.2, 0.008, 0.56, -0.3, 0, 0))
  const opt = { tile: 'amber' as K, edge: 'ochre' as K }
  // terrace and cruciform body
  p.marble.push(bx(0.52, 0.012, 0.2, 0.02, 0.004, 0), bx(0.2, 0.012, 0.42, -0.01, 0.004, 0), bx(0.5, 0.008, 0.18, 0.02, 0.016, 0), bx(0.18, 0.008, 0.4, -0.01, 0.016, 0))
  const y0 = 0.024, wh = 0.085
  p.marble.push(bx(0.42, wh, 0.13, 0.02, y0, 0), bx(0.13, wh, 0.34, -0.01, y0, 0))
  // gold-framed windows
  for (const s of [-1, 1]) {
    for (const x of [-0.15, -0.12, 0.1, 0.14, 0.18]) {
      p.gold.push(pane(0.016, 0.04, x, y0 + 0.02, s * 0.0652, s > 0 ? 's' : 'n'))
      p.dark.push(pane(0.009, 0.03, x, y0 + 0.024, s * 0.0656, s > 0 ? 's' : 'n'))
    }
    for (const z of [-0.12, 0.12]) {
      p.gold.push(pane(0.016, 0.04, s * 0.0652 - 0.01, y0 + 0.02, z, s > 0 ? 'e' : 'w'))
      p.dark.push(pane(0.009, 0.03, s * 0.0656 - 0.01, y0 + 0.024, z, s > 0 ? 'e' : 'w'))
    }
    p.gold.push(pane(0.03, 0.06, -0.01, y0, s * 0.1702, s > 0 ? 's' : 'n'))
  }
  // east porch: marble columns, door, steps down to the forecourt
  p.marble.push(bx(0.06, 0.006, 0.12, 0.26, y0, 0))
  posts(p, 'marble', 4, 0.285, -0.045, 0.285, 0.045, 0.01, 0.07, y0)
  p.gold.push(pane(0.034, 0.06, 0.2302, y0, 0, 'e'))
  p.dark.push(pane(0.022, 0.05, 0.2306, y0, 0, 'e'))
  for (let i = 0; i < 4; i++) p.marble.push(bx(0.012 * (4 - i), 0.006, 0.09, 0.29 + 0.006 * (4 - i), i * 0.006, 0))
  // roofs: three tiers each way, with the porch roofs stepping lower
  thaiRoof(sub(p, 0.02, 0), 0.44, 0.15, 0.1, y0 + wh, { ...opt, tiers: 3, skirt: 0.3 })
  thaiRoof(sub(p, -0.01, 0, Math.PI / 2), 0.36, 0.14, 0.095, y0 + wh, { ...opt, tiers: 3, skirt: 0.3 })
  thaiRoof(sub(p, 0.265, 0), 0.07, 0.13, 0.07, y0 + 0.07, { ...opt, tiers: 2, step: 0.008 })
  for (const s of [-1, 1]) {
    thaiRoof(sub(p, -0.01, s * 0.2, Math.PI / 2), 0.05, 0.12, 0.06, y0 + 0.065, { ...opt, tiers: 1, step: 0 })
    // the singha guarding the door
    p.marble.push(bx(0.018, 0.024, 0.012, 0.34, 0.004, s * 0.06))
    p.marble.push(flat(new THREE.SphereGeometry(0.009, 6, 4).translate(0.343, 0.035, s * 0.06)))
  }

  // cloister wrapping the back
  const cx0 = -0.44, cz = 0.4, w = 0.05
  gallery(sub(p, cx0, 0, Math.PI / 2), 2 * cz + w, w, 0.045, -1, 'amber', 'ochre', 'marble')
  for (const s of [-1, 1]) gallery(sub(p, (cx0 - 0.1) / 2 + 0.01, s * cz), -0.1 - cx0, w, 0.045, s as 1 | -1, 'amber', 'ochre', 'marble')
  for (let i = 0; i < 9; i++) p.gold.push(bx(0.01, 0.016, 0.01, cx0 + 0.006, 0.004, -0.32 + i * 0.08))
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) p.gold.push(bx(0.01, 0.016, 0.01, -0.37 + i * 0.07, 0.004, s * (cz - 0.006)))

  // the canal in front with a marble bridge
  p.water.push(bx(0.08, 0.004, 1, 0.42, 0, 0))
  for (const s of [-1, 1]) p.marble.push(bx(0.006, 0.012, 1, 0.42 + s * 0.043, 0, 0))
  p.marble.push(bx(0.11, 0.01, 0.06, 0.42, 0.004, 0))
  for (const s of [-1, 1]) p.marble.push(bx(0.11, 0.01, 0.004, 0.42, 0.014, s * 0.028))
  finish(k, R)
}

// Ananta Samakhom Throne Hall (1908–1915), 110 m to a unit. Carrara marble in Italian Renaissance style: a 49 m
// central dome over the crossing, six smaller domes, front portico to the south over the Royal Plaza with the
// equestrian statue of Rama V.
function anantaSamakhom(k: Kit) {
  const R = parts(), p = R as P
  p.pave.push(bx(1, 0.004, 1, 0, 0, 0))
  for (const s of [-1, 1]) p.lawn.push(bx(0.3, 0.008, 0.24, s * 0.3, 0, 0.33))
  const z0 = -0.14, wh = 0.13
  const block = (x: number, z: number, w: number, d: number, h: number) => {
    p.marble.push(bx(w, h, d, x, 0.004, z))
    p.marble.push(bx(w + 0.008, 0.006, d + 0.008, x, 0.004 + h, z), bx(w + 0.006, 0.004, d + 0.006, x, 0.004 + h * 0.48, z))
    p.grey.push(bx(w + 0.002, 0.012, d + 0.002, x, 0.004, z))
    for (const [nx, nz, len, f] of [[0, 1, w, 's'], [0, -1, w, 'n'], [1, 0, d, 'e'], [-1, 0, d, 'w']] as const) {
      const n = Math.max(1, Math.round(len / 0.03))
      for (let i = 0; i < n; i++) for (const fy of [0.03, 0.03 + h * 0.48]) {
        const t = -len / 2 + (i + 0.5) * (len / n)
        p.dark.push(pane(0.011, h * 0.3, x + (nx ? nx * (w / 2 + 0.001) : t), fy, z + (nz ? nz * (d / 2 + 0.001) : t), f))
      }
    }
  }
  const dome = (x: number, z: number, y: number, r: number, drum: number) => {
    p.marble.push(cyl(r * 1.05, r * 1.05, drum, x, y, z, 16))
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      p.dark.push(new THREE.PlaneGeometry(r * 0.22, drum * 0.5).rotateY(Math.PI / 2 - a).translate(x + Math.cos(a) * r * 1.06, y + drum * 0.5, z + Math.sin(a) * r * 1.06))
    }
    p.marble.push(cyl(r * 1.12, r * 1.12, 0.006, x, y + drum, z, 16))
    p.dome.push(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1).translate(x, y + drum + 0.006, z))
    const ly = y + drum + 0.006 + r * 1.15
    p.marble.push(cyl(r * 0.18, r * 0.18, r * 0.25, x, ly - 0.004, z, 8))
    p.dome.push(cyl(r * 0.2, 0.001, r * 0.3, x, ly + r * 0.25 - 0.004, z, 8))
  }
  // main block east-west, rear arm to the north, centre square raised under the dome
  block(0, z0, 0.84, 0.2, wh)
  block(0, z0 - 0.18, 0.24, 0.2, wh)
  block(0, z0, 0.26, 0.26, wh + 0.04)
  for (const s of [-1, 1]) block(s * 0.36, z0, 0.12, 0.26, wh + 0.01)
  dome(0, z0, wh + 0.044, 0.1, 0.07)
  for (const s of [-1, 1]) {
    dome(s * 0.36, z0, wh + 0.014, 0.042, 0.03)
    dome(s * 0.17, z0 + 0.08, wh + 0.004, 0.036, 0.025)
    dome(s * 0.1, z0 - 0.26, wh + 0.004, 0.036, 0.025)
  }
  // south portico: columns, pediment, steps
  const zf = z0 + 0.13
  p.marble.push(bx(0.16, 0.02, 0.07, 0, 0.004, zf + 0.005))
  posts(p, 'marble', 6, -0.065, zf + 0.03, 0.065, zf + 0.03, 0.01, 0.09, 0.024)
  p.marble.push(bx(0.16, 0.014, 0.06, 0, 0.114, zf + 0.008))
  p.marble.push(gable(0.06, 0.17, 0.03).rotateY(Math.PI / 2).translate(0, 0.128, zf + 0.008))
  p.dark.push(pane(0.03, 0.06, 0, 0.024, zf - 0.019, 's'))
  for (let i = 0; i < 5; i++) p.marble.push(bx(0.2, 0.004, 0.014 * (5 - i), 0, i * 0.004, zf + 0.04 + 0.007 * (5 - i)))

  // Royal Plaza and the equestrian statue of Rama V
  const sz = 0.4
  p.marble.push(bx(0.05, 0.014, 0.06, 0, 0.004, sz), bx(0.034, 0.034, 0.044, 0, 0.018, sz))
  for (const [dx, dz] of [[-0.004, -0.012], [0.004, -0.012], [-0.004, 0.012], [0.004, 0.012]]) p.bronze.push(bx(0.003, 0.012, 0.003, dx, 0.052, sz + dz))
  p.bronze.push(bx(0.012, 0.012, 0.034, 0, 0.064, sz), bx(0.007, 0.016, 0.009, 0, 0.07, sz - 0.02))
  p.bronze.push(bx(0.008, 0.016, 0.008, 0, 0.076, sz + 0.002), bx(0.005, 0.006, 0.005, 0, 0.092, sz + 0.002))
  finish(k, R)
}

export const thai_1: Record<string, Builder> = {
  'wat-phra-kaew': watPhraKaew,
  'grand-palace': grandPalace,
  'wat-pho': watPho,
  'wat-suthat': watSuthat,
  'wat-benchamabophit': watBenchamabophit,
  'ananta-samakhom': anantaSamakhom,
}
