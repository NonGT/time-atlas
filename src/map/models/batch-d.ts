import * as THREE from 'three'
import { doubleSided, gable, merge, staged, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
const PI = Math.PI
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

const boxg = (w: number, h: number, d: number, y: number, x = 0, z = 0) => {
  const b = new THREE.BoxGeometry(w, h, d)
  b.translate(x, y + h / 2, z)
  return b
}

const cyl = (r0: number, r1: number, h: number, seg: number, y = 0, x = 0, z = 0) => {
  const c = new THREE.CylinderGeometry(r1, r0, h, seg)
  c.translate(x, y + h / 2, z)
  return c
}

/** Box whose top is w1 x d1 and bottom w0 x d0, base at y=0. */
function frustum(w0: number, d0: number, w1: number, d1: number, h: number) {
  const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0
    p.setXYZ(i, p.getX(i) * (top ? w1 : w0), top ? h : 0, p.getZ(i) * (top ? d1 : d0))
  }
  g.computeVertexNormals()
  return g
}

/** Thin cylinder from a to b. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 4) {
  const d = b.clone().sub(a), c = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true)
  c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()))
  c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return c
}

/** Flight of n steps running along `axis` from a (height y0) to b (height y1), centred on c across, w wide. */
function flight(a: number, b: number, y0: number, y1: number, c: number, w: number, n: number, axis: 'x' | 'z' = 'x', lift = 0.004) {
  const geos: G[] = [], run = (b - a) / n, rise = (y1 - y0) / n
  for (let i = 0; i < n; i++) {
    const h = rise * (i + 1) + lift, p = a + run * (i + 0.5)
    geos.push(axis === 'x' ? boxg(Math.abs(run), h, w, y0, p, c) : boxg(w, h, Math.abs(run), y0, c, p))
  }
  return geos
}

/** Sloping slab along x from (x0, y0) to (x1, y1), for stair balustrades. */
function ramp(x0: number, y0: number, x1: number, y1: number, z: number, w: number, t: number) {
  const l = Math.hypot(x1 - x0, y1 - y0), g = new THREE.BoxGeometry(l, t, w)
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0))
  g.translate((x0 + x1) / 2, (y0 + y1) / 2 + t / 2, z)
  return g
}

interface Ring { hx: number; hz: number; y: number; lift?: number }

