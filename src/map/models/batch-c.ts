import * as THREE from 'three'
import { gable, merge, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
const SQ2 = Math.SQRT2

const at = <T extends G>(g: T, x: number, y: number, z: number) => { g.translate(x, y, z); return g }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z)
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 24) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n), x, y + h / 2, z)
function lathe(pts: number[][], seg: number, sr: number, sh: number, rot = 0) {
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)), seg)
  if (rot) g.rotateY(rot)
  return g
}
// redented square plan, two crossed boxes
const redent = (o: G[], w: number, h: number, x: number, y: number, z: number, f = 0.8) => {
  o.push(bx(w, h, w * f, x, y, z), bx(w * f, h, w, x, y, z))
}
const done = (k: Kit, m: G[], d: G[] = [], em: G[] = [], ed: G[] = []) => {
  if (m.length) merge(k, m)
  if (d.length) merge(k, d, k.dark)
  if (em.length) merge(k, em)
  if (ed.length) merge(k, ed, k.dark)
}
const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** Flight of steps on side (dx, dz): top at distance r0 from (cx, cz), running l outward and h down to y0. */
function stairs(o: G[], dx: number, dz: number, r0: number, l: number, h: number, w: number, y0 = 0, n = 6, cx = 0, cz = 0) {
  for (let i = 0; i < n; i++) {
    const L = (l * (n - i)) / n, c = r0 + L / 2
    o.push(bx(dx ? L : w, h / n, dx ? w : L, cx + dx * c, y0 + (i * h) / n, cz + dz * c))
  }
}

/** Thai/Khmer prang spire: corn-cob tiers on a convex taper, closing to a bud and a spike. Unit radius and height. */
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

/** A prang: redented body with four porches, then the spire. h is the height above y. */
function prang(m: G[], d: G[], x: number, z: number, y: number, w: number, h: number, seg = 12, tiers = 7) {
  const bh = h * 0.2
  redent(m, w * 2, bh, x, y, z, 0.75)
  for (const [dx, dz] of dirs) {
    const px = x + dx * w * 1.05, pz = z + dz * w * 1.05
    m.push(bx(dx ? w * 0.4 : w * 0.8, bh * 0.85, dx ? w * 0.8 : w * 0.4, px, y, pz))
    d.push(bx(dx ? 0.003 : w * 0.4, bh * 0.55, dx ? w * 0.4 : 0.003, x + dx * (w * 1.25 + 0.0015), y, z + dz * (w * 1.25 + 0.0015)))
  }
  m.push(at(lathe(prangPts(tiers), seg, w * 1.0, h - bh, Math.PI / seg), x, y + bh, z))
}

/** Ringed spire (ปล้องไฉน) ending in a plain tip, unit radius and height. */
function spirePts(n = 7) {
  const pts: number[][] = []
  for (let i = 0; i < n; i++) {
    const r0 = 1 - 0.7 * (i / n), y0 = (0.6 * i) / n
    pts.push([r0, y0], [r0 * 0.86, y0 + (0.6 / n) * 0.95])
  }
  pts.push([0.24, 0.62], [0.12, 0.76], [0.07, 0.86], [0.1, 0.89], [0.03, 0.93], [0, 1])
  return pts
}

/** Ayutthaya bell-shaped chedi (ทรงลังกา): three round rings, bell, square harmika, ringed spire. */
function bellChedi(m: G[], d: G[], x: number, z: number, y: number, R: number, H: number, seg = 20) {
  if (seg <= 10) {
    // small ones in one lathe
    const p = [[1, 0], [1, 0.05], [0.85, 0.08], [0.74, 0.12], [0.74, 0.2], [0.6, 0.33], [0.35, 0.4], [0.2, 0.42], [0.2, 0.48], [0.15, 0.5], [0.04, 0.8], [0, 1]]
    m.push(at(lathe(p, seg, R, H), x, y, z))
    return
  }
  const pts = [[1, 0], [1, 0.035], [0.92, 0.05], [0.92, 0.075], [0.84, 0.09], [0.84, 0.115], [0.76, 0.13],
    [0.7, 0.14], [0.72, 0.2], [0.7, 0.27], [0.61, 0.34], [0.46, 0.39], [0.28, 0.415], [0, 0.42]]
  m.push(at(lathe(pts, seg, R, H), x, y, z))
  m.push(bx(R * 0.52, H * 0.05, R * 0.52, x, y + H * 0.41, z))
  m.push(bx(R * 0.6, H * 0.012, R * 0.6, x, y + H * 0.46, z))
  d.push(cyl(R * 0.17, R * 0.17, H * 0.04, x, y + H * 0.472, z, 8))
  m.push(at(lathe(spirePts(8), seg >> 1, R * 0.2, H * 0.49), x, y + H * 0.51, z))
}

/** Thai tiered gable roof along x (or z), lower tiers stepping out at both ends. */
function thaiRoof(e: G[], l: number, dd: number, x: number, y: number, z: number, alongZ = false, tiers = 3, ext = 0.025) {
  for (let i = 0; i < tiers; i++) {
    const g = gable(l - 2 * ext * (tiers - 1 - i), dd * (1 - 0.06 * (tiers - 1 - i)), dd * 0.7)
    if (alongZ) g.rotateY(Math.PI / 2)
    e.push(at(g, x, y - 0.012 * (tiers - 1 - i), z))
  }
}

