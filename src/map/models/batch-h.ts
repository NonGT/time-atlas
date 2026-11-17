import * as THREE from 'three'
import { gable, merge, staged, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
type M = THREE.Material
const PI = Math.PI

const at = <T extends G>(g: T, x: number, y: number, z: number) => { g.translate(x, y, z); return g }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z)
const cyl = (r: number, h: number, x: number, y: number, z: number, n = 8, rt = r, open = false) =>
  at(new THREE.CylinderGeometry(rt, r, h, n, 1, open), x, y + h / 2, z)
/** Box whose top face is scaled by f, so it tapers (f < 1) or flares (f > 1). */
function taper(w: number, h: number, d: number, f: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f) }
  g.computeVertexNormals()
  return at(g, x, y + h / 2, z)
}
const lathe = (pts: number[][], seg: number, sr: number, sh: number) =>
  new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)), seg)
/** Box of length l along direction a (radians, from +x towards +z). */
const along = (l: number, h: number, d: number, a: number, x: number, y: number, z: number) =>
  at(new THREE.BoxGeometry(l, h, d).rotateY(-a), x, y + h / 2, z)
const rnd = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }

/** Weathered sandstone lump: a tapering block under a rounded cap. */
function rock(b: Bag, m: M, x: number, z: number, w: number, h: number, d: number, seed: number, y = 0, rot = 0) {
  const a = rot + (rnd(seed) - 0.5) * 0.5, c = Math.min(h * 0.3, w * 0.22), body = h - c
  b.put(m, at(taper(w, body, d, 0.86, 0, 0, 0).rotateY(a), x, y, z))
  const cap = new THREE.SphereGeometry(0.5, 6, 3, 0, PI * 2, 0, PI / 2).scale(w * 0.86, c * 2, d * 0.86).rotateY(a)
  b.put(m, at(cap, x, y + body - 0.002, z))
}

const tint = (k: Kit, f: number, to: string, t: number) => {
  const c = (k.mat as THREE.MeshLambertMaterial).clone()
  c.color.lerp(new THREE.Color(to), t).multiplyScalar(f)
  c.emissive.multiplyScalar(f)
  return c
}

/** Collects geometry per material, then merges each set, optionally shifted and turned as a whole. */
class Bag {
  private m = new Map<M, G[]>()
  constructor(private k: Kit) {}
  put(mat: M, ...g: G[]) { const a = this.m.get(mat); if (a) a.push(...g); else this.m.set(mat, g) }
  done(rot = 0, dx = 0, dz = 0) {
    for (const [mat, gs] of this.m) {
      const flat = gs.some(g => !g.index)
      const list = flat ? gs.map(g => (g.index ? g.toNonIndexed() : g)) : gs
      for (const g of list) { if (dx || dz) g.translate(dx, 0, dz); if (rot) g.rotateY(rot) }
      merge(this.k, list, mat)
    }
  }
}

function petra(k: Kit) {
  // Al-Khazneh, about 25 m wide and 39 m high, cut into the cliff facing the end of the Siq
  const b = new Bag(k)
  const stone = tint(k, 0.9, '#c47c66', 0.6), face = tint(k, 1.04, '#e6a88c', 0.5), sh = tint(k, 0.45, '#5e3328', 0.6)
  const rock2 = tint(k, 0.8, '#b86e5c', 0.6)
  // cliff behind, three rows deep, rising away from the facade
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) {
    const x = -0.375 + i * 0.125, edge = Math.abs(x) > 0.3 ? 0.85 : 1
    rock(b, (i + j) % 2 ? stone : rock2, x, -0.38 + j * 0.095, 0.15, (0.6 + 0.1 * (2 - j) + 0.12 * rnd(i * 7 + j)) * edge, 0.13, i * 3 + j)
  }
  // shoulders of rock standing forward on both sides, so the facade sits in a recess
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    rock(b, i % 2 ? rock2 : stone, s * (0.22 + i * 0.11), -0.07 + i * 0.01, 0.12, 0.56 + 0.1 * rnd(i * 3 + s) - i * 0.05, 0.17 - i * 0.02, 40 + i * 2 + s)
  }
  rock(b, stone, 0, -0.1, 0.36, 0.26, 0.13, 50, 0.47)
  // lower storey: six-column portico under a pediment
  b.put(face, bx(0.33, 0.02, 0.12, 0, 0, -0.07), bx(0.32, 0.22, 0.03, 0, 0.02, -0.125))
  b.put(sh, bx(0.05, 0.11, 0.004, 0, 0.02, -0.108))
  for (const x of [-0.125, -0.075, -0.025, 0.025, 0.075, 0.125]) {
    b.put(face, cyl(0.011, 0.17, x, 0.02, -0.03, 8), bx(0.026, 0.012, 0.026, x, 0.188, -0.03))
  }
  b.put(face, bx(0.32, 0.03, 0.12, 0, 0.2, -0.07))
  b.put(face, at(gable(0.024, 0.2, 0.05).rotateY(PI / 2), 0, 0.23, -0.025))
  // upper storey: round tholos with a conical roof and urn, flanked by two pavilions with broken pediments
  b.put(face, bx(0.3, 0.025, 0.08, 0, 0.23, -0.09), bx(0.3, 0.2, 0.03, 0, 0.255, -0.125))
  b.put(face, cyl(0.04, 0.14, 0, 0.255, -0.07, 12))
  for (let a = -2; a <= 2; a++) b.put(face, cyl(0.006, 0.14, Math.sin(a * 0.55) * 0.05, 0.255, -0.07 + Math.cos(a * 0.55) * 0.05, 6))
  b.put(face, at(new THREE.ConeGeometry(0.054, 0.05, 12), 0, 0.42, -0.07), cyl(0.012, 0.03, 0, 0.445, -0.07, 8, 0.006))
  for (const s of [-1, 1]) {
    const x = s * 0.118
    b.put(face, bx(0.064, 0.14, 0.045, x, 0.255, -0.095), bx(0.07, 0.02, 0.06, x, 0.395, -0.09))
    for (const c of [-0.022, 0.022]) b.put(face, cyl(0.006, 0.14, x + c, 0.255, -0.06, 6))
    b.put(face, at(gable(0.02, 0.035, 0.03).rotateY(PI / 2), x + s * 0.018, 0.415, -0.075))
    b.put(sh, bx(0.025, 0.07, 0.004, x, 0.27, -0.072))
  }
  // the Siq: a narrow winding slot between tall rock walls, opening opposite the facade
  const path = [[0.04, 0.1], [0.08, 0.26], [0.2, 0.36], [0.4, 0.42]]
  let n = 0
  for (let p = 0; p < path.length - 1; p++) {
    const [x0, z0] = path[p], [x1, z1] = path[p + 1], dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz)
    const a = Math.atan2(dz, dx), nx = -dz / L, nz = dx / L, parts = Math.ceil(L / 0.07)
    for (let q = 0; q < parts; q++) for (const s of [-1, 1]) {
      const t = (q + 0.5) / parts, x = x0 + dx * t + s * nx * 0.085, z = z0 + dz * t + s * nz * 0.085
      const h = 0.16 + p * 0.07 + 0.08 * rnd(n++)
      rock(b, n % 2 ? stone : rock2, x, z, L / parts + 0.04, h, 0.12, n + 60, 0, -a)
    }
  }
  // rock round the open plaza
  for (const [x, z, w, h] of [[-0.36, 0.1, 0.2, 0.34], [-0.26, 0.28, 0.18, 0.22], [0.32, 0.12, 0.2, 0.36]])
    rock(b, stone, x, z, w, h, w * 0.9, x * 100)
  b.done(PI / 4)
}