/** Surface through rectangular rings (half sizes hx, hz at height y), corners raised by `lift`. Flat shaded. */
function loft(rings: Ring[], n = 6) {
  const perim = (r: Ring) => {
    const up = (s: number) => (r.lift ?? 0) * s ** 6, pts: number[][] = []
    for (let i = 0; i < n; i++) { const s = -1 + (2 * i) / n; pts.push([s * r.hx, r.y + up(s), r.hz]) }
    for (let i = 0; i < n; i++) { const s = 1 - (2 * i) / n; pts.push([r.hx, r.y + up(s), s * r.hz]) }
    for (let i = 0; i < n; i++) { const s = 1 - (2 * i) / n; pts.push([s * r.hx, r.y + up(s), -r.hz]) }
    for (let i = 0; i < n; i++) { const s = -1 + (2 * i) / n; pts.push([-r.hx, r.y + up(s), s * r.hz]) }
    return pts
  }
  const P = rings.map(perim), m = 4 * n, pos: number[] = []
  for (let r = 0; r < P.length - 1; r++) for (let j = 0; j < m; j++) {
    const a = P[r][j], b = P[r][(j + 1) % m], c = P[r + 1][j], d = P[r + 1][(j + 1) % m]
    pos.push(...a, ...d, ...b, ...a, ...c, ...d)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * East Asian roof over a w x d eave line, concave slopes and turned-up corners. gable > 0 makes a
 * hip-and-gable roof whose ends turn vertical above that fraction of the height.
 */
function roof(w: number, d: number, h: number, o: { ridge?: number; gable?: number; lift?: number; curve?: number } = {}) {
  const g = o.gable || 1, ridge = o.ridge ?? Math.max(0, 1 - (g * d) / w), lift = o.lift ?? 0, curve = o.curve ?? 1.7
  const rings: Ring[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, u = Math.min(t / g, 1)
    rings.push({ hx: w / 2 - (w / 2) * (1 - ridge) * u, hz: Math.max((d / 2) * (1 - t), 0.002), y: h * t ** curve, lift: lift * (1 - t) ** 2 })
  }
  return loft(rings)
}

interface HallOpt {
  x?: number; z?: number; y?: number; w: number; d: number; h: number; roofH: number
  double?: boolean; gable?: number; ridge?: number; eave?: number; alongZ?: boolean
}

/** Timber hall: body, optional pent roof halfway up (double eaves), curved roof. w runs along x unless alongZ. */
function hall(k: Kit, rm: THREE.Material, o: HallOpt) {
  const { x = 0, z = 0, y = 0, w, d, h, roofH } = o, ov = o.eave ?? d * 0.16
  const turn = (g: G) => { if (o.alongZ) g.rotateY(PI / 2); return g }
  const bx = (W: number, H: number, D: number, Y: number) => (o.alongZ ? k.box(D, H, W, Y, x, z) : k.box(W, H, D, Y, x, z))
  let tw = w, td = d
  if (o.double) {
    const h1 = h * 0.48
    bx(w, h1, d, y)
    tw = w - d * 0.24; td = d * 0.76
    bx(tw, h - h1, td, y + h1)
    const pent = loft([
      { hx: w / 2 + ov, hz: d / 2 + ov, y: 0, lift: ov * 0.4 },
      { hx: w / 2 + ov * 0.3, hz: d / 2 + ov * 0.3, y: ov * 0.35 },
      { hx: tw / 2, hz: td / 2, y: ov * 1.1 },
    ])
    k.add(turn(pent), y + h1 - ov * 0.2, x, z, rm)
  } else bx(w, h, d, y)
  k.add(turn(roof(tw + 2 * ov, td + 2 * ov, roofH, { gable: o.gable, ridge: o.ridge, lift: ov * 0.5 })), y + h - ov * 0.15, x, z, rm)
}

function yinxuPalace(k: Kit) {
  // Shang royal precinct at Anyang: timber halls on rammed-earth platforms round a courtyard, steep thatched hipped roofs
  const rm = doubleSided(k.dark), posts: G[] = []
  const shang = (x: number, z: number, l: number, d: number, alongZ = false) => {
    const W = alongZ ? d : l, D = alongZ ? l : d
    k.box(W + 0.05, 0.035, D + 0.05, 0, x, z)
    k.box(W - 0.05, 0.07, D - 0.05, 0.035, x, z)
    const n = Math.round(l / 0.07)
    for (let i = 0; i <= n; i++) for (const s of [-1, 1]) {
      const a = -l / 2 + 0.01 + (i * (l - 0.02)) / n, b = s * (d / 2 - 0.01)
      posts.push(cyl(0.006, 0.006, 0.07, 5, 0.035, x + (alongZ ? b : a), z + (alongZ ? a : b)))
    }
    const r = roof(l + 0.03, d + 0.05, 0.14, { curve: 1.05 })
    if (alongZ) r.rotateY(PI / 2)
    k.add(r, 0.1, x, z, rm)
  }
  k.box(1.0, 0.012, 0.86, 0, 0, 0.02)
  shang(0, -0.3, 0.86, 0.17)
  shang(-0.41, 0.07, 0.5, 0.13, true)
  shang(0.41, 0.07, 0.5, 0.13, true)
  shang(-0.16, 0.38, 0.22, 0.11)
  shang(0.16, 0.38, 0.22, 0.11)
  merge(k, posts, k.dark)
}

const wildGoosePagoda = staged([704, 1556], (k, year) => {
  // 64 m of brick in seven storeys on a 4 m terrace, each face with an arched opening and corbelled eaves
  // 652: Xuanzang's five storeys; 704: rebuilt with ten under Wu Zetian; 1556: the Shaanxi earthquake took three off
  const n = year >= 1556 ? 7 : year >= 704 ? 10 : 5
  const rm = k.dark, arches: G[] = [], corbels: G[] = []
  k.box(0.96, 0.09, 0.96, 0)
  merge(k, flight(0.62, 0.48, 0, 0.09, 0, 0.16, 6, 'z'))
  const door = (w: number, h: number) => {
    const s = new THREE.Shape(), r = w / 2
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, PI, false); s.closePath()
    return s
  }
  let y = 0.09
  for (let i = 0; i < n; i++) {
    const w = 0.56 - i * 0.03, h = i === 0 ? 0.3 : 0.21 - i * 0.008, wall = h - 0.05
    k.add(frustum(w, w, w * 0.96, w * 0.96, wall), y)
    const dw = i === 0 ? 0.11 : 0.075, dh = i === 0 ? 0.17 : 0.1
    for (let f = 0; f < 4; f++) {
      const g = new THREE.ExtrudeGeometry(door(dw, dh), { depth: 0.014, bevelEnabled: false, curveSegments: 5 })
      g.translate(0, y + (wall - dh) * 0.45, (w * 0.98) / 2 - 0.006)
      g.rotateY((f * PI) / 2)
      arches.push(g)
    }
    let cy = y + wall
    for (const [o, t] of [[0.02, 0.01], [0.04, 0.012], [0.06, 0.012], [0.035, 0.008], [0.01, 0.008]]) {
      corbels.push(boxg(w * 0.96 + o, t, w * 0.96 + o, cy)); cy += t
    }
    y += h
  }
  merge(k, corbels)
  merge(k, arches, rm)
  const top = 0.56 - n * 0.03
  k.add(roof(top + 0.02, top + 0.02, 0.08, { curve: 1 }), y - 0.004, 0, 0, doubleSided(rm))
  k.add(cyl(0.022, 0.022, 0.02, 8), y + 0.07)
  k.add(cyl(0.012, 0.004, 0.09, 8), y + 0.09)
})

/** Seven-storey pagoda of about 100 m, base 0.17 wide, for Todaiji's lost east and west pagodas. */
function sevenStorey(k: Kit, rm: THREE.Material, x: number, z: number) {
  const body: G[] = []
  k.box(0.2, 0.02, 0.2, 0, x, z)
  let y = 0.02
  for (let i = 0; i < 7; i++) {
    const w = 0.13 - i * 0.008, h = i === 0 ? 0.16 : 0.145
    body.push(boxg(w, h, w, y, x, z))
    k.add(roof(w + 0.07, w + 0.07, 0.045, { ridge: 0, lift: 0.012 }), y + h - 0.012, x, z, rm)
    y += h
  }
  merge(k, body)
  // sorin: the bronze finial of stacked rings
  k.add(cyl(0.006, 0.004, 0.24, 6), y + 0.02, x, z, k.dark)
  for (let i = 0; i < 9; i++) k.add(cyl(0.016, 0.016, 0.006, 8), y + 0.05 + i * 0.016, x, z, k.dark)
}

const todaiji = staged([934, 1362, 1567, 1709], (k, year) => {
  // Daibutsuden: 57 x 50 m and 49 m high, a hipped roof with gilt shibi, a pent-roof skirt (mokoshi) and the cusped karahafu gable over the front window
  // 752: the first hall was 86 m wide, with two ~100 m pagodas to the south-east and south-west (drawn closer in)
  // 934: west pagoda burned; 1362: east pagoda lost to lightning; 1567: hall burned in the Miyoshi-Matsunaga fighting, Buddha left in the open; 1709: present hall
  const rm = doubleSided(k.dark), first = year < 1567, W = first ? 0.955 : 0.633, D = 0.556, zc = -0.07
  k.box(W + 0.15, 0.025, 0.72, 0, 0, -0.04)
  merge(k, flight(0.4, 0.32, 0, 0.025, 0, 0.2, 3, 'z'))
  // octagonal bronze lantern before the hall
  k.add(cyl(0.02, 0.016, 0.02, 8), 0.025, 0, 0.27)
  k.add(cyl(0.005, 0.005, 0.03, 6), 0.045, 0, 0.27)
  k.add(cyl(0.014, 0.014, 0.025, 8), 0.075, 0, 0.27, k.dark)
  k.add(new THREE.ConeGeometry(0.024, 0.02, 8), 0.11, 0, 0.27, k.dark)
  if (year < 934) sevenStorey(k, rm, -0.7, 0.3)
  if (year < 1362) sevenStorey(k, rm, 0.7, 0.3)
  if (year >= 1567 && year < 1709) {
    // stone podium, a few charred column bases and the seated Vairocana on its lotus
    k.box(0.955, 0.02, D, 0.025, 0, zc)
    const bases: G[] = []
    for (let i = 0; i < 11; i++) for (const s of [-1, 1]) bases.push(cyl(0.012, 0.012, 0.012, 6, 0.045, -0.44 + i * 0.088, zc + s * 0.24))
    merge(k, bases, k.dark)
    k.add(cyl(0.1, 0.085, 0.05, 12), 0.045, 0, zc, k.dark)
    k.add(new THREE.SphereGeometry(0.075, 10, 8, 0, PI * 2, 0, PI / 2).scale(1, 1.6, 0.8), 0.095, 0, zc, k.dark)
    k.add(new THREE.SphereGeometry(0.032, 10, 8), 0.24, 0, zc, k.dark)
    return
  }
  k.box(W, 0.17, D, 0.025, 0, zc)
  k.box(0.16, 0.12, 0.01, 0.025, 0, zc + D / 2, k.dark)
  const ov = 0.04, y1 = 0.195
  k.add(loft([
    { hx: W / 2 + ov, hz: D / 2 + ov, y: 0, lift: 0.012 },
    { hx: W / 2 + ov * 0.3, hz: D / 2 + ov * 0.3, y: 0.016 },
    { hx: W / 2 - 0.04, hz: D / 2 - 0.04, y: 0.05 },
  ]), y1 - 0.01, 0, zc, rm)
  const uw = W - 0.08, ud = D - 0.08, y2 = y1 + 0.24
  k.box(uw, 0.25, ud, y1, 0, zc)
  if (!first) {
    // karahafu: an ogee-curved gable breaking the mokoshi at the centre of the front
    const kh = new THREE.Shape()
    kh.moveTo(-0.12, 0); kh.bezierCurveTo(-0.06, 0, -0.06, 0.07, 0, 0.075); kh.bezierCurveTo(0.06, 0.07, 0.06, 0, 0.12, 0)
    kh.lineTo(0.12, -0.012); kh.bezierCurveTo(0.05, -0.012, 0.05, 0.058, 0, 0.062); kh.bezierCurveTo(-0.05, 0.058, -0.05, -0.012, -0.12, -0.012)
    kh.closePath()
    const kg = new THREE.ExtrudeGeometry(kh, { depth: 0.1, bevelEnabled: false, curveSegments: 8 })
    kg.translate(0, 0, -0.1 + 0.03)
    k.add(kg, y1 + 0.03, 0, zc + D / 2, k.dark)
    k.box(0.14, 0.045, 0.012, y1 + 0.02, 0, zc + ud / 2 + 0.002, k.dark)
  }
  const ridge = first ? 0.6 : 0.42
  k.add(roof(uw + 0.1, ud + 0.1, 0.29, { ridge, lift: 0.025 }), y2 - 0.005, 0, zc, rm)
  const rx = (ridge * (uw + 0.1)) / 2
  for (const s of [-1, 1]) k.add(frustum(0.02, 0.012, 0.035, 0.012, 0.045), y2 + 0.28, s * rx, zc)
})

const bulguksa = staged([1593, 1604, 1969], (k, year) => {
  // stone terrace with the Cheongun-gyo and Baegun-gyo stairs up to Jahamun gate; galleries enclose Daeungjeon, with Seokgatap (west) and Dabotap (east) in its court
  // 1593: burned in the Imjin war, leaving the stonework; 1604: rebuilding of the halls begins; 1969: galleries restored
  const halls = year < 1593 || year >= 1604, galleries = year < 1593 || year >= 1969
  const rm = doubleSided(k.dark), T = 0.07
  k.box(0.94, T, 0.72, 0, 0, -0.13)
  k.box(0.96, 0.01, 0.74, T * 0.45, 0, -0.13, k.dark)
  merge(k, [...flight(0.46, 0.34, 0, 0.036, 0, 0.08, 6, 'z'), boxg(0.08, 0.036, 0.04, 0, 0, 0.32), ...flight(0.3, 0.23, 0.036, T, 0, 0.08, 5, 'z')])
  // arch under the stair bridge
  k.box(0.04, 0.024, 0.088, 0, 0, 0.32, k.dark)
  const body: G[] = [], roofs: G[] = []
  const gallery = (x0: number, z0: number, x1: number, z1: number) => {
    const alongZ = x0 === x1, l = alongZ ? Math.abs(z1 - z0) : Math.abs(x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    body.push(alongZ ? boxg(0.04, 0.035, l, T, cx, cz) : boxg(l, 0.035, 0.04, T, cx, cz))
    const r = gable(l + 0.02, 0.065, 0.03)
    if (alongZ) r.rotateY(PI / 2)
    r.translate(cx, T + 0.035, cz)
    roofs.push(r)
  }
  if (galleries) {
    gallery(-0.33, -0.44, -0.33, 0.19); gallery(0.33, -0.44, 0.33, 0.19); gallery(-0.33, -0.44, 0.33, -0.44)
    gallery(-0.33, 0.19, -0.08, 0.19); gallery(0.08, 0.19, 0.33, 0.19)
    merge(k, body); merge(k, roofs, rm)
  }
  if (halls) {
    hall(k, rm, { z: 0.19, y: T, w: 0.15, d: 0.07, h: 0.05, roofH: 0.05, gable: 0.5 })
    hall(k, rm, { z: -0.27, y: T, w: 0.3, d: 0.17, h: 0.09, roofH: 0.1, gable: 0.5 })
  } else {
    // hall plinths with their stone column bases
    const bases: G[] = []
    for (const [z, w, d] of [[0.19, 0.15, 0.07], [-0.27, 0.3, 0.17]]) {
      k.box(w + 0.02, 0.012, d + 0.02, T, 0, z)
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) bases.push(boxg(0.012, 0.008, 0.012, T + 0.012, -w / 2 + (i * w) / 5, z + (s * d) / 2))
    }
    merge(k, bases, k.dark)
  }
  // Seokgatap: plain three-storey stone pagoda on a two-tier base
  const sx = -0.13, sz = -0.02
  k.box(0.08, 0.02, 0.08, T, sx, sz); k.box(0.06, 0.03, 0.06, T + 0.02, sx, sz)
  let y = T + 0.05
  for (const [b, h] of [[0.032, 0.035], [0.026, 0.02], [0.022, 0.018]]) {
    k.box(b, h, b, y, sx, sz); y += h
    k.add(frustum(b * 1.9, b * 1.9, b * 1.4, b * 1.4, 0.012), y, sx, sz); y += 0.012
  }
  k.add(cyl(0.004, 0.003, 0.04, 6), y, sx, sz)
  // Dabotap: stairs on four sides, an open pillared storey, then octagonal railings and lotus tiers
  const dx = 0.13
  k.box(0.08, 0.025, 0.08, T, dx, sz)
  for (let f = 0; f < 4; f++) {
    const g = boxg(0.02, 0.02, 0.025, T, 0, 0.05); g.rotateY((f * PI) / 2); g.translate(dx, 0, sz); k.add(g, 0)
  }
  y = T + 0.025
  const pil: G[] = [cyl(0.008, 0.008, 0.035, 6, y, dx, sz)]
  for (const a of [-1, 1]) for (const b of [-1, 1]) pil.push(boxg(0.008, 0.035, 0.008, y, dx + a * 0.025, sz + b * 0.025))
  merge(k, pil); y += 0.035
  k.box(0.075, 0.008, 0.075, y, dx, sz); y += 0.008
  k.add(cyl(0.028, 0.028, 0.018, 8), y, dx, sz, k.dark); y += 0.018
  k.add(cyl(0.02, 0.026, 0.015, 8), y, dx, sz); y += 0.015
  k.add(cyl(0.016, 0.016, 0.014, 8), y, dx, sz, k.dark); y += 0.014
  k.add(new THREE.ConeGeometry(0.034, 0.018, 8), y + 0.009, dx, sz); y += 0.018
  k.add(cyl(0.004, 0.003, 0.035, 6), y, dx, sz)
})

function forbiddenCity(k: Kit) {
  // the outer court: Hall of Supreme Harmony (64 x 37 m, double hipped roof) with the Central and Preserving Harmony halls behind it on the three-tier marble terrace, a courtyard closed by galleries and the Gate of Supreme Harmony
  const rm = doubleSided(k.dark), t = 0.018
  k.box(0.98, 0.004, 0.98, 0)
  for (let i = 0; i < 3; i++) k.box(0.44 - i * 0.03, t, 0.74 - i * 0.03, i * t, 0, -0.14)
  const top = 3 * t
  merge(k, [...flight(0.3, 0.2, 0, top, -0.05, 0.035, 6, 'z'), ...flight(0.3, 0.2, 0, top, 0.05, 0.035, 6, 'z')])
  k.add(ramp(0, 0, 0.1, top, 0, 0.035, 0.008).rotateY(PI / 2).translate(0, 0, 0.3), 0, 0, 0, k.dark)
  hall(k, rm, { z: 0.08, y: top, w: 0.213, d: 0.123, h: 0.1, roofH: 0.12, double: true })
  hall(k, rm, { z: -0.12, y: top, w: 0.075, d: 0.075, h: 0.055, roofH: 0.06, eave: 0.015 })
  k.add(new THREE.SphereGeometry(0.008, 8, 6), top + 0.055 + 0.058, 0, -0.12)
  hall(k, rm, { z: -0.3, y: top, w: 0.17, d: 0.09, h: 0.08, roofH: 0.085, double: true, gable: 0.5 })
  // Gate of Supreme Harmony on its own marble base
  k.box(0.26, 0.025, 0.11, 0, 0, 0.43)
  hall(k, rm, { z: 0.43, y: 0.025, w: 0.2, d: 0.075, h: 0.08, roofH: 0.075, double: true, gable: 0.5 })
  // galleries round the courtyard, with the two side pavilions
  const body: G[] = [], roofs: G[] = []
  const gallery = (cx: number, cz: number, l: number, alongZ: boolean) => {
    body.push(alongZ ? boxg(0.035, 0.035, l, 0, cx, cz) : boxg(l, 0.035, 0.035, 0, cx, cz))
    const r = gable(l, 0.055, 0.03)
    if (alongZ) r.rotateY(PI / 2)
    r.translate(cx, 0.035, cz)
    roofs.push(r)
  }
  for (const s of [-1, 1]) {
    gallery(s * 0.47, -0.02, 0.92, true)
    gallery(s * 0.3, 0.45, 0.32, false)
    hall(k, rm, { x: s * 0.39, z: 0.2, w: 0.14, d: 0.07, h: 0.08, roofH: 0.06, double: true, gable: 0.5, alongZ: true })
    hall(k, rm, { x: s * 0.47, z: 0.45, w: 0.06, d: 0.06, h: 0.05, roofH: 0.045, gable: 0.5 })
  }
  merge(k, body); merge(k, roofs, rm)
}

function tokyoTower(k: Kit) {
  // 333 m lattice tower on an 80 m base, main deck at 150 m and top deck at 250 m, painted in bands of orange and white
  const s = 1 / 90
  const hw = (y: number) => (40 * Math.exp(-y / 75) + 2.2) * s
  const levels = [0, 22, 42, 58, 74, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 268, 281, 294, 307]
  const geos: [G[], G[]] = [[], []]
  const put = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const band = Math.floor((a.y + b.y) / 2 / s / (333 / 11))
    geos[band % 2].push(strut(a, b, r))
  }
  const corners = (y: number) => {
    const h = hw(y)
    return [V3(-h, y * s, -h), V3(h, y * s, -h), V3(h, y * s, h), V3(-h, y * s, h)]
  }
  for (let i = 0; i < levels.length - 1; i++) {
    const A = corners(levels[i]), B = corners(levels[i + 1]), r = 0.011 * Math.exp(-levels[i] / 120) + 0.003
    for (let c = 0; c < 4; c++) {
      const n = (c + 1) % 4
      put(A[c], B[c], r)
      put(B[c], B[n], 0.0035)
      if (i > 0) { put(A[c], B[n], 0.003); put(A[n], B[c], 0.003) }
    }
  }
  merge(k, geos[0], k.dark)
  merge(k, geos[1])
  // arches between the legs at the foot
  for (let c = 0; c < 4; c++) {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 8; i++) {
      const u = -1 + i / 4, h = hw(0) * 0.92
      pts.push(V3(u * h, (1 - u * u) * 22 * s + 0.0, h))
    }
    const g: G[] = []
    for (let i = 0; i < 8; i++) g.push(strut(pts[i], pts[i + 1], 0.005))
    const m = merge(k, g, k.dark)
    m.rotation.y = (c * PI) / 2
  }
  k.box(0.56, 0.2, 0.46, 0, 0, 0.02)
  k.box(0.58, 0.01, 0.48, 0.2, 0, 0.02, k.dark)
  // main deck, two storeys
  const deck = (y: number, w: number, h: number) => {
    k.box(w, 0.012, w, y)
    k.box(w - 0.012, h, w - 0.012, y + 0.012, 0, 0, k.dark)
    k.box(w, 0.012, w, y + 0.012 + h)
  }
  deck(145 * s, 0.27, 0.05)
  deck(145 * s + 0.074, 0.24, 0.04)
  deck(250 * s, 0.14, 0.04)
  k.add(cyl(0.012, 0.006, 0.12, 8), 307 * s)
  k.add(cyl(0.006, 0.0025, 0.12, 6), 307 * s + 0.12)
}