/** Thai prasat spire: square receding tiers (lathe of 4) then a needle. */
function prasatSpire(m: G[], x: number, z: number, y: number, w: number, h: number) {
  const pts: number[][] = [[1, 0]]
  for (let i = 0; i < 6; i++) {
    const r = 1 - i * 0.12, y0 = i * 0.07
    pts.push([r, y0 + 0.05], [r * 0.84, y0 + 0.058], [r * 0.86, y0 + 0.07])
  }
  pts.push([0.38, 0.44], [0.42, 0.48], [0.28, 0.56], [0.16, 0.66], [0.13, 0.7], [0.05, 0.84], [0.015, 1], [0, 1])
  m.push(at(lathe(pts, 4, w * SQ2, h, Math.PI / 4), x, y, z))
}

function bayon(k: Kit) {
  // outer gallery 156 x 141 m, inner gallery 80 x 70 m, upper terrace crowded with face towers around a round central massif 43 m high
  const m: G[] = [], d: G[] = []
  const gallery = (w: number, dd: number, y: number, h: number, t: number) => {
    for (const s of [-1, 1]) {
      m.push(bx(w, h, t, 0, y, (s * (dd - t)) / 2), bx(t, h, dd - 2 * t, (s * (w - t)) / 2, y, 0))
      d.push(bx(w + 0.006, 0.01, t + 0.006, 0, y + h, (s * (dd - t)) / 2), bx(t + 0.006, 0.01, dd - 2 * t, (s * (w - t)) / 2, y + h, 0))
    }
  }
  const faceTower = (x: number, z: number, y: number, w: number, h: number) => {
    const sh = h * 0.55
    m.push(bx(w, sh, w, x, y, z))
    const fy = y + sh * 0.35, fh = sh * 0.55, o = w / 2 + 0.002
    d.push(bx(w * 0.62, fh, 0.004, x, fy, z + o), bx(w * 0.62, fh, 0.004, x, fy, z - o))
    d.push(bx(0.004, fh, w * 0.62, x + o, fy, z), bx(0.004, fh, w * 0.62, x - o, fy, z))
    const bud = [[1, 0], [1.1, 0.06], [0.9, 0.12], [0.86, 0.3], [0.95, 0.34], [0.7, 0.42], [0.62, 0.6], [0.7, 0.63], [0.45, 0.7], [0.32, 0.85], [0.12, 0.95], [0, 1]]
    m.push(at(lathe(bud, 4, (w / 2) * 1.05 * SQ2, h - sh, Math.PI / 4), x, y + sh, z))
  }
  m.push(bx(1.0, 0.008, 0.9, 0, 0, 0))
  gallery(1.0, 0.9, 0.008, 0.035, 0.025)
  for (const [dx, dz] of dirs) m.push(bx(dx ? 0.05 : 0.09, 0.06, dx ? 0.09 : 0.05, dx * 0.49, 0, dz * 0.44))
  m.push(bx(0.6, 0.04, 0.52, 0, 0, 0))
  gallery(0.58, 0.5, 0.04, 0.045, 0.03)
  redent(m, 0.42, 0.14, 0, 0, 0, 0.72)
  m.push(bx(0.08, 0.1, 0.62, 0, 0, 0), bx(0.66, 0.1, 0.08, 0, 0, 0))
  // inner gallery corner and gate towers
  for (const x of [-0.27, 0, 0.27]) for (const z of [-0.23, 0, 0.23]) if (x || z) faceTower(x, z, 0.085, 0.045, 0.11)
  // face towers on the upper terrace
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2, r = 0.19
    const c = Math.cos(a), s = Math.sin(a), q = Math.max(Math.abs(c), Math.abs(s))
    faceTower((c / q) * r * 0.82, (s / q) * r * 0.82, 0.14, 0.04, 0.12 + (i % 2) * 0.03)
  }
  for (const [dx, dz] of dirs) faceTower(dx * 0.11, dz * 0.11, 0.14, 0.05, 0.19)
  // central massif with faces on its cardinal chapels
  const c = [[1, 0], [1, 0.24], [1.1, 0.26], [1.1, 0.3], [0.95, 0.32], [0.9, 0.5], [1, 0.52], [1, 0.55], [0.82, 0.58], [0.72, 0.72],
    [0.78, 0.74], [0.56, 0.8], [0.46, 0.9], [0.2, 0.97], [0, 1]]
  m.push(at(lathe(c, 16, 0.1, 0.36, Math.PI / 16), 0, 0.14, 0))
  for (const [dx, dz] of dirs) d.push(bx(dx ? 0.004 : 0.06, 0.07, dx ? 0.06 : 0.004, dx * 0.098, 0.14 + 0.36 * 0.3, dz * 0.098))
  done(k, m, d)
}

