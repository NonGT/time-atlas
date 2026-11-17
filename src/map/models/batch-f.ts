import * as THREE from 'three'
import { gable, merge, staged, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
type P3 = [number, number, number]
const PI = Math.PI
const deg = (d: number) => (d * PI) / 180

const at = <T extends G>(g: T, x: number, y: number, z: number) => { g.translate(x, y, z); return g }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z)
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 12) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n), x, y + h / 2, z)
const lathe = (pts: number[][], seg: number, phi0 = 0, phiL = PI * 2) =>
  new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r), h)), seg, phi0, phiL)
const flat = (g: G, y: number) => { g.rotateX(-PI / 2); g.translate(0, y, 0); return g }
const lam = (color: string, emissive = '#000000') => new THREE.MeshLambertMaterial({ color, emissive })
const grass = () => lam('#6f8f4a', '#1a2410')
const water = () => lam('#5d7f94', '#101c24')

const tint = (k: Kit, f: number, to: string, t: number) => {
  const c = (k.mat as THREE.MeshLambertMaterial).clone()
  c.color.lerp(new THREE.Color(to), t).multiplyScalar(f)
  c.emissive.multiplyScalar(f)
  return c
}

/** Merges with one material, turning the lot about y first; copes with indexed and extruded geometry together. */
function put(k: Kit, gs: G[], m: THREE.Material = k.mat, rot = 0) {
  if (!gs.length) return
  const mixed = gs.some(g => g.index) && gs.some(g => !g.index)
  merge(k, gs.map(g => {
    const o = mixed && g.index ? g.toNonIndexed() : g
    if (rot) o.rotateY(rot)
    return o
  }), m)
}

const UP = new THREE.Vector3(0, 1, 0)
/** Open tube from a to b. */
function strut(a: P3, b: P3, r: number, n = 4) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A)
  const g = new THREE.CylinderGeometry(r, r, d.length(), n, 1, true)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()))
  const m = A.add(B).multiplyScalar(0.5)
  return at(g, m.x, m.y, m.z)
}

/** Box of height h standing on y, running from (x1, z1) to (x2, z2). */
function wall(x1: number, z1: number, x2: number, z2: number, h: number, t: number, y = 0) {
  const l = Math.hypot(x2 - x1, z2 - z1), g = new THREE.BoxGeometry(l + t, h, t)
  g.rotateY(-Math.atan2(z2 - z1, x2 - x1))
  return at(g, (x1 + x2) / 2, y + h / 2, (z1 + z2) / 2)
}

/** Gable roof along z instead of x. */
const gableZ = (l: number, d: number, h: number) => gable(l, d, h).rotateY(PI / 2)

const stonehenge = staged([1000], (k, year) => {
  // sarsen circle 33 m across, 30 uprights 4.1 m high under a ring of lintels; horseshoe of five trilithons up
  // to 7.3 m opening to the midsummer sunrise; bluestones; a 110 m ditch and bank with the Heel Stone outside.
  // Most of the fallen and missing stones were gone by the Middle Ages.
  const u = 1 / 100, V = 2.4, h = (m: number) => m * u * V
  const ruin = year >= 1000
  const sar: G[] = [], blu: G[] = []
  const AX = deg(50)
  const place = (g: G, az: number, r: number, t: number) => {
    g.rotateY(-az)
    return at(g, (r * Math.sin(az) + t * Math.cos(az)) * u, 0, (-r * Math.cos(az) + t * Math.sin(az)) * u)
  }
  // lean > 0 tips the top towards the centre
  const stand = (o: G[], az: number, r: number, t: number, w: number, hh: number, d: number, lean = 0, y = 0) => {
    const g = at(new THREE.BoxGeometry(w * u, h(hh), d * u), 0, y + h(hh) / 2, 0)
    if (lean) g.rotateX(lean)
    o.push(place(g, az, r, t))
  }
  const lie = (o: G[], az: number, r: number, t: number, w: number, len: number, d: number, spin = 0) => {
    const g = at(new THREE.BoxGeometry(w * u, h(d), len * u), 0, h(d) / 2, 0)
    g.rotateY(spin)
    o.push(place(g, az, r, t))
  }

  const up = new Set([1, 2, 3, 4, 5, 6, 7, 10, 11, 16, 21, 22, 23, 27, 28, 29, 30])
  const down = new Map([[8, 0.3], [9, -0.4], [12, 1.2], [14, 0.2], [19, -0.9], [25, 0.5]])
  const lintels = new Set([30, 1, 2, 4, 5, 6, 21])
  const sAz = (i: number) => AX + deg((i - 0.5) * 12)
  for (let i = 1; i <= 30; i++) {
    if (!ruin || up.has(i)) stand(sar, sAz(i), 15.5, 0, 2.1, 4.1, 1.1)
    else if (down.has(i)) lie(sar, sAz(i), 17.5, 0, 2.1, 4.1, 1.1, down.get(i)!)
    if (!ruin || lintels.has(i)) stand(sar, AX + deg(i * 12), 15.5, 0, 3.3, 0.8, 1.0, 0, 4.1)
  }
  if (ruin) {
    lie(sar, AX + deg(130), 12.5, 0, 3.2, 1.0, 0.8, 1.3)
    lie(sar, AX + deg(250), 18.5, 0, 3.2, 1.0, 0.8, 0.4)
  }

  // trilithons: angle from the axis, radius, height, what is left of each today
  const tris: [number, number, number, 'up' | 'one' | 'fell'][] = [
    [62, 8.5, 6.0, 'up'], [118, 8.5, 6.5, 'up'], [180, 9.0, 7.3, 'one'], [-118, 8.5, 6.5, 'up'], [-62, 8.5, 6.0, 'fell'],
  ]
  for (const [a, r, hh, left] of tris) {
    const az = AX + deg(a)
    if (!ruin || left === 'up') {
      for (const t of [-1.35, 1.35]) stand(sar, az, r, t, 2.3, hh, 1.5)
      stand(sar, az, r, 0, 5.0, 1.0, 1.3, 0, hh)
    } else if (left === 'one') {
      // the great trilithon: one upright still stands, leaning; its partner and lintel lie across the Altar Stone
      stand(sar, az, r, 1.35, 2.3, hh, 1.5, 0.12)
      lie(sar, az, r - 3.5, -1.5, 2.3, hh, 1.4, 0.3)
      lie(sar, az, r - 2.5, 2.0, 1.3, 5.0, 1.0, 1.2)
    } else {
      stand(sar, az, r, 1.35, 2.3, 2.0, 1.5)
      lie(sar, az, r - 3.0, -1.4, 2.3, hh, 1.4, -0.2)
      lie(sar, az, r + 3.0, 0, 1.3, 5.0, 1.0, 1.5)
    }
  }
  lie(blu, AX + deg(180), ruin ? 4.5 : 3.5, 0, 1.0, 4.9, 0.5, ruin ? 1.4 : PI / 2)

  // bluestone circle and horseshoe
  for (let i = 0; i < 48; i++) {
    const a = 9 + i * 7.3
    const gone = ruin && i % 3 === 0
    if (!gone) stand(blu, AX + deg(a), 11.5, 0, 1.2, 1.9, 0.8)
    else if (i % 2) lie(blu, AX + deg(a), 11, 0, 1.2, 2.0, 0.7, 0.8)
  }
  for (let i = 0; i < 15; i++) {
    const a = 45 + i * (270 / 14)
    if (!ruin || i % 3 !== 1) stand(blu, AX + deg(a), 5.5, 0, 0.9, 1.9 + 0.6 * Math.sin((i / 14) * PI), 0.7)
  }

  // Heel Stone in the Avenue, Slaughter Stone in the entrance
  stand(sar, AX + 0.03, 56, 0, 2.4, 4.7, 2.1, 0.2)
  if (ruin) lie(sar, AX - 0.04, 47, 0, 2.1, 6.4, 0.8, PI / 2)
  else stand(sar, AX - 0.04, 47, 0, 2.1, 6.4, 0.8)

  put(k, sar, tint(k, 0.95, '#b9b3a6', 0.55))
  put(k, blu, tint(k, 0.72, '#7c8794', 0.6))
  const gap = deg(9)
  const lip = lathe([[0.43, 0], [0.45, h(1.2)], [0.47, h(1.0)], [0.485, 0]], 64, PI - AX + gap, PI * 2 - gap * 2)
  const avenue = [-1, 1].map(s => place(bx(1.2 * u, h(0.6), 10 * u, 0, 0, 0), AX, 55, s * 7))
  put(k, [flat(new THREE.CircleGeometry(0.585, 64), 0.0005), lip, ...avenue], grass())
  put(k, [flat(new THREE.RingGeometry(0.49, 0.53, 64, 1, PI / 2 - AX + gap, PI * 2 - gap * 2), 0.001)], lam('#4f6b33', '#101a08'))
})