function orientalPearl(k: Kit) {
  // 468 m: three columns and three raking legs carry a 50 m sphere, five small spheres, a 45 m sphere at 263 m and the little space module under the mast
  const hs = 1 / 70, vs = 4 / 468
  k.add(cyl(0.36, 0.34, 0.035, 24), 0)
  const cols: G[] = []
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + (i * 2 * PI) / 3, b = a + PI / 3
    cols.push(cyl(0.045, 0.045, 263 * vs, 10, 0, 0.1 * Math.cos(a), 0.1 * Math.sin(a)))
    cols.push(strut(V3(0.4 * Math.cos(b), 0, 0.4 * Math.sin(b)), V3(0.1 * Math.cos(b), 0.62, 0.1 * Math.sin(b)), 0.03, 8))
  }
  cols.push(cyl(0.04, 0.03, (350 - 263) * vs, 10, 263 * vs))
  merge(k, cols)
  const ball = (r: number, y: number, m = k.dark) => k.add(new THREE.SphereGeometry(r, 24, 16), y, 0, 0, m)
  ball(25 * hs, 93 * vs)
  for (let i = 0; i < 5; i++) ball(0.07, (150 + i * 19) * vs)
  ball(22.5 * hs, 263 * vs)
  k.add(cyl(0.34, 0.34, 0.012, 24), 263 * vs - 0.006)
  ball(7 * hs, 350 * vs)
  k.add(cyl(0.022, 0.012, 0.25, 8), 357 * vs)
  k.add(cyl(0.012, 0.003, 4 - 357 * vs - 0.25, 6), 357 * vs + 0.25)
}