function lotusBud(m: G[], d: G[], x: number, z: number, y: number, s: number) {
  // Sukhothai lotus-bud chedi: stepped square base, tall pedestal, redented body, lotus tiers and a pointed bud
  redent(m, 0.2 * s, 0.03 * s, x, y, z, 0.82)
  redent(m, 0.17 * s, 0.03 * s, x, y + 0.03 * s, z, 0.82)
  redent(m, 0.14 * s, 0.03 * s, x, y + 0.06 * s, z, 0.82)
  redent(m, 0.1 * s, 0.1 * s, x, y + 0.09 * s, z, 0.78)
  m.push(bx(0.125 * s, 0.012 * s, 0.125 * s, x, y + 0.19 * s, z))
  redent(m, 0.095 * s, 0.07 * s, x, y + 0.202 * s, z, 0.78)
  for (const [dx, dz] of dirs) d.push(bx(dx ? 0.003 : 0.03 * s, 0.045 * s, dx ? 0.03 * s : 0.003, x + dx * 0.049 * s, y + 0.205 * s, z + dz * 0.049 * s))
  const bud = [[0.62, 0], [0.7, 0.03], [0.55, 0.05], [0.62, 0.08], [0.48, 0.1], [0.55, 0.13], [0.42, 0.15],
    [0.5, 0.18], [0.56, 0.25], [0.5, 0.33], [0.35, 0.42], [0.18, 0.5], [0.1, 0.54], [0.12, 0.56], [0.08, 0.58], [0.07, 0.68], [0.1, 0.7], [0.05, 0.72], [0.02, 0.88], [0, 0.88]]
  m.push(at(lathe(bud, 12, 0.08 * s, 0.4 * s, Math.PI / 12), x, y + 0.272 * s, z))
}

function watMahathatSukhothai(k: Kit) {
  // main lotus-bud chedi on a square platform ringed by eight satellites (Khmer prangs at the corners),
  // two tall mondop with standing Buddhas (พระอัฏฐารส) north and south, the big pillared viharn to the east
  const m: G[] = [], d: G[] = []
  m.push(bx(0.96, 0.01, 0.76, 0.02, 0, 0))
  const cx = -0.18
  m.push(bx(0.36, 0.025, 0.36, cx, 0.01, 0))
  lotusBud(m, d, cx, 0, 0.035, 1.25)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) prang(m, d, cx + sx * 0.13, sz * 0.13, 0.035, 0.022, 0.2, 8, 5)
  for (const [dx, dz] of dirs) bellChedi(m, d, cx + dx * 0.145, dz * 0.145, 0.035, 0.026, 0.2, 10)
  for (const sz of [-1, 1]) {
    m.push(bx(0.07, 0.01, 0.07, cx, 0.01, sz * 0.29))
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, sz]]) m.push(bx(dx ? 0.01 : 0.06, 0.22, dz ? 0.01 : 0.06, cx + dx * 0.025, 0.02, sz * 0.29 + dz * 0.025))
    m.push(cyl(0.012, 0.009, 0.17, cx, 0.02, sz * 0.29, 8), at(new THREE.SphereGeometry(0.01, 8, 6), cx, 0.2, sz * 0.29))
  }
  // viharn luang: brick platform with rows of laterite columns and a seated Buddha at the west end
  const vx = 0.22
  m.push(bx(0.42, 0.025, 0.17, vx, 0.01, 0))
  for (let i = 0; i < 9; i++) for (const z of [-0.06, -0.025, 0.025, 0.06]) m.push(bx(0.011, 0.07, 0.011, vx - 0.17 + i * 0.04, 0.035, z))
  m.push(bx(0.04, 0.025, 0.06, vx - 0.18, 0.035, 0))
  m.push(at(lathe([[1, 0], [0.9, 0.3], [0.45, 0.45], [0.5, 0.7], [0.35, 0.95], [0.15, 1.05], [0, 1.15]], 10, 0.025, 0.08), vx - 0.18, 0.06, 0))
  // a few small chedis among the ruins
  for (const [x, z] of [[0.1, -0.3], [0.2, -0.3], [0.3, -0.3], [0.1, 0.3], [0.2, 0.3], [0.3, 0.3], [0.44, -0.2], [0.44, 0.2]])
    bellChedi(m, d, x, z, 0.01, 0.022, 0.13, 8)
  done(k, m, d)
}

function watRatchaburana(k: Kit) {
  // Khmer-style prang on a high redented base with steep stairs, four small chedis at the corners, cloister around
  const m: G[] = [], d: G[] = [], V = 1.5
  m.push(bx(0.9, 0.012, 0.8, 0.05, 0, 0))
  for (const s of [-1, 1]) {
    m.push(bx(0.72, 0.035, 0.02, -0.02, 0.012, s * 0.36), bx(0.02, 0.035, 0.72, -0.37, 0.012, 0))
    m.push(bx(0.02, 0.035, 0.28, 0.33, 0.012, s * 0.22))
  }
  redent(m, 0.42, 0.06, 0, 0.012, 0, 0.82)
  redent(m, 0.32, 0.07, 0, 0.072, 0, 0.82)
  redent(m, 0.24, 0.06, 0, 0.142, 0, 0.8)
  for (const [dx, dz] of dirs) stairs(m, dx, dz, 0.1, dx > 0 ? 0.2 : 0.15, 0.2, 0.05, 0.012, 8)
  prang(m, d, 0, 0, 0.2, 0.065, (40 / 60) * V - 0.2)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bellChedi(m, d, sx * 0.165, sz * 0.165, 0.072, 0.04, 0.3, 12)
  // viharn ruin east: walls, dark floor, column stubs
  m.push(bx(0.16, 0.015, 0.14, 0.42, 0, 0))
  d.push(bx(0.13, 0.002, 0.11, 0.42, 0.015, 0))
  for (const s of [-1, 1]) m.push(bx(0.16, 0.05, 0.012, 0.42, 0.015, s * 0.064))
  m.push(bx(0.012, 0.07, 0.14, 0.494, 0.015, 0))
  for (let i = 0; i < 4; i++) for (const z of [-0.03, 0.03]) m.push(cyl(0.006, 0.006, 0.06, 0.36 + i * 0.035, 0.015, z, 6))
  done(k, m, d)
}