const montSaintMichel = staged([1897], (k, year) => {
  // granite islet about 960 m round and 80 m high: abbey church on the summit, the Merveille on the north face,
  // village and ramparts on the south-east. The 1897 neo-Gothic spire puts the gilt archangel at 157 m.
  const u = 1 / 300, V = 1.6, h = (m: number) => m * u * V
  const H = h(80)
  const prof = [[0.4, 0], [0.39, 0.015], [0.34, 0.05], [0.28, 0.1], [0.22, 0.17], [0.17, 0.25], [0.13, 0.33], [0.1, H - 0.01], [0, H]]
  const rockAt = (r: number) => {
    for (let i = 1; i < prof.length; i++) {
      const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]
      if (r >= r1) return y0 + ((r0 - r) / (r0 - r1)) * (y1 - y0)
    }
    return H
  }
  const rock = lathe(prof, 24)
  rock.scale(1.08, 1, 1)
  put(k, [rock], lam('#7f7a68', '#1a1810'))
  put(k, [flat(new THREE.CircleGeometry(0.585, 48), 0.0005)], lam('#d4c6a2', '#2a2416'))

  const m: G[] = [], d: G[] = [], roofs: G[] = []
  // abbey: west terrace, nave, transept, Flamboyant choir, the three-storey Merveille and the abbots' lodgings
  const ch = h(19), nz = 0.026
  m.push(bx(0.07, 0.08, 0.08, -0.16, H - 0.08, 0))
  m.push(bx(0.17, 0.07 + ch, nz * 2, -0.05, H - 0.07, 0))
  m.push(bx(0.045, 0.07 + ch, 0.13, 0.035, H - 0.07, 0))
  m.push(bx(0.08, 0.06 + h(24), 0.07, 0.095, H - 0.06, 0), cyl(0.035, 0.035, 0.06 + h(24), 0.135, H - 0.06, 0, 10))
  m.push(bx(0.19, H + h(8) - h(38), 0.05, 0.06, h(38), -0.09))
  m.push(bx(0.13, H + h(4) - h(48), 0.045, 0.04, h(48), 0.085))
  for (let x = -0.025; x <= 0.15; x += 0.035) d.push(bx(0.008, H + h(6) - h(38), 0.012, x, h(38), -0.118))
  for (let i = 0; i < 7; i++) {
    const a = -PI / 2 + (i / 6) * PI
    m.push(cyl(0.004, 0, 0.05, 0.135 + Math.cos(a) * 0.048, H + h(24) - 0.03, Math.sin(a) * 0.048, 4))
  }
  roofs.push(at(gable(0.17, nz * 2 + 0.006, 0.04), -0.05, H + ch, 0))
  roofs.push(at(gableZ(0.13, 0.05, 0.04), 0.035, H + ch, 0))
  roofs.push(at(gable(0.07, 0.074, 0.04), 0.095, H + h(24), 0))
  roofs.push(at(gable(0.19, 0.054, 0.03), 0.06, H + h(8), -0.09))
  roofs.push(at(gable(0.13, 0.05, 0.03), 0.04, H + h(4), 0.085))
  d.push(at(new THREE.ConeGeometry(0.037, 0.04, 10, 1, false, 0, PI), 0.135, H + h(24) + 0.02, 0))

  // crossing tower and spire
  const t0 = H + ch + 0.02
  m.push(bx(0.04, h(14), 0.04, 0.035, t0, 0))
  const gold = lam('#d9b35a', '#3a2a08')
  if (year >= 1897) {
    m.push(cyl(0.018, 0.018, h(10), 0.035, t0 + h(14), 0, 8))
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) m.push(cyl(0.004, 0, h(10), 0.035 + px * 0.017, t0 + h(14), pz * 0.017, 4))
    const s0 = t0 + h(24)
    d.push(cyl(0.017, 0.002, h(150) - s0, 0.035, s0, 0, 8))
    put(k, [cyl(0.003, 0.002, h(7), 0.035, h(150), 0, 5)], gold)
  } else {
    d.push(at(new THREE.ConeGeometry(0.03, h(14), 4).rotateY(PI / 4), 0.035, t0 + h(14) + h(7), 0))
  }

  // village climbing the south-east slope, with the parish church
  const houses: [number, number][] = []
  for (let a = 100; a <= 190; a += 12) houses.push([a, 0.335])
  for (let a = 94; a <= 184; a += 14) houses.push([a, 0.28])
  for (let a = 100; a <= 180; a += 16) houses.push([a, 0.25])
  for (let a = 108; a <= 172; a += 16) houses.push([a, 0.205])
  for (let a = 60; a <= 90; a += 15) houses.push([a, 0.33])
  houses.forEach(([a, r], i) => {
    const az = deg(a), x = r * Math.sin(az) * 1.08, z = -r * Math.cos(az)
    const y = rockAt(r + 0.02) - 0.01, hh = 0.03 + (i % 3) * 0.008
    const g = bx(0.034, hh, 0.028, 0, y, 0), rf = at(gable(0.036, 0.032, 0.02), 0, y + hh, 0)
    for (const q of [g, rf]) { q.rotateY(-az); q.translate(x, 0, z) }
    m.push(g); roofs.push(rf)
  })
  m.push(bx(0.025, 0.06, 0.025, 0.16, rockAt(0.24), 0.17))
  d.push(at(new THREE.ConeGeometry(0.02, 0.03, 4).rotateY(PI / 4), 0.16, rockAt(0.24) + 0.075, 0.17))

  // ramparts round the foot of the rock with their towers, from the Tour du Nord to the Tour Gabriel
  const pts: [number, number][] = []
  for (let a = 25; a <= 255; a += 23) { const az = deg(a), r = 0.395; pts.push([r * Math.sin(az) * 1.08, -r * Math.cos(az)]) }
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]
    if (i) m.push(wall(pts[i - 1][0], pts[i - 1][1], x, z, h(13), 0.012))
    m.push(cyl(0.018, 0.016, h(17), x, 0, z, 10))
    d.push(at(new THREE.ConeGeometry(0.02, 0.025, 10), x, h(17) + 0.0125, z))
  }
  const slate = lam('#545a62', '#121418')
  put(k, m, lam('#b8ae9a', '#221e18'))
  put(k, d, slate)
  put(k, roofs, slate)
  // causeway (1879), now the footbridge
  if (year >= 1897) put(k, [bx(0.03, 0.006, 0.2, 0.04, 0, 0.49)], lam('#a8a294', '#1e1c18'))
})

