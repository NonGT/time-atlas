import * as THREE from 'three'
import { gable, merge, staged, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
type Mat = THREE.Material
type Paint = Map<Mat, G[]>
const SQ2 = Math.SQRT2
const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const at = <T extends G>(g: T, x: number, y: number, z: number) => { g.translate(x, y, z); return g }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z)
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 16) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n), x, y + h / 2, z)
const lathe = (pts: number[][], seg: number, sr: number, sh: number, rot = 0) => {
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)), seg)
  if (rot) g.rotateY(rot)
  return g
}
const blob = (r: number, x: number, y: number, z: number, sy = 0.8) => at(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1), x, y, z)
const rnd = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }

const L = (c: string, e = '#000000') => new THREE.MeshLambertMaterial({ color: c, emissive: e })
const put = (p: Paint, m: Mat, ...gs: G[]) => { let a = p.get(m); if (!a) p.set(m, a = []); a.push(...gs) }
const flush = (k: Kit, p: Paint) => {
  for (const [m, gs] of p) if (gs.length) merge(k, gs.map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n }), m)
}

/** Thin box from one point to another. */
function beam(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, t: number) {
  const d = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1), len = d.length()
  const g = new THREE.BoxGeometry(len, t, t)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()))
  return at(g, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)
}

/** Hipped roof along x: l by d at the eaves, ridge of the given length. */
function hip(l: number, d: number, h: number, ridge = l - d) {
  const a = l / 2, b = d / 2, r = Math.max(0, ridge / 2)
  const P = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [-r, h, 0], [r, h, 0]]
  const pos: number[] = []
  for (const f of [[0, 4, 5], [0, 5, 1], [1, 5, 2], [2, 5, 4], [2, 4, 3], [3, 4, 0]]) for (const i of f) pos.push(...P[i])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** Vertex-coloured height field over the given grid lines. */
function field(xs: number[], zs: number[], h: (x: number, z: number) => number, col: (x: number, z: number, y: number) => string, skip = -1) {
  const pos: number[] = [], cols: number[] = [], idx: number[] = [], c = new THREE.Color()
  for (const z of zs) for (const x of xs) {
    const y = h(x, z)
    pos.push(x, y, z)
    c.set(col(x, z, y))
    cols.push(c.r, c.g, c.b)
  }
  const n = xs.length
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, low = (q: number) => pos[q * 3 + 1] <= skip
    // leave out flat ground so the hill gets a natural outline instead of a square
    if (!(low(a) && low(a + n) && low(a + 1))) idx.push(a, a + n, a + 1)
    if (!(low(a + 1) && low(a + n) && low(a + n + 1))) idx.push(a + 1, a + n, a + n + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
const vcol = () => new THREE.MeshLambertMaterial({ vertexColors: true })
const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)

interface HallMats { base: Mat, wall: Mat, roof: Mat, trim: Mat, gold: Mat }

/** Thai hall along x (then turned by rot): raised base, walls, stepped roof tiers with chofa and a gold pediment. */
function thaiHall(p: Paint, M: HallMats, x: number, y: number, z: number, l: number, w: number, wh: number, rot = 0, tiers = 3) {
  const loc: Paint = new Map()
  const bh = w * 0.15
  put(loc, M.base, bx(l + w * 0.3, bh, w * 1.3, 0, 0, 0))
  put(loc, M.wall, bx(l, wh, w, 0, bh, 0))
  const yr = bh + wh, W = w * 1.3, rh = w * 0.9, dy = rh * 0.24
  for (let i = 0; i < tiers; i++) {
    const li = l * (0.6 + 0.48 * (tiers > 1 ? i / (tiers - 1) : 1)), yi = yr - i * dy
    // green border showing below an orange field of the same slope
    put(loc, M.trim, at(gable(li, W, rh), 0, yi, 0))
    put(loc, M.roof, at(gable(li - w * 0.12, W * 0.86, rh * 0.86), 0, yi + rh * 0.14 + w * 0.07, 0))
    for (const s of [-1, 1]) {
      put(loc, M.gold, at(new THREE.BoxGeometry(w * 0.06, w * 0.26, w * 0.06).rotateZ(-s * 0.55), s * (li / 2 + w * 0.03), yi + rh + w * 0.07, 0))
      if (i === 0) put(loc, M.gold, at(gable(w * 0.03, W * 0.9, rh * 0.9), s * (li / 2 + w * 0.012), yi, 0))
    }
  }
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z)
  for (const [mt, gs] of loc) for (const g of gs) put(p, mt, g.applyMatrix4(m))
}

const redent = (o: G[], w: number, h: number, x: number, y: number, z: number, f = 0.8) => {
  o.push(bx(w, h, w * f, x, y, z), bx(w * f, h, w, x, y, z))
}

function prangPts(tiers = 7, top = 0.8) {
  const pts: number[][] = [[1, 0]]
  const r = (t: number) => 1 - 0.84 * Math.pow(t, 2.3)
  for (let i = 0; i < tiers; i++) {
    const y0 = (i / tiers) * top, y1 = ((i + 1) / tiers) * top, r0 = r(i / tiers), r1 = r((i + 1) / tiers)
    pts.push([r0 * 1.1, y0 + 0.004], [r0 * 1.1, y0 + 0.02], [r0 * 0.97, y0 + 0.03], [r1 * 0.98, y1])
  }
  pts.push([0.2, top + 0.03], [0.1, top + 0.08], [0.04, top + 0.1], [0.012, 1], [0, 1])
  return pts
}

function prang(m: G[], d: G[], x: number, z: number, y: number, w: number, h: number, seg = 12, tiers = 7) {
  const bh = h * 0.2
  redent(m, w * 2, bh, x, y, z, 0.75)
  for (const [dx, dz] of dirs) {
    m.push(bx(dx ? w * 0.4 : w * 0.8, bh * 0.85, dx ? w * 0.8 : w * 0.4, x + dx * w * 1.05, y, z + dz * w * 1.05))
    d.push(bx(dx ? 0.002 : w * 0.4, bh * 0.55, dx ? w * 0.4 : 0.002, x + dx * (w * 1.25 + 0.001), y, z + dz * (w * 1.25 + 0.001)))
  }
  m.push(at(lathe(prangPts(tiers), seg, w, h - bh, Math.PI / seg), x, y + bh, z))
}

