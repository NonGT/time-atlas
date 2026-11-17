import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { gable, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
type P = [number, number]
const SQ2 = Math.SQRT2
const dirs: P[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const lam = (c: string, e = '#000000', map?: THREE.Texture) => {
  const m = new THREE.MeshLambertMaterial({ color: c, emissive: e })
  if (map) m.map = map
  return m
}

// Chinese porcelain mosaic: off-white with blue, orange, green and gold flecks
function porcelainMap() {
  if (typeof document === 'undefined') return undefined
  const c = document.createElement('canvas'), S = 256
  c.width = c.height = S
  const x = c.getContext('2d')!
  x.fillStyle = '#ece7dc'; x.fillRect(0, 0, S, S)
  const cols = ['#4f7fb0', '#4f7fb0', '#6d98c4', '#c8622e', '#2f7a4a', '#d9a93a', '#b7b0a2']
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 1100; i++) {
    x.fillStyle = cols[Math.floor(rnd() * cols.length)]
    const r = 0.8 + rnd() * 1.4
    x.beginPath(); x.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2); x.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 4)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

let mats: ReturnType<typeof makeMats> | undefined
function makeMats() {
  return {
    gold: lam('#d9a93a', '#3a2a08'),
    white: lam('#efe9dc'),
    stucco: lam('#e4ddcf'),
    grey: lam('#b9b3a8'),
    porc: lam('#ffffff', '#000000', porcelainMap()),
    blue: lam('#4f7fb0'),
    orange: lam('#c8622e'),
    green: lam('#2f7a4a'),
    red: lam('#a8322a'),
    tree: lam('#3f6e3a'),
    grass: lam('#6f9a56'),
    bronze: lam('#3a3530', '#0c0a08'),
    statue: lam('#5a4632'),
    paving: lam('#cfc9bd'),
    concrete: lam('#d9d5cc'),
    water: lam('#6f9fb8'),
  }
}
const M = () => (mats ??= makeMats())

const at = <T extends G>(g: T, x: number, y: number, z: number) => { g.translate(x, y, z); return g }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z)
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 16) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n), x, y + h / 2, z)
function lathe(pts: number[][], seg: number, sr: number, sh: number, rot = 0) {
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)), seg)
  if (rot) g.rotateY(rot)
  return g
}
const redent = (o: G[], w: number, h: number, x: number, y: number, z: number, f = 0.8) => {
  o.push(bx(w, h, w * f, x, y, z), bx(w * f, h, w, x, y, z))
}

/** Flat ring from r0 to r1 with its top at h, so neighbouring rings never overlap. */
const ring = (r0: number, r1: number, h: number, n = 40) => lathe([[r1, 0], [r1, h], [r0, h]], n, 1, 1)

/** Collects geometry per material and merges each pile into one mesh. */
class Piles {
  piles = new Map<THREE.Material, G[]>()
  constructor(public k: Kit) {}
  on(m: THREE.Material) {
    let p = this.piles.get(m)
    if (!p) this.piles.set(m, (p = []))
    return p
  }
  done() {
    for (const [m, gs] of this.piles) {
      if (!gs.length) continue
      const flat = gs.map(g => {
        const n = g.index ? g.toNonIndexed() : g
        for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') n.deleteAttribute(a)
        if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2))
        return n
      })
      this.k.add(mergeGeometries(flat)!, 0, 0, 0, m)
    }
  }
}

/** Redented square section (ย่อมุมไม้สิบสอง), unit half-width. */
function redentSection(a = 0.56, b = 0.8): P[] {
  const q: P[] = [[1, a], [b, a], [b, b], [a, b], [a, 1]]
  const out: P[] = []
  for (let r = 0; r < 4; r++) for (const [qx, qz] of q) {
    let x = qx, z = qz
    for (let j = 0; j < r; j++) [x, z] = [-z, x]
    out.push([x, z])
  }
  return out
}

const notchSection = (a = 0.62): P[] => {
  const out: P[] = []
  for (let r = 0; r < 4; r++) for (const [qx, qz] of [[1, a], [a, a], [a, 1]]) {
    let x = qx, z = qz
    for (let j = 0; j < r; j++) [x, z] = [-z, x]
    out.push([x, z])
  }
  return out
}