const sagrada = staged([1930, 1977, 2010, 2021, 2023, 2026], (k, year) => {
  // 90 m from the apse to the Glory front, transept 60 m; apostle towers about 100 m, the four evangelists
  // 135 m, Mary 138 m (2021) and Jesus 172.5 m (topped out 2026). Built along x, then turned to the Eixample grid:
  // Glory front to the south-east, Nativity to the north-east, Passion to the south-west.
  const u = 1 / 110, V = 1.15, h = (m: number) => m * u * V
  const ROT = -PI / 4
  const m: G[] = [], d: G[] = [], fin: G[] = [], green: G[] = [], white: G[] = []
  const cx = -0.04, tw = 0.1, nw = 0.2, apX = -0.21

  // Gaudí's parabolic spires: body tapering into a coloured mosaic pinnacle
  const spire = (x: number, z: number, r: number, H: number, seg: number, y = 0, finial = true) => {
    const body = [[r, 0], [r, 0.35], [r * 0.93, 0.58], [r * 0.78, 0.72], [r * 0.55, 0.82], [r * 0.4, 0.86]]
    const g = lathe(body.map(([a, b]) => [a, (b * H) / (finial ? 1 : 0.86)]), seg)
    m.push(at(g, x, y, z))
    if (finial) {
      const top = [[r * 0.4, 0.86], [r * 0.5, 0.89], [r * 0.44, 0.93], [r * 0.18, 0.97], [0, 1]]
      fin.push(at(lathe(top.map(([a, b]) => [a, b * H]), Math.min(seg, 6)), x, y, z))
    }
  }

  // apse with its ring of pinnacles (1890s), crypt level
  const apseH = year >= 2010 ? h(45) : h(30)
  m.push(at(new THREE.CylinderGeometry(nw, nw, apseH, 14, 1, false, PI, PI), apX, apseH / 2, 0), bx(0.01, apseH, nw * 2, apX, 0, 0))
  for (let i = 0; i < 7; i++) {
    const a = PI + (i / 6) * PI
    spire(apX + Math.sin(a) * (nw + 0.005), Math.cos(a) * (nw + 0.005), 0.016, apseH + h(14), 4, 0, false)
  }

  // Nativity front on -z: three portals and the green cypress, four towers (only St Barnabas finished in 1926)
  const nTow = [-0.105, -0.035, 0.035, 0.105]
  const facade = (s: number, fh: number) => {
    m.push(bx(0.27, fh, 0.05, cx, 0, s * 0.27))
    for (const x of [-0.07, 0, 0.07]) d.push(bx(0.04, fh * 0.55, 0.004, cx + x, 0, s * 0.297))
  }
  facade(-1, h(48))
  green.push(at(new THREE.ConeGeometry(0.028, h(18), 8), cx, h(48) + h(9), -0.27))
  nTow.forEach((x, i) => {
    const H = i === 0 || i === 3 ? h(98) : h(107)
    if (year >= 1930 || i === 2) spire(cx + x, -0.285, 0.033, H, 8)
    else spire(cx + x, -0.285, 0.033, H * 0.62, 8, 0, false)
  })

  if (year >= 1977) {
    // Passion front on +z: six leaning bone-like columns under a heavy frieze
    facade(1, h(40))
    for (let i = 0; i < 6; i++) {
      const x = cx - 0.1 + i * 0.04
      m.push(strut([x - (i - 2.5) * 0.008, 0, 0.33], [x, h(26), 0.31], 0.009, 5))
    }
    m.push(bx(0.27, h(8), 0.05, cx, h(26), 0.31))
    nTow.forEach((x, i) => spire(cx + x, 0.285, 0.033, i === 0 || i === 3 ? h(107) : h(112), 8))
  }

  if (year >= 2010) {
    // nave and transept roofed and consecrated in 2010
    const nx0 = cx + tw, nx1 = 0.4
    m.push(bx(nx1 - nx0, h(45), 0.15, (nx0 + nx1) / 2, 0, 0))
    for (const s of [-1, 1]) m.push(bx(nx1 - nx0, h(30), nw - 0.075, (nx0 + nx1) / 2, 0, s * (nw + 0.075) / 2))
    m.push(bx(tw * 2, h(45), 0.49, cx, 0, 0))
    m.push(bx(0.06, h(30), 0.36, nx1 + 0.02, 0, 0))
    d.push(at(gable(nx1 - nx0, 0.16, h(14)), (nx0 + nx1) / 2, h(45), 0))
    d.push(at(gableZ(0.49, tw * 2 + 0.01, h(14)), cx, h(45), 0))
    for (const s of [-1, 1]) d.push(bx(nx1 - nx0, 0.006, nw - 0.075, (nx0 + nx1) / 2, h(30), s * (nw + 0.075) / 2))
    for (let x = nx0 + 0.03; x < nx1; x += 0.06) for (const s of [-1, 1]) spire(x, s * 0.11, 0.012, h(52), 4, 0, false)
  } else if (year >= 1977) {
    for (const s of [-1, 1]) m.push(bx(0.32, h(8), 0.02, 0.22, 0, s * 0.19))
  }

  if (year >= 2021) {
    // Mary's tower over the apse with its twelve-pointed star
    spire(apX + 0.03, 0, 0.05, h(138), 10, 0, false)
    white.push(at(new THREE.IcosahedronGeometry(0.022, 0), apX + 0.03, h(138) + 0.01, 0))
  }
  if (year >= 2023) for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) spire(cx + x * 0.075, z * 0.075, 0.04, h(135), 8)
  if (year >= 2026) {
    spire(cx, 0, 0.065, h(172.5) - 0.06, 12, 0, false)
    const y = h(172.5) - 0.06
    white.push(bx(0.012, 0.075, 0.012, cx, y - 0.01, 0), bx(0.06, 0.012, 0.012, cx, y + 0.035, 0), bx(0.012, 0.012, 0.06, cx, y + 0.035, 0))
  }

  put(k, m, k.mat, ROT)
  put(k, d, k.dark, ROT)
  put(k, fin, lam('#d38b45', '#3a1c08'), ROT)
  put(k, green, lam('#5f7d3f', '#1a2410'), ROT)
  put(k, white, lam('#f2efe6', '#5a5850'), ROT)
})

