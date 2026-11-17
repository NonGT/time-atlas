import * as THREE from 'three'
import { gable, merge, staged, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
const SQ2 = Math.SQRT2

const at = <T extends G>(g: T, x: number, y: number, z: number) => { g.translate(x, y, z); return g }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z)
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 12) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n), x, y + h / 2, z)
function lathe(pts: number[][], seg: number, sr: number, sh: number, rot = 0) {
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)), seg)
  if (rot) g.rotateY(rot)
  return g
}
/** Square plan from a 4-sided lathe; r is the half-width. */
const sqLathe = (pts: number[][], r: number, h: number) => lathe(pts, 4, r * SQ2, h, Math.PI / 4)
// redented (ย่อมุม) square: two crossed boxes
const redent = (o: G[], w: number, h: number, x: number, y: number, z: number, f = 0.8) => {
  o.push(bx(w, h, w * f, x, y, z), bx(w * f, h, w, x, y, z))
}
/** Redented square lathe: the same profile squeezed two ways, so every tier has stepped corners. */
const redentLathe = (o: G[], pts: number[][], r: number, h: number, x: number, y: number, z: number, f = 0.8) => {
  o.push(at(sqLathe(pts, r, h).scale(1, 1, f), x, y, z), at(sqLathe(pts, r, h).scale(f, 1, 1), x, y, z))
}
/** Box between two points, for balustrades and handrails on a slope. */
function beam(a: number[], b: number[], w: number, h: number) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b)
  const g = new THREE.BoxGeometry(w, h, va.distanceTo(vb))
  const o = new THREE.Object3D()
  o.position.copy(va).add(vb).multiplyScalar(0.5)
  o.lookAt(vb)
  o.updateMatrix()
  return g.applyMatrix4(o.matrix)
}
const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const lam = (color: string, emissive = '#000000') => new THREE.MeshLambertMaterial({ color, emissive })

/** One bucket of geometry per material, merged at the end (all made non-indexed so extrusions mix with boxes). */
function bag(k: Kit) {
  const M = {
    gold: lam('#d9a93a', '#3a2a08'),
    stucco: lam('#efe9dc', '#24221c'),
    laterite: lam('#9a4a2e', '#1e0c06'),
    pink: lam('#b8a48c', '#1c1812'),
    grey: lam('#c9c2b4', '#1e1c18'),
    brick: lam('#a55a3c', '#1c0c06'),
    roof: lam('#c8622e', '#200c04'),
    green: lam('#2f7a4a', '#081a0e'),
    red: lam('#a8322a', '#1a0604'),
    grass: lam('#5f7d3f', '#1a2410'),
    forest: lam('#3d5f2c', '#0e1a08'),
    rock: lam('#8a8170', '#18160f'),
    monkey: lam('#7a6048', '#140e08'),
    dark: lam('#2b2622', '#060504'),
    soot: lam('#6e3a28', '#140806'),
  }
  type Key = keyof typeof M
  const parts = new Map<Key, G[]>()
  const put = (key: Key, ...g: G[]) => { if (!parts.has(key)) parts.set(key, []); parts.get(key)!.push(...g) }
  const flush = () => {
    for (const [key, gs] of parts) if (gs.length) merge(k, gs.map(g => (g.index ? g.toNonIndexed() : g)), M[key])
  }
  return { M, put, flush }
}
type Bag = ReturnType<typeof bag>
type Key = Parameters<Bag['put']>[0]

/** Flight of steps on side (dx, dz): top at distance r0 from (cx, cz), running l outward and h down to y0. */
function stairs(o: G[], dx: number, dz: number, r0: number, l: number, h: number, w: number, y0 = 0, n = 6, cx = 0, cz = 0) {
  for (let i = 0; i < n; i++) {
    const L = (l * (n - i)) / n, c = r0 + L / 2
    o.push(bx(dx ? L : w, h / n, dx ? w : L, cx + dx * c, y0 + (i * h) / n, cz + dz * c))
  }
}

/** Naga balustrades either side of a stair: sloped bodies with a raised hood at the foot. */
function nagaRails(o: G[], dx: number, dz: number, r0: number, l: number, h: number, w: number, y0: number, cx = 0, cz = 0, t = 0.012) {
  for (const s of [-1, 1]) {
    const ox = dz * s * (w / 2), oz = dx * s * (w / 2)
    const top = [cx + dx * r0 + ox, y0 + h + t, cz + dz * r0 + oz]
    const foot = [cx + dx * (r0 + l) + ox, y0 + t * 0.6, cz + dz * (r0 + l) + oz]
    o.push(beam(top, foot, t, t))
    // hood rears up and fans out
    const hx = foot[0] + dx * t, hz = foot[2] + dz * t
    o.push(bx(dx ? t * 1.2 : t * 2.6, t * 3.2, dx ? t * 2.6 : t * 1.2, hx, 0 + y0, hz))
    o.push(bx(dx ? t * 0.8 : t * 3.6, t * 1.4, dx ? t * 3.6 : t * 0.8, hx, y0 + t * 2.6, hz))
  }
}

/** Thai tiered gable roof along x (or z): lower tiers step out at both ends, a green border, gold chofa and pediments. */
function thaiRoof(P: Bag, l: number, d: number, x: number, y: number, z: number, o: {
  alongZ?: boolean; tiers?: number; ext?: number; rise?: number; drop?: number; tile?: Key; edge?: Key; chofa?: boolean
} = {}) {
  const { alongZ = false, tiers = 3, ext = 0.025, rise = 0.75, drop = 0.014, tile = 'roof', edge = 'green', chofa = true } = o
  const rot = (g: G) => (alongZ ? g.rotateY(Math.PI / 2) : g)
  const place = (g: G, px: number, py: number) => at(rot(g), alongZ ? x : x + px, py, alongZ ? z + px : z)
  for (let i = 0; i < tiers; i++) {
    const j = tiers - 1 - i, L = l - 2 * ext * j, D = d * (1 - 0.07 * j), H = D * rise * 0.5, yy = y - drop * j
    const He = (H * (D + 0.014)) / D
    P.put(edge, place(gable(L + 0.004, D + 0.014, He), 0, yy + H - He - 0.003))
    P.put(tile, place(gable(L, D, H), 0, yy))
    if (chofa) for (const s of [-1, 1]) {
      // chofa: a slim gold hook rising from the ridge end
      const c = new THREE.BoxGeometry(0.006, H * 0.55, 0.006).rotateZ(-s * 0.5)
      P.put('gold', place(c, s * (L / 2 - 0.004), yy + H + H * 0.2))
      if (i === tiers - 1) P.put('gold', place(gable(0.003, D * 0.8, H * 0.8), s * (L / 2 + 0.001), yy + H * 0.05))
    }
  }
}

