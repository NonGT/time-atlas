import * as THREE from 'three'
import { doubleSided, gable, merge, staged, type Builder, type Kit } from './kit'

type Num = number | ((t: number) => number)
const val = (v: Num, t: number) => (typeof v === 'number' ? v : v(t))

/** Box geometry with its base at y, optionally turned about Y. */
function boxG(w: number, h: number, d: number, y: number, x = 0, z = 0, rot = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rot) g.rotateY(rot)
  g.translate(x, y + h / 2, z)
  return g
}

/** Box whose top face is shrunk to wt x dt: battered walls, platform mounds, tapered towers. */
function frustum(w: number, h: number, d: number, wt: number, dt: number, y = 0, x = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, (p.getX(i) * wt) / w); p.setZ(i, (p.getZ(i) * dt) / d) }
  g.computeVertexNormals()
  g.translate(x, y + h / 2, z)
  return g
}

/**
 * Wall following an elliptical arc (angle t from +x towards +z). Thickness tb at the foot and tt at the top,
 * height and foot level may vary along the arc. Use with a double-sided material.
 */
function arcWall(cx: number, cz: number, rx: number, rz: number, tb: number, tt: number, h: Num, a0: number, a1: number, n = 32, y0: Num = 0) {
  const pos: number[] = [], idx: number[] = []
  const pt = (t: number, o: number, y: number) => [cx + (rx + o) * Math.cos(t), y, cz + (rz + o) * Math.sin(t)]
  const strip = (f: (t: number) => [number[], number[]]) => {
    const s = pos.length / 3
    for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n, [a, b] = f(t); pos.push(...a, ...b) }
    for (let i = 0; i < n; i++) { const j = s + i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2) }
  }
  const top = (t: number) => val(y0, t) + val(h, t)
  strip(t => [pt(t, tb / 2, val(y0, t)), pt(t, tt / 2, top(t))])
  strip(t => [pt(t, -tt / 2, top(t)), pt(t, -tb / 2, val(y0, t))])
  strip(t => [pt(t, tt / 2, top(t)), pt(t, -tt / 2, top(t))])
  for (const t of [a0, a1]) {
    const s = pos.length / 3
    pos.push(...pt(t, tb / 2, val(y0, t)), ...pt(t, tt / 2, top(t)), ...pt(t, -tt / 2, top(t)), ...pt(t, -tb / 2, val(y0, t)))
    idx.push(s, s + 1, s + 2, s, s + 2, s + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const ring = (cx: number, cz: number, r: number, t: number, h: number, a0 = 0, a1 = Math.PI * 2, n = 40) =>
  arcWall(cx, cz, r, r, t, t * 0.8, h, a0, a1, n)

function disc(r: number, y: number, x: number, z: number, sx = 1, sz = 1, seg = 32) {
  const g = new THREE.CircleGeometry(r, seg)
  g.rotateX(-Math.PI / 2)
  g.scale(sx, 1, sz)
  g.translate(x, y, z)
  return g
}

function gobekliTepe(k: Kit) {
  // round enclosures A-D dug into the hill, ringed by T-shaped pillars; D is about 20 m across with two 5.5 m central pillars
  const V = 1.6, S = 30
  const wall = doubleSided(k.mat), walls: THREE.BufferGeometry[] = [], pillars: THREE.BufferGeometry[] = [], floors: THREE.BufferGeometry[] = []
  const tee = (x: number, z: number, a: number, h: number, L = 0.04, t = 0.013) => {
    // stem along the radial direction a, head overhangs towards the centre
    const st = new THREE.BoxGeometry(L, h * 0.8, t)
    st.translate(0, h * 0.4, 0)
    const hd = new THREE.BoxGeometry(L * 1.8, h * 0.2, t * 1.2)
    hd.translate(-L * 0.35, h * 0.9, 0)
    for (const g of [st, hd]) { g.rotateY(-a); g.translate(x, 0, z); pillars.push(g) }
  }
  const encl = (cx: number, cz: number, r: number, n: number, ph: number, central?: number) => {
    walls.push(ring(cx, cz, r, 0.03, 0.055, 0, Math.PI * 2, 48))
    floors.push(disc(r - 0.015, 0.003, cx, cz))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3
      tee(cx + (r - 0.03) * Math.cos(a), cz + (r - 0.03) * Math.sin(a), a, (ph / S) * V)
    }
    if (central) for (const s of [-1, 1]) tee(cx + s * 0.065, cz, Math.PI / 2 + 0.25, (central / S) * V, 0.085, 0.022)
  }
  encl(0.12, 0.1, 0.3, 10, 3.6, 5.5)
  encl(-0.28, -0.2, 0.19, 7, 3, 4.2)
  encl(-0.33, 0.25, 0.15, 6, 2.8, 3.8)
  encl(0.08, -0.38, 0.12, 5, 2.6, 3.4)
  merge(k, walls, wall)
  merge(k, pillars)
  merge(k, floors, k.dark)
}

function towerOfJericho(k: Kit) {
  // stone tower 9 m across at the foot, about 8.5 m high, with an inner stair of 22 steps
  // entered from the east; it stands against the inside of the town wall
  const V = 1.1, S = 9
  const h = (8.5 / S) * V, rb = 0.4, rt = 0.33, cx = 0.12
  const prof: THREE.Vector2[] = [new THREE.Vector2(0, 0)]
  for (let i = 0; i <= 6; i++) {
    const y = (i / 6) * h, r = rb + ((rt - rb) * i) / 6
    prof.push(new THREE.Vector2(r, y))
    if (i < 6) prof.push(new THREE.Vector2(r - 0.004, y + h / 6 - 0.006))
  }
  prof.push(new THREE.Vector2(0, h))
  k.add(new THREE.LatheGeometry(prof, 32), 0, cx, 0)
  // stair shaft opening on the summit and the passage door at the foot
  k.box(0.1, 0.006, 0.16, h, cx - 0.04, 0.02, k.dark)
  k.box(0.08, 0.3, 0.07, 0, cx + rb - 0.03, 0, k.dark)
  // town wall, 1.8 m thick and about 3.6 m high, running north-south behind the tower
  k.add(frustum(0.2, (3.6 / S) * V, 1.08, 0.15, 1.08), 0, -0.36, 0)
}

function barnenez(k: Kit) {
  // 72 x 25 m long cairn of stepped dry-stone terraces, 11 passage graves opening on the south side
  const V = 1.8, S = 72
  const tiers = 4, th = (8 / S) * V / tiers
  const tierGeo: THREE.BufferGeometry[] = []
  for (let i = 0; i < tiers; i++) {
    const L = 0.5 - i * 0.045, W = 0.165 - i * 0.03, c = W * 0.7
    const s = new THREE.Shape()
    s.moveTo(-L, -W + c * 0.3); s.lineTo(-L + c, -W); s.lineTo(L - c, -W); s.lineTo(L, -W + c * 0.3)
    s.lineTo(L, W - c * 0.3); s.lineTo(L - c, W); s.lineTo(-L + c, W); s.lineTo(-L, W - c * 0.3); s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, i * th, 0)
    tierGeo.push(g)
  }
  merge(k, tierGeo)
  // passage mouths and the passages' dark roofline across the slope
  const doors: THREE.BufferGeometry[] = []
  for (let i = 0; i < 11; i++) {
    const x = -0.42 + (i * 0.84) / 10
    doors.push(boxG(0.022, th * 0.8, 0.012, 0, x, 0.161))
  }
  merge(k, doors, k.dark)
}