function starSection(n: number, inner: number): P[] {
  const out: P[] = []
  for (let i = 0; i < n * 2; i++) {
    const t = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? inner : 1
    out.push([Math.cos(t) * r, Math.sin(t) * r])
  }
  return out
}

/** Profile [radius, height] swept along a polygon section, flat-shaded. */
function sweep(sec: P[], prof: number[][], sr: number, sh: number, x = 0, y = 0, z = 0) {
  let area = 0
  for (let i = 0; i < sec.length; i++) { const [ax, az] = sec[i], [bx2, bz] = sec[(i + 1) % sec.length]; area += ax * bz - bx2 * az }
  const pos: number[] = [], uv: number[] = [], n = sec.length
  for (let j = 0; j < prof.length - 1; j++) {
    const [r0, y0] = prof[j], [r1, y1] = prof[j + 1]
    for (let i = 0; i < n; i++) {
      const a = sec[i], b = sec[(i + 1) % n]
      const A0 = [a[0] * r0 * sr + x, y0 * sh + y, a[1] * r0 * sr + z], B0 = [b[0] * r0 * sr + x, y0 * sh + y, b[1] * r0 * sr + z]
      const A1 = [a[0] * r1 * sr + x, y1 * sh + y, a[1] * r1 * sr + z], B1 = [b[0] * r1 * sr + x, y1 * sh + y, b[1] * r1 * sr + z]
      const u0 = i / n, u1 = (i + 1) / n
      const tri = area > 0 ? [A0, B1, B0, A0, A1, B1] : [A0, B0, B1, A0, B1, A1]
      const tuv = area > 0 ? [[u0, y0], [u1, y1], [u1, y0], [u0, y0], [u0, y1], [u1, y1]] : [[u0, y0], [u1, y0], [u1, y1], [u0, y0], [u1, y1], [u0, y1]]
      for (const v of tri) pos.push(...v)
      for (const v of tuv) uv.push(...v)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Corn-cob prang tower profile, unit radius and height. */
function prangProfile(tiers = 7, top = 0.8, simple = false) {
  const pts: number[][] = [[1, 0]]
  const r = (t: number) => 1 - 0.8 * Math.pow(t, 1.7)
  for (let i = 0; i < tiers; i++) {
    const y0 = (i / tiers) * top, y1 = ((i + 1) / tiers) * top, r0 = r(i / tiers), r1 = r((i + 1) / tiers)
    if (simple) pts.push([r0 * 1.12, y0 + 0.02], [r1, y1])
    else pts.push([r0 * 1.12, y0 + 0.008], [r0 * 0.97, y0 + 0.03], [r1, y1])
  }
  if (simple) pts.push([0.2, top + 0.04], [0.06, top + 0.1], [0.02, 0.95], [0, 1])
  else pts.push([0.24, top + 0.02], [0.15, top + 0.06], [0.17, top + 0.075], [0.06, top + 0.12], [0.03, 0.93], [0, 1])
  return pts
}

/** Ringed spire (ปล้องไฉน) ending in a tip, unit radius and height. */
function spireProfile(n = 7) {
  const pts: number[][] = []
  for (let i = 0; i < n; i++) {
    const r0 = 1 - 0.72 * (i / n), y0 = (0.62 * i) / n
    pts.push([r0, y0], [r0 * 0.84, y0 + (0.62 / n) * 0.9])
  }
  pts.push([0.22, 0.64], [0.12, 0.76], [0.07, 0.86], [0.1, 0.89], [0.03, 0.93], [0, 1])
  return pts
}

/** Thai bell chedi (ทรงระฆัง) on three round rings, harmika and ringed spire. */
function bellChedi(o: G[], x: number, z: number, y: number, R: number, H: number, seg = 20) {
  const pts = [[1, 0], [1, 0.035], [0.92, 0.05], [0.92, 0.075], [0.84, 0.09], [0.84, 0.115], [0.76, 0.13],
    [0.7, 0.14], [0.72, 0.2], [0.7, 0.27], [0.61, 0.34], [0.46, 0.39], [0.28, 0.415], [0, 0.42]]
  o.push(at(lathe(pts, seg, R, H), x, y, z))
  o.push(bx(R * 0.5, H * 0.05, R * 0.5, x, y + H * 0.41, z), bx(R * 0.58, H * 0.012, R * 0.58, x, y + H * 0.46, z))
  o.push(cyl(R * 0.16, R * 0.16, H * 0.04, x, y + H * 0.472, z, 8))
  o.push(at(lathe(spireProfile(8), seg >> 1, R * 0.2, H * 0.49), x, y + H * 0.51, z))
}

/** Square tiered mondop roof ending in a needle, w is the half-width at the base. */
function mondopSpire(o: G[], x: number, z: number, y: number, w: number, h: number, tiers = 5) {
  const pts: number[][] = [[1, 0]]
  for (let i = 0; i < tiers; i++) {
    const r = 1 - i * (0.62 / tiers), y0 = (i * 0.45) / tiers
    pts.push([r, y0 + 0.05], [r * 0.8, y0 + 0.06], [r * 0.84, y0 + 0.45 / tiers])
  }
  pts.push([0.3, 0.5], [0.22, 0.6], [0.12, 0.7], [0.05, 0.85], [0.015, 1], [0, 1])
  o.push(at(lathe(pts, 4, w * SQ2, h, Math.PI / 4), x, y, z))
}

/**
 * Thai hall roof along x (or z): orange tiles with a green border, tiers stepping down at the gable ends,
 * gold gable boards and chofa hooks at the ridge ends.
 */
function thaiRoof(p: Piles, l: number, dd: number, x: number, y: number, z: number, alongZ = false, tiers = 3) {
  const m = M(), step = l * 0.09, H = dd * 0.62, th = Math.max(0.004, dd * 0.04)
  const put = (g: G, ox: number, oy: number, oz: number) => {
    if (alongZ) g.rotateY(Math.PI / 2)
    return alongZ ? at(g, x + oz, y + oy, z + ox) : at(g, x + ox, y + oy, z + oz)
  }
  for (let i = 0; i < tiers; i++) {
    const L = l - 2 * step * i, D = dd * (1 - 0.14 * i), h = H * (1 - 0.14 * i), yy = i * dd * 0.16
    const ang = Math.atan2(h, D / 2), b = D * 0.14
    p.on(m.orange).push(put(gable(L, D, h), 0, yy, 0))
    for (const s of [-1, 1]) {
      // green tile border along the eave, sitting on the slope
      const e = new THREE.BoxGeometry(L, th, b)
      e.rotateX(s * ang)
      p.on(m.green).push(put(e, 0, yy + (b / 2) * Math.sin(ang) + (th / 2) * Math.cos(ang), s * (D / 2 - (b / 2) * Math.cos(ang) + (th / 2) * Math.sin(ang))))
      // gold pediment, chofa on the top ridge, hang hong at the eave corners
      p.on(m.gold).push(put(gable(th * 1.5, D * 0.94, h * 0.94), s * (L / 2 + th), yy, 0))
      if (i === tiers - 1) {
        const c = new THREE.BoxGeometry(th, dd * 0.3, th)
        c.rotateZ(-s * 0.45)
        p.on(m.gold).push(put(c, s * (L / 2 + dd * 0.04), yy + h + dd * 0.1, 0))
      }
      for (const e2 of [-1, 1]) p.on(m.gold).push(put(new THREE.BoxGeometry(th, dd * 0.12, th), s * (L / 2 + th), yy + dd * 0.05, e2 * D * 0.47))
    }
  }
}

/** Ubosot or vihara: raised base, white walls with red doors, tiered roof; sema stones if it is an ubosot. */
function hall(p: Piles, x: number, z: number, l: number, w: number, h: number, alongZ = false, sema = false) {
  const m = M()
  const L = alongZ ? w : l, D = alongZ ? l : w
  p.on(m.white).push(bx(L + 0.02, h * 0.15, D + 0.02, x, 0, z))
  p.on(m.white).push(bx(L, h * 0.6, D, x, h * 0.15, z))
  // door and windows
  for (const s of [-1, 1]) {
    if (alongZ) p.on(m.red).push(bx(w * 0.25, h * 0.4, 0.004, x, h * 0.15, z + s * (l / 2 + 0.001)))
    else p.on(m.red).push(bx(0.004, h * 0.4, w * 0.25, x + s * (l / 2 + 0.001), h * 0.15, z))
    for (let i = 0; i < 4; i++) {
      const t = -0.3 + (i / 3) * 0.6
      if (alongZ) p.on(m.red).push(bx(0.004, h * 0.25, l * 0.07, x + s * (w / 2 + 0.001), h * 0.3, z + t * l))
      else p.on(m.red).push(bx(l * 0.07, h * 0.25, 0.004, x + t * l, h * 0.3, z + s * (w / 2 + 0.001)))
    }
  }
  thaiRoof(p, l * 1.06, w * 1.25, x, h * 0.75, z, alongZ, 3)
  if (sema) for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const sx = x + dx * (L / 2 + 0.03), sz = z + dz * (D / 2 + 0.03)
    p.on(m.white).push(bx(0.012, 0.006, 0.012, sx, 0, sz))
    p.on(m.gold).push(at(new THREE.ConeGeometry(0.005, 0.016, 4), sx, 0.014, sz))
  }
}

/** Row of small lotus-bud finials along the edges of a square tier of half-width r at height y. */
function budRow(o: G[], r: number, y: number, per: number, s: number, cx = 0, cz = 0) {
  for (let i = 0; i <= per; i++) {
    const t = -r * 0.5 + (r * i) / per
    for (const [px, pz] of [[t, -r], [t, r], [-r, t], [r, t]] as P[]) o.push(at(new THREE.ConeGeometry(s, s * 3, 4, 1, true), cx + px, y + s * 1.5, cz + pz))
  }
}

function watArun(k: Kit) {
  // central prang about 82 m on a stepped base about 37 m square, four minor prangs, four mondops, ubosot to the west
  const p = new Piles(k), m = M(), sec = redentSection()
  const cx = 0.08
  const P = p.on(m.porc), W = p.on(m.white), D = p.on(m.grey), B = p.on(m.blue)
  W.push(bx(0.86, 0.02, 0.86, cx, 0, 0))
  // low crenellated wall round the platform
  for (const s of [-1, 1]) W.push(bx(0.86, 0.025, 0.01, cx, 0.02, s * 0.425), bx(0.01, 0.025, 0.86, cx + s * 0.425, 0.02, 0))
  const ts = [[0.31, 0.09], [0.25, 0.09], [0.195, 0.085], [0.15, 0.06]]
  let y = 0.02
  for (const [r, h] of ts) {
    P.push(sweep(sec, [[1, 0], [1, 0.8], [1.04, 0.9], [0.96, 1]], r, h, cx, y, 0))
    B.push(sweep(sec, [[1.01, 0.6], [1.01, 0.72]], r, h, cx, y, 0))
    // giants and monkeys in niches round each tier
    if (y < 0.15) for (const [dx, dz] of dirs) for (const t of [-0.5, 0.5]) {
      const ox = cx + dx * (r + 0.002) + (dz ? t * r : 0), oz = dz * (r + 0.002) + (dx ? t * r : 0)
      D.push(bx(dx ? 0.004 : 0.03, h * 0.5, dx ? 0.03 : 0.004, ox, y + h * 0.12, oz))
    }
    budRow(P, r * 0.98, y + h, 2, 0.006, cx, 0)
    y += h
  }
  // the steep stairs up the four faces, with a porch at each landing
  for (const [dx, dz] of dirs) {
    let yy = 0.02
    for (let i = 0; i < 3; i++) {
      const r0 = ts[i][0] + 0.035, r1 = ts[i + 1][0] - 0.005, h = ts[i][1]
      const run = r0 - r1, len = Math.hypot(run, h), ang = Math.atan2(h, run)
      const st = new THREE.BoxGeometry(len, 0.012, 0.04)
      st.rotateZ(-ang)
      st.translate((r0 + r1) / 2, yy + h / 2, 0)
      if (dz) st.rotateY(dz > 0 ? -Math.PI / 2 : Math.PI / 2)
      else if (dx < 0) st.rotateY(Math.PI)
      D.push(at(st, cx, 0, 0))
      yy += h
    }
  }
  // the tower: redented body with Indra-on-Erawan niches, then the corn-cob prang and trident
  const R = 0.11, by = y
  P.push(sweep(sec, [[1.05, 0], [1.05, 0.04], [1, 0.05], [1, 0.12]], R, 1, cx, by, 0))
  for (const [dx, dz] of dirs) {
    W.push(bx(dx ? 0.03 : 0.07, 0.1, dx ? 0.07 : 0.03, cx + dx * R * 1.05, by, dz * R * 1.05))
    D.push(bx(dx ? 0.003 : 0.032, 0.06, dx ? 0.032 : 0.003, cx + dx * (R * 1.05 + 0.016), by + 0.01, dz * (R * 1.05 + 0.016)))
    W.push(at(new THREE.ConeGeometry(0.022, 0.06, 4, 1, true).rotateY(Math.PI / 4), cx + dx * R * 1.05, by + 0.13, dz * R * 1.05))
  }
  const top = 1.18, ty = by + 0.12
  P.push(sweep(sec, prangProfile(7, 0.84), R * 0.98, top - ty, cx, ty, 0))
  B.push(sweep(sec, [[1.13, 0], [1.13, 0.012]], R * 0.98, top - ty, cx, ty + (top - ty) * 0.03, 0))
  const fy = top - 0.04
  for (const s of [-1, 1]) D.push(bx(0.003, 0.02, 0.003, cx + s * 0.008, fy, 0))
  // minor prangs at the corners, mondops at the cardinal points
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx * 0.34, z = sz * 0.34, r = 0.042
    P.push(sweep(notchSection(), [[1.6, 0], [1.6, 0.06], [1.3, 0.08], [1.3, 0.13], [1.15, 0.15]], r, 1, x, 0.02, z))
    P.push(sweep(notchSection(), prangProfile(5, 0.8, true), r, 0.3, x, 0.17, z))
  }
  for (const [dx, dz] of dirs) {
    const x = cx + dx * 0.36, z = dz * 0.36
    W.push(bx(0.07, 0.015, 0.07, x, 0.02, z), bx(0.055, 0.06, 0.055, x, 0.035, z))
    D.push(bx(dx ? 0.003 : 0.022, 0.04, dx ? 0.022 : 0.003, x + dx * 0.029, 0.035, z + dz * 0.029))
    p.on(m.blue).push(bx(0.06, 0.008, 0.06, x, 0.095, z))
    mondopSpire(P, x, z, 0.103, 0.032, 0.17, 4)
  }
  // ubosot behind, facing the river; landing on the river bank to the east
  hall(p, -0.5, 0, 0.22, 0.11, 0.1, false, true)
  W.push(bx(0.06, 0.01, 0.2, 0.555, 0, 0))
  p.on(m.red).push(cyl(0.004, 0.004, 0.04, 0.57, 0.01, -0.08, 6), cyl(0.004, 0.004, 0.04, 0.57, 0.01, 0.08, 6))
  p.done()
}

/** Path winding round a hill of radius r(y), lying on the slope. */
function helix(r: (y: number) => number, y0: number, y1: number, turns: number, w: number, n = 120, a0 = 0) {
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = y0 + (y1 - y0) * t, a = a0 + t * turns * Math.PI * 2
    const ri = r(y + w * 0.6) + 0.007, ro = r(y - w * 0.6) + 0.007
    const c = Math.cos(a), s = Math.sin(a)
    pos.push(c * ri, y + w * 0.6 + 0.003, s * ri, c * ro, y - w * 0.6 + 0.003, s * ro)
  }
  for (let i = 0; i < n; i++) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function goldenMount(k: Kit) {
  // man-made hill about 58 m high, 344 steps winding up it, square terrace and gilded chedi on top, 80 m in all
  const p = new Piles(k), m = M()
  const hp = [[0.42, 0], [0.41, 0.025], [0.37, 0.09], [0.32, 0.2], [0.27, 0.32], [0.22, 0.42], [0.17, 0.5], [0.13, 0.55], [0.11, 0.57], [0, 0.57]]
  const rAt = (y: number) => {
    for (let i = 0; i < hp.length - 2; i++) if (y <= hp[i + 1][1]) { const [r0, y0] = hp[i], [r1, y1] = hp[i + 1]; return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0) }
    return 0.11
  }
  p.on(m.tree).push(lathe(hp, 28, 1, 1))
  // white retaining walls in rings up the slope
  for (const y of [0, 0.2, 0.42]) {
    const r = rAt(y)
    p.on(m.white).push(lathe([[r + 0.012, 0], [r + 0.012, 0.03], [rAt(y + 0.03), 0.03]], 28, 1, 1).translate(0, y, 0))
  }
  p.on(m.white).push(helix(rAt, 0.04, 0.54, 1.8, 0.009, 110, 0.9))
  // tree crowns on the slopes
  let s = 11
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 46; i++) {
    const y = 0.05 + rnd() * 0.45, a = rnd() * Math.PI * 2, r = rAt(y) + 0.012, sz = 0.022 + rnd() * 0.016
    const t = new THREE.IcosahedronGeometry(sz, 0)
    t.scale(1, 0.85, 1)
    p.on(i % 3 ? m.tree : m.grass).push(at(t, Math.cos(a) * r, y + sz * 0.3, Math.sin(a) * r))
  }
  // summit: white square terrace with balustrade, small corner chedis, gilded bell chedi
  const ty = 0.57
  redent(p.on(m.white), 0.2, 0.05, 0, ty, 0, 0.84)
  p.on(m.white).push(bx(0.22, 0.008, 0.22, 0, ty + 0.05, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.on(m.white).push(bx(0.02, 0.025, 0.02, sx * 0.1, ty + 0.058, sz * 0.1))
    p.on(m.gold).push(at(new THREE.ConeGeometry(0.008, 0.035, 6), sx * 0.1, ty + 0.1, sz * 0.1))
  }
  for (const [dx, dz] of dirs) p.on(m.red).push(bx(dx ? 0.003 : 0.03, 0.03, dx ? 0.03 : 0.003, dx * 0.101, ty + 0.01, dz * 0.101))
  redent(p.on(m.white), 0.13, 0.03, 0, ty + 0.058, 0, 0.8)
  bellChedi(p.on(m.gold), 0, 0, ty + 0.088, 0.062, 0.3, 24)
  // Wat Saket at the foot of the hill
  hall(p, 0.3, 0.48, 0.2, 0.09, 0.08, false, true)
  hall(p, -0.3, 0.48, 0.16, 0.08, 0.07, false)
  p.on(m.white).push(bx(0.05, 0.02, 0.08, 0.0, 0, 0.44))
  p.done()
}