function burjKhalifa(k: Kit) {
  // 828 m; a Y plan of three wings round a hexagonal core, each wing stepping back in turn so the setbacks spiral up to the spire
  const ang = [-PI / 2, PI / 6, (5 * PI) / 6], dy = 0.2, L0 = 0.5, L1 = 0.15, steps = 4, ww = 0.17
  const geos: G[] = []
  k.add(cyl(0.32, 0.32, 0.03, 24), 0)
  for (let w = 0; w < 3; w++) {
    let y0 = 0
    for (let m = 0; m <= steps; m++) {
      const y1 = m < steps ? (3 * m + w + 1) * dy : (13 + w) * dy
      const L = L0 - ((L0 - L1) * m) / steps
      const g = boxg(L, y1 - y0, ww, y0, L / 2)
      g.rotateY(-ang[w]); geos.push(g)
      y0 = y1
    }
  }
  merge(k, geos)
  k.add(cyl(0.13, 0.12, 3.1, 6), 0)
  k.add(cyl(0.11, 0.05, 0.45, 6), 3.1)
  k.add(cyl(0.05, 0.02, 0.3, 6), 3.55)
  k.add(cyl(0.02, 0.004, 0.18, 6), 3.85)
}

const empireState = staged([1950], (k, year) => {
  // 381 m to the roof, 443 m with the mast: a five-storey base filling the block, then setbacks to a notched shaft and the mooring mast
  const s = 1 / 130, strips: G[] = []
  const tier = (w: number, d: number, y0: number, y1: number) => k.box(w, y1 - y0, d, y0)
  tier(1, 0.46, 0, 0.19)
  tier(0.74, 0.38, 0.19, 0.62)
  tier(0.62, 0.34, 0.62, 0.92)
  tier(0.48, 0.24, 0.92, 2.3)
  tier(0.38, 0.32, 0.92, 2.3)
  tier(0.32, 0.22, 2.3, 2.48)
  tier(0.24, 0.17, 2.48, 2.62)
  tier(0.16, 0.13, 2.62, 2.74)
  for (let i = 0; i < 7; i++) {
    const x = -0.15 + (i * 0.3) / 6
    for (const z of [-0.161, 0.161]) strips.push(boxg(0.016, 1.3, 0.004, 0.95, x, z))
  }
  for (let i = 0; i < 3; i++) {
    const z = -0.08 + i * 0.08
    for (const x of [-0.241, 0.241]) strips.push(boxg(0.004, 1.3, 0.016, 0.95, x, z))
  }
  merge(k, strips, k.dark)
  k.add(cyl(0.055, 0.05, 0.12, 8), 2.74)
  k.add(cyl(0.045, 0.035, 0.18, 8), 2.86)
  k.add(cyl(0.035, 0.012, 0.06, 8), 3.04)
  // 1950: TV antenna on top of the mooring mast
  if (year >= 1950) k.add(cyl(0.007, 0.003, 443 * s - 3.1, 6), 3.1)
  else k.add(cyl(0.006, 0.002, 0.04, 6), 3.1)
})