/** Polar outline r(a) around an origin, the union of discs and boxes seen from that origin. */
function polarOutline(ox: number, oz: number, discs: number[][], rects: number[][], n = 96) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a)
    let r = 0
    for (const [cx, cz, cr] of discs) {
      const px = cx - ox, pz = cz - oz, b = px * dx + pz * dz, c = px * px + pz * pz - cr * cr, D = b * b - c
      if (D >= 0) r = Math.max(r, b + Math.sqrt(D))
    }
    for (const [x0, z0, x1, z1] of rects) {
      let tmin = -Infinity, tmax = Infinity
      for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oz, dz, z0, z1]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) tmax = -1 }
        else { const ta = (lo - o) / d, tb = (hi - o) / d; tmin = Math.max(tmin, Math.min(ta, tb)); tmax = Math.min(tmax, Math.max(ta, tb)) }
      }
      if (tmax >= Math.max(tmin, 0)) r = Math.max(r, tmax)
    }
    pts.push(new THREE.Vector2(ox + r * dx, oz + r * dz))
  }
  return pts
}

/** Outline of discs and boxes strung along the u axis, traced as an upper and lower envelope over u. */
function lobeOutline(discs: number[][], rects: number[][], n = 120) {
  const u0 = Math.min(...discs.map(d => d[0] - d[2]), ...rects.map(r => r[0])) + 1e-4
  const u1 = Math.max(...discs.map(d => d[0] + d[2]), ...rects.map(r => r[2])) - 1e-4
  const top: THREE.Vector2[] = [], bot: THREE.Vector2[] = []
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * (1 - Math.cos((i / n) * Math.PI))) / 2
    let hi = -Infinity, lo = Infinity
    for (const [cu, cv, r] of discs) {
      const q = r * r - (u - cu) ** 2
      if (q >= 0) { hi = Math.max(hi, cv + Math.sqrt(q)); lo = Math.min(lo, cv - Math.sqrt(q)) }
    }
    for (const [a, v0, b, v1] of rects) if (u >= a && u <= b) { hi = Math.max(hi, v1); lo = Math.min(lo, v0) }
    if (hi < lo) continue
    top.push(new THREE.Vector2(u, hi)); bot.push(new THREE.Vector2(u, lo))
  }
  return [...bot, ...top.reverse()]
}