/** Loha Prasat spire: small square pavilion carrying a black metal tiered spire. */
function lohaSpire(p: Piles, x: number, z: number, y: number, w: number, h: number, base = 0.18) {
  const m = M()
  if (base) p.on(m.white).push(bx(w, h * base, w, x, y, z))
  const pts = [[1, 0], [1, 0.08], [0.7, 0.14], [0.66, 0.24], [0.44, 0.34], [0.42, 0.44], [0.14, 0.66], [0.02, 1], [0, 1]]
  p.on(m.bronze).push(at(lathe(pts, 4, (w / 2) * SQ2 * 0.95, h * (1 - base), Math.PI / 4), x, y + h * base, z))
}

function lohaPrasat(k: Kit) {
  // three square tiers 36 m high with 37 metal spires (24, 12 and 1), ubosot and vihara to the south
  const p = new Piles(k), m = M()
  const cx = 0.04, cz = -0.12
  const W = p.on(m.white), Dk = p.on(m.grey)
  const tiers: [number, number, number][] = [[0.5, 0, 0.13], [0.33, 0.13, 0.12], [0.18, 0.25, 0.11]]
  for (const [w, y, h] of tiers) {
    redent(W, w, h, cx, y, cz, 0.9)
    for (const s of [-1, 1]) {
      p.on(m.red).push(bx(w * 1.01, 0.01, 0.006, cx, y + h - 0.016, cz + s * w * 0.503), bx(0.006, 0.01, w * 1.01, cx + s * w * 0.503, y + h - 0.016, cz))
    }
    // arched passages through each tier
    const n = Math.round(w / 0.05)
    for (const [dx, dz] of dirs) for (let i = 0; i < n; i++) {
      const t = -w / 2 + ((i + 0.5) * w) / n
      const ox = cx + (dx ? dx * (w / 2 + 0.001) : t), oz = cz + (dz ? dz * (w / 2 + 0.001) : t)
      Dk.push(bx(dx ? 0.003 : 0.016, h * 0.5, dx ? 0.016 : 0.003, ox, y + h * 0.15, oz))
    }
  }
  const spires = (w: number, y: number, per: number, sw: number, sh: number) => {
    for (let i = 0; i < per; i++) {
      const t = -w / 2 + (i * w) / per
      for (const [x, z] of [[t, -w / 2], [w / 2, t], [-t, w / 2], [-w / 2, -t]]) lohaSpire(p, cx + x, cz + z, y, sw, sh)
    }
  }
  spires(0.45, 0.13, 6, 0.038, 0.13)
  spires(0.285, 0.25, 3, 0.042, 0.15)
  lohaSpire(p, cx, cz, 0.36, 0.15, 0.4, 0)
  p.on(m.gold).push(cyl(0.003, 0.001, 0.03, cx, 0.76, cz, 4))
  // stair porches on the four sides
  for (const [dx, dz] of dirs) W.push(bx(dx ? 0.06 : 0.07, 0.06, dx ? 0.07 : 0.06, cx + dx * 0.27, 0, cz + dz * 0.27))
  hall(p, -0.22, 0.42, 0.24, 0.11, 0.09, false, true)
  hall(p, 0.3, 0.42, 0.24, 0.11, 0.09, false)
  p.done()
}