/** Patch of a sphere (radius k times the triangle's circumradius) spanning the triangle A, L, R, bulging away from its centre (upwards). */
function shell(A: THREE.Vector3, L: THREE.Vector3, R: THREE.Vector3, k = 1.25, n = 10) {
  const ab = L.clone().sub(A), ac = R.clone().sub(A), nrm = ab.clone().cross(ac)
  const cc = A.clone().add(
    nrm.clone().cross(ab).multiplyScalar(ac.lengthSq()).add(ac.clone().cross(nrm).multiplyScalar(ab.lengthSq())).divideScalar(2 * nrm.lengthSq()),
  )
  if (nrm.y < 0) nrm.negate()
  nrm.normalize()
  const rc = cc.distanceTo(A), rad = rc * k, C = cc.sub(nrm.multiplyScalar(Math.sqrt(rad * rad - rc * rc)))
  const a = A.clone().sub(C), l = L.clone().sub(C), r = R.clone().sub(C)
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= n; i++) for (let j = 0; j <= i; j++) {
    const p = a.clone().multiplyScalar(1 - i / n).add(l.clone().multiplyScalar((i - j) / n)).add(r.clone().multiplyScalar(j / n))
    p.setLength(rad).add(C)
    pos.push(p.x, p.y, p.z)
  }
  const at = (i: number, j: number) => (i * (i + 1)) / 2 + j
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1))
    if (j < i) idx.push(at(i, j), at(i + 1, j + 1), at(i, j + 1))
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  // the edges A-L and A-R as points on the sphere, for the glass walls under the mouth
  const edge = (e: THREE.Vector3) => Array.from({ length: n + 1 }, (_, i) => a.clone().lerp(e, i / n).setLength(rad).add(C))
  return { geo, edges: [edge(l), edge(r)] }
}