function ggantija(k: Kit) {
  // two lobed temples side by side behind one concave façade facing south-east; the south temple has five apses,
  // the north one four and an end niche; outer wall of huge upright blocks still about 6 m high
  const V = 1.6, S = 40, h = (6 / S) * V
  // plan drawn with u running from the façade into the temples, v across, then turned so u points north-west
  const south = { v: -0.2, apses: [[0.17, 0.085], [0.37, 0.1]], end: 0.5, er: 0.065 }
  const north = { v: 0.2, apses: [[0.17, 0.07], [0.33, 0.08]], end: 0.44, er: 0.04 }
  const holes: THREE.Vector2[][] = []
  for (const t of [south, north]) {
    const discs: number[][] = []
    for (const [u, r] of t.apses) for (const s of [-1, 1]) discs.push([u, t.v + s * r * 0.85, r])
    discs.push([t.end, t.v, t.er])
    holes.push(lobeOutline(discs, [[0.1, t.v - 0.03, t.end, t.v + 0.03]]))
  }
  // outer mass: union of two big lobes, with the façade cut back in a shallow concave arc
  const fR = 0.9, fu = -fR + 0.1
  const outer = polarOutline(0.3, 0, [[0.3, -0.2, 0.31], [0.27, 0.2, 0.27]], [], 128).map(p => {
    const dx = p.x - fu, dz = p.y, d = Math.hypot(dx, dz)
    return d < fR ? new THREE.Vector2(fu + (dx / d) * fR, dz * (fR / d)) : p
  })
  const s = new THREE.Shape(outer)
  for (const hp of holes) s.holes.push(new THREE.Path(hp))
  const rot = (g: THREE.BufferGeometry) => {
    g.rotateX(Math.PI / 2)
    g.translate(-0.3, 0, 0)
    g.rotateY((3 * Math.PI) / 4)
    return g
  }
  const mass = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false })
  mass.translate(0, 0, -h)
  k.add(rot(mass), 0, 0, 0, doubleSided(k.mat))
  const floors = holes.map(hp => rot(new THREE.ShapeGeometry(new THREE.Shape(hp))))
  for (const f of floors) f.translate(0, 0.003, 0)
  merge(k, floors, doubleSided(k.dark))
  // trilithon doorways in the façade and the paved forecourt
  for (const t of [south, north]) {
    const door = new THREE.BoxGeometry(0.03, 0.065, h * 0.6)
    door.translate(0.078, t.v, -(h * 0.6) / 2 - 0.001)
    k.add(rot(door), 0, 0, 0, k.dark)
  }
  const court = new THREE.Shape()
  court.absarc(fu, 0, fR + 0.12, -0.42, 0.42, false)
  court.absarc(fu, 0, fR, 0.42, -0.42, true)
  const cg = new THREE.ExtrudeGeometry(court, { depth: 0.012, bevelEnabled: false, curveSegments: 24 })
  cg.translate(0, 0, -0.012)
  k.add(rot(cg), 0)
}

function greatEnclosure(k: Kit) {
  // dry-stone outer wall about 250 m round, up to 11 m high and 5 m thick on the south-east where a chevron
  // frieze runs along the top; inside, a narrow parallel passage leads to the solid conical tower (10 m)
  const V = 1.6, S = 100
  const rx = 0.47, rz = 0.36, tb = 0.05, tt = 0.022
  const h = (t: number) => (5 / S) * V + ((6 / S) * V) * Math.max(0, Math.cos(t - Math.PI / 5)) ** 1.5
  const wall = doubleSided(k.mat), ws: THREE.BufferGeometry[] = []
  // entrances on the north, north-west and west
  for (const [a0, a1] of [[-0.49, 0.94], [1.0, 1.2], [1.25, 1.46]]) ws.push(arcWall(0, 0, rx, rz, tb, tt, h, a0 * Math.PI, a1 * Math.PI, 40))
  // inner wall of the parallel passage
  ws.push(arcWall(0, 0, rx - 0.065, rz - 0.065, 0.03, 0.016, t => h(t) * 0.75, -0.42 * Math.PI, 0.15 * Math.PI, 24))
  // stone enclosures inside
  ws.push(arcWall(-0.12, 0.02, 0.13, 0.1, 0.022, 0.014, 0.05, 0.2 * Math.PI, 1.6 * Math.PI, 20))
  ws.push(arcWall(0.08, 0.14, 0.09, 0.07, 0.02, 0.012, 0.045, 0.9 * Math.PI, 2.3 * Math.PI, 16))
  ws.push(arcWall(-0.28, -0.12, 0.07, 0.06, 0.018, 0.012, 0.04, 1.6 * Math.PI, 3.2 * Math.PI, 14))
  merge(k, ws, wall)
  // chevron band near the wall top on the south-east stretch
  const ch: THREE.BufferGeometry[] = []
  for (let i = 0; i < 20; i++) {
    const t = -0.1 * Math.PI + (i / 19) * 0.45 * Math.PI, y = h(t) - 0.03
    const o = tt / 2 + ((tb - tt) / 2) * (1 - y / h(t)) + 0.001
    const x = (rx + o) * Math.cos(t), z = (rz + o) * Math.sin(t)
    const b = new THREE.BoxGeometry(0.004, 0.012, 0.014)
    b.rotateX((i % 2 ? 1 : -1) * 0.7)
    b.rotateY(-Math.atan2(z / (rz * rz), x / (rx * rx)))
    b.translate(x, y, z)
    ch.push(b)
  }
  merge(k, ch, k.dark)
  // conical tower, 5.5 m across, and its small companion
  const tx = (rx - 0.11) * Math.cos(-0.12 * Math.PI), tz = (rz - 0.11) * Math.sin(-0.12 * Math.PI)
  k.add(new THREE.CylinderGeometry(0.013, 0.032, (10 / S) * V, 16), (5 / S) * V, tx, tz)
  k.add(new THREE.CylinderGeometry(0.008, 0.013, 0.06, 12), 0.03, tx - 0.05, tz - 0.035)
}