// 27 BC: an earthquake broke off the upper half of the colossus just south of the door
// (turned a little towards the south from its true east-facing front so the colossi read from the default view)
const abuSimbel = staged([-27], (k, year) => {
  // great temple front 35 m wide and 30 m high with four 20 m seated Ramesses II; Nefertari's temple to the north
  const b = new Bag(k)
  const stone = tint(k, 1.02, '#e4c08c', 0.55), hill = tint(k, 0.86, '#c99a66', 0.55), sh = tint(k, 0.45, '#5c4024', 0.6)
  // the temples are cut into the front of rounded hills, a cut-back flat face either side of each facade
  const hillAt = (x: number, rx: number, h: number, rz: number) => {
    b.put(hill, at(new THREE.SphereGeometry(1, 16, 6, PI, PI, 0, PI / 2).scale(rx, h, rz), x, 0, 0.02))
    b.put(hill, at(new THREE.CircleGeometry(1, 16, 0, PI).scale(rx, h, 1), x, 0, 0.02))
  }
  hillAt(0, 0.4, 0.5, 0.42)
  hillAt(0.43, 0.2, 0.27, 0.26)
  b.put(stone, bx(0.56, 0.42, 0.04, 0, 0, 0.04), bx(0.56, 0.025, 0.025, 0, 0.415, 0.05))
  for (let i = 0; i < 20; i++) b.put(stone, bx(0.014, 0.02, 0.014, -0.266 + i * 0.028, 0.44, 0.055))
  b.put(sh, bx(0.05, 0.12, 0.004, 0, 0.025, 0.061), bx(0.045, 0.065, 0.004, 0, 0.2, 0.061))
  b.put(stone, bx(0.022, 0.055, 0.012, 0, 0.2, 0.066))
  b.put(stone, bx(0.54, 0.025, 0.15, 0, 0, 0.125))
  const fallen = year >= -27
  for (const x of [-0.19, -0.07, 0.07, 0.19]) {
    const y0 = 0.025
    b.put(stone, bx(0.105, 0.13, 0.1, x, y0, 0.11), bx(0.08, 0.11, 0.035, x, y0, 0.175), bx(0.088, 0.032, 0.125, x, y0 + 0.108, 0.128))
    if (fallen && x === -0.07) {
      // the head and torso lie where they fell, at its feet
      b.put(stone, at(taper(0.065, 0.05, 0.05, 0.75, 0, 0, 0).rotateZ(PI / 2).rotateY(0.4), x + 0.01, y0 + 0.032, 0.25))
      b.put(stone, at(new THREE.BoxGeometry(0.08, 0.045, 0.1).rotateY(-0.3), x - 0.05, y0 + 0.022, 0.26))
      continue
    }
    b.put(stone, taper(0.06, 0.09, 0.05, 1.35, x, y0 + 0.14, 0.09))
    b.put(stone, taper(0.068, 0.055, 0.05, 0.72, x, y0 + 0.215, 0.09), bx(0.034, 0.04, 0.016, x, y0 + 0.228, 0.118))
    b.put(stone, bx(0.01, 0.025, 0.01, x, y0 + 0.205, 0.124))
    b.put(stone, cyl(0.019, 0.045, x, y0 + 0.268, 0.09, 8, 0.012), cyl(0.008, 0.014, x, y0 + 0.313, 0.09, 6, 0.005))
  }
  // small temple of Hathor and Nefertari: six standing statues between sloping buttresses
  const cx = 0.43
  b.put(stone, bx(0.25, 0.2, 0.03, cx, 0, 0.045))
  for (let i = -3; i <= 3; i++) {
    const x = cx + i * 0.035
    if (i) b.put(stone, taper(0.018, 0.21, 0.035, 0.75, x, 0, 0.07))
    else b.put(sh, bx(0.02, 0.07, 0.004, x, 0, 0.061))
  }
  for (const x of [-0.0875, -0.0525, -0.0175, 0.0175, 0.0525, 0.0875]) {
    const X = cx + x
    b.put(stone, bx(0.017, 0.125, 0.016, X, 0.005, 0.072), bx(0.013, 0.02, 0.016, X, 0.13, 0.072), cyl(0.006, 0.026, X, 0.15, 0.072, 6, 0.004))
  }
  b.done(PI / 3, -0.12, 0)
})