/** Gilded multi-tier parasol (ฉัตร) on a pole. */
function parasol(P: Bag, x: number, z: number, y: number, h: number, r: number, n = 5) {
  P.put('gold', cyl(r * 0.08, r * 0.08, h, x, y, z, 5))
  for (let i = 0; i < n; i++) {
    const rr = r * (1 - (i / n) * 0.65)
    P.put('gold', cyl(rr, rr * 0.7, h * 0.05, x, y + h * (0.45 + (i * 0.5) / n), z, 8))
  }
}

/**
 * Khmer prang: redented cella with porches, then receding redented tiers each fringed with antefixes,
 * capped by a lotus finial. h counts from y.
 */
function khmerPrang(P: Bag, key: Key, x: number, z: number, y: number, w: number, h: number, o: {
  tiers?: number; porches?: [number, number][]; body?: number; trim?: Key; ant?: number
} = {}) {
  const { tiers = 5, porches = dirs, body = 0.34, trim = key, ant = 1 } = o
  const m: G[] = [], t: G[] = [], d: G[] = []
  const bh = h * body
  redent(m, w * 1.04, h * 0.05, x, y, z, 0.78)
  redent(m, w, bh, x, y, z, 0.74)
  for (const [dx, dz] of porches) {
    const pl = w * 0.28, pw = w * 0.46, ph = bh * 0.82, px = x + dx * (w / 2 + pl / 2 - 0.002), pz = z + dz * (w / 2 + pl / 2 - 0.002)
    m.push(bx(dx ? pl : pw, ph, dx ? pw : pl, px, y, pz))
    // stacked frontons over the doorway
    const g1 = gable(pl, pw * 1.05, ph * 0.38), g2 = gable(pl * 0.7, pw * 0.75, ph * 0.5)
    if (dz) { g1.rotateY(Math.PI / 2); g2.rotateY(Math.PI / 2) }
    t.push(at(g1, px, y + ph, pz), at(g2, px - dx * pl * 0.1, y + ph + ph * 0.2, pz - dz * pl * 0.1))
    d.push(bx(dx ? 0.003 : pw * 0.42, ph * 0.62, dx ? pw * 0.42 : 0.003, px + dx * (pl / 2 + 0.001), y, pz + dz * (pl / 2 + 0.001)))
  }
  let yy = y + bh
  redent(t, w * 1.06, h * 0.025, x, yy, z, 0.76)
  yy += h * 0.025
  const th0 = (h * (1 - body - 0.025 - 0.13)) / tiers
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers, tw = w * (0.92 - 0.6 * Math.pow(f, 1.25)), th = th0 * (1.12 - 0.24 * f)
    redent(m, tw, th * 0.78, x, yy, z, 0.74)
    redent(t, tw * 1.04, th * 0.22, x, yy + th * 0.78, z, 0.74)
    // antefixes at the corners and on the redents
    const a = tw * 0.52, ah = th * 0.7 * ant, ar = tw * 0.075 * ant
    for (const [cx, cz] of [[a, a * 0.74], [a * 0.74, a], [a, -a * 0.74], [a * 0.74, -a], [-a, a * 0.74], [-a * 0.74, a], [-a, -a * 0.74], [-a * 0.74, -a]])
      t.push(at(new THREE.ConeGeometry(ar, ah, 4), x + cx * 0.96, yy + th + ah / 2 - th * 0.1, z + cz * 0.96))
    for (const [dx, dz] of dirs) t.push(at(new THREE.ConeGeometry(ar * 1.3, ah * 1.2, 4), x + dx * a * 0.98, yy + th + ah * 0.5, z + dz * a * 0.98))
    yy += th
  }
  const lotus = [[0.42, 0], [0.5, 0.12], [0.38, 0.25], [0.3, 0.3], [0.36, 0.42], [0.2, 0.68], [0.06, 0.88], [0.02, 1], [0, 1]]
  t.push(at(lathe(lotus, 8, w * 0.42, y + h - yy, Math.PI / 8), x, yy, z))
  P.put(key, ...m)
  P.put(trim, ...t)
  P.put('dark', ...d)
}