// ~400 fell and broke (date uncertain), 1937 shipped to Rome, 2008 re-erected after its return
const aksumObelisk = staged([400, 1937, 2008], (k, year) => {
  // 24 m granite stele carved as a tower house: false door at the foot, storeys of windows divided by
  // beam-end bands, crowned by a rounded head. Base 2.65 x 1.56 m; height capped for the map.
  const H = 2.6, wb = 0.8, db = 0.47, taper = 0.78
  merge(k, [boxG(1.04, 0.05, 0.72, 0), boxG(0.92, 0.05, 0.6, 0.05)])
  if (year >= 1937 && year < 2008) return
  const y0 = 0.1, door = 0.32, storeys = 9, sh = (H - door) / storeys
  const wAt = (y: number) => wb * (1 - (1 - taper) * ((y - y0) / H)), dAt = (y: number) => db * (1 - (1 - taper) * ((y - y0) / H))
  // three pieces, split where it broke, each with its own body and dark parts
  const body: THREE.BufferGeometry[][] = [[], [], []], dark: THREE.BufferGeometry[][] = [[], [], []]
  const piece = (i: number) => (i < 3 ? 0 : i < 6 ? 1 : 2)
  body[0].push(frustum(wb, door, db, wAt(y0 + door), dAt(y0 + door), y0))
  for (const s of [-1, 1]) dark[0].push(boxG(0.22, door * 0.75, 0.04, y0, 0, s * (db / 2 + 0.002)))
  for (let i = 0; i < storeys; i++) {
    const y = y0 + door + i * sh, w0 = wAt(y), d0 = dAt(y), w1 = wAt(y + sh), d1 = dAt(y + sh), p = piece(i)
    body[p].push(frustum(w0, sh, d0, w1, d1, y))
    // beam-end band at each floor
    body[p].push(boxG(w0 + 0.03, 0.035, d0 + 0.03, y))
    const wy = y + sh * 0.35, ww = wAt(wy), wd = dAt(wy)
    for (const x of [-0.22, 0.22]) for (const s of [-1, 1]) dark[p].push(boxG(0.1, sh * 0.42, 0.04, wy, x * (ww / wb), s * (wd / 2 + 0.002)))
    for (const s of [-1, 1]) dark[p].push(boxG(0.04, sh * 0.42, 0.08, wy, s * (ww / 2 + 0.002), 0))
  }
  // rounded head, a half disc across the broad face
  const top = y0 + H, wt = wAt(top), dt = dAt(top)
  const s = new THREE.Shape()
  s.moveTo(-wt / 2, 0); s.lineTo(wt / 2, 0); s.absarc(0, 0, wt / 2, 0, Math.PI, false)
  const head = new THREE.ExtrudeGeometry(s, { depth: dt, bevelEnabled: false, curveSegments: 16 })
  head.translate(0, top, -dt / 2)
  if (year >= 400 && year < 1937) {
    // lying on its broad face south of the base, foot to the west, shortened so the pieces stay near the anchor
    const L = 0.6, starts = [y0, y0 + door + 3 * sh, y0 + door + 6 * sh], ends = [starts[1], starts[2], top + wt / 2]
    let x = -0.92
    for (let p = 0; p < 3; p++) {
      const m = new THREE.Matrix4().makeTranslation(0, -starts[p], 0)
      m.premultiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
      m.premultiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))
      m.premultiply(new THREE.Matrix4().makeScale(L, 0.5, 0.6))
      m.premultiply(new THREE.Matrix4().makeRotationY([0.05, -0.12, 0.2][p]))
      m.premultiply(new THREE.Matrix4().makeTranslation(x, (dAt(starts[p]) / 2 + 0.017) * 0.5, 0.62 + [0, 0.04, -0.03][p]))
      for (const g of [...body[p], ...dark[p], ...(p === 2 ? [head] : [])]) g.applyMatrix4(m)
      x += (ends[p] - starts[p]) * L + 0.08
    }
  }
  merge(k, body.flat())
  merge(k, dark.flat(), k.dark)
  k.add(head, 0)
})