function spirePts(n = 7) {
  const pts: number[][] = []
  for (let i = 0; i < n; i++) {
    const r0 = 1 - 0.7 * (i / n), y0 = (0.6 * i) / n
    pts.push([r0, y0], [r0 * 0.86, y0 + (0.6 / n) * 0.95])
  }
  pts.push([0.24, 0.62], [0.12, 0.76], [0.07, 0.86], [0.1, 0.89], [0.03, 0.93], [0, 1])
  return pts
}

/** Ayutthaya bell chedi: round rings, bell, harmika, ringed spire; tip (top ~12%) goes to `tip` if given. */
function bellChedi(m: G[], x: number, z: number, y: number, R: number, H: number, seg = 20, tip?: G[]) {
  const pts = [[1, 0], [1, 0.035], [0.92, 0.05], [0.92, 0.075], [0.84, 0.09], [0.84, 0.115], [0.76, 0.13],
    [0.7, 0.14], [0.72, 0.2], [0.7, 0.27], [0.61, 0.34], [0.46, 0.39], [0.28, 0.415], [0, 0.42]]
  m.push(at(lathe(pts, seg, R, H), x, y, z))
  m.push(bx(R * 0.52, H * 0.05, R * 0.52, x, y + H * 0.41, z))
  m.push(bx(R * 0.6, H * 0.012, R * 0.6, x, y + H * 0.46, z))
  m.push(cyl(R * 0.17, R * 0.17, H * 0.04, x, y + H * 0.472, z, 8))
  const sp = spirePts(8)
  if (!tip) { m.push(at(lathe(sp, Math.max(6, seg >> 1), R * 0.2, H * 0.49), x, y + H * 0.51, z)); return }
  m.push(at(lathe(sp.filter(q => q[1] <= 0.76), Math.max(6, seg >> 1), R * 0.2, H * 0.49), x, y + H * 0.51, z))
  tip.push(at(lathe(sp.filter(q => q[1] >= 0.76), Math.max(6, seg >> 1), R * 0.2, H * 0.49), x, y + H * 0.51, z))
}

/** Small bell chedi in one lathe. */
const smallChedi = (m: G[], x: number, z: number, y: number, R: number, H: number, seg = 8) => m.push(at(lathe(
  [[1, 0], [1, 0.05], [0.85, 0.08], [0.74, 0.12], [0.74, 0.2], [0.6, 0.33], [0.35, 0.4], [0.2, 0.42], [0.2, 0.48], [0.15, 0.5], [0.12, 0.6], [0.04, 0.85], [0, 1]], seg, R, H), x, y, z))

/** Thai prasat spire: square receding tiers then a needle. */
function prasatSpire(m: G[], x: number, z: number, y: number, w: number, h: number) {
  const pts: number[][] = [[1, 0]]
  for (let i = 0; i < 6; i++) {
    const r = 1 - i * 0.12, y0 = i * 0.07
    pts.push([r, y0 + 0.05], [r * 0.84, y0 + 0.058], [r * 0.86, y0 + 0.07])
  }
  pts.push([0.38, 0.44], [0.42, 0.48], [0.28, 0.56], [0.16, 0.66], [0.13, 0.7], [0.05, 0.84], [0.015, 1], [0, 1])
  m.push(at(lathe(pts, 4, w * SQ2, h, Math.PI / 4), x, y, z))
}

// Phra Pathom: a Dvaravati stupa (about 39 m) given a Khmer prang top, overgrown when the town was abandoned,
// then encased by King Mongkut's 120 m bell chedi (begun 1853, finished about 1870) in orange glazed tiles
const PATHOM = [[1, 0], [1, 0.018], [0.95, 0.022], [0.95, 0.04], [0.9, 0.044], [0.9, 0.062], [0.85, 0.066], [0.85, 0.08],
  [0.88, 0.095], [0.87, 0.14], [0.82, 0.21], [0.72, 0.29], [0.58, 0.355], [0.4, 0.4], [0.22, 0.425], [0, 0.43]]