/** Khmer gallery around a court: walls, corbelled roof, a cruciform gopura in the middle of each side. */
function khmerGallery(P: Bag, key: Key, cx: number, cz: number, W: number, D: number, h: number, t: number, gates: [number, number][] = dirs) {
  for (const s of [-1, 1]) {
    P.put(key, bx(W, h, t, cx, 0, cz + (s * (D - t)) / 2), bx(t, h, D - 2 * t, cx + (s * (W - t)) / 2, 0, cz))
    P.put(key, at(gable(W, t * 1.1, t * 0.7), cx, h, cz + (s * (D - t)) / 2))
    P.put(key, at(gable(D, t * 1.1, t * 0.7).rotateY(Math.PI / 2), cx + (s * (W - t)) / 2, h, cz))
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.put(key, bx(t * 1.5, h * 1.25, t * 1.5, cx + (sx * (W - t)) / 2, 0, cz + (sz * (D - t)) / 2))
  for (const [dx, dz] of gates) {
    const gx = cx + (dx * (W - t)) / 2, gz = cz + (dz * (D - t)) / 2
    const L = t * 2.4, gh = h * 1.4
    // crossed halls make the cross plan
    P.put(key, bx(dx ? L : t * 3, gh, dx ? t * 3 : L, gx, 0, gz), bx(dx ? L * 1.5 : t * 1.5, gh * 0.85, dx ? t * 1.5 : L * 1.5, gx, 0, gz))
    const r1 = gable(t * 3.1, L, L * 0.5), r2 = gable(L * 1.6, t * 1.6, t * 0.9)
    if (dx) r1.rotateY(Math.PI / 2); else r2.rotateY(Math.PI / 2)
    P.put(key, at(r1, gx, gh, gz), at(r2, gx, gh * 0.85, gz))
    P.put(key, at(new THREE.ConeGeometry(t * 0.7, gh * 0.5, 4).rotateY(Math.PI / 4), gx, gh + gh * 0.25, gz))
    P.put('dark', bx(dx ? 0.003 : t * 1.4, gh * 0.55, dx ? t * 1.4 : 0.003, gx + dx * (L / 2 + 0.002), 0, gz + dz * (L / 2 + 0.002)))
  }
}

/** Cruciform naga bridge: a low terrace on short posts, naga rails along its edges. */
function nagaBridge(P: Bag, key: Key, x: number, z: number, y: number, L: number, W: number, alongZ = false) {
  const hh = 0.018
  const a = alongZ ? [W, L] : [L, W], b = alongZ ? [L * 0.75, W * 0.5] : [W * 0.5, L * 0.75]
  P.put(key, bx(a[0], hh * 0.4, a[1], x, y + hh * 0.6, z), bx(b[0], hh * 0.4, b[1], x, y + hh * 0.6, z))
  for (const i of [-1, -0.5, 0, 0.5, 1]) for (const s of [-1, 1]) {
    const px = alongZ ? x + s * W * 0.4 : x + i * L * 0.45, pz = alongZ ? z + i * L * 0.45 : z + s * W * 0.4
    P.put(key, bx(0.008, hh * 0.6, 0.008, px, y, pz))
  }
  for (const s of [-1, 1]) {
    const r = alongZ ? bx(0.008, 0.008, L, x + s * W / 2, y + hh + 0.002, z) : bx(L, 0.008, 0.008, x, y + hh + 0.002, z + s * W / 2)
    P.put(key, r)
    for (const e of [-1, 1]) {
      const hx = alongZ ? x + s * W / 2 : x + e * L / 2, hz = alongZ ? z + e * L / 2 : z + s * W / 2
      P.put(key, bx(0.014, 0.03, 0.014, hx, y + hh, hz), bx(alongZ ? 0.03 : 0.008, 0.014, alongZ ? 0.008 : 0.03, hx, y + hh + 0.022, hz))
    }
  }
}

/** Lanna chedi: stepped redented square base, round mouldings, bell, harmika, ringed spire, parasol. Gold all over. */
function lannaChedi(P: Bag, x: number, z: number, y: number, W: number, H: number, key: Key = 'gold', baseSteps = 3) {
  const o: G[] = []
  let yy = y
  const sh = H * 0.07
  for (let i = 0; i < baseSteps; i++) {
    const w = W * (1 - i * 0.12)
    redent(o, w, sh * 0.8, x, yy, z, 0.78)
    redent(o, w * 0.96, sh * 0.2, x, yy + sh * 0.8, z, 0.78)
    yy += sh
  }
  const w0 = W * (1 - baseSteps * 0.12)
  // tall redented pedestal with octagon-like mouldings
  redentLathe(o, [[1, 0], [1, 0.04], [0.86, 0.06], [0.86, 0.22], [0.96, 0.25], [0.96, 0.28], [0.8, 0.31], [0.8, 0.34], [0.9, 0.37], [0.9, 0.4], [0, 0.4]], w0 / 2, H * 0.32, x, yy, z, 0.78)
  yy += H * 0.32 * 0.4
  const R = w0 * 0.42
  const bell = [[1.12, 0], [1.12, 0.03], [1.0, 0.04], [1.0, 0.07], [0.9, 0.08], [0.9, 0.11], [0.82, 0.12], [0.8, 0.14], [0.84, 0.22], [0.8, 0.3], [0.68, 0.38], [0.46, 0.44], [0.3, 0.46], [0, 0.46]]
  o.push(at(lathe(bell, 20, R, H * 0.4), x, yy, z))
  yy += H * 0.4 * 0.46
  redentLathe(o, [[0.34, 0], [0.34, 0.05], [0.42, 0.06], [0.42, 0.08], [0, 0.08]], R, H * 0.4, x, yy - 0.002, z, 0.8)
  yy += H * 0.4 * 0.08
  const rings: number[][] = []
  const n = 8
  for (let i = 0; i < n; i++) {
    const r0 = 0.28 * (1 - 0.68 * (i / n)), y0 = (0.6 * i) / n
    rings.push([r0, y0], [r0 * 0.84, y0 + 0.6 / n])
  }
  rings.push([0.08, 0.62], [0.07, 0.8], [0.04, 0.9], [0.02, 1], [0, 1])
  const top = y + H - yy
  o.push(at(lathe(rings, 12, R, top), x, yy, z))
  P.put(key, ...o)
  // small parasol at the tip
  for (let i = 0; i < 4; i++) {
    const rr = R * 0.14 * (1 - i * 0.2)
    P.put('gold', cyl(rr, rr * 0.6, top * 0.012, x, yy + top * (0.8 + i * 0.035), z, 8))
  }
}

/** Sri Lankan bell chedi: three rings, a broad bell, harmika, ringed spire. Returns the y where the spire starts. */
function bellChedi(o: G[], x: number, z: number, y: number, R: number, H: number, seg = 24) {
  if (seg <= 8) {
    const p = [[1, 0], [1, 0.06], [0.8, 0.12], [0.8, 0.2], [0.55, 0.38], [0.2, 0.45], [0.16, 0.52], [0.04, 0.85], [0, 1]]
    o.push(at(lathe(p, seg, R, H), x, y, z))
    return y + H
  }
  const pts = [[1, 0], [1, 0.035], [0.92, 0.05], [0.92, 0.075], [0.84, 0.09], [0.84, 0.115], [0.76, 0.13],
    [0.72, 0.14], [0.74, 0.2], [0.71, 0.27], [0.62, 0.34], [0.46, 0.39], [0.28, 0.415], [0, 0.42]]
  o.push(at(lathe(pts, seg, R, H), x, y, z))
  o.push(bx(R * 0.5, H * 0.05, R * 0.5, x, y + H * 0.41, z), bx(R * 0.6, H * 0.012, R * 0.6, x, y + H * 0.46, z))
  return y + H * 0.472
}
/** Ringed spire (ปล้องไฉน) and its tip; with gold given, everything above the fraction cut is gilded. */
function ringSpire(o: G[], x: number, z: number, y: number, r: number, h: number, n = 9, seg = 12, gold?: G[], cut = 0.5) {
  const pts: number[][] = []
  for (let i = 0; i < n; i++) {
    const r0 = 1 - 0.72 * (i / n), y0 = (0.62 * i) / n
    pts.push([r0, y0], [r0 * 0.84, y0 + (0.62 / n) * 0.95])
  }
  pts.push([0.24, 0.63], [0.2, 0.66], [0.14, 0.8], [0.09, 0.88], [0.12, 0.9], [0.04, 0.94], [0, 1])
  if (!gold) { o.push(at(lathe(pts, seg, r, h), x, y, z)); return }
  const i = pts.findIndex(p => p[1] > cut), [r0, y0] = pts[i - 1], [r1, y1] = pts[i]
  const rc = r0 + ((cut - y0) / (y1 - y0)) * (r1 - r0)
  o.push(at(lathe([...pts.slice(0, i), [rc, cut], [0, cut]], seg, r, h), x, y, z))
  gold.push(at(lathe([[rc, cut], ...pts.slice(i)], seg, r, h), x, y, z))
}

/** Square cloister of roofed galleries with a gate in the middle of the given sides. */
function cloister(P: Bag, cx: number, cz: number, W: number, D: number, h: number, t: number, wall: Key, o: {
  gates?: [number, number][]; tile?: Key; edge?: Key; rise?: number
} = {}) {
  const { gates = dirs, tile = 'roof', edge = 'green', rise = 0.7 } = o
  for (const s of [-1, 1]) {
    P.put(wall, bx(W, h, t, cx, 0, cz + (s * (D - t)) / 2), bx(t, h, D - 2 * t, cx + (s * (W - t)) / 2, 0, cz))
    thaiRoof(P, W + t * 0.4, t * 1.5, cx, h, cz + (s * (D - t)) / 2, { tiers: 1, rise, tile, edge, chofa: false })
    thaiRoof(P, D, t * 1.5, cx + (s * (W - t)) / 2, h, cz, { alongZ: true, tiers: 1, rise, tile, edge, chofa: false })
  }
  for (const [dx, dz] of gates) {
    const gx = cx + (dx * (W - t)) / 2, gz = cz + (dz * (D - t)) / 2
    P.put(wall, bx(dx ? t * 1.6 : t * 3, h * 1.3, dx ? t * 3 : t * 1.6, gx, 0, gz))
    thaiRoof(P, t * 2.6, t * 3.4, gx, h * 1.3, gz, { alongZ: !dz, tiers: 2, ext: t * 0.4, rise, tile, edge })
    P.put('dark', bx(dx ? t * 1.7 : t, h * 0.8, dx ? t : t * 1.7, gx, 0, gz))
  }
}

/** Thai hall on a raised base: white walls, red doors, tiered roof. */
function hall(P: Bag, x: number, z: number, l: number, w: number, h: number, alongZ = false, o: { tiers?: number; rise?: number; tile?: Key; edge?: Key; base?: number } = {}) {
  const { base = 0.012 } = o
  const L = alongZ ? w : l, Dd = alongZ ? l : w
  P.put('stucco', bx(L + 0.012, base, Dd + 0.012, x, 0, z), bx(L, h, Dd, x, base, z))
  // front door at the +x (or +z) end
  P.put('red', bx(alongZ ? w * 0.3 : 0.003, h * 0.6, alongZ ? 0.003 : w * 0.3, x + (alongZ ? 0 : l / 2 + 0.002), base, z + (alongZ ? l / 2 + 0.002 : 0)))
  thaiRoof(P, l + 0.03, w + 0.035, x, base + h, z, { alongZ, tiers: o.tiers ?? 3, ext: l * 0.08, rise: o.rise, tile: o.tile, edge: o.edge })
}

/** Seeded scatter so the trees and rubble stay put between rebuilds. */
function rng(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
}

function tree(P: Bag, x: number, z: number, y: number, r: number, key: Key = 'forest') {
  P.put(key, at(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.85, 1), x, y + r * 0.7, z))
}