function djinguereber(k: Kit) {
  // mud-brick mosque of about 70 x 60 m: a flat-roofed prayer hall with buttressed walls topped by pinnacles,
  // an open court to the west, and tapering towers bristling with torons (palm-wood stakes)
  const V = 1.7, S = 70
  const hh = (5 / S) * V, solid: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = []
  const x0 = -0.14, x1 = 0.45, z0 = -0.38, z1 = 0.38
  solid.push(frustum(x1 - x0, hh, z1 - z0, x1 - x0 - 0.012, z1 - z0 - 0.012, 0, (x0 + x1) / 2, 0))
  // roof light openings
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) dark.push(boxG(0.025, 0.004, 0.025, hh, x0 + 0.07 + i * 0.11, -0.27 + j * 0.18))
  // courtyard walls on the west
  const cw = 0.028, ch = hh * 0.85, cx0 = -0.5
  solid.push(boxG(x0 - cx0, ch, cw, 0, (cx0 + x0) / 2, z0 + cw / 2))
  solid.push(boxG(x0 - cx0, ch, cw, 0, (cx0 + x0) / 2, z1 - cw / 2))
  solid.push(boxG(cw, ch, z1 - z0, 0, cx0 + cw / 2, 0))
  solid.push(boxG(0.012, ch * 0.8, 0.35, 0, -0.3, 0.1))
  dark.push(boxG(cw + 0.004, ch * 0.7, 0.06, 0, cx0 + cw / 2, 0))
  dark.push(boxG(x0 - cx0 - cw, 0.002, z1 - z0 - 2 * cw, 0, (cx0 + cw + x0) / 2, 0))
  // buttresses with pinnacles around the hall and court
  const pin = (x: number, z: number, top: number) => {
    solid.push(frustum(0.026, top, 0.026, 0.016, 0.016, 0, x, z))
    solid.push(frustum(0.016, 0.035, 0.016, 0.003, 0.003, top, x, z))
  }
  for (let i = 0; i <= 8; i++) for (const z of [z0, z1]) pin(x0 + (i * (x1 - x0)) / 8, z, hh + 0.02)
  for (let i = 1; i < 10; i++) if (Math.abs(i - 5) > 1) pin(x1, z0 + (i * (z1 - z0)) / 10, hh + 0.02)
  for (let i = 1; i <= 3; i++) for (const z of [z0, z1]) pin(x0 - (i * (x0 - cx0)) / 3, z, ch + 0.02)
  for (let i = 1; i < 6; i++) pin(cx0, z0 + (i * (z1 - z0)) / 6, ch + 0.02)
  // tapering tower with rows of torons on every face
  const tower = (x: number, z: number, b: number, t: number, h: number, y: number, rows: number) => {
    solid.push(frustum(b, h, b, t, t, y, x, z))
    solid.push(frustum(t * 0.7, 0.05, t * 0.7, 0.004, 0.004, y + h, x, z))
    for (let r = 0; r < rows; r++) {
      const ty = y + ((r + 0.7) * h) / (rows + 0.3), hw = (b + (t - b) * ((ty - y) / h)) / 2
      for (let c = -1; c <= 1; c++) {
        const off = c * hw * 0.55, len = 0.028
        solid.push(boxG(len, 0.005, 0.005, ty, x + hw + len / 2 - 0.006, z + off), boxG(len, 0.005, 0.005, ty, x - hw - len / 2 + 0.006, z + off))
        solid.push(boxG(0.005, 0.005, len, ty, x + off, z + hw + len / 2 - 0.006), boxG(0.005, 0.005, len, ty, x + off, z - hw - len / 2 + 0.006))
      }
    }
  }
  // the great minaret on the south side and the mihrab tower on the east façade
  tower(0.08, 0.27, 0.15, 0.06, (16 / S) * V, 0, 5)
  tower(x1 + 0.03, 0, 0.08, 0.035, (9 / S) * V, 0, 3)
  merge(k, solid)
  merge(k, dark, k.dark)
}