function lalibela(k: Kit) {
  // Bete Giyorgis: 12 x 12 m Greek cross, 12 m deep, cut down into the rock with its roof level with the ground
  const b = new Bag(k)
  const rock = tint(k, 0.85, '#a8705a', 0.6), ch = tint(k, 1, '#c08c70', 0.55), sh = tint(k, 0.4, '#4a2a20', 0.6)
  const H = 0.27, P = 0.3
  // rock shelf around the pit, with a stepped trench coming in from the west
  b.put(rock, bx(1, H, 0.5 - P, 0, 0, -(0.5 + P) / 2), bx(1, H, 0.5 - P, 0, 0, (0.5 + P) / 2))
  b.put(rock, bx(0.5 - P, H, 2 * P, (0.5 + P) / 2, 0, 0))
  b.put(rock, bx(0.5 - P, H, P + 0.12, -(0.5 + P) / 2, 0, (0.12 - P) / 2), bx(0.5 - P, H, P - 0.2, -(0.5 + P) / 2, 0, (0.2 + P) / 2))
  for (let i = 0; i < 4; i++) b.put(rock, bx(0.05, (H * (4 - i)) / 5, 0.08, -0.475 + i * 0.05, 0, 0.16))
  b.put(sh, bx(2 * P, 0.004, 2 * P, 0, 0, 0))
  // stepped plinth then the cross, its roof carved with three nested crosses
  const cross = (s: number, a: number, h: number, y: number, m: M) => b.put(m, bx(s, h, a, 0, y, 0), bx(a, h, s, 0, y, 0))
  cross(0.44, 0.17, 0.015, 0, ch); cross(0.42, 0.155, 0.015, 0.015, ch); cross(0.4, 0.14, 0.015, 0.03, ch)
  cross(0.38, 0.13, H - 0.045, 0.045, ch)
  cross(0.32, 0.09, 0.008, H, ch); cross(0.25, 0.055, 0.008, H + 0.008, ch); cross(0.16, 0.022, 0.008, H + 0.016, ch)
  // windows: an ornate upper row and a blind lower row on every arm face
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ex = dx * 0.191, ez = dz * 0.191
    for (const t of [-0.035, 0.035]) {
      const px = ex + (dz ? t : 0), pz = ez + (dx ? t : 0)
      b.put(sh, bx(dx ? 0.004 : 0.02, 0.045, dx ? 0.02 : 0.004, px, 0.165, pz))
      b.put(sh, bx(dx ? 0.004 : 0.016, 0.03, dx ? 0.016 : 0.004, px, 0.075, pz))
    }
    // the side faces of each arm
    for (const s of [-1, 1]) {
      const px = dx * 0.125 + (dz ? s * 0.066 : 0), pz = dz * 0.125 + (dx ? s * 0.066 : 0)
      b.put(sh, bx(dz ? 0.004 : 0.02, 0.045, dz ? 0.02 : 0.004, px, 0.165, pz))
    }
  }
  b.put(sh, bx(0.004, 0.08, 0.04, -0.191, 0.045, 0))
  b.done()
}

function djenne(k: Kit) {
  // Great Mosque, 1907 rebuild: 75 x 75 m on a 3 m platform, qibla wall to the east with three towers
  const b = new Bag(k)
  const mud = tint(k, 0.85, '#a8703f', 0.75), wood = tint(k, 0.55, '#6b4a2a', 0.6), sh = tint(k, 0.45, '#4f321c', 0.6)
  const egg = new THREE.MeshLambertMaterial({ color: '#f2ead8', emissive: '#3a362c' })
  b.put(mud, bx(0.96, 0.035, 0.96, 0, 0, 0))
  for (const s of [-1, 1]) b.put(mud, taper(0.12, 0.035, 0.1, 0.6, 0, 0, s * 0.52), bx(0.07, 0.02, 0.06, 0.3, 0, s * 0.51))
  const y = 0.035, H = 0.16, t = 0.035, W = 0.82
  // roofed prayer hall on the east, courtyard on the west
  b.put(mud, bx(0.42, H, W, 0.2, y, 0))
  for (const s of [-1, 1]) b.put(mud, bx(W - 0.42, H * 0.9, t, -0.2, y, s * (W - t) / 2))
  b.put(mud, bx(t, H * 0.9, W - 2 * t, -(W - t) / 2, y, 0))
  b.put(sh, bx(W - 0.42 - t, 0.003, W - 2 * t, -0.2 - t / 2 + 0.0, y, 0))
  // buttresses with pinnacles rising above the parapet all round
  const pinnacle = (x: number, z: number, h: number, w: number) => {
    b.put(mud, taper(w, h, w, 0.75, x, y, z), at(new THREE.ConeGeometry(w * 0.45, 0.03, 4).rotateY(PI / 4), x, y + h + 0.015, z))
  }
  for (let i = 0; i <= 10; i++) {
    const p = -W / 2 + (i * W) / 10
    for (const s of [-1, 1]) pinnacle(p, s * (W / 2 + 0.008), H + 0.035, 0.03)
    pinnacle(-W / 2 - 0.008, p, H * 0.9 + 0.035, 0.03)
  }
  // east facade: three tall tower massifs, the middle one tallest, with pinnacles and ostrich eggs on top
  const ex = W / 2 + 0.01
  for (const [z, h] of [[-0.27, 0.36], [0, 0.44], [0.27, 0.36]]) {
    b.put(mud, taper(0.11, h, 0.13, 0.6, ex + 0.02, y, z))
    for (const dz of [-0.028, 0, 0.028]) {
      const ph = dz ? 0.035 : 0.05
      b.put(mud, at(new THREE.ConeGeometry(0.012, ph, 4).rotateY(PI / 4), ex + 0.02, y + h + ph / 2, z + dz * 0.75))
      b.put(egg, at(new THREE.SphereGeometry(0.007, 6, 4), ex + 0.02, y + h + ph + 0.004, z + dz * 0.75))
    }
    // rows of protruding palm sticks (toron) used as scaffolding for the yearly replastering
    for (let r = 0; r < 4; r++) {
      const yy = y + 0.05 + r * (h - 0.08) / 4, f = 1 - (0.4 * (yy - y)) / h
      for (const q of [-1.5, -0.5, 0.5, 1.5]) b.put(wood, bx(0.03, 0.004, 0.004, ex + 0.02 + 0.055 * f + 0.01, yy, z + q * 0.025 * f))
      for (const s of [-1, 1]) b.put(wood, bx(0.004, 0.004, 0.03, ex + 0.02, yy, z + s * (0.06 * f + 0.01)))
    }
  }
  for (const z of [-0.135, 0.135]) pinnacle(ex, z, H + 0.06, 0.04)
  for (let i = 0; i < 12; i++) for (const r of [0, 1]) {
    const p = -W / 2 + 0.04 + i * (W - 0.08) / 11, yy = y + 0.05 + r * 0.06
    b.put(wood, bx(0.004, 0.004, 0.028, p, yy, W / 2 + 0.014), bx(0.028, 0.004, 0.004, -W / 2 - 0.014, yy, p))
  }
  for (const z of [-0.08, 0.08]) b.put(sh, bx(0.004, 0.05, 0.025, ex - 0.012, y, z))
  b.done()
}