function alhambra(k: Kit) {
  // 740 x 205 m enclosure on the Sabika ridge above Granada: red walls with some thirty towers, the Alcazaba
  // and Torre de la Vela at the west point, Comares tower (45 m) over the Nasrid palaces, Charles V's palace
  const ROT = -0.25
  const H = 0.05
  const red = lam('#c0704c', '#2e1408'), roofs = lam('#8f4a32', '#200c06')
  const hill = lathe([[1, 0], [0.97, H * 0.55], [0.93, H]], 32)
  hill.scale(0.6, 1, 0.19)
  const cap = lathe([[0.93, H], [0, H]], 32)
  cap.scale(0.6, 1, 0.19)
  put(k, [hill], lam('#6f8547', '#18200c'), ROT)
  put(k, [cap], lam('#a4a26e', '#22220e'), ROT)

  const r: G[] = [], rf: G[] = [], st: G[] = [], wet: G[] = [], cy: G[] = [], dk: G[] = []
  const ring: [number, number][] = [[-0.52, 0], [-0.47, -0.07], [-0.38, -0.105], [-0.26, -0.125], [-0.13, -0.15], [0, -0.14], [0.12, -0.135],
    [0.25, -0.12], [0.37, -0.1], [0.46, -0.07], [0.52, -0.03], [0.53, 0.02], [0.48, 0.07], [0.38, 0.1], [0.25, 0.125], [0.12, 0.14],
    [0, 0.14], [-0.12, 0.13], [-0.25, 0.11], [-0.38, 0.085], [-0.47, 0.05]]
  ring.forEach(([x, z], i) => {
    const [px, pz] = ring[(i + ring.length - 1) % ring.length]
    r.push(wall(px, pz, x, z, 0.028, 0.01, H))
    r.push(bx(0.024, 0.045, 0.024, x, H, z))
    const mx = (x + px) / 2, mz = (z + pz) / 2
    if (Math.hypot(x - px, z - pz) > 0.1) r.push(bx(0.02, 0.04, 0.02, mx, H, mz))
  })
  // Alcazaba
  const alc: [number, number][] = [[-0.52, 0], [-0.47, -0.07], [-0.36, -0.085], [-0.35, 0.06], [-0.46, 0.05]]
  alc.forEach(([x, z], i) => { const [px, pz] = alc[(i + 4) % 5]; r.push(wall(px, pz, x, z, 0.04, 0.012, H)) })
  r.push(bx(0.055, 0.1, 0.05, -0.49, H, 0.01), bx(0.04, 0.09, 0.04, -0.37, H, -0.07), bx(0.03, 0.06, 0.03, -0.36, H, 0.055))
  dk.push(bx(0.1, 0.002, 0.1, -0.43, H, -0.01), bx(0.012, 0.015, 0.012, -0.49, H + 0.1, 0.01))
  // Comares tower, Court of the Myrtles with its pool, Court of the Lions
  r.push(bx(0.05, 0.12, 0.05, -0.2, H, -0.13))
  dk.push(bx(0.052, 0.004, 0.052, -0.2, H + 0.12, -0.13))
  for (const s of [-1, 1]) {
    r.push(bx(0.014, 0.032, 0.09, -0.2 + s * 0.03, H, -0.06))
    rf.push(at(gableZ(0.09, 0.018, 0.012), -0.2 + s * 0.03, H + 0.032, -0.06))
  }
  r.push(bx(0.07, 0.035, 0.014, -0.2, H, -0.012))
  wet.push(bx(0.02, 0.003, 0.075, -0.2, H, -0.06))
  for (const [w, dd, x, z] of [[0.07, 0.012, -0.12, -0.09], [0.07, 0.012, -0.12, -0.03], [0.012, 0.05, -0.155, -0.06], [0.012, 0.05, -0.085, -0.06]]) {
    r.push(bx(w, 0.026, dd, x, H, z))
    rf.push(at(w > dd ? gable(w, dd + 0.006, 0.01) : gableZ(dd, w + 0.006, 0.01), x, H + 0.026, z))
  }
  wet.push(cyl(0.006, 0.006, 0.006, -0.12, H, -0.06, 8))
  // Charles V's palace: a square with a round courtyard
  const sq = new THREE.Shape([new THREE.Vector2(-0.045, -0.045), new THREE.Vector2(0.045, -0.045), new THREE.Vector2(0.045, 0.045), new THREE.Vector2(-0.045, 0.045)])
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.026, 0, PI * 2, true)
  sq.holes.push(hole)
  const cv = new THREE.ExtrudeGeometry(sq, { depth: 0.045, bevelEnabled: false, curveSegments: 6 })
  cv.rotateX(-PI / 2)
  st.push(at(cv, -0.22, H, 0.03))
  // Santa María, Puerta de la Justicia, Partal with the Torre de las Damas and its pool
  r.push(bx(0.06, 0.035, 0.028, -0.11, H, 0.05), bx(0.02, 0.065, 0.02, -0.075, H, 0.05))
  rf.push(at(gable(0.06, 0.034, 0.014), -0.11, H + 0.035, 0.05))
  r.push(bx(0.045, 0.058, 0.035, -0.12, H, 0.125))
  r.push(bx(0.03, 0.04, 0.026, -0.03, H, -0.135))
  wet.push(bx(0.03, 0.003, 0.03, -0.03, H, -0.1))
  // the old medina to the east: the San Francisco convent and scattered houses among gardens
  r.push(bx(0.06, 0.028, 0.05, 0.08, H, 0.01))
  rf.push(at(gable(0.06, 0.056, 0.014), 0.08, H + 0.028, 0.01))
  for (let i = 0; i < 9; i++) {
    const x = 0.16 + i * 0.035, z = ((i * 37) % 13) / 13 * 0.14 - 0.07
    r.push(bx(0.024, 0.016, 0.02, x, H, z))
  }
  for (let i = 0; i < 16; i++) {
    const x = -0.3 + i * 0.05 + ((i * 13) % 7) * 0.004, z = (i % 2 ? 0.1 : -0.1) * (0.6 + ((i * 7) % 5) * 0.08)
    cy.push(at(new THREE.ConeGeometry(0.007, 0.05, 5), x, H + 0.025, z))
  }
  put(k, r, red, ROT)
  put(k, rf, roofs, ROT)
  put(k, st, tint(k, 1.05, '#ddc89d', 0.6), ROT)
  put(k, wet, water(), ROT)
  put(k, cy, lam('#4f6b33', '#101a08'), ROT)
  put(k, dk, k.dark, ROT)
}