// ~1320 Sultan al-Hasan ibn Sulaiman's domed extension, ~1850 roofs fallen in after the town was abandoned
const kilwaMosque = staged([1320, 1850], (k, year) => {
  // coral-stone mosque, qibla to the north: the older flat-roofed hall of 9 bays and the 14th-century
  // extension to the south, a pillared hall roofed by alternating domes and barrel vaults, with a larger dome
  const V = 1.6, S = 60, ruin = year >= 1850
  const ph = (4 / S) * V, slab = 0.012, roofY = ph + slab
  const solid: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = []
  const xw = 0.26, zN = -0.5, zM = -0.13, zS = 0.5
  if (!ruin) {
    // old hall: walls, flat roof with parapet and a few roof domes
    solid.push(boxG(2 * xw, ph + slab, zM - zN, 0, 0, (zN + zM) / 2))
    solid.push(boxG(2 * xw, 0.012, 0.012, roofY, 0, zN + 0.006), boxG(0.012, 0.012, zM - zN, roofY, -xw + 0.006, (zN + zM) / 2))
    solid.push(boxG(0.012, 0.012, zM - zN, roofY, xw - 0.006, (zN + zM) / 2))
    for (let i = 0; i < 3; i++) dark.push(boxG(0.03, 0.004, 0.03, roofY, -0.17 + i * 0.17, (zN + zM) / 2))
  } else {
    // roofless shell: the qibla wall stands, the side walls are broken down, columns are stumps
    const t = 0.02, zc = (zN + zM) / 2
    solid.push(boxG(2 * xw, ph, t, 0, 0, zN + t / 2))
    solid.push(boxG(t, ph * 0.7, zM - zN, 0, -xw + t / 2, zc), boxG(t, ph * 0.45, (zM - zN) * 0.6, 0, xw - t / 2, zN + (zM - zN) * 0.3))
    solid.push(boxG(t, ph * 0.2, (zM - zN) * 0.4, 0, xw - t / 2, zM - (zM - zN) * 0.2))
    dark.push(boxG(2 * xw - 2 * t, 0.002, zM - zN - t, 0, 0, zc + t / 2))
    for (let i = 1; i < 4; i++) for (const z of [zN + 0.13, zN + 0.25]) {
      const c = new THREE.CylinderGeometry(0.011, 0.012, ph * (0.2 + ((i * 3 + (z > zc ? 1 : 0)) % 4) * 0.1), 8)
      c.translate(-xw + (i * xw) / 2, (c.parameters.height) / 2, z)
      solid.push(c)
    }
  }
  // mihrab niche bulging from the north wall
  const mih = new THREE.CylinderGeometry(0.04, 0.04, ph * 0.9, 12, 1, false, Math.PI / 2, Math.PI)
  mih.translate(0, (ph * 0.9) / 2, zN)
  solid.push(mih)
  if (year >= 1320) {
    // extension: 3 x 4 bays on pillars; after the collapse a few bays on the west keep their vaults
    const cols = 3, rows = 4, bx = (2 * xw) / cols, bz = (zS - zM) / rows
    const kept = (i: number, j: number) => !ruin || (i === 0 && j > 0) || (i === 1 && j === 2)
    const holds = (i: number, j: number) => [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].some(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows && kept(a, b))
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
      const h = holds(i, j) ? ph : ph * 0.3
      const c = new THREE.CylinderGeometry(0.011, 0.012, h, 8)
      c.translate(-xw + i * bx, h / 2, zM + j * bz)
      solid.push(c)
    }
    if (!ruin) solid.push(boxG(2 * xw + 0.02, slab, zS - zM + 0.01, ph, 0, (zM + zS) / 2))
    solid.push(boxG(0.02, ruin ? ph * 0.6 : ph, zS - zM, 0, -xw - 0.002, (zM + zS) / 2))
    dark.push(boxG(2 * xw - 0.03, 0.002, zS - zM - 0.02, 0, 0.005, (zM + zS) / 2))
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (!kept(i, j)) continue
      const x = -xw + (i + 0.5) * bx, z = zM + (j + 0.5) * bz
      if (ruin) solid.push(boxG(bx + 0.01, slab, bz + 0.01, ph, x, z))
      if (i === 2 && j === 0) {
        // the great dome
        solid.push(boxG(bx * 0.95, 0.025, bz * 0.95, roofY, x, z))
        const d = new THREE.SphereGeometry(bx * 0.47, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
        d.scale(1, 1.25, 1)
        d.translate(x, roofY + 0.025, z)
        solid.push(d)
      } else if ((i + j) % 2 === 0) {
        const d = new THREE.SphereGeometry(Math.min(bx, bz) * 0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)
        d.translate(x, roofY, z)
        solid.push(d)
      } else {
        const r = bx * 0.42
        const v = new THREE.CylinderGeometry(r, r, bz * 0.9, 12, 1, false, -Math.PI / 2, Math.PI)
        v.rotateX(-Math.PI / 2)
        v.scale(1, 0.7, 1)
        v.translate(x, roofY, z)
        solid.push(v)
      }
    }
  }
  // courtyard to the east with low walls
  const cx0 = xw, cx1 = 0.5, cz0 = -0.5, cz1 = -0.05, wh = ph * (ruin ? 0.25 : 0.45)
  solid.push(boxG(cx1 - cx0, wh, 0.016, 0, (cx0 + cx1) / 2, cz0 + 0.008), boxG(cx1 - cx0, wh, 0.016, 0, (cx0 + cx1) / 2, cz1 - 0.008))
  solid.push(boxG(0.016, wh, cz1 - cz0, 0, cx1 - 0.008, (cz0 + cz1) / 2))
  dark.push(boxG(0.06, 0.01, 0.08, 0, 0.4, -0.3))
  merge(k, solid)
  merge(k, dark, k.dark)
})