function aitBenhaddou(k: Kit) {
  // fortified earthen village climbing a hill above the Ounila river (the map draws the river), the communal granary on the summit
  const b = new Bag(k)
  const mud = tint(k, 0.95, '#c08a5a', 0.55), hillM = tint(k, 0.75, '#8c6a4c', 0.55), sh = tint(k, 0.42, '#4e301c', 0.6)
  const prof = [[0.48, 0], [0.42, 0.03], [0.34, 0.08], [0.26, 0.15], [0.18, 0.22], [0.11, 0.28], [0.05, 0.32], [0, 0.33]]
  const hAt = (r: number) => {
    if (r >= prof[0][0]) return 0
    for (let i = 1; i < prof.length; i++) if (r >= prof[i][0]) {
      const [r0, h0] = prof[i - 1], [r1, h1] = prof[i]
      return h1 + ((h0 - h1) * (r - r1)) / (r0 - r1)
    }
    return prof[prof.length - 1][1]
  }
  const hx = -0.06, hz = -0.06
  b.put(hillM, at(lathe(prof, 14, 1, 1), hx, 0, hz))
  // granary ruin on top
  for (const s of [-1, 1]) b.put(mud, bx(0.1, 0.05, 0.015, hx, 0.3, hz + s * 0.035), bx(0.015, 0.05, 0.07, hx + s * 0.045, 0.3, hz))
  const house = (r: number, a: number, w: number, h: number, i: number) => {
    const x = hx + r * Math.cos(a), z = hz + r * Math.sin(a), lo = hAt(r + w * 0.6), hi = hAt(Math.max(0, r - w * 0.6))
    b.put(mud, at(new THREE.BoxGeometry(w, hi - lo + h, w * (0.8 + 0.4 * rnd(i))).rotateY(-a + 0.3 * rnd(i + 9)), x, (lo + hi + h) / 2, z))
    return [x, z, lo, hi + h] as const
  }
  let i = 0
  for (const [r, n, a0, a1] of [[0.16, 6, -0.6, 2.4], [0.24, 8, -0.9, 2.9], [0.32, 10, -1.1, 3.0], [0.4, 11, -1.2, 3.2]]) {
    for (let j = 0; j < n; j++) {
      const a = a0 + ((j + 0.5 * rnd(i)) * (a1 - a0)) / n
      house(r + 0.02 * (rnd(i + 3) - 0.5), a, 0.055 + 0.02 * rnd(i + 5), 0.035 + 0.025 * rnd(i + 7), i)
      i++
    }
  }
  // tower kasbahs: square blocks with tapering corner towers, crenellated tops and slit windows
  for (const [r, a, w] of [[0.44, 0.3, 0.11], [0.43, 1.2, 0.1], [0.36, 2.2, 0.1], [0.42, -0.6, 0.09], [0.28, 0.8, 0.09]]) {
    const [x, z, lo, top] = house(r, a, w, 0.07, i++)
    const th = top - lo + 0.05
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = x + sx * w * 0.48, tz = z + sz * w * 0.48
      b.put(mud, taper(0.034, th, 0.034, 0.8, tx, lo, tz))
      for (const [mx, mz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.put(mud, bx(0.007, 0.012, 0.007, tx + mx * 0.0095, lo + th, tz + mz * 0.0095))
      b.put(sh, bx(0.008, 0.02, 0.003, tx, top - 0.02, tz + 0.0145), bx(0.003, 0.02, 0.008, tx + 0.0145, top - 0.02, tz))
    }
  }
  b.done()
}

// 2015: the Temple of Bel and the Monumental Arch blown up
const palmyra = staged([2015], (k, year) => {
  // Temple of Bel in its 205 m walled court at the east end of the colonnaded street; theatre, tetrapylon and tower tombs
  // (all much closer together than in reality)
  const b = new Bag(k)
  const stone = tint(k, 1.04, '#e6c48c', 0.55), sh = tint(k, 0.45, '#5c4426', 0.6)
  const lost = year >= 2015
  const col = (x: number, z: number, h: number, r = 0.0065) => b.put(stone, cyl(r, h, x, 0.006, z, 6, r, true), bx(r * 2.6, 0.006, r * 2.6, x, 0.006 + h, z))
  const rubble = (x: number, z: number, s: number, n: number, seed: number) => {
    for (let i = 0; i < n; i++) {
      const a = rnd(seed + i) * PI * 2, r = s * Math.sqrt(rnd(seed + i + 50))
      const w = s * (0.25 + 0.3 * rnd(seed + i + 90))
      b.put(stone, at(taper(w, w * 0.5, w * 0.8, 0.7, 0, 0, 0).rotateY(a), x + Math.cos(a) * r, 0.004, z + Math.sin(a) * r * 1.4))
    }
  }
  // sanctuary court: high wall with the propylon on the west side
  const cx = 0.3, cz = 0.05, S = 0.46
  for (const s of [-1, 1]) b.put(stone, bx(S, 0.05, 0.015, cx, 0, cz + s * S / 2), bx(0.015, 0.05, S, cx + s * S / 2, 0, cz))
  b.put(stone, bx(0.04, 0.075, 0.12, cx - S / 2, 0, cz))
  b.put(sh, bx(0.004, 0.045, 0.03, cx - S / 2 - 0.021, 0, cz))
  for (let i = 0; i < 12; i++) col(cx - S / 2 + 0.03, cz - 0.18 + i * 0.0327, 0.055)
  b.put(stone, bx(S, 0.004, S, cx, 0, cz))
  // cella with its long side facing west, crenellated, inside a mostly fallen peristyle
  const W = 0.075, L = 0.17
  b.put(stone, bx(W + 0.07, 0.008, L + 0.08, cx, 0.004, cz))
  if (!lost) {
    b.put(stone, bx(W, 0.11, L, cx, 0.012, cz), bx(W + 0.01, 0.01, L + 0.01, cx, 0.122, cz))
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) b.put(stone, at(new THREE.ConeGeometry(0.006, 0.014, 4).rotateY(PI / 4), cx + s * W / 2, 0.139, cz - L / 2 + 0.01 + i * (L - 0.02) / 8))
    b.put(sh, bx(0.004, 0.06, 0.03, cx - W / 2 - 0.002, 0.012, cz + 0.02))
    for (const x of [-0.008, 0.008]) b.put(stone, bx(0.012, 0.11, 0.008, cx - W / 2 - 0.006, 0.012, cz + 0.02 + x * 3))
    for (let i = 0; i < 9; i++) if (i < 2 || i > 4) col(cx - W / 2 - 0.028, cz - L / 2 + i * L / 8, 0.12, 0.008)
    for (const i of [0, 3, 8]) col(cx + W / 2 + 0.028, cz - L / 2 + i * L / 8, 0.12, 0.008)
  } else {
    // only the gateway of the cella was left standing
    rubble(cx, cz, 0.085, 26, 11)
    b.put(stone, bx(0.014, 0.11, 0.012, cx - W / 2, 0.012, cz - 0.003), bx(0.014, 0.11, 0.012, cx - W / 2, 0.012, cz + 0.043), bx(0.014, 0.018, 0.058, cx - W / 2, 0.122, cz + 0.02))
  }
  // Great Colonnade running north-west from the arch, with gaps where columns have fallen
  const ax = 0.0, az = 0.02, a = PI + 0.42, ux = Math.cos(a), uz = Math.sin(a), half = 0.028
  for (let i = 0; i < 19; i++) {
    const t = 0.05 + i * 0.033
    for (const s of [-1, 1]) {
      if ((i * 7 + s * 3 + 10) % 9 === 0) continue
      col(ax + ux * t - uz * half * s, az + uz * t + ux * half * s, 0.07)
    }
  }
  for (const [t0, t1] of [[0.04, 0.22], [0.33, 0.45], [0.53, 0.66]]) for (const s of [-1, 1]) {
    const m = (t0 + t1) / 2
    b.put(stone, along(t1 - t0, 0.01, 0.018, a, ax + ux * m - uz * half * s, 0.082, az + uz * m + ux * half * s))
  }
  // tetrapylon: four plinths of four columns each
  const tt = 0.36, tx = ax + ux * tt, tz = az + uz * tt
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = tx + sx * 0.022, pz = tz + sz * 0.022
    b.put(stone, bx(0.026, 0.02, 0.026, px, 0, pz))
    for (const qx of [-1, 1]) for (const qz of [-1, 1]) b.put(stone, cyl(0.0035, 0.06, px + qx * 0.008, 0.02, pz + qz * 0.008, 5))
    b.put(stone, bx(0.03, 0.008, 0.03, px, 0.08, pz))
  }
  // Monumental Arch: three openings, set at an angle to turn the street towards the temple
  if (!lost) {
    const s = new THREE.Shape()
    s.moveTo(-0.055, 0); s.lineTo(0.055, 0); s.lineTo(0.055, 0.09); s.lineTo(-0.055, 0.09); s.closePath()
    for (const [c, w, h] of [[0, 0.018, 0.06], [-0.036, 0.009, 0.035], [0.036, 0.009, 0.035]]) {
      const p = new THREE.Path()
      p.moveTo(c - w, 0); p.lineTo(c + w, 0); p.lineTo(c + w, h); p.absarc(c, h, w, 0, PI, false); p.lineTo(c - w, 0)
      s.holes.push(p)
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false, curveSegments: 4 })
    g.translate(0, 0, -0.011); g.rotateY(PI / 2 - (a - PI) / 2 + 0.2)
    b.put(stone, at(g, ax + 0.01, 0, az + 0.01))
  } else {
    rubble(ax + 0.01, az + 0.01, 0.035, 10, 70)
    b.put(stone, bx(0.018, 0.05, 0.02, ax + 0.01, 0, az + 0.05))
  }
  // theatre south of the street, its seating opening north-east to the stage
  const th = new THREE.LatheGeometry([[0.025, 0], [0.03, 0.006], [0.085, 0.045], [0.092, 0.045], [0.092, 0]].map(([r, h]) => new THREE.Vector2(r, h)), 10, -PI / 2, PI)
  const seats = stone.clone()
  seats.side = THREE.DoubleSide
  b.put(seats, at(th, -0.2, 0, 0.2))
  b.put(stone, bx(0.17, 0.05, 0.018, -0.2, 0, 0.2 - 0.03))
  // tower tombs in the valley to the west
  for (const [x, z, h] of [[-0.5, 0.25, 0.15], [-0.43, 0.36, 0.12], [-0.55, 0.42, 0.13], [-0.37, 0.46, 0.1]]) {
    b.put(stone, bx(0.05, 0.02, 0.05, x, 0, z), taper(0.04, h, 0.04, 0.9, x, 0.02, z))
    b.put(sh, bx(0.012, 0.025, 0.003, x, 0.06, z + 0.0185))
  }
  b.done()
})