const phraPathom = staged([600, 1100, 1400, 1860, 1870], (k, year) => {
  const p: Paint = new Map()
  const stucco = L('#e4dccb', '#1c1a14'), brick = L('#a55a3c', '#1e0c06'), white = L('#efe9dc', '#1c1a16'), dark = L('#3a2a22')
  const tile = L('#d98a30', '#3a1e06'), gold = L('#d9a93a', '#3a2a08'), jungle = L('#4f7a3a', '#121c0c'), jungle2 = L('#3f6a30', '#0e180a')
  if (year < 1860) {
    const ruin = year >= 1400, m = ruin ? brick : stucco
    const s: G[] = [], d: G[] = []
    s.push(bx(0.8, 0.05, 0.8, 0, 0, 0))
    for (const [dx, dz] of dirs) for (let i = 0; i < 4; i++)
      s.push(bx(dx ? 0.03 : 0.1, 0.05 * (1 - i / 4), dx ? 0.1 : 0.03, dx * (0.415 + i * 0.03), 0, dz * (0.415 + i * 0.03)))
    s.push(cyl(0.33, 0.33, 0.06, 0, 0.05, 0, 32), cyl(0.35, 0.35, 0.012, 0, 0.11, 0, 32))
    const dome: number[][] = []
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); dome.push([Math.cos(a), Math.sin(a) * 0.95]) }
    s.push(at(lathe(dome, 32, 0.31, 0.33), 0, 0.122, 0))
    const t = 0.122 + 0.31
    if (year >= 1100) {
      s.push(bx(0.12, 0.03, 0.12, 0, t - 0.02, 0))
      if (ruin) {
        // the prang broken off above its base
        redent(s, 0.09, 0.06, 0, t + 0.01, 0, 0.75)
        s.push(at(lathe([[0.9, 0], [0.85, 0.5], [0.6, 0.8], [0.35, 1], [0, 1]], 8, 0.045, 0.07).rotateZ(0.12), 0.004, t + 0.07, 0))
      } else prang(s, d, 0, 0, t + 0.01, 0.045, 0.3, 12, 7)
    } else {
      s.push(bx(0.09, 0.05, 0.09, 0, t - 0.01, 0), bx(0.11, 0.01, 0.11, 0, t + 0.04, 0), cyl(0.008, 0.008, 0.2, 0, t + 0.05, 0, 6))
      for (let i = 0; i < 4; i++) s.push(cyl(0.07 - i * 0.014, 0.05 - i * 0.012, 0.012, 0, t + 0.08 + i * 0.04, 0, 16))
    }
    put(p, m, ...s)
    put(p, dark, ...d)
    if (ruin) {
      // trees and shrubs on the terrace and up the dome
      for (let i = 0; i < 34; i++) {
        const a = rnd(i) * Math.PI * 2, u = rnd(i + 50)
        let r: number, y: number
        if (i < 18) { const ph = 0.15 + u * 1.1; r = 0.31 * Math.cos(ph) + 0.01; y = 0.122 + 0.31 * 0.95 * Math.sin(ph) }
        else { r = 0.37 + u * 0.03; y = 0.05; if (i % 3 === 0) { r = 0.55; y = 0.05 } }
        const x = Math.cos(a) * r, z = Math.sin(a) * r
        put(p, i % 2 ? jungle : jungle2, blob(0.025 + rnd(i + 9) * 0.03, x, y + 0.015, z))
      }
    }
    flush(k, p)
    return
  }
  const R = 0.34, H = 1.12, y0 = 0.04
  put(p, white, cyl(0.45, 0.45, y0, 0, 0, 0, 48))
  if (year < 1870) {
    // the new bell rising in raw brick inside bamboo scaffolding
    const cut = PATHOM.filter(q => q[1] <= 0.3)
    put(p, brick, at(lathe([...cut, [0, 0.3]], 40, R, H), 0, y0, 0))
    const bamboo: G[] = []
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
      bamboo.push(beam(c * R * 1.04, y0, s * R * 1.04, c * R * 0.7, y0 + H * 0.36, s * R * 0.7, 0.005))
    }
    for (const f of [0.12, 0.24]) {
      const rr = R * (1.04 - 0.34 * (f / 0.36)), n = 18
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2
        bamboo.push(beam(Math.cos(a0) * rr, y0 + H * f, Math.sin(a0) * rr, Math.cos(a1) * rr, y0 + H * f, Math.sin(a1) * rr, 0.004))
      }
    }
    put(p, L('#b49a62', '#1e180c'), ...bamboo)
    flush(k, p)
    return
  }
  put(p, tile, at(lathe(PATHOM, 48, R, H), 0, y0, 0))
  put(p, tile, bx(R * 0.46, H * 0.045, R * 0.46, 0, y0 + H * 0.425, 0), bx(R * 0.58, H * 0.01, R * 0.58, 0, y0 + H * 0.468, 0))
  put(p, white, cyl(R * 0.2, R * 0.18, H * 0.034, 0, y0 + H * 0.478, 0, 16))
  const sp: number[][] = [], n = 12
  for (let i = 0; i < n; i++) {
    const r0 = 0.17 - 0.11 * (i / n), yy = 0.512 + (0.34 * i) / n
    sp.push([r0, yy], [r0 * 0.86, yy + (0.34 / n) * 0.92])
  }
  sp.push([0.06, 0.852], [0, 0.852])
  put(p, tile, at(lathe(sp, 20, R, H), 0, y0, 0))
  put(p, gold, at(lathe([[0.065, 0.85], [0.045, 0.9], [0.025, 0.945], [0.042, 0.952], [0.03, 0.965], [0.008, 0.99], [0, 1]], 16, R, H), 0, y0, 0))
  // round cloister gallery, white walls under an orange roof
  put(p, white, lathe([[0.535, 0], [0.535, 0.032], [0.465, 0.032], [0.465, 0]], 56, 1, 1))
  put(p, L('#c8622e', '#2a1206'), lathe([[0.545, 0.03], [0.5, 0.058], [0.455, 0.03]], 56, 1, 1))
  const M: HallMats = { base: white, wall: white, roof: L('#c8622e', '#2a1206'), trim: L('#2f7a4a', '#0a1c10'), gold }
  for (const [dx, dz] of dirs) thaiHall(p, M, dx * 0.5, 0, dz * 0.5, 0.2, 0.1, 0.042, Math.atan2(-dz, dx), 3)
  flush(k, p)
})