function watPhraSiSanphet(k: Kit) {
  // three Ayutthaya bell chedis in an east-west row (1492-1530), each with four porches, small mondop between them
  const m: G[] = [], d: G[] = []
  m.push(bx(1.0, 0.02, 0.36, 0, 0, 0))
  for (const x of [-0.33, 0, 0.33]) {
    redent(m, 0.24, 0.04, x, 0.02, 0, 0.8)
    redent(m, 0.19, 0.03, x, 0.06, 0, 0.8)
    for (const [dx, dz] of dirs) {
      const px = x + dx * 0.115, pz = dz * 0.115
      m.push(bx(dx ? 0.05 : 0.06, 0.07, dx ? 0.06 : 0.05, px, 0.06, pz))
      d.push(bx(dx ? 0.003 : 0.025, 0.045, dx ? 0.025 : 0.003, px + dx * 0.026, 0.06, pz + dz * 0.026))
      prasatSpire(m, px, pz, 0.13, 0.026, 0.1)
    }
    bellChedi(m, d, x, 0, 0.09, 0.11, 0.72, 18)
  }
  done(k, m, d)
}

function virupaksha(k: Kit) {
  // 50 m eastern gopuram of nine tiers, courtyards with a smaller inner gopuram, sanctum with a stepped vimana to the west
  const m: G[] = [], d: G[] = []
  m.push(bx(0.94, 0.008, 0.6, -0.03, 0, 0))
  // outer court with colonnade
  for (const s of [-1, 1]) {
    m.push(bx(0.7, 0.04, 0.03, -0.1, 0.008, s * 0.28))
    d.push(bx(0.71, 0.008, 0.036, -0.1, 0.048, s * 0.28))
  }
  m.push(bx(0.03, 0.04, 0.56, -0.44, 0.008, 0))
  for (const s of [-1, 1]) m.push(bx(0.03, 0.04, 0.2, 0.24, 0.008, s * 0.18))
  m.push(bx(0.03, 0.04, 0.42, 0.0, 0.008, 0))
  const gopuram = (x: number, w: number, dd: number, base: number, tiers: number, th: number) => {
    m.push(bx(dd, base, w, x, 0, 0))
    d.push(bx(dd + 0.004, base * 0.75, w * 0.18, x, 0, 0))
    let y = base
    for (let i = 0; i < tiers; i++) {
      const f = 1 - i / (tiers + 2.5), g = 1 - i / (tiers * 3)
      m.push(bx(dd * f * 0.92, th, w * g * 0.92, x, y, 0))
      d.push(bx(dd * f * 0.92 + 0.003, th * 0.35, w * g * 0.6, x, y + th * 0.25, 0))
      y += th
    }
    const r = (dd * (1 - (tiers - 1) / (tiers + 2.5)) * 0.92) / 2, l = w * (1 - (tiers - 1) / (tiers * 3)) * 0.92
    const vault = new THREE.CylinderGeometry(r, r, l, 10, 1, false, 0, Math.PI)
    vault.rotateX(Math.PI / 2); vault.rotateZ(Math.PI / 2)
    m.push(at(vault, x, y, 0))
    for (const s of [-1, 1]) m.push(at(new THREE.ConeGeometry(r * 0.5, r * 1.4, 6), x, y + r * 0.6, s * (l / 2)))
    const n = tiers > 6 ? 9 : 5
    for (let i = 0; i < n; i++) m.push(at(lathe([[0.6, 0], [1, 0.3], [0.6, 0.6], [0.3, 0.7], [0, 1]], 6, r * 0.18, r * 0.9), x, y + r * 0.95, -l * 0.35 + (i * l * 0.7) / (n - 1)))
  }
  gopuram(0.37, 0.3, 0.16, 0.09, 9, 0.058)
  gopuram(0.0, 0.17, 0.09, 0.06, 4, 0.04)
  // sanctum: pillared mandapa then the vimana
  m.push(bx(0.2, 0.05, 0.16, -0.15, 0.008, 0))
  d.push(bx(0.21, 0.008, 0.17, -0.15, 0.058, 0))
  m.push(bx(0.12, 0.08, 0.12, -0.3, 0.008, 0))
  const vim = [[1, 0], [1, 0.12], [0.85, 0.14], [0.85, 0.26], [0.7, 0.28], [0.7, 0.4], [0.55, 0.42], [0.55, 0.54], [0.42, 0.56], [0.48, 0.66], [0.35, 0.78], [0.08, 0.84], [0.1, 0.92], [0, 1]]
  m.push(at(lathe(vim, 4, 0.06 * SQ2, 0.24, Math.PI / 4), -0.3, 0.088, 0))
  done(k, m, d)
}