function greatBath(k: Kit) {
  // Mohenjo-daro citadel mound: the Great Bath, a 12 x 7 m brick tank 2.4 m deep with steps at both ends,
  // inside a colonnaded court ringed by rooms; the granary podium to the west and the Kushan stupa to the north
  const V = 1.8, S = 80
  const top = 0.07, solid: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = []
  solid.push(frustum(1.0, top, 0.86, 0.9, 0.76, 0, 0, 0))
  // bath building 55 x 33 m
  const bx = 0.06, bz = 0.14, W = 0.62, D = 0.4, wt = 0.016, wh = (3 / S) * V
  const wallR = (w: number, d: number, x: number, z: number) => {
    solid.push(boxG(w, wh, wt, top, x, z - d / 2 + wt / 2), boxG(w, wh, wt, top, x, z + d / 2 - wt / 2))
    solid.push(boxG(wt, wh, d - 2 * wt, top, x - w / 2 + wt / 2, z), boxG(wt, wh, d - 2 * wt, top, x + w / 2 - wt / 2, z))
  }
  wallR(W, D, bx, bz)
  // rooms: cross walls between the outer wall and the court
  const cW = 0.36, cD = 0.23
  wallR(cW + 0.04, cD + 0.04, bx, bz)
  for (const s of [-1, 1]) for (const z of [-0.1, 0, 0.1]) solid.push(boxG((W - cW - 0.04) / 2, wh, wt, top, bx + s * (W / 2 - (W - cW - 0.04) / 4), bz + z))
  for (const s of [-1, 1]) for (let i = -2; i <= 2; i++) solid.push(boxG(wt, wh, (D - cD - 0.04) / 2 - wt, top, bx + i * 0.09, bz + s * (D / 2 - (D - cD - 0.04) / 4 - wt / 2)))
  // the court paving, colonnade piers and the sunken tank
  const tW = (7 / S) * 1.15, tD = (12 / S) * 1.15
  solid.push(boxG(cW, 0.008, (cD - tD) / 2, top, bx, bz - (cD + tD) / 4), boxG(cW, 0.008, (cD - tD) / 2, top, bx, bz + (cD + tD) / 4))
  solid.push(boxG((cW - tW) / 2, 0.008, tD, top, bx - (cW + tW) / 4, bz), boxG((cW - tW) / 2, 0.008, tD, top, bx + (cW + tW) / 4, bz))
  dark.push(boxG(tW, 0.002, tD, top, bx, bz))
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) solid.push(boxG(tW * 0.25, 0.006 - i * 0.002, 0.01, top, bx, bz + s * (tD / 2 - 0.005 - i * 0.01)))
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) solid.push(boxG(0.014, wh * 0.85, 0.014, top, bx - 0.15 + i * 0.06, bz + s * (cD / 2 - 0.02)))
  for (let i = 1; i < 4; i++) for (const s of [-1, 1]) solid.push(boxG(0.014, wh * 0.85, 0.014, top, bx + s * (cW / 2 - 0.02), bz - cD / 2 + 0.02 + (i * (cD - 0.04)) / 4))
  // granary podium: rows of brick blocks with air channels between
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) solid.push(boxG(0.04, (2 / S) * V, 0.045, top, -0.44 + i * 0.045, -0.02 + j * 0.055))
  // stupa on its square terrace with the monastery court around it
  const sx = 0.12, sz = -0.24
  solid.push(boxG(0.17, 0.03, 0.17, top, sx, sz))
  const dome = new THREE.SphereGeometry(0.065, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.scale(1, 1.3, 1)
  dome.translate(sx, top + 0.03, sz)
  solid.push(dome)
  wallR(0.34, 0.27, sx, sz)
  for (let i = -1; i <= 1; i += 2) solid.push(boxG(wt, wh, 0.27, top, sx + i * 0.12, sz))
  merge(k, solid)
  merge(k, dark, k.dark)
}