// Phimai: faces south toward Angkor. Inner gallery about 80 x 72 m, central prang 28 m in white-grey sandstone
function phimai(k: Kit) {
  const P = bag(k)
  P.put('grass', bx(1.18, 0.004, 1.16, 0, 0, 0.02))
  // outer laterite wall with the southern gopura and the naga bridge before it
  const ow = 1.08, oz0 = -0.52, oz1 = 0.44
  for (const s of [-1, 1]) P.put('laterite', bx(0.022, 0.05, oz1 - oz0, s * ow / 2, 0, (oz0 + oz1) / 2))
  P.put('laterite', bx(ow, 0.05, 0.022, 0, 0, oz0))
  for (const s of [-1, 1]) P.put('laterite', bx(ow / 2 - 0.08, 0.05, 0.022, s * (ow / 4 + 0.04), 0, oz1))
  P.put('grey', bx(0.16, 0.1, 0.06, 0, 0, oz1), bx(0.07, 0.085, 0.11, 0, 0, oz1))
  P.put('grey', at(gable(0.17, 0.08, 0.05), 0, 0.1, oz1), at(gable(0.12, 0.08, 0.05).rotateY(Math.PI / 2), 0, 0.085, oz1))
  P.put('dark', bx(0.035, 0.06, 0.112, 0, 0, oz1))
  nagaBridge(P, 'grey', 0, 0.53, 0, 0.13, 0.1, true)
  // paved way from the gate to the gallery
  P.put('grey', bx(0.06, 0.006, 0.18, 0, 0, 0.32))
  // inner gallery
  const gz = -0.1
  khmerGallery(P, 'grey', 0, gz, 0.72, 0.62, 0.055, 0.04)
  P.put('grey', bx(0.66, 0.008, 0.56, 0, 0, gz))
  // central prang with its antarala and mandapa reaching south
  const px = 0, pz = -0.14
  P.put('grey', bx(0.2, 0.022, 0.4, px, 0, pz + 0.06))
  khmerPrang(P, 'grey', px, pz, 0.022, 0.14, 0.5, { porches: [[1, 0], [-1, 0], [0, -1]], tiers: 5 })
  P.put('grey', bx(0.08, 0.085, 0.07, px, 0.022, pz + 0.105), bx(0.13, 0.1, 0.12, px, 0.022, pz + 0.2))
  P.put('grey', at(gable(0.07, 0.08, 0.04).rotateY(Math.PI / 2), px, 0.107, pz + 0.105), at(gable(0.13, 0.13, 0.065).rotateY(Math.PI / 2), px, 0.122, pz + 0.2))
  P.put('grey', at(gable(0.08, 0.16, 0.06), px, 0.122, pz + 0.2))
  P.put('dark', bx(0.05, 0.065, 0.003, px, 0.022, pz + 0.262))
  // Prang Hin Daeng (red sandstone) and Prang Brahmadat (laterite) in front
  khmerPrang(P, 'pink', -0.2, 0.08, 0.012, 0.075, 0.2, { porches: [[0, 1]], tiers: 4 })
  khmerPrang(P, 'laterite', 0.19, 0.06, 0.012, 0.075, 0.16, { porches: [[0, 1]], tiers: 3 })
  // two libraries in the outer court
  for (const s of [-1, 1]) {
    P.put('laterite', bx(0.1, 0.045, 0.07, s * 0.3, 0, 0.32))
    P.put('laterite', at(gable(0.1, 0.075, 0.035), s * 0.3, 0.045, 0.32))
  }
  P.flush()
}