function ruwanwelisaya(k: Kit) {
  // 90 m bubble-shaped dome on three rings, square platform with the elephant wall, harmika and a tall spire, 103 m
  const m: G[] = [], d: G[] = []
  m.push(bx(1.0, 0.035, 1.0, 0, 0, 0))
  d.push(bx(1.004, 0.012, 1.004, 0, 0.008, 0))
  const el: G[] = []
  for (let i = 0; i < 17; i++) {
    const t = -0.46 + (i * 0.92) / 16
    for (const s of [-1, 1]) el.push(bx(0.022, 0.026, 0.012, t, 0.005, s * 0.506), bx(0.012, 0.026, 0.022, s * 0.506, 0.005, t))
  }
  m.push(...el)
  m.push(bx(0.8, 0.02, 0.8, 0, 0.035, 0))
  for (const [dx, dz] of dirs) m.push(bx(dx ? 0.08 : 0.12, 0.02, dx ? 0.12 : 0.08, dx * 0.5, 0, dz * 0.5))
  const R = 0.31, y0 = 0.055
  m.push(cyl(R + 0.04, R + 0.04, 0.02, 0, y0, 0, 40), cyl(R + 0.025, R + 0.025, 0.02, 0, y0 + 0.02, 0, 40), cyl(R + 0.01, R + 0.01, 0.02, 0, y0 + 0.04, 0, 40))
  const dome: number[][] = []
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * (Math.PI / 2); dome.push([Math.cos(a) * (1 + 0.04 * Math.sin(a * 2)), Math.sin(a) * 1.08]) }
  m.push(at(lathe(dome, 32, R, R), 0, y0 + 0.06, 0))
  for (const [dx, dz] of dirs) {
    m.push(bx(dx ? 0.03 : 0.08, 0.08, dx ? 0.08 : 0.03, dx * (R + 0.05), y0, dz * (R + 0.05)))
    d.push(bx(dx ? 0.003 : 0.03, 0.05, dx ? 0.03 : 0.003, dx * (R + 0.067), y0, dz * (R + 0.067)))
  }
  const top = y0 + 0.06 + R * 1.08
  m.push(bx(0.1, 0.08, 0.1, 0, top - 0.01, 0), bx(0.12, 0.012, 0.12, 0, top + 0.07, 0))
  m.push(cyl(0.04, 0.04, 0.06, 0, top + 0.082, 0, 16))
  m.push(at(lathe(spirePts(9), 16, 0.045, 0.5), 0, top + 0.142, 0))
  done(k, m, d)
}

function shwezigon(k: Kit) {
  // three square terraces with central stairs on each side, octagonal plinth, gilded bell, lotus and banana-bud spire with hti
  const m: G[] = [], d: G[] = []
  const ws = [0.86, 0.72, 0.58], h = 0.05
  ws.forEach((w, i) => {
    m.push(bx(w, h, w, 0, i * h, 0))
    m.push(bx(w + 0.01, 0.008, w + 0.01, 0, (i + 1) * h - 0.008, 0))
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      m.push(at(lathe([[1, 0], [1, 0.2], [0.7, 0.4], [0.3, 0.6], [0, 1]], 8, 0.022, 0.08), sx * (w / 2 - 0.025), (i + 1) * h, sz * (w / 2 - 0.025)))
  })
  for (const [dx, dz] of dirs) {
    stairs(m, dx, dz, 0.24, 0.27, 3 * h, 0.06, 0, 9)
    for (const side of [-1, 1]) stairs(m, dx, dz, 0.24, 0.27, 3 * h + 0.012, 0.01, 0, 9, dz * side * 0.035, dx * side * 0.035)
  }
  const y = 3 * h
  m.push(cyl(0.25, 0.25, 0.03, 0, y, 0, 8), cyl(0.22, 0.22, 0.03, 0, y + 0.03, 0, 8))
  const bell = [[0.2, 0], [0.2, 0.025], [0.185, 0.03], [0.185, 0.055], [0.17, 0.06], [0.17, 0.08],
    [0.165, 0.09], [0.168, 0.14], [0.155, 0.2], [0.13, 0.25], [0.1, 0.28], [0.08, 0.29],
    [0.08, 0.31], [0.07, 0.315], [0.07, 0.33], [0.06, 0.335], [0.06, 0.35], [0.075, 0.37], [0.05, 0.4],
    [0.045, 0.45], [0.038, 0.5], [0.03, 0.55], [0.022, 0.6], [0.028, 0.63], [0.02, 0.68], [0.008, 0.72],
    [0.03, 0.725], [0.03, 0.735], [0.004, 0.745], [0.003, 0.8], [0, 0.8]]
  m.push(at(lathe(bell, 24, 1, 1), 0, y + 0.06, 0))
  done(k, m, d)
}

function borobudur(k: Kit) {
  // 123 m square base, five redented square terraces, three round terraces with 32 + 24 + 16 bell stupas, main stupa 35 m up
  const m: G[] = [], d: G[] = [], st: G[] = []
  const sq = [[1.0, 0.04], [0.86, 0.035], [0.77, 0.035], [0.68, 0.035], [0.6, 0.035], [0.53, 0.03]]
  let y = 0
  for (const [w, h] of sq) {
    m.push(bx(w * 0.8, h, w, 0, y, 0), bx(w, h, w * 0.8, 0, y, 0), bx(w * 0.92, h, w * 0.92, 0, y, 0))
    for (const [dx, dz] of dirs) d.push(bx(dx ? 0.003 : 0.035, h * 0.8, dx ? 0.035 : 0.003, dx * (w / 2 + 0.0015), y, dz * (w / 2 + 0.0015)))
    y += h
  }
  const rings: [number, number, number][] = [[0.235, 0.205, 32], [0.18, 0.152, 24], [0.128, 0.1, 16]]
  const bell = [[1, 0], [0.95, 0.45], [0.6, 0.85], [0.15, 1.0], [0, 1.45]]
  for (const [rr, rs, n] of rings) {
    m.push(cyl(rr, rr, 0.028, 0, y, 0, 40))
    y += 0.028
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      st.push(at(lathe(bell, 6, 0.014, 0.026), Math.cos(a) * rs, y, Math.sin(a) * rs))
    }
  }
  m.push(cyl(0.065, 0.065, 0.015, 0, y, 0, 24))
  m.push(at(lathe([[1, 0], [1, 0.3], [0.96, 0.5], [0.75, 0.8], [0.4, 0.97], [0, 1]], 20, 0.058, 0.07), 0, y + 0.015, 0))
  m.push(bx(0.03, 0.022, 0.03, 0, y + 0.083, 0), cyl(0.012, 0.002, 0.06, 0, y + 0.105, 0, 8))
  done(k, m, d)
  merge(k, st)
}