// River Kwai bridge: 11 curved-chord steel spans of about 20 m on concrete piers (1943); the middle three
// were bombed in 1945 and replaced after the war by two square trusses
const riverKwai = staged([1943, 1945, 1946], (k, year) => {
  const p: Paint = new Map()
  const steel = L('#8a8f96', '#16181a'), conc = L('#b8b2a6', '#1c1b18'), wood = L('#5e4630', '#140c06'), rail = L('#2a2a2a')
  const bank = new THREE.Shape(), N = 14
  for (let i = 0; i <= N; i++) { const z = -0.32 + (0.64 * i) / N; bank[i ? 'lineTo' : 'moveTo'](-0.27 + 0.02 * Math.sin(i * 1.7), z) }
  for (let i = N; i >= 0; i--) { const z = -0.32 + (0.64 * i) / N; bank.lineTo(0.29 + 0.02 * Math.sin(i * 2.3 + 1), z) }
  put(p, L('#3f6b70', '#0a1416'), at(new THREE.ShapeGeometry(bank).rotateX(-Math.PI / 2), 0, 0.003, 0))
  const yd = 0.02, sp = 0.07, x0 = -0.385, zw = 0.009, t = 0.0018
  for (const s of [-1, 1]) put(p, L('#8c7d62', '#1a160e'), bx(0.12, yd, 0.03, s * 0.445, 0, 0), bx(0.08, yd * 0.5, 0.05, s * 0.465, 0, 0))
  const S: G[] = []

  function truss(o: G[], xa: number, xb: number, ht: number, n: number, curved: boolean) {
    const y0 = yd + 0.002, X = (i: number) => xa + ((xb - xa) * i) / n
    const top = (i: number) => y0 + (curved ? ht * Math.pow(Math.sin((Math.PI * i) / n), 0.6) : ht)
    for (const z of [-zw, zw]) {
      o.push(beam(xa, y0, z, xb, y0, z, t * 1.4), beam(xa, y0, z, X(1), top(1), z, t), beam(xb, y0, z, X(n - 1), top(n - 1), z, t))
      for (let i = 1; i < n - 1; i++) o.push(beam(X(i), top(i), z, X(i + 1), top(i + 1), z, t))
      for (let i = 1; i < n; i++) o.push(beam(X(i), y0, z, X(i), top(i), z, t * 0.7))
      for (let i = 1; i < n - 1; i++) o.push(i < n / 2 ? beam(X(i), top(i), z, X(i + 1), y0, z, t * 0.7) : beam(X(i + 1), top(i + 1), z, X(i), y0, z, t * 0.7))
    }
    for (let i = 2; i < n - 1; i += curved ? 1 : 2) o.push(beam(X(i), top(i), -zw, X(i), top(i), zw, t))
    o.push(bx(xb - xa, 0.003, zw * 2.4, (xa + xb) / 2, y0 - 0.003, 0))
  }
  const tilt = (gs: G[], px: number, a: number) => {
    const m = new THREE.Matrix4().makeTranslation(px, yd, 0).multiply(new THREE.Matrix4().makeRotationZ(a)).multiply(new THREE.Matrix4().makeTranslation(-px, -yd, 0))
    for (const g of gs) S.push(g.applyMatrix4(m))
  }

  const piers: number[] = []
  for (let i = 0; i <= 11; i++) if (year < 1946 || (i !== 5 && i !== 6)) piers.push(x0 + i * sp)
  if (year >= 1946) piers.push(x0 + 4 * sp + 0.105)
  for (const x of piers) put(p, conc, bx(0.011, yd, 0.03, x, 0, 0), bx(0.016, 0.003, 0.034, x, yd - 0.003, 0))

  for (let i = 0; i < 11; i++) {
    const xa = x0 + i * sp, xb = xa + sp
    if (i < 4 || i > 6 || year === 1943) truss(S, xa, xb, 0.02, 5, true)
    else if (year === 1945) {
      if (i === 5) {
        // wreck of the centre span lying in the river
        const w: G[] = []
        truss(w, xa, xb, 0.02, 5, true)
        const m = new THREE.Matrix4().makeTranslation((xa + xb) / 2, 0.004, 0.03)
          .multiply(new THREE.Matrix4().makeRotationX(1.35)).multiply(new THREE.Matrix4().makeRotationY(0.35)).multiply(new THREE.Matrix4().makeTranslation(-(xa + xb) / 2, -yd, 0))
        for (const g of w) S.push(g.applyMatrix4(m))
        continue
      }
      const w: G[] = []
      truss(w, xa, xb, 0.02, 5, true)
      tilt(w, i === 4 ? xa : xb, (i === 4 ? -1 : 1) * Math.asin(yd / sp) * 0.92)
    }
  }
  if (year >= 1946) { truss(S, x0 + 4 * sp, x0 + 4 * sp + 0.105, 0.022, 6, false); truss(S, x0 + 4 * sp + 0.105, x0 + 7 * sp, 0.022, 6, false) }
  put(p, steel, ...S)

  const runs: [number, number][] = year === 1945 ? [[-0.505, x0 + 4 * sp], [x0 + 7 * sp, 0.505]] : [[-0.505, 0.505]]
  for (const [a, b] of runs) for (const z of [-0.003, 0.003]) put(p, rail, bx(b - a, 0.0012, 0.0012, (a + b) / 2, yd + 0.002, z))

  if (year < 1946) {
    // the timber trestle bridge built alongside, about 100 m downstream
    const zw2 = 0.26, W: G[] = []
    for (const [a, b] of year === 1945 ? [[-0.34, -0.06], [0.06, 0.34]] : [[-0.34, 0.34]]) {
      W.push(bx(b - a, 0.0025, 0.01, (a + b) / 2, 0.012, zw2))
      for (let x = a + 0.01; x < b; x += 0.04) for (const dz of [-0.005, 0.005]) W.push(bx(0.003, 0.012, 0.003, x, 0, zw2 + dz))
    }
    put(p, wood, ...W)
    for (const s of [-1, 1]) put(p, L('#8c7d62', '#1a160e'), bx(0.06, 0.012, 0.014, s * 0.37, 0, zw2))
  }
  flush(k, p)
})