const pontDuGard = staged([1743], (k, year) => {
  // 49 m high: six arches below (22 m, up to 24.5 m wide), eleven in the middle (20 m), thirty-five small ones on
  // top carrying the water channel, 275 m long. A road bridge was built against the lower tier in 1743.
  const u = 1 / 275, V = 1.7, h = (m: number) => m * u * V
  const ROT = 1.3
  const stone = lam('#dcc48e', '#2c2414')

  // shape of a tier in (along, up), spans laid from s0 with piers p, arch crowns at top
  const tier = (s0: number, spans: number[], p: number, H: number, top: number) => {
    const sh = new THREE.Shape(), cs: number[] = []
    sh.moveTo(s0 * u, 0)
    let s = s0 + p
    for (const w of spans) {
      const c = s + w / 2, spring = top - w / 2
      cs.push(c)
      sh.lineTo(s * u, 0); sh.lineTo(s * u, h(spring))
      sh.absellipse(c * u, h(spring), (w / 2) * u, h(w / 2), PI, 0, true, 0)
      sh.lineTo((s + w) * u, 0)
      s += w + p
    }
    sh.lineTo(s * u, 0); sh.lineTo(s * u, h(H)); sh.lineTo(s0 * u, h(H)); sh.closePath()
    return { sh, cs, end: s }
  }
  const slabOf = (sh: THREE.Shape, t: number, y: number, z = 0, cs = 5) => {
    const g = new THREE.ExtrudeGeometry(sh, { depth: t * u, bevelEnabled: false, curveSegments: cs })
    return at(g, 0, h(y), z * u - (t * u) / 2)
  }
  const low = tier(-71.5, [15.6, 19.2, 24.5, 21.5, 15.5, 14.4], 4.6, 22, 20)
  const mid = tier(-115.5, [17.4, 17.4, 15.6, 19.2, 24.5, 21.5, 15.5, 14.4, 17.4, 17.4, 17.4], 4.6, 20, 18.5)
  const top = tier(-137.5, Array(35).fill(4.8), 3.057, 7.4, 5)
  const s: G[] = [slabOf(low.sh, 6.4, 0), slabOf(mid.sh, 4.6, 22), slabOf(top.sh, 3.1, 42, 0, 3)]
  if (year >= 1743) s.push(slabOf(tier(-71.5, [15.6, 19.2, 24.5, 21.5, 15.5, 14.4], 4.6, 20.5, 19).sh, 5, 0, 5.7))
  put(k, s, stone, ROT)
  put(k, [bx(275 * u, h(0.6), 3.4 * u, 0, h(49.4), 0)], lam('#a8946a', '#201a10'), ROT)

  // valley sides, gravel bed and the Gardon under the big arch
  const bank = (dir: number) => {
    const sh = new THREE.Shape()
    const pts = [[72, 0], [82, 22], [104, 33], [124, 40], [140, 45.5], [158, 47], [158, 0]]
    sh.moveTo(dir * pts[0][0] * u, 0)
    for (const [a, b] of pts.slice(1)) sh.lineTo(dir * a * u, h(b))
    sh.closePath()
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.36, bevelEnabled: false })
    return at(g, 0, 0, -0.18)
  }
  put(k, [bank(-1), bank(1)], lam('#7d8f55', '#1c2410'), ROT)
  put(k, [bx(150 * u, 0.002, 0.36, 0, 0, 0)], lam('#cdbf9a', '#28241a'), ROT)
  put(k, [bx(42 * u, 0.004, 0.36, low.cs[2] * u, 0, 0)], water(), ROT)
})