const s3 = (w: number) => w / 2 - 0.07

// 1170: an earthquake brought down the Temple of Jupiter and wrecked the rest; the site became an Arab citadel
const baalbek = staged([1170], (k, year) => {
  // Temple of Jupiter 48 x 88 m, columns about 20 m, on the raised acropolis; Temple of Bacchus 35 x 66 m to the south
  const b = new Bag(k)
  const stone = tint(k, 1.04, '#e8d2a8', 0.55), sh = tint(k, 0.45, '#5e4a30', 0.6), roof = tint(k, 0.7, '#a0705a', 0.5)
  const ruin = year >= 1170
  const C = 0.15
  const column = (x: number, y: number, z: number, h: number, r: number) => {
    b.put(stone, cyl(r, h, x, y, z, 6, r * 0.88, h >= C * 0.8))
    if (h >= C * 0.8) b.put(stone, bx(r * 2.8, 0.01, r * 2.8, x, y + h - 0.004, z))
  }
  // acropolis platform with the Trilithon course along the west side
  b.put(stone, bx(0.95, 0.04, 0.44, -0.04, 0, -0.14))
  b.put(sh, bx(0.004, 0.012, 0.24, -0.517, 0.016, -0.14))
  // Jupiter
  const jx = -0.3, jz = -0.14, JL = 0.4, JW = 0.22, jy = 0.07
  b.put(stone, bx(JL + 0.02, jy - 0.04, JW + 0.02, jx, 0.04, jz))
  b.put(stone, at(new THREE.BoxGeometry(0.06, 0.028, 0.14).translate(0, 0.014, 0), jx + JL / 2 + 0.03, 0.04, jz))
  const jr = 0.0105
  for (let i = 0; i < 19; i++) for (const s of [-1, 1]) {
    const x = jx - JL / 2 + 0.01 + (i * (JL - 0.02)) / 18, z = jz + s * (JW / 2 - 0.01)
    if (!ruin) column(x, jy, z, C, jr)
    else if (s > 0 && i >= 4 && i <= 9) column(x, jy, z, C, jr)
    else if (rnd(i * 2 + s) < 0.55) column(x, jy, z, C * (0.06 + 0.12 * rnd(i + s * 30)), jr)
  }
  for (let i = 1; i < 9; i++) for (const s of [-1, 1]) {
    const x = jx + s * (JL / 2 - 0.01), z = jz - JW / 2 + 0.01 + (i * (JW - 0.02)) / 9
    if (!ruin) column(x, jy, z, C, jr)
    else if (rnd(i * 5 + s) < 0.4) column(x, jy, z, C * 0.08, jr)
  }
  if (!ruin) {
    b.put(sh, bx(JL - 0.08, C, JW - 0.07, jx - 0.02, jy, jz))
    b.put(stone, bx(JL, 0.03, JW, jx, jy + C, jz))
    b.put(roof, at(gable(JL, JW, 0.05), jx, jy + C + 0.03, jz))
    for (const s of [-1, 1]) b.put(stone, at(gable(0.006, JW, 0.05), jx + s * JL / 2, jy + C + 0.03, jz))
  } else {
    // the six columns on the south side still carry their entablature
    const x0 = jx - JL / 2 + 0.01 + (4 * (JL - 0.02)) / 18, x1 = jx - JL / 2 + 0.01 + (9 * (JL - 0.02)) / 18
    b.put(stone, bx(x1 - x0 + 0.03, 0.03, 0.026, (x0 + x1) / 2, jy + C, jz + JW / 2 - 0.01))
    // fallen drums on the platform and below it
    for (let i = 0; i < 8; i++) {
      const g = new THREE.CylinderGeometry(jr, jr, 0.03, 8).rotateZ(PI / 2).rotateY(rnd(i + 70) * PI)
      b.put(stone, at(g, jx - 0.15 + rnd(i + 80) * 0.3, i < 5 ? jy + jr : 0.04 + jr, i < 5 ? jz + (rnd(i + 90) - 0.5) * 0.12 : jz + JW / 2 + 0.04 + rnd(i) * 0.03))
    }
  }
  // Great Court with porticoes on three sides and two altars, then the hexagonal forecourt and the propylaea
  const gx = 0.06, GL = 0.3, gz = -0.14, GW = 0.36, wh = ruin ? 0.025 : 0.05
  for (const s of [-1, 1]) b.put(stone, bx(GL, wh, 0.03, gx, 0.04, gz + s * (GW / 2 - 0.015)))
  b.put(stone, bx(0.03, wh, 0.14, gx + GL / 2 - 0.015, 0.04, gz + s3(GW)), bx(0.03, wh, 0.14, gx + GL / 2 - 0.015, 0.04, gz - s3(GW)))
  b.put(stone, bx(0.04, ruin ? 0.03 : 0.06, 0.04, gx - 0.07, 0.04, gz), bx(0.02, 0.02, 0.02, gx + 0.02, 0.04, gz))
  b.put(sh, bx(0.05, 0.003, 0.02, gx + 0.04, 0.04, gz - 0.09), bx(0.05, 0.003, 0.02, gx + 0.04, 0.04, gz + 0.09))
  const hx = 0.29, hr = 0.08
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * PI * 2 + PI / 6, m = t + PI / 6
    if (i === 2 || i === 5) continue
    b.put(stone, along(hr, wh, 0.025, m + PI / 2, hx + Math.cos(m) * hr * 0.87, 0.04, gz + Math.sin(m) * hr * 0.87))
  }
  b.put(stone, bx(0.05, 0.04, 0.3, 0.405, 0, gz))
  for (const s of [-1, 1]) b.put(stone, bx(0.07, ruin ? 0.1 : 0.12, 0.07, 0.405, 0.04, gz + s * 0.14))
  if (!ruin) {
    for (let i = 0; i < 6; i++) column(0.425, 0.04, gz - 0.09 + i * 0.036, 0.1, 0.0065)
    b.put(stone, bx(0.03, 0.02, 0.22, 0.425, 0.14, gz))
  }
  // Bacchus, lower and to the south
  const bxc = -0.2, bzc = 0.24, BL = 0.3, BW = 0.16, by = 0.035, BC = 0.12, br = 0.0075
  b.put(stone, bx(BL + 0.02, by, BW + 0.02, bxc, 0, bzc))
  b.put(stone, at(new THREE.BoxGeometry(0.05, by, 0.1).translate(0, by / 2, 0), bxc + BL / 2 + 0.035, 0, bzc))
  for (let i = 0; i < 15; i++) for (const s of [-1, 1]) {
    const x = bxc - BL / 2 + 0.01 + (i * (BL - 0.02)) / 14
    if (ruin && s < 0 && (i < 3 || i > 6)) continue
    column(x, by, bzc + s * (BW / 2 - 0.01), BC, br)
  }
  for (let i = 1; i < 7; i++) for (const s of [-1, 1]) {
    if (ruin && s > 0) continue
    column(bxc + s * (BL / 2 - 0.01), by, bzc - BW / 2 + 0.01 + (i * (BW - 0.02)) / 7, BC, br)
  }
  const cw = BW - 0.06, cl = BL - 0.1
  if (!ruin) {
    b.put(stone, bx(cl, BC, cw, bxc - 0.02, by, bzc), bx(BL, 0.025, BW, bxc, by + BC, bzc))
    b.put(roof, at(gable(BL, BW, 0.04), bxc, by + BC + 0.025, bzc))
    for (const s of [-1, 1]) b.put(stone, at(gable(0.006, BW, 0.04), bxc + s * BL / 2, by + BC + 0.025, bzc))
  } else {
    // roofless cella, walls standing, and the entablature along the surviving rows
    for (const s of [-1, 1]) b.put(stone, bx(cl, BC, 0.012, bxc - 0.02, by, bzc + s * (cw / 2 - 0.006)))
    b.put(stone, bx(0.012, BC, cw, bxc - 0.02 - cl / 2 + 0.006, by, bzc), bx(0.012, BC, cw, bxc - 0.02 + cl / 2 - 0.006, by, bzc))
    b.put(sh, bx(0.012, 0.07, 0.03, bxc - 0.02 + cl / 2 - 0.002, by, bzc), bx(cl - 0.02, 0.003, cw - 0.02, bxc - 0.02, by, bzc))
    b.put(stone, bx(BL, 0.025, 0.026, bxc, by + BC, bzc + BW / 2 - 0.01), bx(0.026, 0.025, BW, bxc - BL / 2 + 0.01, by + BC, bzc))
    // the Arab citadel's towers
    for (const [x, z] of [[-0.48, 0.0], [0.1, 0.13]]) b.put(stone, bx(0.07, 0.11, 0.07, x, 0, z))
  }
  b.done()
})