// Phanom Rung: Shiva sanctuary on an extinct volcano, the 160 m processional way runs east to west uphill
function phanomRung(k: Kit) {
  const P = bag(k)
  // hill: a broad green mound, the top flattened for the sanctuary
  const hx = -0.24, top = 0.07
  const hill = lathe([[1.0, 0], [0.86, 0.25], [0.7, 0.6], [0.6, 0.85], [0.52, 1], [0, 1]], 28, 0.42, top)
  hill.scale(1, 1, 1.05)
  P.put('grass', at(hill, hx, 0, 0))
  // processional way lined with lotus-bud posts (sao nang riang)
  const x0 = 0.6, x1 = 0.2
  P.put('pink', bx(x0 - x1, 0.006, 0.05, (x0 + x1) / 2, 0, 0))
  for (let i = 0; i <= 13; i++) {
    const x = x1 + 0.02 + (i * (x0 - x1 - 0.04)) / 13
    for (const s of [-1, 1]) {
      P.put('pink', bx(0.008, 0.024, 0.008, x, 0.004, s * 0.034))
      P.put('pink', at(new THREE.ConeGeometry(0.008, 0.016, 4).rotateY(Math.PI / 4), x, 0.036, s * 0.034))
    }
  }
  // the White Elephant Hall at the foot, north of the way
  P.put('soot', bx(0.09, 0.025, 0.05, 0.5, 0, -0.1))
  // first naga bridge, then the stairs with their landings, second bridge on top, third before the gopura
  nagaBridge(P, 'pink', 0.17, 0, 0.004, 0.08, 0.08)
  const s0 = 0.13, s1 = 0.0
  for (let f = 0; f < 4; f++) {
    const a = s0 - (f * (s0 - s1)) / 4, b = s0 - ((f + 1) * (s0 - s1)) / 4
    const ya = 0.004 + (f * top) / 4, yb = 0.004 + ((f + 1) * top) / 4
    const o: G[] = [], l = (a - b) * 0.75, w = 0.07 - f * 0.006
    stairs(o, 1, 0, b, l, yb - ya, w, ya, 5)
    // solid fill under the flight and the landing at its foot
    o.push(bx(l, ya, w, b + l / 2, 0, 0), bx(a - b - l + 0.002, ya, w + 0.02, (a + b + l) / 2, 0, 0))
    P.put('pink', ...o)
  }
  // landing and the top terrace
  P.put('pink', bx(0.06, 0.01, 0.12, -0.01, top, 0))
  nagaBridge(P, 'pink', -0.035, 0, top, 0.06, 0.1)
  // galleried enclosure with the east gopura
  const cx = -0.25
  P.put('pink', bx(0.36, 0.006, 0.3, cx, top, 0))
  const sub: Bag = { ...P, put: (key, ...gs) => P.put(key, ...gs.map(g => g.translate(0, top, 0))) }
  khmerGallery(sub, 'pink', cx, 0, 0.36, 0.3, 0.04, 0.03)
  nagaBridge(P, 'pink', cx + 0.215, 0, top, 0.04, 0.07)
  // central prang facing east with the mandapa and antarala before it
  const px = cx - 0.03
  khmerPrang(P, 'pink', px, 0, top + 0.006, 0.095, 0.22, { porches: [[-1, 0], [0, 1], [0, -1]], tiers: 5 })
  P.put('pink', bx(0.03, 0.05, 0.05, px + 0.055, top + 0.006, 0), bx(0.07, 0.06, 0.07, px + 0.1, top + 0.006, 0))
  P.put('pink', at(gable(0.1, 0.075, 0.035), px + 0.085, top + 0.066, 0))
  P.put('dark', bx(0.003, 0.04, 0.03, px + 0.136, top + 0.006, 0))
  // the older brick prangs and libraries in the court
  khmerPrang(P, 'brick', cx - 0.1, -0.09, top + 0.006, 0.04, 0.08, { porches: [[1, 0]], tiers: 3 })
  for (const z of [-0.09, 0.09]) {
    P.put('pink', bx(0.05, 0.03, 0.035, cx + 0.1, top + 0.006, z))
    P.put('pink', at(gable(0.05, 0.04, 0.018), cx + 0.1, top + 0.036, z))
  }
  // trees on the hillside
  const r = rng(7)
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 0.3 + r() * 0.12
    const x = hx + Math.cos(a) * d, z = Math.sin(a) * d * 1.05
    if (x > 0 && Math.abs(z) < 0.09) continue
    const yh = top * Math.max(0, Math.min(1, (0.42 - d) / 0.2 + 0.2))
    tree(P, x, z, yh * 0.8, 0.02 + r() * 0.012)
  }
  P.flush()
}

// Prang Sam Yot: three laterite prangs in a north-south row joined by corridors, Bayon style (about 1200)
function prangSamYot(k: Kit) {
  const P = bag(k)
  P.put('grass', bx(0.64, 0.004, 1.06, 0, 0, 0))
  P.put('soot', bx(0.36, 0.035, 1.0, 0, 0.004, 0), bx(0.38, 0.008, 1.02, 0, 0.004, 0))
  const y = 0.039
  const towers: [number, number, number][] = [[-0.34, 0.16, 0.56], [0, 0.18, 0.65], [0.34, 0.16, 0.56]]
  for (const [z, w, h] of towers) khmerPrang(P, 'soot', 0, z, y, w, h, { porches: [[1, 0], [-1, 0]], tiers: 5, body: 0.38, ant: 0.6 })
  // corridors between the towers
  for (const z of [-0.17, 0.17]) {
    P.put('soot', bx(0.09, 0.12, 0.2, 0, y, z))
    P.put('soot', at(gable(0.2, 0.11, 0.05).rotateY(Math.PI / 2), 0, y + 0.12, z))
  }
  // stairs up to the east porches
  for (const [z] of towers) {
    const o: G[] = []
    stairs(o, 1, 0, 0.17, 0.08, 0.035, 0.07, 0.004, 4, 0, z)
    P.put('soot', ...o)
  }
  // whitish stucco left on the porches and tiers
  const r = rng(11)
  for (const [z, w, h] of towers) {
    for (let i = 0; i < 12; i++) {
      const f = 0.08 + r() * 0.3, side = r() < 0.5 ? 1 : -1, rw = w / 2
      const pw = 0.03 + r() * 0.04, ph = 0.03 + r() * 0.05, off = (r() - 0.5) * rw
      if (r() < 0.5) P.put('stucco', bx(0.004, ph, pw, side * (rw + 0.002), y + f * h, z + off))
      else P.put('stucco', bx(pw, ph, 0.004, off, y + f * h, z + side * (rw + 0.002)))
    }
    P.put('stucco', bx(0.006, 0.07, 0.05, w / 2 + w * 0.28 + 0.002, y + 0.03, z))
  }
  // a few macaques on the base
  const mk = (x: number, z: number, yy: number, ry: number) => {
    const b = new THREE.BoxGeometry(0.012, 0.012, 0.018).translate(0, 0.008, 0)
    const h = new THREE.BoxGeometry(0.009, 0.009, 0.009).translate(0, 0.016, 0.011)
    const t = new THREE.BoxGeometry(0.003, 0.003, 0.016).translate(0, 0.01, -0.016)
    for (const g of [b, h, t]) P.put('monkey', at(g.rotateY(ry), x, yy, z))
  }
  for (const [x, z, yy, ry] of [[0.16, -0.25, y, 0.5], [0.17, 0.08, y, 2], [-0.16, 0.24, y, 4], [0.24, -0.1, 0.004, 1], [0.27, 0.4, 0.004, 3], [-0.24, -0.42, 0.004, 5.2], [0.15, 0.44, y, 1.2]])
    mk(x, z, yy, ry)
  P.flush()
}