function cologne(k: Kit) {
  // 144 m long, 86 m across the transept, twin west towers 157 m, roof ridge 61 m; five-aisled nave and a
  // choir ringed with chapels and flying buttresses
  const u = 1 / 145, V = 1.35, h = (m: number) => m * u * V
  const m: G[] = [], d: G[] = [], rf: G[] = []
  const nz = 0.05, az = 0.155, x0 = -0.31, xc0 = 0.02, xc1 = 0.14, x1 = 0.33
  const pin = (x: number, z: number, y: number, r: number, hh: number) => m.push(cyl(r, 0, hh, x, y, z, 5))

  // west towers: two square storeys with corner buttresses, an octagonal lantern, then the openwork spire
  for (const s of [-1, 1]) {
    const tz = s * 0.125, tx = -0.405
    m.push(bx(0.19, h(68), 0.17, tx, 0, tz))
    m.push(bx(0.15, h(97) - h(68), 0.14, tx, h(68), tz))
    m.push(cyl(0.058, 0.055, h(110) - h(97), tx, h(97), tz, 8))
    m.push(cyl(0.055, 0.003, h(152) - h(110), tx, h(110), tz, 8))
    m.push(cyl(0.004, 0.004, h(5), tx, h(152), tz, 4), bx(0.02, 0.004, 0.02, tx, h(153), tz))
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      m.push(bx(0.03, h(68) + 0.02, 0.03, tx + px * 0.088, 0, tz + pz * 0.078))
      pin(tx + px * 0.088, tz + pz * 0.078, h(68) + 0.02, 0.014, 0.07)
      pin(tx + px * 0.066, tz + pz * 0.062, h(97), 0.012, 0.08)
    }
    for (const a of [0, PI / 2, PI, -PI / 2]) pin(tx + Math.cos(a) * 0.068, tz + Math.sin(a) * 0.068, h(97), 0.008, 0.06)
    for (const zz of [-0.035, 0.035]) {
      d.push(bx(0.004, h(26), 0.022, tx - 0.097, h(30), tz + zz), bx(0.004, h(20), 0.02, tx - 0.077, h(72), tz + zz))
      d.push(bx(0.022, h(20), 0.004, tx + zz, h(72), tz + s * 0.072))
    }
    d.push(bx(0.004, h(20), 0.045, tx - 0.097, 0, tz))
  }
  // middle of the west front between the towers
  m.push(bx(0.19, h(52), 0.08, -0.405, 0, 0))
  d.push(bx(0.004, h(24), 0.05, -0.502, 0, 0), bx(0.004, h(18), 0.045, -0.502, h(30), 0))
  // nave, transept and choir
  m.push(bx(x1 - x0, h(45), nz * 2, (x0 + x1) / 2, 0, 0))
  m.push(cyl(nz, nz, h(45), x1, 0, 0, 10))
  for (const s of [-1, 1]) m.push(bx(x1 - x0, h(22), az - nz, (x0 + x1) / 2, 0, s * (az + nz) / 2))
  m.push(at(lathe([[az, 0], [az, h(22)], [0, h(22)]], 12, 0, PI), x1, 0, 0))
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * PI
    m.push(cyl(0.03, 0.03, h(19), x1 + Math.sin(a) * (az + 0.01), 0, Math.cos(a) * (az + 0.01), 6))
  }
  m.push(bx(xc1 - xc0, h(45), 0.6, (xc0 + xc1) / 2, 0, 0))
  for (const s of [-1, 1]) {
    m.push(at(gableZ(0.006, xc1 - xc0, h(16)), (xc0 + xc1) / 2, h(45), s * 0.297))
    for (const x of [xc0 + 0.008, xc1 - 0.008]) { m.push(bx(0.018, h(52), 0.018, x, 0, s * 0.3)); pin(x, s * 0.3, h(52), 0.01, 0.06) }
    d.push(bx(0.06, h(20), 0.004, (xc0 + xc1) / 2, 0, s * 0.301), at(new THREE.CircleGeometry(0.025, 12), (xc0 + xc1) / 2, h(34), s * 0.302))
  }
  rf.push(at(gable(x1 - x0, nz * 2 + 0.008, h(16)), (x0 + x1) / 2, h(45), 0))
  rf.push(at(gableZ(0.6, xc1 - xc0 + 0.008, h(16)), (xc0 + xc1) / 2, h(45), 0))
  rf.push(at(new THREE.ConeGeometry(nz + 0.004, h(16), 10, 1, false, 0, PI), x1, h(45) + h(8), 0))
  for (const s of [-1, 1]) rf.push(bx(x1 - x0, 0.006, az - nz, (x0 + x1) / 2, h(22), s * (az + nz) / 2))
  rf.push(at(new THREE.CylinderGeometry(az, az, 0.006, 12, 1, false, 0, PI), x1, h(22) + 0.003, 0))
  // crossing ridge turret
  m.push(cyl(0.012, 0.012, h(8), (xc0 + xc1) / 2, h(59), 0, 6), cyl(0.012, 0, h(109) - h(67), (xc0 + xc1) / 2, h(67), 0, 6))

  // flying buttresses with their pinnacles
  const flyer = (x: number, ang: number, r0: number) => {
    const gs = [bx(0.018, h(34), 0.018, 0, 0, r0), cyl(0.009, 0, 0.06, 0, h(34), r0, 5)]
    const span = r0 - nz, arm = new THREE.BoxGeometry(0.007, 0.008, Math.hypot(span, h(8)))
    arm.rotateX(Math.atan2(h(8), span))
    gs.push(at(arm, 0, h(34), nz + span / 2))
    for (const g of gs) { g.rotateY(ang); g.translate(x, 0, 0); m.push(g) }
  }
  for (let x = x0 + 0.03; x < x1 - 0.01; x += 0.055) {
    if (x > xc0 - 0.01 && x < xc1 + 0.01) continue
    flyer(x, 0, az); flyer(x, PI, az)
  }
  for (let i = 1; i < 6; i++) flyer(x1, (i / 6) * PI, az)
  put(k, m, lam('#8a8478', '#1c1a16'))
  put(k, d, k.dark)
  put(k, rf, lam('#565c5e', '#121414'))
}