function caralPyramid(k: Kit) {
  // Pirámide Mayor, about 150 x 160 m and 28 m high, raised in stone-faced terraces; a central stair climbs from
  // the sunken circular plaza (35 m across) at its foot to the summit atrium
  const V = 1.7, S = 150
  const solid: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = []
  const zc = -0.15, tiers = 6, th = ((28 / S) * V) / tiers
  let w = 0.86, d = 0.74
  for (let i = 0; i < tiers; i++) {
    const nw = w - 0.075, nd = d - 0.07
    solid.push(frustum(w, th, d, w - 0.012, d - 0.012, i * th, 0, zc - i * 0.008))
    w = nw; d = nd
  }
  const topY = tiers * th, tz = zc - tiers * 0.008
  // summit atrium with its rooms
  const at = (x: number, z: number, aw: number, ad: number, h: number) => {
    const t = 0.012
    solid.push(boxG(aw, h, t, topY, x, z - ad / 2), boxG(aw, h, t, topY, x, z + ad / 2))
    solid.push(boxG(t, h, ad, topY, x - aw / 2, z), boxG(t, h, ad, topY, x + aw / 2, z))
  }
  at(0, tz + 0.03, 0.16, 0.14, 0.035)
  at(-0.14, tz - 0.04, 0.09, 0.1, 0.03)
  at(0.14, tz - 0.04, 0.09, 0.1, 0.03)
  dark.push(boxG(0.03, 0.003, 0.03, topY, 0, tz + 0.03))
  // central stair down the south face to the ground
  const front = zc + 0.39, back = tz + d / 2 + 0.035, nst = 16, run = (front - back) / nst
  for (let i = 0; i < nst; i++) {
    const zf = front - i * run
    solid.push(boxG(0.08, ((i + 1) * topY) / nst, zf - back, 0, 0, (zf + back) / 2))
    dark.push(boxG(0.06, 0.002, run, ((i + 1) * topY) / nst, 0, zf - run / 2))
  }
  // sunken circular plaza: two stepped rings with stairs on the axis
  const pz = front + 0.115, pr = 0.118
  const rings: THREE.BufferGeometry[] = []
  rings.push(ring(0, pz, pr, 0.02, 0.025, -0.45 * Math.PI, 0.45 * Math.PI, 24), ring(0, pz, pr, 0.02, 0.025, 0.55 * Math.PI, 1.45 * Math.PI, 24))
  rings.push(ring(0, pz, pr - 0.03, 0.014, 0.012, -0.45 * Math.PI, 0.45 * Math.PI, 20), ring(0, pz, pr - 0.03, 0.014, 0.012, 0.55 * Math.PI, 1.45 * Math.PI, 20))
  merge(k, rings, doubleSided(k.mat))
  dark.push(disc(pr - 0.04, 0.002, 0, pz))
  for (const s of [-1, 1]) solid.push(boxG(0.03, 0.012, 0.045, 0, 0, pz + s * (pr - 0.02)))
  merge(k, solid)
  merge(k, dark, k.dark)
}

function monksMound(k: Kit) {
  // Cahokia: earthen platform 291 m north-south, 236 m east-west and 30 m high, in four terraces;
  // a ramp climbs the south front and a great timber hall about 30 m long stood on the summit
  const V = 2, S = 290
  const solid: THREE.BufferGeometry[] = []
  const h4 = (30 / S) * V, h1 = (11 / S) * V, h2 = (19 / S) * V
  // first terrace across the south
  solid.push(frustum(0.78, h1, 0.42, 0.7, 0.34, 0, 0, 0.24))
  // main body and summit (fourth terrace) to the north
  solid.push(frustum(0.81, h2, 0.62, 0.68, 0.5, 0, 0, -0.18))
  solid.push(frustum(0.6, h4 - h2, 0.46, 0.5, 0.38, h2, 0.03, -0.24))
  // second terrace on the west flank, third a small bench on the south-east of the summit
  solid.push(frustum(0.2, h2 * 0.75, 0.3, 0.12, 0.22, h1 * 0.6, -0.3, 0.05))
  solid.push(frustum(0.16, 0.03, 0.12, 0.12, 0.08, h2, 0.22, 0.0))
  // ramp from the plaza onto the first terrace
  const r = new THREE.BufferGeometry()
  const rw = 0.06, rz0 = 0.5, rz1 = 0.41
  const v = [
    [-rw, 0, rz0], [rw, 0, rz0], [rw, h1, rz1], [-rw, h1, rz1], [-rw, 0, rz1], [rw, 0, rz1],
  ]
  const tri = [0, 1, 2, 0, 2, 3, 1, 5, 2, 0, 3, 4]
  r.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap(i => v[i]), 3))
  r.computeVertexNormals()
  k.add(r, 0, 0, 0, doubleSided(k.mat))
  merge(k, solid)
  // summit temple with a steep thatched roof and a palisade post line
  const tx = 0.03, tz = -0.3, hw = 0.16, hd = 0.08, wh = 0.05
  k.box(hw, wh, hd, h4, tx, tz)
  k.add(gable(hw + 0.02, hd + 0.025, 0.09), h4 + wh, tx, tz, k.dark)
  k.box(0.03, 0.03, 0.006, h4, tx, tz + hd / 2, k.dark)
}

export const batch_e: Record<string, Builder> = {
  'gobekli-tepe': gobekliTepe,
  'tower-of-jericho': towerOfJericho,
  barnenez,
  ggantija,
  'great-enclosure': greatEnclosure,
  'aksum-obelisk': aksumObelisk,
  djinguereber,
  'kilwa-mosque': kilwaMosque,
  'great-bath': greatBath,
  'caral-pyramid': caralPyramid,
  'monks-mound': monksMound,
}