function phraSumen(k: Kit) {
  // octagonal brick fort about 17 m high on the river, a small lookout pavilion on top, Santi Chai Prakan lawn to the north
  const p = new Piles(k), m = M()
  const W = p.on(m.white), Dk = p.on(m.grey)
  p.on(m.grass).push(bx(0.5, 0.006, 0.26, -0.08, 0, -0.45))
  const oct = (r: number, h: number, y: number, rt = r) => { const g = new THREE.CylinderGeometry(rt, r, h, 8); g.rotateY(Math.PI / 8); return at(g, 0, y + h / 2, 0) }
  const R1 = 0.27, H1 = 0.18, R2 = 0.15, H2 = 0.09
  W.push(oct(R1 + 0.02, 0.02, 0), oct(R1, H1, 0.02, R1 * 0.97))
  W.push(oct(R1 * 0.99, 0.01, 0.02 + H1))
  const merlons = (r: number, y: number, per: number, hh: number, ports: boolean) => {
    for (let s = 0; s < 8; s++) {
      const a0 = (s / 8) * Math.PI * 2 + Math.PI / 8, a1 = a0 + Math.PI / 4
      const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r
      const ang = Math.atan2(z1 - z0, x1 - x0), len = Math.hypot(x1 - x0, z1 - z0)
      for (let i = 0; i < per; i++) {
        const t = (i + 0.5) / per, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t
        const g = new THREE.BoxGeometry((len / per) * 0.6, hh, 0.014)
        const c = new THREE.ConeGeometry((len / per) * 0.42, hh * 0.6, 4)
        c.rotateY(Math.PI / 4); c.scale(1, 1, 0.3); c.translate(0, hh * 0.8, 0)
        for (const q of [g, c]) { q.rotateY(-ang); W.push(at(q, x, y + hh / 2, z)) }
      }
      if (ports) {
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
        for (const t of [-0.25, 0.25]) {
          const g = new THREE.BoxGeometry(0.018, 0.022, 0.004); g.rotateY(-ang)
          Dk.push(at(g, mx * 1.015 + (x1 - x0) * t, 0.11, mz * 1.015 + (z1 - z0) * t))
        }
      }
    }
  }
  merlons(R1 * 0.985, 0.02 + H1, 4, 0.03, true)
  W.push(oct(R2, H2, 0.02 + H1), oct(R2 * 1.02, 0.008, 0.02 + H1 + H2))
  merlons(R2 * 0.99, 0.02 + H1 + H2, 2, 0.022, false)
  // gate on the land side
  Dk.push(bx(0.004, 0.07, 0.045, R1 * 0.985, 0.02, 0))
  // lookout pavilion (หอรบ) on top
  const py = 0.028 + H1 + H2
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.on(m.white).push(bx(0.01, 0.045, 0.01, sx * 0.04, py, sz * 0.04))
  p.on(m.white).push(bx(0.1, 0.012, 0.1, 0, py, 0))
  thaiRoof(p, 0.11, 0.11, 0, py + 0.045, 0, false, 2)
  p.done()
}