function phraPathom(k: Kit) {
  // the original Dvaravati stupa (about 39 m): inverted-bowl dome on a drum, square terrace with four stairs, harmika and parasols
  const m: G[] = [], d: G[] = []
  m.push(bx(0.84, 0.05, 0.84, 0, 0, 0))
  for (const [dx, dz] of dirs) {
    m.push(bx(dx ? 0.12 : 0.1, 0.03, dx ? 0.1 : 0.12, dx * 0.47, 0, dz * 0.47))
    d.push(bx(dx ? 0.1 : 0.05, 0.006, dx ? 0.05 : 0.1, dx * 0.47, 0.03, dz * 0.47))
  }
  m.push(cyl(0.34, 0.34, 0.05, 0, 0.05, 0, 40), cyl(0.36, 0.36, 0.012, 0, 0.1, 0, 40))
  const dome: number[][] = []
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); dome.push([Math.cos(a), Math.sin(a) * 0.95]) }
  m.push(at(lathe(dome, 32, 0.32, 0.4), 0, 0.112, 0))
  const t = 0.112 + 0.38
  m.push(bx(0.09, 0.05, 0.09, 0, t - 0.01, 0), bx(0.11, 0.01, 0.11, 0, t + 0.04, 0))
  m.push(cyl(0.008, 0.008, 0.2, 0, t + 0.05, 0, 6))
  for (let i = 0; i < 4; i++) m.push(cyl(0.07 - i * 0.014, 0.05 - i * 0.012, 0.012, 0, t + 0.08 + i * 0.04, 0, 16))
  done(k, m, d)
}