// Phra That Phanom: 12.3 m square lotus-bud that, 53 m since 1979. The tower fell in heavy rain on 11 August 1975
const phraThatPhanom = staged([800, 1975, 1979], (k, year) => {
  const P = bag(k)
  P.put('stucco', bx(1.0, 0.012, 1.0, 0, 0, 0))
  cloister(P, 0, 0, 0.98, 0.98, 0.07, 0.05, 'stucco', { gates: [[1, 0], [0, 1], [0, -1], [-1, 0]] })
  P.put('stucco', bx(0.6, 0.016, 0.6, 0, 0.012, 0))
  // corner posts of the fence round the base
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.put('gold', cyl(0.008, 0.008, 0.05, sx * 0.28, 0.028, sz * 0.28, 6))
  for (const s of [-1, 1]) P.put('gold', bx(0.56, 0.006, 0.004, 0, 0.06, s * 0.28), bx(0.004, 0.006, 0.56, s * 0.28, 0.06, 0))
  const y0 = 0.028
  if (year >= 1975 && year < 1979) {
    // a mound of broken brick and plaster, the lowest base still showing
    const o: G[] = []
    redent(o, 0.44, 0.06, 0, y0, 0, 0.82)
    P.put('brick', ...o)
    P.put('brick', at(lathe([[1, 0], [0.9, 0.3], [0.62, 0.7], [0.3, 0.95], [0, 1]], 14, 0.3, 0.2), 0, y0, 0))
    const r = rng(5)
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.34, s = 0.02 + r() * 0.05
      const g = new THREE.BoxGeometry(s, s * 0.5, s * (0.6 + r())).rotateY(r() * 3).rotateX((r() - 0.5) * 0.8)
      const yy = y0 + Math.max(0, 0.2 * (1 - (d / 0.34) ** 2)) - s * 0.1
      P.put(r() < 0.45 ? 'stucco' : 'brick', at(g, Math.cos(a) * d, yy, Math.sin(a) * d))
    }
    P.put('gold', at(new THREE.ConeGeometry(0.02, 0.12, 6).rotateZ(1.3), 0.25, y0 + 0.04, 0.1))
    P.flush()
    return
  }
  // H = 53 m in 30 m units, built about true height
  const b = 0.2, H = 1.85
  const o: G[] = [], gd: G[] = []
  // stepped base
  redent(o, b * 2.2, 0.035, 0, y0, 0, 0.84)
  redent(o, b * 2.08, 0.03, 0, y0 + 0.035, 0, 0.84)
  let y = y0 + 0.065
  // ruean that: tall square body with false doors and gold reliefs
  const bh = 0.36
  redent(o, b * 2, bh, 0, y, 0, 0.86)
  for (const [dx, dz] of dirs) {
    gd.push(bx(dx ? 0.004 : b * 0.7, bh * 0.62, dx ? b * 0.7 : 0.004, dx * (b + 0.002), y + bh * 0.12, dz * (b + 0.002)))
    P.put('stucco', bx(dx ? 0.006 : b * 0.46, bh * 0.5, dx ? b * 0.46 : 0.006, dx * (b + 0.004), y + bh * 0.16, dz * (b + 0.004)))
    // the false door's pointed arch
    const g = gable(0.006, b * 0.6, bh * 0.22)
    if (dz) g.rotateY(Math.PI / 2)
    gd.push(at(g, dx * (b + 0.004), y + bh * 0.74, dz * (b + 0.004)))
  }
  for (const f of [0, 0.97]) gd.push(bx(b * 2.04, bh * 0.03, b * 2.04 * 0.86, 0, y + f * bh, 0), bx(b * 2.04 * 0.86, bh * 0.03, b * 2.04, 0, y + f * bh, 0))
  y += bh
  // mouldings stepping in, then the square bud that swells and tapers
  const mould = [[1.02, 0], [1.02, 0.02], [0.9, 0.04], [0.92, 0.07], [0.8, 0.09], [0.8, 0.11], [0, 0.11]]
  redentLathe(o, mould, b, 1, 0, y, 0, 0.86)
  y += 0.11
  const budH = H - (y - y0) - 0.32
  const bud = [[0.78, 0], [0.84, 0.06], [0.84, 0.14], [0.74, 0.26], [0.6, 0.4], [0.46, 0.56], [0.34, 0.72], [0.24, 0.86], [0.18, 1], [0, 1]]
  redentLathe(o, bud, b, budH, 0, y, 0, 0.84)
  // gold bands round the bud
  for (const f of [0.03, 0.14, 0.3, 0.46, 0.62]) {
    const i = bud.findIndex(p => p[1] > f), [r0, y1] = bud[i - 1], [r1, y2] = bud[i]
    const r = (r0 + ((f - y1) / (y2 - y1)) * (r1 - r0)) * b + 0.003
    gd.push(bx(r * 2, 0.012, r * 2 * 0.84, 0, y + f * budH, 0), bx(r * 2 * 0.84, 0.012, r * 2, 0, y + f * budH, 0))
  }
  // the top fifth of the bud is gilded
  redentLathe(gd, [[0.3, 0], [0.24, 0.5], [0.19, 1], [0, 1]], b * 1.02, budH * 0.28, 0, y + budH * 0.72, 0, 0.84)
  y += budH
  P.put('stucco', ...o)
  // golden finial and the gold umbrella
  gd.push(at(lathe([[0.06, 0], [0.09, 0.05], [0.05, 0.12], [0.07, 0.16], [0.03, 0.4], [0.012, 1], [0, 1]], 10, 1, 0.3), 0, y, 0))
  for (let i = 0; i < 5; i++) gd.push(cyl(0.05 - i * 0.008, 0.035 - i * 0.006, 0.01, 0, y + 0.1 + i * 0.03, 0, 10))
  P.put('gold', ...gd)
  P.flush()
})