function sydneyOpera(k: Kit) {
  // 183 x 120 m on Bennelong Point: two rows of spherical shells (Concert Hall west, Joan Sutherland Theatre east) rising south from glazed mouths to the harbour, a small pair over the restaurant, on a granite podium with the broad south steps
  const P = 0.05, shells: G[] = [], glass: number[] = []
  k.box(0.6, P, 0.8, 0, 0, -0.08)
  k.add(frustum(0.36, 0.1, 0.16, 0.1, P), 0, 0, -0.53)
  merge(k, flight(0.5, 0.32, 0, P, 0, 0.52, 7, 'z'))
  const add = (cx: number, za: number, zf: number, H: number, b: number, mouth: boolean) => {
    const A = V3(cx, P + H, za), L = V3(cx - b, P, zf), R = V3(cx + b, P, zf)
    const { geo, edges } = shell(A, L, R)
    shells.push(geo)
    if (!mouth) return
    for (const e of edges) for (let i = 0; i < e.length - 1; i++) {
      const p = e[i], q = e[i + 1]
      glass.push(p.x, p.y, p.z, q.x, q.y, q.z, q.x, P, q.z, p.x, p.y, p.z, q.x, P, q.z, p.x, P, p.z)
    }
  }
  const hallShells = (cx: number, f: number, dz: number) => {
    add(cx, -0.46 * f + dz, -0.2 * f + dz, 0.17 * f, 0.105 * f, true)
    add(cx, -0.32 * f + dz, -0.02 * f + dz, 0.26 * f, 0.12 * f, true)
    add(cx, -0.16 * f + dz, 0.17 * f + dz, 0.36 * f, 0.13 * f, true)
    add(cx, 0.3 * f + dz, 0.08 * f + dz, 0.19 * f, 0.115 * f, false)
  }
  hallShells(-0.12, 1, 0)
  hallShells(0.135, 0.88, 0.02)
  add(-0.23, 0.42, 0.3, 0.12, 0.05, false)
  add(-0.23, 0.24, 0.36, 0.09, 0.045, true)
  merge(k, shells, doubleSided(k.mat))
  const gg = new THREE.BufferGeometry()
  gg.setAttribute('position', new THREE.Float32BufferAttribute(glass, 3))
  gg.computeVertexNormals()
  k.add(gg, 0, 0, 0, doubleSided(k.dark))
}

/** Stepped pyramid: tiers of [bottom w, bottom d, top w, top d, height]. Returns the top height. */
function terraces(k: Kit, tiers: number[][], x = 0, z = 0) {
  let y = 0
  for (const [w0, d0, w1, d1, h] of tiers) { k.add(frustum(w0, d0, w1, d1, h), y, x, z); y += h }
  return y
}

function pyramidOfTheSun(k: Kit) {
  // 225 m square and 65 m high in five sloping bodies, the stair climbing the west face from the Adosada platform; a temple once stood on top
  const cx = 0.06
  const tiers = [[0.88, 0.86, 0.74, 0.72, 0.15], [0.68, 0.66, 0.56, 0.54, 0.11], [0.52, 0.5, 0.42, 0.4, 0.08], [0.38, 0.36, 0.3, 0.28, 0.07], [0.26, 0.24, 0.2, 0.18, 0.05]]
  const top = terraces(k, tiers, cx)
  const st: G[] = []
  let y = 0
  for (const [w0, , w1, , h] of tiers) { st.push(...flight(cx - w0 / 2, cx - w1 / 2, y, y + h, 0, 0.09, 7)); y += h }
  merge(k, st, k.dark)
  // Adosada: a lower stepped platform against the west face
  k.add(frustum(0.16, 0.5, 0.13, 0.46, 0.06), 0, cx - 0.44 - 0.06)
  k.add(frustum(0.1, 0.34, 0.08, 0.3, 0.04), 0.06, cx - 0.44 - 0.07)
  merge(k, flight(cx - 0.6, cx - 0.53, 0, 0.06, 0, 0.12, 5), k.dark)
  k.box(0.12, 0.05, 0.12, top, cx + 0.02)
  k.box(0.004, 0.035, 0.04, top, cx + 0.02 - 0.062, 0, k.dark)
  k.add(frustum(0.14, 0.14, 0.09, 0.09, 0.04), top + 0.05, cx + 0.02, 0, k.dark)
}

/** Runs build, then scales whatever it added to k.g by f about the origin. */
function scaled(k: Kit, f: number, build: () => void) {
  const n = k.g.children.length
  build()
  const grp = new THREE.Group()
  grp.scale.setScalar(f)
  for (const c of k.g.children.slice(n)) grp.add(c)
  k.g.add(grp)
}

const temploMayor = staged([1428, 1487, 1521, 1978], (k, year) => {
  // Tenochtitlan's great pyramid, about 45 m: twin shrines on top, Tlaloc to the north and Huitzilopochtli to the south, reached by a double stair on the west face
  // 1325: the first small temple; 1428: enlarged under Itzcoatl; 1487: Ahuitzotl's rebuilding; 1521: razed by the Spanish and built over; 1978: excavated
  const cx = 0.06
  if (year >= 1521) {
    if (year < 1978) { k.add(frustum(0.8, 1.0, 0.76, 0.96, 0.025), 0, cx); return }
    // excavation: footings of the last stage round the stepped lower bodies of the earlier ones
    terraces(k, [[0.78, 0.98, 0.76, 0.96, 0.035]], cx)
    terraces(k, [[0.58, 0.76, 0.52, 0.7, 0.07], [0.48, 0.66, 0.44, 0.6, 0.06]], cx + 0.02)
    const top = terraces(k, [[0.34, 0.46, 0.3, 0.42, 0.08], [0.27, 0.38, 0.24, 0.34, 0.06]], cx + 0.04)
    const st: G[] = []
    for (const z of [-0.08, 0.08]) st.push(...flight(cx + 0.04 - 0.21, cx + 0.04 - 0.12, 0, top, z, 0.11, 8))
    merge(k, st)
    for (const z of [-0.08, 0.08]) k.box(0.1, 0.025, 0.1, top, cx + 0.06, z, k.dark)
    return
  }
  scaled(k, year >= 1487 ? 1 : year >= 1428 ? 0.66 : 0.32, () => {
    const top = terraces(k, [[0.78, 0.98, 0.7, 0.9, 0.17], [0.64, 0.84, 0.56, 0.76, 0.17], [0.5, 0.7, 0.42, 0.62, 0.16], [0.36, 0.56, 0.3, 0.5, 0.14]], cx)
    const x0 = cx - 0.53, x1 = cx - 0.15, st: G[] = [], bal: G[] = []
    for (const z of [-0.13, 0.13]) st.push(...flight(x0, x1, 0, top, z, 0.2, 22))
    merge(k, st)
    for (const z of [-0.235, -0.0, 0.235]) bal.push(ramp(x0 - 0.01, 0, x1, top, z, 0.03, 0.02))
    for (const z of [-0.235, -0.02, 0.02, 0.235]) bal.push(boxg(0.04, 0.03, 0.03, 0, x0 - 0.03, z))
    merge(k, bal, k.dark)
    const sx = cx + 0.02
    for (const z of [-0.13, 0.13]) {
      k.box(0.2, 0.12, 0.2, top, sx, z)
      k.box(0.004, 0.08, 0.06, top, sx - 0.1, z, k.dark)
    }
    // Tlaloc's shrine has a flat banded roof, Huitzilopochtli's a taller crest
    for (let i = 0; i < 3; i++) k.box(0.21, 0.014, 0.21, top + 0.12 + i * 0.022, sx, -0.13, i % 2 ? k.mat : k.dark)
    k.box(0.18, 0.012, 0.18, top + 0.186, sx, -0.13)
    k.add(frustum(0.21, 0.21, 0.12, 0.12, 0.11), top + 0.12, sx, 0.13, k.dark)
    k.box(0.12, 0.02, 0.12, top + 0.23, sx, 0.13)
  })
})