function hariphunchai(k: Kit) {
  // 46 m gilded Lanna chedi inside a railing with corner parasols, the viharn luang to the east facing the Kuang river
  const m: G[] = [], d: G[] = [], e: G[] = []
  const cx = -0.18
  m.push(bx(1.0, 0.012, 0.66, 0, 0, 0))
  for (const s of [-1, 1]) m.push(bx(0.5, 0.03, 0.012, cx, 0.012, s * 0.25), bx(0.012, 0.03, 0.5, cx + s * 0.25, 0.012, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx * 0.25, z = sz * 0.25
    m.push(cyl(0.004, 0.004, 0.2, x, 0.012, z, 6))
    for (let i = 0; i < 5; i++) m.push(cyl(0.03 - i * 0.005, 0.03 - i * 0.005, 0.006, x, 0.11 + i * 0.022, z, 10))
  }
  redent(m, 0.32, 0.05, cx, 0.012, 0, 0.82)
  redent(m, 0.27, 0.05, cx, 0.062, 0, 0.82)
  redent(m, 0.22, 0.04, cx, 0.112, 0, 0.82)
  const pts = [[1, 0], [1, 0.03], [0.9, 0.04], [0.9, 0.07], [0.8, 0.08], [0.8, 0.11], [0.72, 0.12],
    [0.68, 0.13], [0.7, 0.2], [0.66, 0.28], [0.56, 0.35], [0.38, 0.4], [0, 0.41]]
  const R = 0.1, y = 0.152, bt = y + 0.41 * 0.75
  m.push(at(lathe(pts, 24, R, 0.75), cx, y, 0))
  m.push(bx(R * 0.6, 0.05, R * 0.6, cx, bt - 0.01, 0), bx(R * 0.7, 0.01, R * 0.7, cx, bt + 0.04, 0))
  m.push(at(lathe(spirePts(9), 12, R * 0.28, 0.5), cx, bt + 0.05, 0))
  for (let i = 0; i < 5; i++) m.push(cyl(0.022 - i * 0.004, 0.022 - i * 0.004, 0.004, cx, bt + 0.35 + i * 0.025, 0, 10))
  // viharn luang with low swept Lanna roof
  const vx = 0.27
  m.push(bx(0.4, 0.07, 0.16, vx, 0.012, 0))
  thaiRoof(e, 0.4, 0.2, vx, 0.08, 0, false, 3, 0.04)
  done(k, m, d, [], e)
}

function chediLuang(k: Kit) {
  // 60 m square Lanna chedi left a ruin by the 1545 earthquake: stepped base, naga stairs on four sides, elephants, niches up top
  const m: G[] = [], d: G[] = [], V = 1.3
  const tiers = [[0.8, 0.08], [0.66, 0.1], [0.54, 0.1]]
  let y = 0
  for (const [w, h] of tiers) {
    m.push(bx(w, h * V, w, 0, y, 0))
    m.push(bx(w + 0.012, 0.01, w + 0.012, 0, y + h * V - 0.01, 0))
    y += h * V
  }
  for (let i = 0; i < 7; i++) {
    const t = -0.3 + i * 0.1
    for (const s of [-1, 1]) {
      d.push(bx(0.035, 0.05, 0.02, t, 0.015, s * 0.405), bx(0.02, 0.05, 0.035, s * 0.405, 0.015, t))
    }
  }
  // naga stairs with balustrades
  for (const [dx, dz] of dirs) {
    stairs(m, dx, dz, 0.2, 0.33, y, 0.08, 0, 10)
    for (const side of [-1, 1]) stairs(m, dx, dz, 0.2, 0.33, y + 0.02, 0.012, 0, 10, dz * side * 0.046, dx * side * 0.046)
  }
  // upper body with a Buddha niche on each face
  m.push(bx(0.4, 0.14 * V, 0.4, 0, y, 0))
  for (const [dx, dz] of dirs) {
    m.push(bx(dx ? 0.03 : 0.12, 0.15 * V, dx ? 0.12 : 0.03, dx * 0.21, y, dz * 0.21))
    d.push(bx(dx ? 0.003 : 0.06, 0.1 * V, dx ? 0.06 : 0.003, dx * 0.2265, y + 0.02, dz * 0.2265))
  }
  y += 0.14 * V
  // broken stump of the bell
  m.push(bx(0.32, 0.03, 0.32, 0, y, 0))
  m.push(at(lathe([[1, 0], [1, 0.25], [0.92, 0.3], [0.92, 0.5], [0.85, 0.6], [0.7, 0.75], [0, 0.78]], 24, 0.13, 0.12), 0, y + 0.03, 0))
  m.push(bx(0.12, 0.05, 0.14, 0.02, y + 0.1, -0.01), bx(0.07, 0.04, 0.06, -0.02, y + 0.14, 0.02))
  done(k, m, d)
}

function grandPalace(k: Kit) {
  // Chakri Maha Prasat (1882): Victorian three-storey halls under Thai tiered roofs and three prasat spires,
  // Dusit Maha Prasat to the west (cruciform, tall spire), Amarin Winitchai hall to the east
  const m: G[] = [], d: G[] = [], e: G[] = [], V = 1.6
  m.push(bx(1.0, 0.01, 0.52, 0, 0, 0))
  for (const s of [-1, 1]) m.push(bx(1.0, 0.03, 0.01, 0, 0.01, s * 0.255), bx(0.01, 0.03, 0.52, s * 0.495, 0.01, 0))
  // Chakri: long front facing north, three pavilions
  const z0 = 0.06, wh = 0.09
  m.push(bx(0.44, wh, 0.07, 0, 0.01, z0))
  for (const fy of [0.03, 0.065]) for (const sz of [-1, 1]) d.push(bx(0.4, 0.014, 0.003, 0, fy, z0 + sz * 0.0365))
  thaiRoof(e, 0.44, 0.08, 0, 0.01 + wh, z0, false, 2, 0.03)
  const pav = (x: number, w: number, dd: number, h: number, sh: number) => {
    m.push(bx(w, h, dd, x, 0.01, z0))
    for (const fy of [0.03, 0.065, 0.1]) for (const sz of [-1, 1]) d.push(bx(w * 0.8, 0.014, 0.003, x, fy, z0 + sz * (dd / 2 + 0.0015)))
    thaiRoof(e, w + 0.02, dd * 0.7, x, 0.01 + h, z0, false, 3, 0.02)
    thaiRoof(e, dd + 0.02, w * 0.7, x, 0.01 + h, z0, true, 3, 0.02)
    prasatSpire(m, x, z0, 0.01 + h + 0.035, w * 0.36, sh)
  }
  pav(0, 0.1, 0.16, 0.14, 0.3 * V)
  for (const s of [-1, 1]) pav(s * 0.2, 0.07, 0.11, 0.12, 0.22 * V)
  m.push(bx(0.06, 0.04, 0.05, 0, 0.01, z0 - 0.1))
  // Dusit Maha Prasat
  const dx = -0.37, dz = 0.0
  m.push(bx(0.06, 0.025, 0.06, dx, 0.01, dz))
  m.push(bx(0.17, 0.05, 0.06, dx, 0.01, dz), bx(0.06, 0.05, 0.17, dx, 0.01, dz))
  thaiRoof(e, 0.19, 0.07, dx, 0.06, dz, false, 4, 0.018)
  thaiRoof(e, 0.19, 0.07, dx, 0.06, dz, true, 4, 0.018)
  prasatSpire(m, dx, dz, 0.095, 0.032, 0.28 * V)
  // Amarin Winitchai
  m.push(bx(0.09, 0.05, 0.2, 0.38, 0.01, -0.02))
  thaiRoof(e, 0.2, 0.11, 0.38, 0.06, -0.02, true, 3, 0.025)
  done(k, m, d, [], e)
}

function watArun(k: Kit) {
  // central prang about 80 m on three stepped terraces, four satellite prangs at the corners, four mondops at the cardinal points
  const m: G[] = [], d: G[] = [], V = 1.35
  m.push(bx(0.96, 0.02, 0.96, 0, 0, 0))
  for (const s of [-1, 1]) m.push(bx(0.96, 0.03, 0.012, 0, 0.02, s * 0.474), bx(0.012, 0.03, 0.96, s * 0.474, 0.02, 0))
  const ts = [[0.56, 0.08], [0.44, 0.08], [0.34, 0.08]]
  let y = 0.02
  for (const [w, h] of ts) {
    redent(m, w, h, 0, y, 0, 0.84)
    m.push(bx(w * 0.84 + 0.01, 0.008, w * 0.84 + 0.01, 0, y + h - 0.008, 0))
    for (const [dx, dz] of dirs) d.push(bx(dx ? 0.003 : 0.04, h * 0.9, dx ? 0.04 : 0.003, dx * (w / 2 + 0.0015), y, dz * (w / 2 + 0.0015)))
    y += h
  }
  prang(m, d, 0, 0, y, 0.095, V * 1.0 - y)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) prang(m, d, sx * 0.36, sz * 0.36, 0.02, 0.045, 0.42, 8, 6)
  for (const [dx, dz] of dirs) {
    const x = dx * 0.37, z = dz * 0.37
    m.push(bx(0.08, 0.07, 0.08, x, 0.02, z))
    d.push(bx(dx ? 0.003 : 0.035, 0.05, dx ? 0.035 : 0.003, x + dx * 0.0415, 0.02, z + dz * 0.0415))
    prasatSpire(m, x, z, 0.09, 0.04, 0.22)
  }
  done(k, m, d)
}