// Wat Chedi Luang: base about 54 m square, 82 m tall when finished in 1475; the 1545 earthquake took the top 30 m,
// the Fine Arts Department rebuilt the base, stairs and niches in 1990-1992 but not the spire
const chediLuang = staged([1475, 1545, 1990], (k, year) => {
  const P = bag(k)
  const ruin = year >= 1545 && year < 1990, restored = year >= 1990, whole = year < 1545
  const H = (m: number) => m * 0.02, Wm = (m: number) => m / 60
  const mat: Key = whole ? 'stucco' : 'brick'
  const o: G[] = [], d: G[] = [], gd: G[] = []
  P.put('grass', bx(1.16, 0.004, 1.16, 0, 0, 0))
  o.push(bx(Wm(60), H(1.5), Wm(60), 0, 0, 0))
  const tiers = [[54, 9], [46, 8], [39, 8]]
  let y = H(1.5)
  tiers.forEach(([w, h], i) => {
    redent(o, Wm(w), H(h) * 0.9, 0, y, 0, 0.84)
    redent(o, Wm(w) * 1.02, H(h) * 0.1, 0, y + H(h) * 0.9, 0, 0.84)
    if (i === 0) {
      // elephants half out of the lowest tier
      for (const [dx, dz] of dirs) for (const t of [-0.32, -0.16, 0.16, 0.32]) {
        const ex = dx * (Wm(w) / 2) + (dz ? t : 0), ez = dz * (Wm(w) / 2) + (dx ? t : 0)
        if (ruin && (t > 0 || dz <= 0)) {
          o.push(bx(dx ? 0.02 : 0.04, 0.05, dx ? 0.04 : 0.02, ex + dx * 0.008, y, ez + dz * 0.008))
          continue
        }
        const em: G[] = [
          bx(dx ? 0.03 : 0.05, 0.06, dx ? 0.05 : 0.03, ex + dx * 0.012, y + 0.04, ez + dz * 0.012),
          bx(dx ? 0.022 : 0.04, 0.045, dx ? 0.04 : 0.022, ex + dx * 0.034, y + 0.07, ez + dz * 0.034),
          bx(0.012, 0.06, 0.012, ex + dx * 0.05, y + 0.02, ez + dz * 0.05),
        ]
        for (const s of [-1, 1]) em.push(bx(0.014, 0.045, 0.014, ex + dx * 0.024 + dz * s * 0.014, y, ez + dz * 0.024 + dx * s * 0.014))
        P.put(whole ? 'stucco' : restored ? 'grey' : 'brick', ...em)
      }
    }
    y += H(h)
  })
  const stairTop = y
  // naga stairways on the four sides
  for (const [dx, dz] of dirs) {
    const r0 = Wm(19.5), reach = Wm(27 + (ruin ? 10 : 13)), wdt = Wm(9)
    stairs(o, dx, dz, r0 - 0.01, reach - r0 + 0.01, stairTop - H(1.5), wdt, H(1.5), ruin ? 7 : 14)
    if (!ruin) nagaRails(o, dx, dz, r0, reach - r0, stairTop - H(1.5), wdt + 0.024, H(1.5), 0, 0, 0.022)
  }
  // ruean that with a Buddha niche on each face
  const bw = Wm(30), bh = H(14)
  redent(o, bw, bh, 0, y, 0, 0.84)
  for (const [dx, dz] of dirs) {
    o.push(bx(dx ? 0.03 : bw * 0.46, bh * 1.05, dx ? bw * 0.46 : 0.03, dx * (bw / 2 + 0.01), y, dz * (bw / 2 + 0.01)))
    const ng = gable(0.03, bw * 0.46, bh * 0.3)
    if (dz) ng.rotateY(Math.PI / 2)
    o.push(at(ng, dx * (bw / 2 + 0.01), y + bh * 1.05, dz * (bw / 2 + 0.01)))
    d.push(bx(dx ? 0.004 : bw * 0.26, bh * 0.66, dx ? bw * 0.26 : 0.004, dx * (bw / 2 + 0.026), y + bh * 0.12, dz * (bw / 2 + 0.026)))
    if (!ruin) {
      const bud = [[1, 0], [0.9, 0.3], [0.45, 0.45], [0.5, 0.7], [0.35, 0.95], [0.15, 1.05], [0, 1.2]]
      gd.push(at(lathe(bud, 8, 0.03, bh * 0.5), dx * (bw / 2 + 0.012), y + bh * 0.14, dz * (bw / 2 + 0.012)))
    }
  }
  y += bh
  if (whole) {
    redentLathe(o, [[1, 0], [1, 0.06], [0.86, 0.1], [0.86, 0.2], [0.74, 0.24], [0.74, 0.32], [0, 0.32]], Wm(28) / 2, H(18), 0, y, 0, 0.84)
    y += H(18) * 0.32
    const R = Wm(9.5)
    const bell = [[1.15, 0], [1.15, 0.05], [1.05, 0.07], [1.05, 0.12], [0.95, 0.14], [0.95, 0.2], [0.9, 0.22], [0.94, 0.4],
      [0.9, 0.6], [0.75, 0.78], [0.5, 0.9], [0.25, 0.96], [0, 0.97]]
    o.push(at(lathe(bell, 20, R, H(15)), 0, y, 0))
    y += H(15) * 0.95
    redentLathe(o, [[0.34, 0], [0.34, 0.6], [0.44, 0.7], [0.44, 1], [0, 1]], R, H(3), 0, y, 0, 0.8)
    y += H(3)
    ringSpire(gd, 0, 0, y, R * 0.32, H(82) - y)
  } else {
    // broken top: the mouldings and a jagged stump of the bell
    redentLathe(o, [[1, 0], [1, 0.06], [0.86, 0.1], [0.86, 0.2], [0.74, 0.24], [0.74, 0.32], [0, 0.32]], Wm(28) / 2, H(18), 0, y, 0, 0.84)
    y += H(18) * 0.32
    o.push(at(lathe([[1.15, 0], [1.15, 0.12], [1.05, 0.16], [1.05, 0.3], [0.95, 0.34], [0.95, 0.5], [0.9, 0.54], [0.92, 1], [0, 1]], 14, Wm(9.5), H(9)), 0, y, 0))
    y += H(9)
    // the break leaves a ragged crown, higher on the west
    const r = rng(3)
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * 6.28 + r() * 0.3, dd = Wm(6 + r() * 2), s = Wm(3 + r() * 3)
      const hh = H(1.5 + r() * 4 + Math.max(0, -Math.cos(a)) * 5)
      o.push(at(new THREE.BoxGeometry(s, hh, s * 0.8).rotateY(a + r()), Math.cos(a) * dd, y + hh / 2 - H(1), Math.sin(a) * dd))
    }
    o.push(bx(Wm(9), H(2.5), Wm(9), 0, y - H(1), 0))
    if (ruin) {
      // shrubs growing on the ledges
      for (let i = 0; i < 18; i++) {
        const a = r() * 6.28, t = Math.floor(r() * 3), w = [54, 46, 39][t] / 120
        const c = Math.cos(a), s = Math.sin(a), q = Math.max(Math.abs(c), Math.abs(s))
        tree(P, (c / q) * w * 0.92, (s / q) * w * 0.92, H(1.5) + tiers.slice(0, t + 1).reduce((a, b) => a + H(b[1]), 0) - 0.01, 0.018 + r() * 0.012, 'grass')
      }
    }
  }
  P.put(mat, ...o)
  P.put('dark', ...d)
  P.put('gold', ...gd)
  P.flush()
})

// Doi Suthep: 24 m gilded chedi on the hilltop terrace, 306 naga steps up the forested slope
function doiSuthep(k: Kit) {
  const P = bag(k)
  const top = 0.1, cx = -0.1
  const hill = lathe([[1, 0], [0.86, 0.3], [0.7, 0.68], [0.6, 0.9], [0.5, 1], [0, 1]], 28, 0.6, top)
  P.put('forest', at(hill, cx, 0, 0))
  // terrace and the stucco cloister
  P.put('stucco', bx(0.58, 0.012, 0.58, cx, top, 0))
  const sub: Bag = { ...P, put: (key, ...gs) => P.put(key, ...gs.map(g => g.translate(0, top + 0.012, 0))) }
  cloister(sub, cx, 0, 0.54, 0.54, 0.045, 0.04, 'stucco', { gates: [[1, 0], [-1, 0]], tile: 'roof', edge: 'red', rise: 0.55 })
  P.put('stucco', bx(0.3, 0.006, 0.3, cx, top + 0.012, 0))
  // the chedi with gilded parasols at the corners of its fence
  const cy = top + 0.018
  lannaChedi(P, cx, 0, cy, 0.22, 0.47)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parasol(P, cx + sx * 0.13, sz * 0.13, cy, 0.17, 0.025, 6)
  for (const s of [-1, 1]) P.put('gold', bx(0.26, 0.012, 0.004, cx, cy, s * 0.13), bx(0.004, 0.012, 0.26, cx + s * 0.13, cy, 0))
  // two small viharas inside the cloister, east and west of the chedi
  for (const s of [-1, 1]) hall(sub, cx + s * 0.195, 0, 0.1, 0.07, 0.035, false, { tiers: 2, rise: 0.6, edge: 'red' })
  // naga staircase down the east slope through the trees
  const sx0 = cx + 0.29, sx1 = 0.58
  const steps: G[] = []
  stairs(steps, 1, 0, sx0, sx1 - sx0, top, 0.045, 0, 22)
  P.put('stucco', ...steps)
  const rails: G[] = []
  nagaRails(rails, 1, 0, sx0, sx1 - sx0, top, 0.06, 0, 0, 0, 0.012)
  P.put('green', ...rails)
  // trees on the slope
  const r = rng(17)
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, dd = 0.34 + r() * 0.26
    const x = cx + Math.cos(a) * dd, z = Math.sin(a) * dd
    if (x > cx + 0.25 && Math.abs(z) < 0.07) continue
    if (Math.abs(x) > 0.62 || Math.abs(z) > 0.62) continue
    const f = Math.max(0, Math.min(1, (0.6 - dd) / 0.3))
    tree(P, x, z, top * (f * 0.9) - 0.01, 0.028 + r() * 0.02, r() < 0.3 ? 'grass' : 'forest')
  }
  P.flush()
}