const coricancha = staged([1534], (k, year) => {
  // Inca temple of the sun in Cusco: fine ashlar chambers round a court and the curved wall at its east end, with the church of Santo Domingo built on top after 1534
  const rm = doubleSided(k.dark), T = 0.1
  k.box(0.66, T, 0.42, 0, -0.1, -0.07)
  const curve = new THREE.CylinderGeometry(0.2, 0.215, T, 20, 1, false, 0, PI)
  k.add(curve, T / 2, 0.23, -0.07)
  const nz = -0.1, ny = T
  if (year >= 1534) {
    // 1534: Dominicans raise the church and convent on the Inca walls: nave, apse over the curved wall, bell tower at the west front
    k.box(0.56, 0.16, 0.15, ny, -0.03, nz)
    k.add(gable(0.58, 0.17, 0.07), ny + 0.16, -0.03, nz, rm)
    k.add(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 10, 1, false, 0, PI), ny + 0.08, 0.25, nz)
    k.add(new THREE.ConeGeometry(0.085, 0.06, 10, 1, false, 0, PI), ny + 0.19, 0.25, nz, rm)
    k.box(0.1, 0.27, 0.1, ny, -0.33, nz - 0.1)
    k.box(0.08, 0.06, 0.104, ny + 0.27, -0.33, nz - 0.1, k.dark)
    k.box(0.104, 0.06, 0.08, ny + 0.27, -0.33, nz - 0.1, k.dark)
    k.box(0.1, 0.015, 0.1, ny + 0.33, -0.33, nz - 0.1)
    k.add(new THREE.SphereGeometry(0.04, 10, 6, 0, PI * 2, 0, PI / 2), ny + 0.345, -0.33, nz - 0.1)
  } else {
    // Inti's hall along the terrace, its thatch running into the curved wall's chamber, and smaller shrines to the west
    k.box(0.4, 0.08, 0.13, ny, 0.0, nz)
    k.add(gable(0.42, 0.17, 0.1), ny + 0.08, 0.0, nz, rm)
    k.add(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16, 1, false, 0, PI), ny + 0.03, 0.23, -0.07)
    k.add(new THREE.ConeGeometry(0.2, 0.1, 16, 1, false, 0, PI), ny + 0.11, 0.23, -0.07, rm)
    for (const x of [-0.3, -0.38]) {
      k.box(0.07, 0.07, 0.12, ny, x, nz)
      const r = gable(0.12, 0.09, 0.06); r.rotateY(PI / 2)
      k.add(r, ny + 0.07, x, nz, rm)
    }
  }
  // Inca chambers round the court south of the nave, trapezoidal doorways
  const ch: G[] = [], roofs: G[] = [], doors: G[] = []
  const door = new THREE.Shape()
  door.moveTo(-0.014, 0); door.lineTo(0.014, 0); door.lineTo(0.009, 0.045); door.lineTo(-0.009, 0.045); door.closePath()
  const range = (cx: number, cz: number, l: number, alongZ: boolean, face: number) => {
    ch.push(alongZ ? boxg(0.07, 0.07, l, 0, cx, cz) : boxg(l, 0.07, 0.07, 0, cx, cz))
    const r = gable(l, 0.08, 0.035)
    if (alongZ) r.rotateY(PI / 2)
    r.translate(cx, 0.07, cz); roofs.push(r)
    for (let i = 0; i < 3; i++) {
      const u = (i - 1) * (l / 3.2), g = new THREE.ExtrudeGeometry(door, { depth: 0.006, bevelEnabled: false })
      g.rotateY(face)
      const off = 0.035
      g.translate(cx + (alongZ ? Math.sin(face) * off : u), 0, cz + (alongZ ? u : Math.cos(face) * off))
      doors.push(g)
    }
  }
  range(-0.1, 0.42, 0.5, false, PI)
  range(-0.36, 0.25, 0.28, true, PI / 2)
  range(0.16, 0.25, 0.28, true, -PI / 2)
  merge(k, ch); merge(k, roofs, rm); merge(k, doors, k.dark)
})

function tikalTemple1(k: Kit) {
  // Temple of the Great Jaguar, 47 m: nine steep terraces, one stair up the west face to a three-room temple with a tall roof comb
  const cx = 0.06, n = 9, h = 0.085, tiers: number[][] = []
  for (let i = 0; i < n; i++) {
    const wx = 0.62 - i * 0.034, wz = 0.7 - i * 0.04
    tiers.push([wx, wz, wx - 0.012, wz - 0.012, h * 0.75], [wx - 0.022, wz - 0.022, wx - 0.024, wz - 0.024, h * 0.25])
  }
  const top = terraces(k, tiers, cx)
  const x1 = cx - (0.62 - 8 * 0.034) / 2
  merge(k, flight(cx - 0.42, x1, 0, top, 0, 0.16, 26), k.dark)
  k.box(0.26, 0.035, 0.3, top, cx + 0.01)
  const ty = top + 0.035
  k.box(0.2, 0.13, 0.24, ty, cx + 0.02)
  for (const z of [-0.06, 0, 0.06]) k.box(0.004, 0.08, 0.035, ty, cx - 0.08, z, k.dark)
  k.add(frustum(0.22, 0.26, 0.17, 0.21, 0.04), ty + 0.13, cx + 0.02)
  const cy = ty + 0.17
  k.add(frustum(0.1, 0.22, 0.09, 0.18, 0.15), cy, cx + 0.05)
  k.add(frustum(0.08, 0.16, 0.07, 0.12, 0.1), cy + 0.15, cx + 0.05)
  k.box(0.004, 0.05, 0.12, cy + 0.04, cx, 0, k.dark)
}