function kinderdijk(k: Kit) {
  // drainage mills along two parallel boezem canals: thatched octagonal Overwaard mills and round brick
  // Nederwaard ones, bodies about 17 m with a 28 m sail span
  const ROT = 0.5
  const th: G[] = [], br: G[] = [], cap: G[] = [], sail: G[] = [], wood: G[] = []
  const mill = (x: number, z: number, face: number, turn: number, brick: boolean) => {
    const H = 0.13
    if (brick) {
      br.push(at(lathe([[0.042, 0], [0.038, 0.05], [0.03, H], [0, H]], 10), x, 0, z))
      wood.push(cyl(0.058, 0.058, 0.004, x, 0.05, z, 10))
    } else {
      br.push(cyl(0.05, 0.05, 0.012, x, 0, z, 8))
      th.push(at(lathe([[0.046, 0], [0.042, 0.02], [0.026, H], [0, H]], 8, PI / 8), x, 0.012, z))
    }
    const top = brick ? H : H + 0.012
    const c = new THREE.SphereGeometry(0.03, 8, 4, 0, PI * 2, 0, PI / 2)
    c.scale(1, 0.85, 1.25); c.rotateY(face)
    cap.push(at(c, x, top, z))
    const hx = x + Math.sin(face) * 0.035, hz = z + Math.cos(face) * 0.035, hy = top + 0.012
    for (let i = 0; i < 4; i++) {
      const a = turn + (i * PI) / 2
      const stock = bx(0.006, 0.105, 0.004, 0, 0, 0)
      const lat = bx(0.022, 0.08, 0.002, 0.013, 0.022, 0.002)
      for (const [g, o] of [[stock, wood], [lat, sail]] as [G, G[]][]) {
        g.rotateZ(a); g.rotateY(face); g.translate(hx, hy, hz); o.push(g)
      }
    }
  }
  for (let i = 0; i < 5; i++) mill(-0.36 + i * 0.18, -0.21, -PI * 0.75 + (i % 2) * 0.15, 0.25 + i * 0.4, false)
  for (let i = 0; i < 4; i++) mill(-0.27 + i * 0.18, 0.27, -PI * 0.75 - (i % 2) * 0.12, 0.6 + i * 0.5, true)

  const fields = [bx(1.0, 0.003, 0.76, 0, 0, 0)]
  const canals = [bx(1.0, 0.002, 0.08, 0, 0.003, -0.11), bx(1.0, 0.002, 0.07, 0, 0.003, 0.17), bx(0.02, 0.002, 0.76, 0.44, 0.003, 0)]
  put(k, fields, grass(), ROT)
  put(k, canals, water(), ROT)
  put(k, th, lam('#6e6352', '#1c1810'), ROT)
  put(k, br, lam('#8e4e3a', '#24100a'), ROT)
  put(k, cap, lam('#4e4a44', '#141210'), ROT)
  put(k, wood, k.dark, ROT)
  put(k, sail, lam('#e2dac8', '#2e2c26'), ROT)
}