// Hariphunchai: 46 m copper-gilt chedi behind a bronze railing, Wihan Luang to the east facing the Kuang river
function hariphunchai(k: Kit) {
  const P = bag(k)
  P.put('stucco', bx(1.0, 0.01, 0.7, 0.02, 0, 0))
  const cx = -0.18
  P.put('stucco', bx(0.46, 0.012, 0.46, cx, 0.01, 0))
  // railing with gilded posts and four tall corner parasols
  for (const s of [-1, 1]) P.put('gold', bx(0.44, 0.03, 0.004, cx, 0.022, s * 0.22), bx(0.004, 0.03, 0.44, cx + s * 0.22, 0.022, 0))
  for (let i = -5; i <= 5; i++) for (const s of [-1, 1]) P.put('gold', bx(0.008, 0.04, 0.008, cx + i * 0.04, 0.022, s * 0.22), bx(0.008, 0.04, 0.008, cx + s * 0.22, 0.022, i * 0.04))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parasol(P, cx + sx * 0.22, sz * 0.22, 0.022, 0.42, 0.04, 7)
  lannaChedi(P, cx, 0, 0.022, 0.36, 1.38, 'gold', 4)
  // Wihan Luang: big Lanna hall facing east, low swept tiered roof
  hall(P, 0.28, 0, 0.36, 0.17, 0.07, false, { tiers: 3, rise: 0.62, edge: 'red' })
  // gilded pediment over the east porch
  P.put('gold', at(gable(0.004, 0.13, 0.07), 0.475, 0.082, 0))
  // Suwanna Chedi, the stepped brick pyramid, in the north-west
  const o: G[] = []
  for (let i = 0; i < 5; i++) o.push(bx(0.1 - i * 0.016, 0.03, 0.1 - i * 0.016, -0.42, 0.01 + i * 0.03, -0.26))
  o.push(at(new THREE.ConeGeometry(0.02, 0.08, 8), -0.42, 0.2, -0.26))
  P.put('brick', ...o)
  // small vihara south-west, and the red library
  hall(P, -0.06, 0.29, 0.14, 0.08, 0.04, false, { tiers: 2, rise: 0.6, edge: 'red' })
  P.put('red', bx(0.07, 0.05, 0.07, 0.32, 0.01, -0.27))
  thaiRoof(P, 0.08, 0.08, 0.32, 0.06, -0.27, { tiers: 2, ext: 0.01, rise: 0.8, edge: 'red' })
  P.flush()
}

// Wat Phra Mahathat, Nakhon Si Thammarat: 55 m Sri Lankan bell chedi with a gold-plated top,
// ringed by small chedis inside the Phra Rabiang cloister
function mahathatNakhon(k: Kit) {
  const P = bag(k)
  P.put('stucco', bx(1.0, 0.01, 1.0, 0, 0, 0))
  cloister(P, 0, 0, 0.98, 0.98, 0.06, 0.05, 'stucco', { gates: [[0, -1], [1, 0]], rise: 0.6 })
  // square base terrace with a walkway, the Wihan Phra Ma stair hall to the north
  const o: G[] = [], gd: G[] = []
  redent(o, 0.36, 0.045, 0, 0.01, 0, 0.86)
  o.push(bx(0.38, 0.008, 0.38, 0, 0.055, 0))
  P.put('stucco', ...o)
  hall(P, 0, -0.27, 0.12, 0.1, 0.05, true, { tiers: 2, rise: 0.7 })
  const s: G[] = []
  stairs(s, 0, -1, 0.18, 0.03, 0.055, 0.05, 0.01, 4)
  P.put('stucco', ...s)
  // the great chedi, true height 55 m in a 70 m footprint
  const c: G[] = []
  const ys = bellChedi(c, 0, 0, 0.063, 0.2, 0.95, 20)
  // the rings stay white, the top of the spire is plated in gold
  ringSpire(c, 0, 0, ys, 0.04, 1.0 - ys, 9, 12, gd, 0.5)
  P.put('stucco', ...c)
  // ring of small chedis on the court
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + 0.13, rr = 0.33
    const c2 = Math.cos(a), s2 = Math.sin(a), q = Math.max(Math.abs(c2), Math.abs(s2))
    const x = (c2 / q) * rr, z = (s2 / q) * rr
    if (z < -0.2 && Math.abs(x) < 0.08) continue
    const sm: G[] = []
    sm.push(bx(0.05, 0.015, 0.05, x, 0.01, z))
    const hh = 0.14 + (i % 3) * 0.025
    bellChedi(sm, x, z, 0.025, 0.021, hh, 6)
    P.put('stucco', ...sm)
    if (i % 3 === 0) P.put('gold', at(new THREE.ConeGeometry(0.004, hh * 0.35, 5), x, 0.025 + hh * 0.82, z))
  }
  // corner chedis with gilded tops on the terrace
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const sm: G[] = []
    const yy = bellChedi(sm, sx * 0.17, sz * 0.17, 0.063, 0.032, 0.3, 8)
    gd.push(at(new THREE.ConeGeometry(0.006, 0.08, 6), sx * 0.17, yy - 0.06, sz * 0.17))
    P.put('stucco', ...sm)
  }
  P.put('gold', ...gd)
  P.flush()
}

export const thai_5: Record<string, Builder> = {
  phimai,
  'phanom-rung': phanomRung,
  'prang-sam-yot': prangSamYot,
  'phra-that-phanom': phraThatPhanom,
  'chedi-luang': chediLuang,
  'doi-suthep': doiSuthep,
  hariphunchai,
  'wat-phra-mahathat-nakhon': mahathatNakhon,
}