// Hellfire Pass (Konyu cutting): cut by hand through a limestone ridge, up to 25 m deep; drawn longer and a
// little wider than life so it reads. The line was lifted in 1947 and the cutting is now a memorial walk
const hellfire = staged([1943, 1947], (k, year) => {
  const p: Paint = new Map()
  const H = 0.056, wb = 0.011, wt = 0.019, fl = 0.003, E = 0.42
  const ridge = (x: number, z: number) => {
    const s = THREE.MathUtils.smoothstep(E - 0.03 - Math.abs(z) + 0.04 * Math.sin(x * 17), 0, 0.14)
    const w = 0.13 + 0.03 * Math.sin(z * 9)
    return s * (H * Math.exp(-((x / w) ** 2)) * (0.82 + 0.18 * Math.cos(z * 11)) + 0.006 * (Math.sin(x * 23 + z * 7) + 1) * Math.exp(-((x / 0.24) ** 2)))
  }
  const h = (x: number, z: number) => {
    const a = Math.abs(z), r = Math.max(ridge(x, z), fl)
    if (a <= wb) return r > fl + 0.002 ? fl : 0
    if (a < wt) return r > fl + 0.002 ? fl + (r - fl) * ((a - wb) / (wt - wb)) ** 0.7 : 0
    return ridge(x, z)
  }
  const half = [0, wb, wb + 0.0015, (wb + wt) / 2, wt - 0.0012, wt, 0.03, ...range(0.045, E, 11)]
  const zs = [...half.slice(1).reverse().map(v => -v), ...half]
  const floor = year < 1947 ? '#7a7264' : '#9a8a68'
  const geo = field(range(-E, E, 30), zs, h, (x, z, y) => {
    const a = Math.abs(z)
    if (a <= wb + 0.0001) return floor
    if (a < wt - 0.0001) return y - fl > 0.008 ? '#8c8172' : floor
    const n = rnd(Math.round(x * 300) * 7 + Math.round(z * 300))
    return y > 0.012 ? (n > 0.5 ? '#46702f' : '#557f38') : (n > 0.5 ? '#557a3a' : '#5f8240')
  }, 0.003)
  const trees: G[] = [], trees2: G[] = []
  for (let i = 0; i < 90; i++) {
    const x = (rnd(i) - 0.5) * 0.5, z = (rnd(i + 100) - 0.5) * 0.8
    const y = ridge(x, z)
    if (Math.abs(z) < 0.035 || y < 0.006) continue
    const r = 0.01 + rnd(i + 200) * 0.011
    ;(i % 2 ? trees : trees2).push(blob(r, x, y + r * 0.5, z))
  }
  put(p, L('#3d6a2c', '#0e180a'), ...trees)
  put(p, L('#4c7a34', '#10190a'), ...trees2)
  const rail = L('#34302c'), sleeper = L('#5a4632', '#120c06')
  put(p, L(floor, '#141210'), bx(2 * E, fl, wb * 2, 0, 0, 0))
  if (year < 1947) {
    for (const z of [-0.0035, 0.0035]) put(p, rail, bx(2 * E, 0.0012, 0.0012, 0, fl + 0.0007, z))
    const sl: G[] = []
    for (let x = -E + 0.008; x < E; x += 0.024) sl.push(bx(0.004, 0.0008, 0.011, x, fl, 0))
    put(p, sleeper, ...sl)
  } else {
    // a short stretch of relaid track and the memorial plaque on the cutting wall
    for (const z of [-0.0035, 0.0035]) put(p, rail, bx(0.05, 0.0012, 0.0012, -0.07, fl + 0.0007, z))
    const sl: G[] = []
    for (let x = -0.09; x < -0.045; x += 0.012) sl.push(bx(0.004, 0.0008, 0.011, x, fl, 0))
    put(p, sleeper, ...sl)
    put(p, L('#4a4640'), bx(0.012, 0.007, 0.003, 0.03, fl, -wb + 0.002))
    put(p, L('#b8322a', '#2a0806'), bx(0.006, 0.0015, 0.004, 0.03, fl, -wb + 0.0055))
  }
  const rot = new THREE.Matrix4().makeRotationY(-Math.PI / 4)
  for (const gs of p.values()) for (const q of gs) q.applyMatrix4(rot)
  k.add(geo.applyMatrix4(rot), 0, 0, 0, vcol())
  flush(k, p)
})