function democracy(k: Kit) {
  // roundabout 48 m across: four 24 m wings round a central turret carrying the constitution on a phan
  const p = new Piles(k), m = M()
  p.on(m.paving).push(ring(0.45, 0.5, 0.012), ring(0, 0.2, 0.02))
  p.on(m.grass).push(ring(0.2, 0.45, 0.016))
  // cannons set muzzle down round the kerb
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    p.on(m.bronze).push(cyl(0.006, 0.005, 0.022, Math.cos(a) * 0.475, 0.008, Math.sin(a) * 0.475, 5))
  }
  // central turret: plinth, six doors, the phan and constitution book
  const C = p.on(m.concrete)
  C.push(cyl(0.12, 0.12, 0.03, 0, 0.02, 0, 32), cyl(0.09, 0.09, 0.03, 0, 0.05, 0, 32), cyl(0.065, 0.065, 0.1, 0, 0.08, 0, 24))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, g = new THREE.BoxGeometry(0.008, 0.055, 0.024)
    g.rotateY(-a)
    p.on(m.grey).push(at(g, Math.cos(a) * 0.064, 0.115, Math.sin(a) * 0.064))
  }
  C.push(cyl(0.07, 0.072, 0.012, 0, 0.18, 0, 24))
  const phan = [[0.3, 0], [0.18, 0.2], [0.18, 0.4], [0.5, 0.55], [0.5, 0.62], [0.24, 0.66], [0.24, 0.72], [1, 0.84], [1, 1], [0, 1]]
  p.on(m.gold).push(lathe(phan, 20, 0.05, 0.06).translate(0, 0.192, 0))
  p.on(m.gold).push(bx(0.056, 0.05, 0.034, 0, 0.252, 0))
  p.on(m.concrete).push(bx(0.058, 0.004, 0.036, 0, 0.3, 0))
  // the four wings, standing radially on the diagonals with a fountain basin in front of each
  const wing = new THREE.Shape()
  wing.moveTo(0, 0); wing.lineTo(0.15, 0); wing.lineTo(0.15, 0.04)
  wing.quadraticCurveTo(0.07, 0.08, 0.05, 0.28)
  wing.quadraticCurveTo(0.04, 0.46, 0.012, 0.56)
  wing.lineTo(0, 0.56); wing.closePath()
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const g = new THREE.ExtrudeGeometry(wing, { depth: 0.05, bevelEnabled: false, curveSegments: 6 })
    g.translate(0.24, 0.016, -0.025)
    g.rotateY(-a)
    C.push(g)
    const rel = new THREE.BoxGeometry(0.1, 0.035, 0.056); rel.translate(0.31, 0.034, 0); rel.rotateY(-a)
    p.on(m.grey).push(rel)
    const pool = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12); pool.translate(0.42, 0.02, 0); pool.rotateY(-a)
    p.on(m.water).push(pool)
  }
  p.done()
}