function forthBridge(k: Kit) {
  // 2.5 km: three double cantilevers on 110 m towers with 207 m arms, joined by 107 m suspended spans, the rail
  // deck 46 m above high water, approach viaducts on granite piers. Heights and width exaggerated.
  const ROT = PI / 2 + 0.15
  const yv = 3.8 / 2500, wz = 3 / 2500
  const s = (m: number) => (m - 1233.5) / 2500, y = (m: number) => m * yv, w = (m: number) => m * wz
  const R: G[] = [], P: G[] = []
  const TOP = 110
  const units: [number, number][] = [[739, 22], [1321.5, 39.5], [1904, 22]]
  const ends: number[] = []
  for (const [c, a] of units) {
    // tower: four tubes leaning in from 36 m apart at the base to 10 m at the top
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      R.push(strut([s(c + sx * a), y(6), sz * w(18)], [s(c + sx * a), y(TOP), sz * w(5)], 0.003))
      P.push(cyl(0.006, 0.006, y(6), s(c + sx * a), 0, sz * w(18), 6))
    }
    for (const sz of [-1, 1]) {
      R.push(strut([s(c - a), y(6), sz * w(18)], [s(c + a), y(TOP), sz * w(5)], 0.0015))
      R.push(strut([s(c + a), y(6), sz * w(18)], [s(c - a), y(TOP), sz * w(5)], 0.0015))
      R.push(strut([s(c - a), y(TOP), sz * w(5)], [s(c + a), y(TOP), sz * w(5)], 0.0018))
    }
    for (const sx of [-1, 1]) R.push(strut([s(c + sx * a), y(TOP), -w(5)], [s(c + sx * a), y(TOP), w(5)], 0.0018))
    // arms: bottom chord curving up from the pier to the deck, top chord falling straight from the tower head
    for (const dir of [-1, 1]) {
      const b0 = c + dir * a, n = 4
      ends.push(c + dir * (a + 207))
      const bot = (f: number, sz: number): P3 => [s(b0 + dir * 207 * f), y(6 + 38 * (1 - Math.pow(1 - f, 1.8))), sz * w(18 - 13 * f)]
      const top = (f: number, sz: number): P3 => [s(b0 + dir * 207 * f), y(TOP - (TOP - 58) * f), sz * w(5)]
      for (const sz of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const f0 = i / n, f1 = (i + 1) / n
          R.push(strut(bot(f0, sz), bot(f1, sz), 0.0035))
          R.push(strut(top(f0, sz), top(f1, sz), 0.0022))
          R.push(strut(bot(f1, sz), top(f1, sz), 0.0013))
          R.push(i % 2 ? strut(bot(f0, sz), top(f1, sz), 0.0013) : strut(top(f0, sz), bot(f1, sz), 0.0013))
        }
      }
      for (let i = 1; i <= n; i++) R.push(strut(bot(i / n, -1), bot(i / n, 1), 0.0012))
    }
  }
  // suspended spans between the arm tips
  ends.sort((p, q) => p - q)
  for (const [e0, e1] of [[ends[1], ends[2]], [ends[3], ends[4]]]) {
    for (const sz of [-1, 1]) {
      const pts = [0, 0.33, 0.67, 1].map(f => [s(e0 + (e1 - e0) * f), sz * w(5), f * (1 - f)] as const)
      for (let i = 0; i < 3; i++) {
        const [xa, za, ka] = pts[i], [xb, zb, kb] = pts[i + 1]
        R.push(strut([xa, y(44), za], [xb, y(44), zb], 0.002))
        R.push(strut([xa, y(52 + 16 * ka), za], [xb, y(52 + 16 * kb), zb], 0.002))
        R.push(strut([xb, y(44), zb], [xb, y(52 + 16 * kb), zb], 0.0012))
        R.push(strut([xa, y(52 + 16 * ka), za], [xb, y(44), zb], 0.0012))
      }
    }
  }
  // deck through the cantilevers and over the approach girders, granite approach piers
  R.push(bx(s(2133) - s(510), y(3), w(10), (s(510) + s(2133)) / 2, y(43), 0))
  R.push(bx(s(510) - s(0), y(5), w(10), (s(0) + s(510)) / 2, y(42), 0), bx(s(2467) - s(2133), y(5), w(10), (s(2133) + s(2467)) / 2, y(42), 0))
  for (let i = 0; i <= 10; i++) P.push(bx(0.005, y(42), w(14), s(i * 51), 0, 0))
  for (let i = 1; i <= 6; i++) P.push(bx(0.005, y(42), w(14), s(2133 + i * 55.7), 0, 0))
  const isle = lathe([[0.03, 0], [0.024, 0.004], [0, 0.006]], 12)
  isle.scale(2, 1, 1)
  put(k, R, lam('#b04a36', '#2c0c06'), ROT)
  put(k, P, tint(k, 0.8, '#9a958c', 0.6), ROT)
  put(k, [at(isle, s(1321.5), 0, 0)], lam('#6f7a55', '#181c10'), ROT)
}

export const batch_f: Record<string, Builder> = {
  stonehenge,
  'mont-saint-michel': montSaintMichel,
  'sagrada-familia': sagrada,
  alhambra,
  'pont-du-gard': pontDuGard,
  'cologne-cathedral': cologne,
  'kinderdijk-windmills': kinderdijk,
  'forth-bridge': forthBridge,
}