function kumhrar(k: Kit) {
  // Mauryan audience hall of 80 polished sandstone pillars (10 x 8, 4.6 m apart) under a wooden roof, wooden platforms to the south
  const m: G[] = [], d: G[] = []
  const nx = 10, nz = 8, sp = 0.046, w = (nx - 1) * sp, dd = (nz - 1) * sp
  m.push(bx(w + 0.08, 0.02, dd + 0.08, 0, 0, -0.08))
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) m.push(cyl(0.008, 0.006, 0.17, -w / 2 + i * sp, 0.02, -0.08 - dd / 2 + j * sp, 8))
  const roof = lathe([[1, 0], [1, 0.06], [0.62, 0.6], [0.5, 0.6], [0.45, 0.9], [0, 1]], 4, 1, 0.1, Math.PI / 4)
  roof.scale((w + 0.04) / SQ2, 1, (dd + 0.04) / SQ2)
  d.push(at(roof, 0, 0.19, -0.08))
  // timber platform and steps down to the canal on the south
  d.push(bx(0.18, 0.015, 0.22, 0, 0, 0.26))
  stairs(d, 0, 1, 0.37, 0.08, 0.015, 0.18, 0, 3)
  m.push(bx(0.5, 0.004, 0.06, 0, 0, 0.48))
  done(k, m, d)
}

function marinaBay(k: Kit) {
  // three 55-storey towers of two leaning legs each, joined by the 340 m SkyPark that cantilevers 67 m past the north tower
  const em: G[] = [], m: G[] = [], d: G[] = []
  const H = 0.82
  const leg = new THREE.Shape()
  leg.moveTo(0.06, 0); leg.lineTo(0.06, H); leg.lineTo(-0.05, H)
  leg.quadraticCurveTo(-0.08, H * 0.45, -0.13, 0)
  leg.lineTo(-0.075, 0)
  leg.quadraticCurveTo(-0.035, H * 0.25, -0.01, H * 0.42)
  leg.lineTo(0.015, 0); leg.closePath()
  for (const z of [-0.3, 0, 0.3]) {
    const g = new THREE.ExtrudeGeometry(leg, { depth: 0.075, bevelEnabled: false, curveSegments: 8 })
    em.push(at(g, 0.05, 0, z - 0.0375))
  }
  const park = new THREE.Shape()
  park.moveTo(-0.07, -0.42); park.lineTo(0.07, -0.42); park.lineTo(0.07, 0.5); park.quadraticCurveTo(0.06, 0.6, 0.0, 0.62)
  park.quadraticCurveTo(-0.06, 0.6, -0.07, 0.5); park.closePath()
  const pg = new THREE.ExtrudeGeometry(park, { depth: 0.03, bevelEnabled: false, curveSegments: 6 })
  pg.rotateX(-Math.PI / 2)
  em.push(at(pg, 0.01, H, 0))
  d.push(bx(0.08, 0.006, 0.6, 0.01, H + 0.03, -0.08))
  // podium of the shoppes, theatres and casino on the bay side
  m.push(bx(0.2, 0.05, 0.86, -0.3, 0, 0.0), bx(0.2, 0.025, 0.86, -0.12, 0, 0.0))
  for (let i = 0; i < 5; i++) d.push(bx(0.16, 0.012, 0.03, -0.3, 0.05, -0.36 + i * 0.18))
  done(k, m, d, em)
}

export const batch_c: Record<string, Builder> = {
  bayon,
  'wat-mahathat-sukhothai': watMahathatSukhothai,
  'wat-ratchaburana': watRatchaburana,
  'wat-phra-si-sanphet': watPhraSiSanphet,
  virupaksha,
  ruwanwelisaya,
  shwezigon,
  borobudur,
  'phra-pathom': phraPathom,
  hariphunchai,
  'chedi-luang': chediLuang,
  'grand-palace': grandPalace,
  'wat-arun': watArun,
  kumhrar,
  'marina-bay': marinaBay,
}