function victory(k: Kit) {
  // obelisk of five bayonets, 50 m, with five bronze statues at its foot in the middle of a big roundabout
  const p = new Piles(k), m = M()
  p.on(m.grass).push(ring(0.3, 0.5, 0.012))
  p.on(m.paving).push(ring(0.22, 0.3, 0.018))
  const C = p.on(m.concrete)
  C.push(cyl(0.22, 0.22, 0.04, 0, 0, 0, 36), cyl(0.17, 0.17, 0.05, 0, 0.04, 0, 36))
  const sec = starSection(5, 0.36)
  C.push(sweep(sec, [[1, 0], [0.95, 0.12], [0.78, 0.5], [0.56, 0.82], [0.34, 0.93], [0, 1]], 0.12, 1.36, 0, 0.09, 0))
  C.push(sweep(sec, [[1.15, 0], [1.15, 0.03], [1.0, 0.04]], 0.12, 1, 0, 0.09, 0))
  // statues between the fins: army, navy, air force, police, civilian
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + ((i + 0.5) / 5) * Math.PI * 2, r = 0.135
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    p.on(m.grey).push(bx(0.034, 0.018, 0.034, x, 0.09, z))
    p.on(m.statue).push(cyl(0.011, 0.009, 0.05, x, 0.108, z, 6), at(new THREE.IcosahedronGeometry(0.009, 0), x, 0.166, z))
  }
  p.done()
}

export const thai_2: Record<string, Builder> = {
  'wat-arun': watArun,
  'golden-mount': goldenMount,
  'loha-prasat': lohaPrasat,
  'phra-sumen-fort': phraSumen,
  'democracy-monument': democracy,
  'victory-monument': victory,
}