function naqshEJahan(k: Kit) {
  // the maidan, 160 x 560 m inside two-storey arcades; Shah Mosque at the south end turned towards Mecca,
  // Sheikh Lotfollah on the east side, Ali Qapu facing it on the west, Qeysarie gate to the north
  const b = new Bag(k)
  const brick = tint(k, 1, '#dcc49c', 0.55), sh = tint(k, 0.42, '#4a3a26', 0.6)
  const tile = new THREE.MeshLambertMaterial({ color: '#4f97c0', emissive: '#10283a' })
  const turq = new THREE.MeshLambertMaterial({ color: '#6cb7c4', emissive: '#123236' })
  const cream = new THREE.MeshLambertMaterial({ color: '#e2c79a', emissive: '#3a2c18' })
  const green = new THREE.MeshLambertMaterial({ color: '#7c9a5a', emissive: '#1a2410' })
  const water = new THREE.MeshLambertMaterial({ color: '#6d93a8', emissive: '#15242c' })
  const X = 0.15, Z0 = -0.56, Z1 = 0.36, d = 0.035, H = 0.05, zc = (Z0 + Z1) / 2, ZL = Z1 - Z0
  for (const s of [-1, 1]) b.put(brick, bx(d, H, ZL, s * (X + d / 2), 0, zc), bx(2 * X + 2 * d, H, d, 0, 0, s < 0 ? Z0 - d / 2 : Z1 + d / 2))
  b.put(brick, bx(2 * X, 0.006, ZL, 0, 0, zc))
  // arches facing the square, two storeys
  const arch = (x: number, z: number, nx: number, nz: number) => {
    for (const y of [0.008, 0.029]) {
      const p = new THREE.PlaneGeometry(0.014, 0.017).rotateY(Math.atan2(nx, nz))
      b.put(sh, at(p, x + nx * 0.001, y + 0.0085, z + nz * 0.001))
    }
  }
  for (let i = 0; i < 34; i++) {
    const z = Z0 + 0.013 + i * (ZL - 0.026) / 33
    if (Math.abs(z + 0.07) > 0.05) arch(X, z, -1, 0)
    if (Math.abs(z + 0.04) > 0.06) arch(-X, z, 1, 0)
  }
  for (let i = 0; i < 11; i++) {
    const x = -X + 0.014 + i * (2 * X - 0.028) / 10
    if (Math.abs(x) > 0.04) { arch(x, Z0, 0, 1); arch(x, Z1, 0, -1) }
  }
  // gardens and the long pool down the middle
  b.put(green, bx(0.17, 0.014, 0.7, 0, 0, zc))
  b.put(water, bx(0.05, 0.02, 0.3, 0, 0, zc))
  const portal = (x: number, z: number, rot: number, w: number, h: number, m: M) => {
    const g1 = new THREE.BoxGeometry(w, h, 0.04).translate(0, h / 2, 0), g2 = new THREE.BoxGeometry(w * 0.55, h * 0.75, 0.004).translate(0, h * 0.375, 0.021)
    b.put(brick, at(g1.rotateY(rot), x, 0, z)); b.put(m, at(g2.rotateY(rot), x, 0, z))
  }
  const dome = (x: number, z: number, y: number, r: number, h: number, m: M, drum: M) => {
    b.put(drum, cyl(r * 0.98, h * 0.45, x, y, z, 16))
    b.put(m, at(lathe([[1, 0], [1.04, 0.15], [1.0, 0.35], [0.85, 0.6], [0.55, 0.85], [0.2, 0.97], [0, 1]], 16, r, h), x, y + h * 0.45, z))
    b.put(brick, cyl(0.004, h * 0.3, x, y + h * 1.42, z, 4, 0.001))
  }
  const minaret = (x: number, z: number, y: number, h: number) => {
    b.put(tile, cyl(0.008, h, x, y, z, 10, 0.007), cyl(0.012, 0.01, x, y + h * 0.85, z, 10))
    b.put(turq, at(new THREE.ConeGeometry(0.008, 0.02, 10), x, y + h + 0.01, z))
  }
  // Shah Mosque: portal on the square, the mosque behind it turned 45 degrees to face Mecca
  portal(0, Z1 + 0.02, PI, 0.08, 0.13, tile)
  for (const s of [-1, 1]) minaret(s * 0.03, Z1 + 0.025, 0.13, 0.11)
  const mx = -0.06, mz = Z1 + 0.13, qa = PI / 4, q = (u: number, v: number) => [mx + u * Math.cos(qa) - v * Math.sin(qa), mz + u * Math.sin(qa) + v * Math.cos(qa)]
  b.put(brick, at(new THREE.BoxGeometry(0.15, 0.05, 0.15).rotateY(-qa).translate(0, 0.025, 0), mx, 0, mz))
  b.put(turq, at(new THREE.BoxGeometry(0.11, 0.004, 0.11).rotateY(-qa).translate(0, 0.051, 0), mx, 0, mz))
  const [dx, dz] = q(0, 0.1)
  b.put(brick, at(new THREE.BoxGeometry(0.11, 0.08, 0.1).rotateY(-qa).translate(0, 0.04, 0), dx, 0, dz))
  dome(dx, dz, 0.08, 0.052, 0.13, tile, turq)
  const [ix, iz] = q(0, 0.06)
  b.put(brick, at(new THREE.BoxGeometry(0.07, 0.13, 0.02).rotateY(-qa).translate(0, 0.065, 0), ix, 0, iz))
  b.put(tile, at(new THREE.BoxGeometry(0.04, 0.1, 0.004).rotateY(-qa).translate(0, 0.05, -0.012), ix, 0, iz))
  for (const s of [-1, 1]) { const [px, pz] = q(s * 0.042, 0.06); minaret(px, pz, 0.05, 0.2) }
  // Sheikh Lotfollah: no courtyard or minarets, a shallow cream dome set off the portal's axis
  portal(X + 0.015, -0.07, -PI / 2, 0.06, 0.08, tile)
  b.put(brick, bx(0.09, 0.06, 0.09, X + 0.075, 0, -0.04))
  dome(X + 0.075, -0.04, 0.06, 0.036, 0.06, cream, turq)
  // Ali Qapu: palace block with its raised columned talar looking over the square
  const ax = -X - 0.02
  b.put(brick, bx(0.08, 0.17, 0.08, ax - 0.03, 0, -0.04), bx(0.05, 0.06, 0.1, ax + 0.03, 0, -0.04))
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) b.put(brick, cyl(0.0025, 0.06, ax + 0.012 + i * 0.016, 0.06, -0.08 + j * 0.026, 5))
  b.put(brick, bx(0.06, 0.008, 0.1, ax + 0.025, 0.12, -0.04), bx(0.03, 0.025, 0.03, ax - 0.03, 0.17, -0.04))
  b.put(sh, bx(0.004, 0.035, 0.03, ax + 0.056, 0, -0.04), bx(0.004, 0.05, 0.05, ax + 0.01, 0.07, -0.04))
  // Qeysarie gate to the bazaar
  portal(0, Z0 - 0.02, 0, 0.08, 0.1, sh)
  b.done()
}

export const batch_h: Record<string, Builder> = {
  petra,
  'abu-simbel': abuSimbel,
  lalibela,
  'djenne-old-town': djenne,
  'ait-benhaddou': aitBenhaddou,
  palmyra,
  baalbek,
  'naqsh-e-jahan-square': naqshEJahan,
}