function elCastillo(k: Kit) {
  // Temple of Kukulcan, 55 m square and 30 m high: nine terraces, a 91-step stair on each side, the temple on top, serpent heads at the foot of the north stair
  const n = 9, h = 0.066, tiers: number[][] = []
  for (let i = 0; i < n; i++) { const w = 0.86 - i * 0.056; tiers.push([w, w, w - 0.02, w - 0.02, h]) }
  const top = terraces(k, tiers)
  const st: G[] = [], bal: G[] = [], half = 0.86 / 2, tw = (0.86 - 8 * 0.056 - 0.02) / 2
  for (let f = 0; f < 4; f++) {
    const g = flight(half + 0.08, tw - 0.01, 0, top, 0, 0.15, 24)
    const b = [ramp(half + 0.085, 0, tw, top, -0.085, 0.022, 0.02), ramp(half + 0.085, 0, tw, top, 0.085, 0.022, 0.02)]
    for (const x of [...g, ...b]) x.rotateY((f * PI) / 2)
    st.push(...g); bal.push(...b)
  }
  merge(k, st)
  for (const z of [-0.085, 0.085]) bal.push(boxg(0.035, 0.03, 0.04, 0, z, -half - 0.1))
  merge(k, bal, k.dark)
  k.box(0.27, 0.12, 0.27, top)
  for (let f = 0; f < 4; f++) {
    const d = boxg(f === 2 ? 0.14 : 0.06, 0.08, 0.006, top, 0, 0.136)
    d.rotateY((f * PI) / 2)
    k.add(d, 0, 0, 0, k.dark)
  }
  for (const x of [-0.025, 0.025]) k.box(0.018, 0.08, 0.01, top, x, -0.138)
  k.box(0.29, 0.02, 0.29, top + 0.12)
  k.box(0.25, 0.025, 0.25, top + 0.14, 0, 0, k.dark)
}

function tschudi(k: Kit) {
  // Nik An, the best kept ciudadela of Chan Chan: double adobe walls 9-12 m high, entered from the north into a ceremonial plaza, then audiencias and storerooms, a walk-in well at the south
  const walls: G[] = [], low: G[] = []
  const wall = (x0: number, z0: number, x1: number, z1: number, h: number, t: number, to = walls) => {
    const along = x0 !== x1, l = Math.abs(along ? x1 - x0 : z1 - z0) + t
    const g = along ? frustum(l, t, l, t * 0.5, h) : frustum(t, l, t * 0.5, l, h)
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2)
    to.push(g)
  }
  const X = 0.36, Z = 0.5
  wall(-X, -Z, -0.03, -Z, 0.13, 0.03); wall(0.03, -Z, X, -Z, 0.13, 0.03)
  wall(-X, Z, X, Z, 0.13, 0.03); wall(-X, -Z, -X, Z, 0.13, 0.03); wall(X, -Z, X, Z, 0.13, 0.03)
  const x = 0.3, z = 0.44
  wall(-x, -z, -0.08, -z, 0.1, 0.022); wall(0.08, -z, x, -z, 0.1, 0.022)
  wall(-x, z, x, z, 0.1, 0.022); wall(-x, -z, -x, z, 0.1, 0.022); wall(x, -z, x, z, 0.1, 0.022)
  wall(-x, -0.12, -0.04, -0.12, 0.08, 0.02); wall(0.04, -0.12, x, -0.12, 0.08, 0.02)
  wall(-x, 0.18, 0.06, 0.18, 0.08, 0.02); wall(0.14, 0.18, x, 0.18, 0.08, 0.02)
  wall(0, -0.12, 0, 0.18, 0.06, 0.016)
  merge(k, walls)
  // ceremonial plaza: a ramp up to a low platform against its south side
  k.box(0.22, 0.025, 0.05, 0, 0, -0.17)
  k.add(ramp(0, 0, 0.08, 0.025, 0, 0.06, 0.006).rotateY(PI / 2).translate(0, 0, -0.07), 0)
  // U-shaped audiencias and rows of storerooms
  const u = (cx: number, cz: number) => {
    wall(cx - 0.035, cz - 0.03, cx + 0.035, cz - 0.03, 0.04, 0.01, low)
    wall(cx - 0.035, cz - 0.03, cx - 0.035, cz + 0.03, 0.04, 0.01, low)
    wall(cx + 0.035, cz - 0.03, cx + 0.035, cz + 0.03, 0.04, 0.01, low)
  }
  u(-0.2, -0.02); u(-0.1, -0.02); u(-0.2, 0.09); u(-0.1, 0.09)
  for (let i = 0; i < 5; i++) wall(0.04, -0.09 + i * 0.06, 0.28, -0.09 + i * 0.06, 0.045, 0.01, low)
  for (let i = 0; i < 5; i++) wall(0.06 + i * 0.05, -0.1, 0.06 + i * 0.05, 0.16, 0.045, 0.01, low)
  // walk-in well and burial platform in the south sector
  k.box(0.26, 0.004, 0.14, 0, -0.12, 0.31, k.dark)
  for (const [w, d] of [[0.26, 0.14]]) {
    wall(-0.12 - w / 2, 0.31 - d / 2, -0.12 + w / 2, 0.31 - d / 2, 0.015, 0.012, low)
    wall(-0.12 - w / 2, 0.31 + d / 2, -0.12 + w / 2, 0.31 + d / 2, 0.015, 0.012, low)
  }
  merge(k, low)
  k.add(frustum(0.14, 0.12, 0.1, 0.08, 0.05), 0, 0.17, 0.31)
  k.add(frustum(0.09, 0.07, 0.06, 0.05, 0.03), 0.05, 0.17, 0.31)
}

export const batch_d: Record<string, Builder> = {
  'yinxu-palace': yinxuPalace,
  'wild-goose-pagoda': wildGoosePagoda,
  todaiji,
  bulguksa,
  'forbidden-city': forbiddenCity,
  'tokyo-tower': tokyoTower,
  'oriental-pearl': orientalPearl,
  'burj-khalifa': burjKhalifa,
  'empire-state': empireState,
  'sydney-opera': sydneyOpera,
  'pyramid-of-the-sun': pyramidOfTheSun,
  'templo-mayor': temploMayor,
  coricancha,
  'tikal-temple-1': tikalTemple1,
  'el-castillo': elCastillo,
  tschudi,
}