// Phra Nakhon Khiri (Khao Wang), Phetchaburi: three peaks of a 92 m forested hill. West: King Mongkut's palace
// halls and the Ho Chatchawan Wiang Chai observatory; middle: Phra That Chom Phet; east: Wat Phra Kaeo
function phraNakhonKhiri(k: Kit) {
  const p: Paint = new Map()
  const peaks = [{ x: -0.27, z: 0.03, H: 0.17, s: 0.15 }, { x: 0, z: -0.03, H: 0.2, s: 0.14 }, { x: 0.27, z: 0.04, H: 0.155, s: 0.14 }]
  const h = (x: number, z: number) => {
    let y = 0.08 * Math.exp(-((x / 0.38) ** 2) - (z / 0.16) ** 2) - 0.02
    for (const q of peaks) y = Math.max(y, (q.H + 0.02) * Math.min(1, 1.3 * Math.exp(-((((x - q.x) ** 2 + (z - q.z) ** 2) / q.s ** 2) ** 1.4))) - 0.02)
    return Math.max(0, y) * THREE.MathUtils.smoothstep(0.5 - Math.abs(x), 0, 0.08) * THREE.MathUtils.smoothstep(0.34 - Math.abs(z), 0, 0.08)
  }
  const top = (x: number, z: number) => peaks.some(q => Math.hypot(x - q.x, z - q.z) < q.s * 0.45)
  k.add(field(range(-0.5, 0.5, 32), range(-0.34, 0.34, 22), h, (x, z, y) => {
    if (top(x, z)) return '#cfc6b2'
    const n = rnd(Math.round(x * 200) * 13 + Math.round(z * 200))
    return y < 0.01 ? '#5f8240' : n > 0.55 ? '#3f6a2e' : n > 0.25 ? '#4b7834' : '#58823c'
  }, 0.002), 0, 0, 0, vcol())
  const t1: G[] = [], t2: G[] = []
  for (let i = 0; i < 52; i++) {
    const x = (rnd(i + 7) - 0.5) * 0.9, z = (rnd(i + 77) - 0.5) * 0.56
    if (peaks.some(q => Math.hypot(x - q.x, z - q.z) < q.s * 0.55)) continue
    const y = h(x, z)
    if (y < 0.02) continue
    const r = 0.012 + rnd(i + 3) * 0.012
    ;(i % 2 ? t1 : t2).push(blob(r, x, y + r * 0.3, z))
  }
  put(p, L('#3a6229', '#0c1608'), ...t1)
  put(p, L('#4a7633', '#0e1a0a'), ...t2)

  const white = L('#f2eee4', '#1e1c18'), grey = L('#7d838a', '#121416'), gold = L('#d9a93a', '#3a2a08'), red = L('#9a4a2e', '#2a0e06')
  const glass = L('#a8cadb', '#1e3440')
  // west peak: palace halls
  {
    const [cx, cz, y] = [peaks[0].x, peaks[0].z, peaks[0].H]
    const w: G[] = [], r: G[] = []
    w.push(bx(0.1, 0.006, 0.1, cx, y - 0.002, cz))
    w.push(bx(0.07, 0.024, 0.03, cx + 0.005, y, cz + 0.022))
    r.push(at(hip(0.076, 0.036, 0.014), cx + 0.005, y + 0.024, cz + 0.022))
    for (let i = 0; i < 5; i++) w.push(cyl(0.0022, 0.0022, 0.02, cx - 0.025 + i * 0.015, y, cz + 0.041, 6))
    // Wechayan Wichian Prasat: cross-shaped hall under a Thai prasat spire
    redent(w, 0.042, 0.022, cx - 0.03, y, cz - 0.022, 0.5)
    r.push(at(hip(0.046, 0.024, 0.01), cx - 0.03, y + 0.022, cz - 0.022), at(hip(0.046, 0.024, 0.01).rotateY(Math.PI / 2), cx - 0.03, y + 0.022, cz - 0.022))
    prasatSpire(w, cx - 0.03, cz - 0.022, y + 0.03, 0.011, 0.05)
    // the round observatory tower with its glass dome
    w.push(cyl(0.012, 0.011, 0.046, cx + 0.032, y, cz - 0.022, 16), cyl(0.014, 0.014, 0.003, cx + 0.032, y + 0.046, cz - 0.022, 16))
    put(p, glass, at(new THREE.SphereGeometry(0.0105, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), cx + 0.032, y + 0.049, cz - 0.022))
    put(p, white, ...w)
    put(p, grey, ...r)
  }
  // middle peak: Phra That Chom Phet, white bell chedi about 40 m
  {
    const [cx, cz, y] = [peaks[1].x, peaks[1].z, peaks[1].H]
    const w: G[] = [], tip: G[] = []
    w.push(bx(0.07, 0.006, 0.07, cx, y - 0.002, cz))
    redent(w, 0.05, 0.012, cx, y + 0.004, cz, 0.75)
    bellChedi(w, cx, cz, y + 0.016, 0.022, 0.085, 16, tip)
    put(p, white, ...w)
    put(p, gold, ...tip)
  }
  // east peak: Wat Phra Kaeo with its grey marble ubosot and the red Phra Prang Daeng
  {
    const [cx, cz, y] = [peaks[2].x, peaks[2].z, peaks[2].H]
    put(p, white, bx(0.09, 0.006, 0.08, cx, y - 0.002, cz))
    thaiHall(p, { base: white, wall: L('#a9adb0', '#141516'), roof: L('#c8622e', '#2a1206'), trim: L('#2f7a4a', '#0a1c10'), gold }, cx - 0.012, y + 0.004, cz + 0.012, 0.05, 0.024, 0.014)
    const m: G[] = [], d: G[] = []
    prang(m, d, cx + 0.03, cz - 0.022, y + 0.004, 0.008, 0.048, 8, 5)
    put(p, red, ...m)
    put(p, L('#2a1e18'), ...d)
    const c: G[] = []
    smallChedi(c, cx - 0.025, cz - 0.024, y + 0.004, 0.011, 0.04)
    put(p, white, ...c)
  }
  flush(k, p)
}

// Bang Pa-In: river palace revived by King Chulalongkorn from 1872. Aisawan Thiphya-Art in the pond, the European
// Warophat Phiman hall, the Chinese Wehart Chamrun, Withun Thatsana lookout, and Gothic Wat Niwet across the river
function bangPaIn(k: Kit) {
  const p: Paint = new Map()
  const water = L('#5d8c94', '#0e1c20'), lawn = L('#5e8442', '#121a0a'), white = L('#f2eee4', '#1e1c18'), gold = L('#d9a93a', '#3a2a08')
  const red = L('#a8322a', '#2a0806'), cream = L('#eadfc2', '#1e1a12'), slate = L('#6f7d7a', '#101414'), yellow = L('#e2b84a', '#2a2008')
  put(p, lawn, bx(0.9, 0.004, 0.86, -0.06, 0, 0))
  put(p, water, bx(0.15, 0.005, 1.0, 0.465, 0, 0))
  put(p, water, bx(0.66, 0.0015, 0.13, 0.06, 0.004, 0.02), bx(0.06, 0.0015, 0.13, 0.4, 0.004, 0.02), bx(0.2, 0.0015, 0.22, -0.32, 0.004, 0.06))
  put(p, lawn, bx(0.07, 0.0025, 0.07, -0.32, 0.004, 0.06))

  // Aisawan Thiphya-Art: cruciform open pavilion with red-and-gold roofs and a prasat spire, on a platform in the pond
  {
    const [x, z] = [0.24, 0.02], y = 0.006
    put(p, white, bx(0.07, 0.004, 0.07, x, y, z), bx(0.012, 0.002, 0.06, x, y, z - 0.06))
    const pil: G[] = []
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0.35], [-1, 0.35], [1, -0.35], [-1, -0.35]]) pil.push(cyl(0.0022, 0.0022, 0.026, x + a * 0.022, y + 0.004, z + b * 0.022, 6), cyl(0.0022, 0.0022, 0.026, x + b * 0.022, y + 0.004, z + a * 0.022, 6))
    put(p, red, ...pil)
    const M: HallMats = { base: gold, wall: gold, roof: red, trim: gold, gold }
    for (const a of [0, Math.PI / 2]) {
      const loc: Paint = new Map()
      const yr = y + 0.03, ww = 0.04
      for (let i = 0; i < 3; i++) {
        const li = 0.07 - i * -0.008 - 0.02, yi = yr - i * 0.006
        put(loc, M.trim, at(gable(li, ww * 1.1, ww * 0.62), 0, yi, 0))
        put(loc, M.roof, at(gable(li - 0.006, ww * 0.94, ww * 0.53), 0, yi + ww * 0.09 + 0.003, 0))
        for (const s of [-1, 1]) put(loc, gold, at(new THREE.BoxGeometry(0.002, 0.009, 0.002).rotateZ(-s * 0.55), s * (li / 2 + 0.001), yi + ww * 0.65, 0))
      }
      for (const s of [-1, 1]) put(loc, gold, at(gable(0.0015, ww, ww * 0.56), s * 0.026, yr, 0))
      const m = new THREE.Matrix4().makeRotationY(a).setPosition(x, 0, z)
      for (const [mt, gs] of loc) for (const g of gs) put(p, mt, g.applyMatrix4(m))
    }
    const s: G[] = []
    prasatSpire(s, x, z, y + 0.045, 0.009, 0.04)
    put(p, gold, ...s)
  }
  // Warophat Phiman: long neoclassical hall north of the pond
  {
    const [x, z] = [0.08, -0.2]
    put(p, cream, bx(0.22, 0.034, 0.06, x, 0.004, z), bx(0.05, 0.034, 0.02, x, 0.004, z + 0.035))
    put(p, slate, at(hip(0.23, 0.07, 0.016), x, 0.038, z))
    const c: G[] = []
    for (let i = 0; i < 4; i++) c.push(cyl(0.0025, 0.0025, 0.03, x - 0.018 + i * 0.012, 0.004, z + 0.05, 6))
    c.push(bx(0.05, 0.004, 0.016, x, 0.034, z + 0.05), at(gable(0.016, 0.052, 0.012).rotateY(Math.PI / 2), x, 0.038, z + 0.05))
    put(p, white, ...c)
  }
  // Wehart Chamrun: two-storey Chinese hall, red walls, yellow trim, green glazed roofs with upturned corners
  {
    const [x, z] = [-0.12, 0.24]
    const rf = L('#2f6b4f', '#0a180f')
    put(p, red, bx(0.09, 0.022, 0.06, x, 0.004, z), bx(0.065, 0.016, 0.04, x, 0.036, z))
    put(p, yellow, bx(0.094, 0.003, 0.064, x, 0.026, z), bx(0.068, 0.002, 0.044, x, 0.052, z), bx(0.1, 0.004, 0.07, x, 0, z))
    put(p, rf, at(hip(0.1, 0.07, 0.01, 0.06), x, 0.029, z), at(hip(0.075, 0.052, 0.014, 0.04), x, 0.054, z))
    const c: G[] = []
    for (const [w, d, y] of [[0.1, 0.07, 0.029], [0.075, 0.052, 0.054]]) for (const sx of [-1, 1]) for (const sz of [-1, 1])
      c.push(at(new THREE.BoxGeometry(0.003, 0.008, 0.003).rotateZ(-sx * 0.6).rotateX(sz * 0.6), x + sx * w / 2, y + 0.002, z + sz * d / 2))
    put(p, yellow, ...c)
  }
  // Withun Thatsana: striped lookout tower on its island
  {
    const [x, z] = [-0.32, 0.06]
    let y = 0.0065
    for (let i = 0; i < 3; i++) {
      const w = 0.03 - i * 0.006, h = 0.022 - i * 0.002
      put(p, yellow, bx(w, h, w, x, y, z))
      put(p, red, bx(w + 0.003, 0.003, w + 0.003, x, y + h * 0.45, z), bx(w + 0.006, 0.002, w + 0.006, x, y + h, z))
      y += h + 0.002
    }
    put(p, red, at(new THREE.ConeGeometry(0.012, 0.014, 4).rotateY(Math.PI / 4), x, y + 0.007, z))
  }
  // Wat Niwet Thammaprawat across the river: grey Gothic church-like ubosot with a pointed tower
  {
    const [x, z] = [0.56, -0.26]
    const st = L('#c9c0a6', '#18160f')
    put(p, lawn, bx(0.08, 0.004, 0.14, x, 0, z))
    put(p, st, bx(0.03, 0.026, 0.08, x, 0.004, z + 0.01), bx(0.018, 0.05, 0.018, x, 0.004, z - 0.04))
    put(p, slate, at(gable(0.08, 0.034, 0.022).rotateY(Math.PI / 2), x, 0.03, z + 0.01), at(new THREE.ConeGeometry(0.013, 0.03, 4).rotateY(Math.PI / 4), x, 0.069, z - 0.04))
  }
  const t1: G[] = [], t2: G[] = []
  for (let i = 0; i < 60; i++) {
    const x = -0.5 + rnd(i + 31) * 0.88, z = -0.42 + rnd(i + 91) * 0.84
    if (Math.abs(z - 0.02) < 0.09 && x > -0.27) continue
    if (Math.hypot(x + 0.32, z - 0.06) < 0.13) continue
    if (Math.abs(x - 0.08) < 0.13 && Math.abs(z + 0.2) < 0.06) continue
    if (Math.abs(x + 0.12) < 0.07 && Math.abs(z - 0.24) < 0.06) continue
    const r = 0.012 + rnd(i) * 0.01
    ;(i % 2 ? t1 : t2).push(blob(r, x, 0.004 + r * 0.7, z))
  }
  put(p, L('#3f6a2e', '#0c1608'), ...t1)
  put(p, L('#55803a', '#10190a'), ...t2)
  flush(k, p)
}

// Wat Yai Chai Mongkhon: the great chedi (about 60 m) on a high redented platform with four corner chedis, ringed
// by rows of seated Buddhas. Abandoned after 1767, monks returned and restored it from 1957
const STATUE = [[1, 0], [1, 0.15], [0.45, 0.3], [0.38, 0.66], [0, 0.72]]
const watYaiChaiMongkhon = staged([1592, 1767, 1957], (k, year) => {
  const p: Paint = new Map()
  const ruin = year >= 1767 && year < 1957
  const body = year < 1767 ? L('#efe9dc', '#1c1a16') : ruin ? L('#b3a892', '#16140e') : L('#e2dccd', '#1a1814')
  const brick = L('#a55a3c', '#1e0c06'), gold = L('#d9a93a', '#3a2a08'), dark = L('#3a2a22')
  const c: G[] = [], tip: G[] = []
  const cx = -0.04
  // platform 34 units wide in two redented tiers, steep stair up the east side to the chamber
  redent(c, 0.36, 0.07, cx, 0, 0, 0.84)
  redent(c, 0.32, 0.045, cx, 0.07, 0, 0.84)
  for (let i = 0; i < 9; i++) c.push(bx(0.012, 0.115 * (1 - i / 9), 0.05, cx + 0.186 + i * 0.012, 0, 0))
  put(p, dark, bx(0.004, 0.022, 0.016, cx + 0.161, 0.115, 0))
  redent(c, 0.23, 0.04, cx, 0.115, 0, 0.8)
  redent(c, 0.19, 0.03, cx, 0.155, 0, 0.8)
  bellChedi(c, cx, 0, 0.185, 0.1, 0.46, 24, tip)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    c.push(bx(0.05, 0.012, 0.05, cx + sx * 0.13, 0.115, sz * 0.13))
    smallChedi(c, cx + sx * 0.13, sz * 0.13, 0.127, 0.024, 0.12, 10)
  }
  put(p, body, ...c)
  put(p, year < 1767 ? gold : body, ...tip)

  // seated Buddhas around the courtyard, gilded at first, headless brick after the sack, saffron-robed today
  const robe = year < 1767 ? gold : ruin ? brick : L('#e08a1e', '#3a1e04')
  const head = year < 1767 ? gold : L('#e6e0d4', '#1c1a16')
  const B: G[] = [], Hd: G[] = [], wall: G[] = [], plinth: G[] = []
  const D = 0.285
  for (const [dx, dz] of dirs) {
    plinth.push(bx(dx ? 0.02 : 0.6, 0.006, dx ? 0.6 : 0.02, cx + dx * D, 0, dz * D))
    for (let s = -0.3; s < 0.3; s += 0.06) {
      if (ruin && rnd(s * 100 + dx * 7 + dz * 13) > 0.25) wall.push(bx(dx ? 0.01 : 0.06, ruin ? 0.01 + rnd(s * 40 + dx) * 0.012 : 0.024, dx ? 0.06 : 0.01, cx + dx * (D + 0.022) + (dx ? 0 : s + 0.03), 0, dz * (D + 0.022) + (dz ? 0 : s + 0.03)))
    }
    if (!ruin) wall.push(bx(dx ? 0.01 : 0.6, 0.024, dx ? 0.6 : 0.01, cx + dx * (D + 0.022), 0, dz * (D + 0.022)))
    for (let i = 0; i < 11; i++) {
      const t = -0.25 + i * 0.05
      if (dx === 1 && Math.abs(t) < 0.04) continue
      const x = cx + (dx ? dx * D : t), z = dz ? dz * D : t
      B.push(at(lathe(STATUE, 4, 0.011, 0.032, Math.PI / 4), x, 0.006, z))
      if (!ruin || rnd(i + dx * 3 + dz * 5) > 0.8) Hd.push(at(new THREE.OctahedronGeometry(0.006).scale(1, 1.3, 1), x, 0.006 + 0.032 * 0.84, z))
    }
  }
  put(p, robe, ...B)
  put(p, head, ...Hd)
  put(p, ruin || year >= 1957 ? brick : body, ...wall)
  put(p, body, ...plinth)

  // east vihara: a roofed hall at first, later a platform of column stumps
  const vx = 0.36
  if (year < 1767) {
    thaiHall(p, { base: body, wall: body, roof: L('#9a4a2e', '#1e0c06'), trim: L('#6a3a26', '#140a06'), gold }, vx, 0, 0, 0.2, 0.08, 0.04, 0, 2)
  } else {
    const col: G[] = []
    col.push(bx(0.22, 0.012, 0.1, vx, 0, 0))
    for (let i = 0; i < 6; i++) for (const z of [-0.03, 0.03]) col.push(cyl(0.0045, 0.0045, 0.012 + rnd(i * 3 + z * 100) * 0.03, vx - 0.08 + i * 0.03, 0.012, z, 6))
    put(p, brick, ...col)
    put(p, robe, at(lathe(STATUE, 6, 0.016, 0.045), vx - 0.085, 0.012, 0))
    if (!ruin) put(p, head, at(new THREE.OctahedronGeometry(0.009).scale(1, 1.3, 1), vx - 0.085, 0.012 + 0.045 * 0.84, 0))
  }

  // reclining Buddha in the open, north-east of the courtyard
  {
    const [x, z] = [0.24, -0.4]
    put(p, brick, bx(0.15, 0.008, 0.04, x, 0, z))
    if (ruin) put(p, brick, at(new THREE.SphereGeometry(1, 10, 5).scale(0.06, 0.008, 0.013), x, 0.012, z))
    else {
      put(p, robe, at(new THREE.SphereGeometry(1, 12, 6).scale(0.055, 0.009, 0.013), x + 0.005, 0.016, z))
      put(p, head, at(new THREE.SphereGeometry(0.009, 8, 6), x - 0.055, 0.024, z), bx(0.012, 0.012, 0.018, x - 0.055, 0.008, z),
        at(new THREE.ConeGeometry(0.004, 0.008, 6), x - 0.055, 0.035, z))
    }
  }
  flush(k, p)
})

export const thai_3: Record<string, Builder> = {
  'phra-pathom': phraPathom,
  'river-kwai-bridge': riverKwai,
  'hellfire-pass': hellfire,
  'phra-nakhon-khiri': phraNakhonKhiri,
  'bang-pa-in': bangPaIn,
  'wat-yai-chai-mongkhon': watYaiChaiMongkhon,
}
