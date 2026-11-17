import * as THREE from 'three'
import { merge, staged, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
type P = [number, number]
const PI = Math.PI

const at = <T extends G>(g: T, x: number, y: number, z: number) => { g.translate(x, y, z); return g }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d)
  if (ry) g.rotateY(ry)
  return at(g, x, y + h / 2, z)
}
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 12, open = false) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n, 1, open), x, y + h / 2, z)
const cone = (r: number, h: number, x: number, y: number, z: number, n = 8, rot = 0) => {
  const g = new THREE.ConeGeometry(r, h, n)
  if (rot) g.rotateY(rot)
  return at(g, x, y + h / 2, z)
}
const lathe = (pts: number[][], seg: number, sr = 1, sh = 1) =>
  new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)), seg)
const onionPts = [[0.42, 0], [0.92, 0.18], [1, 0.36], [0.8, 0.58], [0.3, 0.8], [0, 1]]
const onion = (r: number, h: number, x: number, y: number, z: number, seg = 8) => at(lathe(onionPts, seg, r, h), x, y, z)

const tint = (k: Kit, to: string, t: number, f = 1) => {
  const c = (k.mat as THREE.MeshLambertMaterial).clone()
  c.color.lerp(new THREE.Color(to), t).multiplyScalar(f)
  c.emissive.lerp(new THREE.Color(to).multiplyScalar(0.3), t).multiplyScalar(f)
  return c
}

// merge() needs all indexed or all not, extrusions aren't
function put(k: Kit, geos: G[], m: THREE.Material = k.mat) {
  const a = geos.filter(g => g.index), b = geos.filter(g => !g.index)
  if (a.length) merge(k, a, m)
  if (b.length) merge(k, b, m)
}

/** Box running from a to b on the ground plane. */
function wall(a: P, b: P, h: number, t: number, y = 0) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const g = new THREE.BoxGeometry(Math.hypot(dx, dz), h, t)
  g.rotateY(-Math.atan2(dz, dx))
  return at(g, (a[0] + b[0]) / 2, y + h / 2, (a[1] + b[1]) / 2)
}
const lerp2 = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
function merlons(o: G[], a: P, b: P, n: number, y: number, w: number, h: number, t: number) {
  const ang = -Math.atan2(b[1] - a[1], b[0] - a[0])
  for (let i = 0; i < n; i++) { const [x, z] = lerp2(a, b, (i + 0.5) / n); o.push(bx(w, h, t, x, y, z, ang)) }
}

/** Gable roof along x of length l, width d, height h, base at y. */
function roof(l: number, d: number, h: number, x: number, y: number, z: number, ry = 0) {
  const s = new THREE.Shape()
  s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false })
  g.translate(0, 0, -l / 2)
  g.rotateY(PI / 2 + ry)
  return at(g, x, y, z)
}

/** Russian bochka: a keel-shaped barrel roof of width w, height h, length l, running along angle ry. */
function bochka(w: number, h: number, l: number, x: number, y: number, z: number, ry: number) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h * 0.25)
  s.quadraticCurveTo(-w / 2, h * 0.7, 0, h); s.quadraticCurveTo(w / 2, h * 0.7, w / 2, h * 0.25)
  s.lineTo(w / 2, 0); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false, curveSegments: 2 })
  g.translate(0, 0, -l / 2)
  g.rotateY(ry)
  return at(g, x, y, z)
}

/** Lathe warped by a cheap deterministic noise, scaled to an ellipse: rock pillars and crags. */
function rock(pts: number[][], seg: number, rx: number, rz: number, h: number, seed: number) {
  const g = lathe(pts, seg, 1, h), p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i) / h, t = Math.atan2(x, z)
    const f = 1 + 0.1 * Math.sin(3 * t + seed) + 0.07 * Math.sin(5 * t + seed * 2.3 + y * 4) + 0.05 * Math.sin(7 * t - y * 9 + seed)
    p.setX(i, x * rx * f); p.setZ(i, z * rz * f)
  }
  g.computeVertexNormals()
  return g
}

const kremlin = staged([1600, 1685, 1787, 1849], (k, year) => {
  // triangle of brick walls 2.2 km round, 5-19 m high, with 20 towers; Spasskaya 71 m, Troitskaya 80 m.
  // Tented tops were added in the 1680s, Ivan the Great raised to 81 m in 1600
  const u = 1 / 800, V = 2.4, h = (m: number) => m * u * V
  const tents = year >= 1685
  const brick = tint(k, '#a8432e', 0.78), green = tint(k, '#4c7a5a', 0.75, 0.9), white = tint(k, '#f4f0e6', 0.8)
  const gold = tint(k, '#dcb24a', 0.82), yellow = tint(k, '#e8cf92', 0.7)
  const br: G[] = [], gr: G[] = [], wh: G[] = [], go: G[] = [], ye: G[] = [], dk: G[] = []
  const SW: P = [-0.42, 0.22], SE: P = [0.4, 0.26], N: P = [-0.12, -0.42]
  const WH = h(14)
  for (const [a, b] of [[SW, SE], [SE, N], [N, SW]] as [P, P][]) {
    br.push(wall(a, b, WH, 0.012))
    merlons(br, a, b, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 11), WH, 0.009, h(3), 0.014)
  }
  const tower = (p: P, w: number, shaft: number, top: number, round = false) => {
    const [x, z] = p
    br.push(round ? cyl(w * 0.6, w * 0.55, shaft, x, 0, z, 10) : bx(w, shaft, w, x, 0, z))
    if (!tents) { dk.push(cone(w * (round ? 0.62 : 0.78), w * 0.9, x, shaft, z, round ? 10 : 4, round ? 0 : PI / 4)); return }
    let y = shaft
    br.push(bx(w * 0.72, top * 0.22, w * 0.72, x, y, z)); y += top * 0.22
    br.push(cyl(w * 0.34, w * 0.34, top * 0.14, x, y, z, 8, true)); y += top * 0.14
    gr.push(cone(w * 0.38, top * 0.64, x, y, z, 8))
  }
  // corner towers are round
  tower(SW, 0.04, h(30), h(31), true)
  tower(SE, 0.036, h(26), h(20), true)
  tower(N, 0.044, h(32), h(28), true)
  for (const t of [0.18, 0.38, 0.55, 0.68, 0.82]) tower(lerp2(SW, SE, t), 0.024, h(20), h(18))
  for (const t of [0.1, 0.2, 0.55, 0.78]) tower(lerp2(SE, N, t), t === 0.78 ? 0.032 : 0.026, h(22), t === 0.78 ? h(45) : h(20))
  for (const t of [0.25, 0.35, 0.6, 0.78]) tower(lerp2(N, SW, t), t === 0.78 ? 0.032 : 0.024, h(22), t === 0.78 ? h(32) : h(16))
  // Spasskaya gate on Red Square and Troitskaya on the west
  const sp = lerp2(SE, N, 0.32), tr = lerp2(N, SW, 0.47)
  tower(sp, 0.038, h(30), h(41))
  tower(tr, 0.038, h(32), h(48))
  if (tents) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dk.push(bx(dx ? 0.002 : 0.012, 0.012, dx ? 0.012 : 0.002, sp[0] + dx * 0.0138, h(30) + 0.004, sp[1] + dz * 0.0138))
  // Kutafya barbican outside the Troitskaya gate
  wh.push(bx(0.03, h(14), 0.03, tr[0] - 0.07, 0, tr[1] - 0.02), wall(tr, [tr[0] - 0.07, tr[1] - 0.02], h(8), 0.012))

  // Cathedral Square, drawn 1.5x so the domes still read
  const S = 1.5, cs = (m: number) => m * u * S, ch = (m: number) => h(m) * 1.25
  const church = (x: number, z: number, w: number, d: number, hh: number, dome: number, drum: number, five = true) => {
    wh.push(bx(cs(w), ch(hh), cs(d), x, 0, z))
    const spots: [number, number, number][] = [[0, 0, 1]]
    if (five) for (const sx of [-1, 1]) for (const sz of [-1, 1]) spots.push([sx * cs(w) * 0.27, sz * cs(d) * 0.27, 0.75])
    for (const [ox, oz, s] of spots) {
      wh.push(cyl(cs(dome) * 0.7 * s, cs(dome) * 0.7 * s, ch(drum) * s, x + ox, ch(hh), z + oz, 6, true))
      go.push(onion(cs(dome) * s, ch(dome * 1.9) * s, x + ox, ch(hh) + ch(drum) * s, z + oz, s < 1 ? 6 : 8))
    }
  }
  church(-0.04, 0.04, 38, 26, 24, 5, 9)
  church(0.03, 0.15, 30, 22, 22, 4.5, 8)
  church(-0.07, 0.13, 22, 18, 18, 3.5, 6)
  // Ivan the Great: three diminishing octagons, the drum added in 1600, gold dome
  const ivan = year >= 1600
    ? [[10.5, 0], [10.5, 25], [9, 25], [9, 44], [8, 44], [8, 56], [6.5, 58], [6.5, 66], [0, 66]]
    : [[10.5, 0], [10.5, 25], [9, 25], [9, 44], [8, 44], [8, 50], [0, 50]]
  const ix = 0.07, iz = 0.06, top = ivan[ivan.length - 1][1]
  wh.push(at(lathe(ivan, 8, cs(1), ch(1)), ix, 0, iz))
  wh.push(bx(cs(16), ch(32), cs(18), ix + cs(17), 0, iz))
  go.push(onion(cs(7.5), ch(15), ix, ch(top), iz, 10))
  if (year >= 1787) {
    // Senate, a triangle with its green dome; the Arsenal along the north-west wall
    const A: P = [0.1, -0.14], B: P = [-0.1, -0.12], C: P = [0.0, 0.0]
    for (const [a, b] of [[A, B], [B, C], [C, A]] as [P, P][]) ye.push(wall(a, b, h(20), 0.028))
    gr.push(cyl(0.022, 0.022, h(6), 0.0, h(20), -0.085, 12), at(new THREE.SphereGeometry(0.023, 12, 5, 0, PI * 2, 0, PI / 2), 0.0, h(26), -0.085))
    const a1 = lerp2(N, SW, 0.1), a2 = lerp2(N, SW, 0.42)
    ye.push(wall([a1[0] + 0.035, a1[1]], [a2[0] + 0.035, a2[1]], h(16), 0.03))
  }
  if (year >= 1849) {
    // Grand Kremlin Palace above the river
    wh.push(bx(0.2, h(28), 0.06, -0.22, 0, 0.15))
    gr.push(roof(0.2, 0.06, h(6), -0.22, h(28), 0.15), bx(0.03, h(10), 0.03, -0.22, h(28), 0.15))
  }
  put(k, br, brick); put(k, gr, green); put(k, wh, white); put(k, go, gold); put(k, ye, yellow); put(k, dk, k.dark)
})

const kizhi = staged([1764], (k, year) => {
  // Church of the Transfiguration (1714): 37 m of logs, three stacked octagons on a cross of four arms,
  // 22 aspen-shingled domes; Church of the Intercession (1764) with 9 domes; bell tower; log fence round the pogost
  const u = 1 / 80, V = 1.25, s = (m: number) => m * u, h = (m: number) => m * u * V
  const wood = tint(k, '#6b4a33', 0.92), aspen = tint(k, '#c9c7c0', 0.92), plank = tint(k, '#857360', 0.9)
  const wd: G[] = [], as: G[] = [], pl: G[] = [], dk: G[] = []
  const dome = (x: number, z: number, y: number, r: number, seg = 6) => as.push(onion(s(r), h(r * 2.8), x, y, z, seg))
  const oct = (r: number, y0: number, y1: number, x: number, z: number) => wd.push(at(new THREE.CylinderGeometry(s(r), s(r), h(y1 - y0), 8).rotateY(PI / 8), x, h(y0) + h(y1 - y0) / 2, z))
  {
    const cx = -0.22, cz = -0.04
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2, dx = Math.cos(a), dz = Math.sin(a), ry = PI / 2 - a
      wd.push(bx(i % 2 ? s(7) : s(10.5), h(10), i % 2 ? s(10.5) : s(7), cx + (dx * s(10.5)) / 2, 0, cz + (dz * s(10.5)) / 2))
      pl.push(bochka(s(7), h(4), s(4), cx + dx * s(8.6), h(10), cz + dz * s(8.6), ry))
      pl.push(bochka(s(6), h(4), s(3.5), cx + dx * s(6.2), h(12.5), cz + dz * s(6.2), ry))
      dome(cx + dx * s(8.6), cz + dz * s(8.6), h(13.6), 1.3)
      dome(cx + dx * s(6.2), cz + dz * s(6.2), h(16.1), 1.3)
    }
    oct(5, 0, 17, cx, cz)
    for (let i = 0; i < 8; i++) {
      const a = (i * PI) / 4 + PI / 8, dx = Math.cos(a), dz = Math.sin(a)
      pl.push(bochka(s(3.2), h(2.8), s(2.6), cx + dx * s(4.6), h(17), cz + dz * s(4.6), PI / 2 - a))
      dome(cx + dx * s(4.6), cz + dz * s(4.6), h(19.6), 1.15)
    }
    oct(3.8, 17, 23, cx, cz)
    for (let i = 0; i < 4; i++) {
      const a = (i * PI) / 2 + PI / 4, dx = Math.cos(a), dz = Math.sin(a)
      pl.push(bochka(s(2.6), h(2.4), s(2), cx + dx * s(3.4), h(23), cz + dz * s(3.4), PI / 2 - a))
      dome(cx + dx * s(3.4), cz + dz * s(3.4), h(25.2), 1.05)
    }
    oct(2.6, 23, 28, cx, cz)
    wd.push(cyl(s(1.3), s(1.3), h(2.5), cx, h(28), cz, 8))
    dome(cx, cz, h(30.3), 2.1, 8)
    dk.push(bx(s(0.25), h(2.2), s(0.25), cx, h(35.9), cz), bx(s(1.4), h(0.25), s(0.25), cx, h(37.2), cz))
    // apse on the east arm
    wd.push(cyl(s(2.8), s(2.8), h(7), cx + s(12), 0, cz, 6))
    pl.push(cone(s(3), h(2), cx + s(12), h(7), cz, 6))
    dome(cx + s(12), cz, h(8.6), 1.1)
  }
  if (year >= 1764) {
    // Intercession: square base, octagon, crown of eight domes round a taller central one; refectory to the west
    const cx = 0.24, cz = -0.04
    wd.push(bx(s(10), h(8), s(10), cx, 0, cz))
    oct(4.6, 8, 17, cx, cz)
    pl.push(cyl(s(4.9), s(4.2), h(1.2), cx, h(17), cz, 8))
    for (let i = 0; i < 8; i++) {
      const a = (i * PI) / 4, dx = Math.cos(a), dz = Math.sin(a)
      dome(cx + dx * s(3.6), cz + dz * s(3.6), h(19.8), 1.1)
    }
    wd.push(cyl(s(1.6), s(1.6), h(4), cx, h(18), cz, 8))
    dome(cx, cz, h(22), 1.8, 8)
    wd.push(bx(s(14), h(6), s(9), cx - s(12), 0, cz))
    pl.push(roof(s(14), s(9.6), h(3.5), cx - s(12), h(6), cz))
    wd.push(cyl(s(3), s(3), h(6), cx + s(6.5), 0, cz, 6))
    pl.push(cone(s(3.2), h(2), cx + s(6.5), h(6), cz, 6))
  }
  {
    // bell tower: square base, open octagonal belfry, shingled tent
    const cx = 0.0, cz = 0.2
    wd.push(bx(s(6), h(9), s(6), cx, 0, cz))
    for (let i = 0; i < 8; i++) {
      const a = (i * PI) / 4 + PI / 8
      wd.push(bx(s(0.6), h(5), s(0.6), cx + Math.cos(a) * s(2.6), h(9), cz + Math.sin(a) * s(2.6)))
    }
    dk.push(cyl(s(1.8), s(1.8), h(5), cx, h(9), cz, 8))
    as.push(cone(s(3.4), h(9), cx, h(14), cz, 8, PI / 8))
    dome(cx, cz, h(22.6), 1, 8)
  }
  // log fence with a small plank roof
  const F: P[] = [[-0.48, -0.3], [0.46, -0.3], [0.46, 0.34], [-0.48, 0.34]]
  for (let i = 0; i < 4; i++) {
    const a = F[i], b = F[(i + 1) % 4]
    wd.push(wall(a, b, h(2.4), s(0.8)))
    pl.push(wall(a, b, h(0.4), s(1.6), h(2.4)))
  }
  put(k, wd, wood); put(k, as, aspen); put(k, pl, plank); put(k, dk, k.dark)
})

function meteora(k: Kit) {
  // sandstone pillars up to 400 m above the Thessalian plain, monasteries on their flat tops:
  // Great Meteoron on the broadest, Varlaam next to it, Roussanou filling a narrow spire, Holy Trinity to the south
  const stone = tint(k, '#a39581', 0.9, 0.85), wallM = tint(k, '#ece4d4', 0.85), tile = tint(k, '#b8603c', 0.82)
  const rk: G[] = [], wl: G[] = [], tl: G[] = []
  const prof = [[1.15, 0], [1.02, 0.12], [1.06, 0.32], [0.95, 0.52], [0.98, 0.74], [0.9, 0.9], [0.74, 0.975], [0.4, 1], [0, 1]]
  const pillars: [number, number, number, number, number][] = [
    [-0.18, -0.06, 0.2, 0.15, 0.55], [0.17, -0.2, 0.12, 0.1, 0.5], [0.24, 0.2, 0.065, 0.055, 0.4], [-0.27, 0.3, 0.09, 0.08, 0.44],
    [0.02, 0.08, 0.1, 0.09, 0.42], [0.42, -0.03, 0.08, 0.07, 0.3], [-0.44, 0.06, 0.08, 0.09, 0.34], [0.0, -0.4, 0.08, 0.07, 0.32],
  ]
  pillars.forEach(([x, z, rx, rz, H], i) => rk.push(at(rock(prof, 10, rx, rz, H, i * 1.7 + 0.4), x, 0, z)))
  rk.push(rock([[1, 0], [0.85, 0.4], [0.5, 0.85], [0, 1]], 12, 0.5, 0.45, 0.08, 9))
  const block = (x: number, z: number, y: number, w: number, d: number, hh: number, ry = 0) => {
    wl.push(bx(w, hh, d, x, y - 0.01, z, ry))
    tl.push(roof(w, d * 1.05, d * 0.45, x, y - 0.01 + hh, z, ry))
  }
  const katholikon = (x: number, z: number, y: number, w: number) => {
    block(x, z, y, w, w * 0.6, w * 0.45)
    wl.push(cyl(w * 0.16, w * 0.16, w * 0.3, x + w * 0.1, y + w * 0.4, z, 8))
    tl.push(at(new THREE.SphereGeometry(w * 0.17, 8, 4, 0, PI * 2, 0, PI / 2), x + w * 0.1, y + w * 0.7, z))
  }
  {
    const [x, z, , , H] = pillars[0]
    katholikon(x, z, H, 0.12)
    block(x - 0.05, z + 0.1, H - 0.006, 0.16, 0.05, 0.035, 0.2)
    block(x + 0.08, z - 0.08, H - 0.008, 0.05, 0.1, 0.04)
    block(x - 0.12, z - 0.05, H - 0.01, 0.05, 0.08, 0.03)
  }
  {
    const [x, z, , , H] = pillars[1]
    katholikon(x, z, H, 0.09)
    block(x + 0.02, z + 0.07, H - 0.006, 0.12, 0.04, 0.035)
  }
  {
    // Roussanou covers its whole summit, three storeys
    const [x, z, , , H] = pillars[2]
    block(x, z, H, 0.1, 0.075, 0.06)
    wl.push(cyl(0.012, 0.012, 0.02, x + 0.02, H + 0.05, z, 8))
  }
  {
    const [x, z, , , H] = pillars[3]
    katholikon(x, z, H, 0.07)
    block(x - 0.03, z + 0.05, H - 0.006, 0.07, 0.035, 0.025)
  }
  put(k, rk, stone); put(k, wl, wallM); put(k, tl, tile)
}

const florence = staged([1461], (k, year) => {
  // Santa Maria del Fiore, 153 m long; Brunelleschi's octagonal dome 45 m across, 114 m to the lantern ball,
  // lantern finished 1461; Giotto's campanile 84 m; the octagonal baptistery 50 m in front of the facade
  const u = 1 / 260, V = 1.4, s = (m: number) => m * u, h = (m: number) => m * u * V
  const marble = tint(k, '#f3efe4', 0.82), green = tint(k, '#5c7d68', 0.7, 0.9), tile = tint(k, '#c0613b', 0.78)
  const mb: G[] = [], gr: G[] = [], tl: G[] = [], dk: G[] = []
  const ox = 0.03, fx = ox - 0.22 // facade
  // nave and aisles, facade
  mb.push(bx(s(92), h(26), s(43), fx + s(46), 0, 0))
  mb.push(bx(s(92), h(40), s(20), fx + s(46), 0, 0))
  tl.push(roof(s(92), s(21), h(7), fx + s(46), h(40), 0))
  tl.push(roof(s(92), s(44), h(4), fx + s(46), h(26) - 0.002, 0))
  mb.push(bx(s(3), h(50), s(43), fx + s(1.5), 0, 0))
  for (let i = 0; i < 5; i++) gr.push(bx(s(3.4), h(0.8), s(43.4), fx + s(1.5), h(8 + i * 8), 0))
  for (const z of [-1, 1]) for (let i = 0; i < 6; i++) gr.push(bx(s(3), h(26), s(0.8), fx + s(10 + i * 15), 0, z * s(21.8)))
  // crossing: octagon walls, drum with oculi
  const cx = fx + s(92) + s(27), R = s(27)
  const oct = (r: number, y0: number, hh: number, m: G[]) => m.push(at(new THREE.CylinderGeometry(r, r, hh, 8).rotateY(PI / 8), cx, y0 + hh / 2, 0))
  oct(R, 0, h(42), mb)
  oct(R * 0.97, h(42), h(13), mb)
  for (let i = 0; i < 8; i++) {
    const a = (i * PI) / 4, r = R * 0.97 * Math.cos(PI / 8) + 0.001
    dk.push(at(new THREE.CylinderGeometry(s(2.6), s(2.6), 0.003, 8).rotateX(PI / 2).rotateY(PI / 2 - a), cx + Math.cos(a) * r, h(48.5), Math.sin(a) * r))
  }
  // tribunes on the north, south and east faces with their half-domes
  for (const [dx, dz] of [[1, 0], [0, 1], [0, -1]]) {
    const tx = cx + dx * (R + s(8)), tz = dz * (R + s(8)), ry = Math.atan2(dx, dz) - PI / 2
    mb.push(at(new THREE.CylinderGeometry(s(16), s(16), h(30), 5, 1, false, ry, PI), tx, h(15), tz))
    tl.push(at(new THREE.SphereGeometry(s(13), 6, 3, Math.atan2(dz, -dx) - PI / 2, PI, 0, PI / 2), tx, h(30), tz))
  }
  // the dome: pointed-fifth profile on eight sides, white marble ribs at the corners
  const yd = h(55)
  const prof = [[27, 0], [26.6, 7], [25, 14], [22.4, 21], [18.6, 27], [13.6, 32], [7.5, 35.5], [5.5, 36]]
  tl.push(at(lathe(prof, 8, s(1), h(1)).rotateY(PI / 8), cx, yd, 0))
  for (let i = 0; i < 8; i++) {
    const a = (i * PI) / 4 + PI / 8
    for (let j = 0; j < prof.length - 2; j++) {
      const p0 = prof[j], p1 = prof[j + 1]
      const A = new THREE.Vector3(Math.sin(a) * s(p0[0]), yd + h(p0[1]), Math.cos(a) * s(p0[0]))
      const B = new THREE.Vector3(Math.sin(a) * s(p1[0]), yd + h(p1[1]), Math.cos(a) * s(p1[0]))
      const d = B.clone().sub(A), g = new THREE.BoxGeometry(s(2.2), d.length(), s(2.2))
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
      const m = A.add(B).multiplyScalar(0.5)
      mb.push(at(g, cx + m.x, m.y, m.z))
    }
  }
  if (year >= 1461) {
    mb.push(at(new THREE.CylinderGeometry(s(4.5), s(5), h(10), 8).rotateY(PI / 8), cx, yd + h(36) + h(5), 0))
    mb.push(cone(s(3.6), h(9), cx, yd + h(46), 0, 8, PI / 8))
    dk.push(at(new THREE.SphereGeometry(s(1.5), 8, 6), cx, yd + h(56.5), 0))
  } else mb.push(cyl(s(6), s(6), h(1.5), cx, yd + h(35.5), 0, 8))
  // campanile by the south-west corner of the facade
  const bxp = fx + s(8), bz = s(21.5) + s(12)
  mb.push(bx(s(14.5), h(82), s(14.5), bxp, 0, bz))
  mb.push(bx(s(16.5), h(2), s(16.5), bxp, h(82), bz))
  for (let i = 0; i < 6; i++) gr.push(bx(s(15), h(0.8), s(15), bxp, h(10 + i * 12), bz))
  for (const [y, hh] of [[46, 9], [60, 9], [70, 10]]) {
    dk.push(bx(s(5), h(hh), s(14.8), bxp, h(y), bz), bx(s(14.8), h(hh), s(5), bxp, h(y), bz))
  }
  // baptistery: octagon, attic and low white pyramid with its lantern
  const px = fx - s(48)
  mb.push(at(new THREE.CylinderGeometry(s(13.5), s(13.5), h(27), 8).rotateY(PI / 8), px, h(13.5), 0))
  for (const y of [9, 18, 26]) gr.push(at(new THREE.CylinderGeometry(s(13.8), s(13.8), h(0.8), 8).rotateY(PI / 8), px, h(y), 0))
  mb.push(cone(s(14), h(6), px, h(27), 0, 8, PI / 8))
  mb.push(cyl(s(2), s(2), h(4), px, h(33), 0, 8), cone(s(2.4), h(3), px, h(37), 0, 8))
  put(k, mb, marble); put(k, gr, green); put(k, tl, tile); put(k, dk, k.dark)
})

function neuschwanstein(k: Kit) {
  // white limestone palace on a crag above the Pöllat gorge, about 150 m from the gatehouse to the west end;
  // slate roofs, slender stair tower 65 m, square tower and the red gatehouse on the east
  const u = 1 / 150, V = 1.5, s = (m: number) => m * u, h = (m: number) => m * u * V
  const white = tint(k, '#f1eee6', 0.82), slate = tint(k, '#56606f', 0.75), gate = tint(k, '#c4866a', 0.65), crag = tint(k, '#6a6e58', 0.9, 0.8)
  const wh: G[] = [], sl: G[] = [], gt: G[] = [], cr: G[] = [], dk: G[] = []
  const y0 = 0.2
  cr.push(at(rock([[1.15, 0], [1.05, 0.3], [0.9, 0.7], [0.82, 1], [0, 1]], 12, 0.47, 0.19, y0, 2), 0, 0, 0))
  const turret = (x: number, z: number, y: number, r: number, hh: number, ch: number, m = wh) => {
    m.push(cyl(r, r, hh, x, y, z, 10))
    sl.push(cone(r * 1.15, ch, x, y + hh, z, 10))
  }
  // palas, five storeys, windows in bands
  const px = -0.27
  wh.push(bx(s(48), h(30), s(17), px, y0, 0))
  sl.push(roof(s(48), s(18), h(13), px, y0 + h(30), 0))
  for (let i = 0; i < 4; i++) dk.push(bx(s(48.4), h(1.6), s(17.4), px, y0 + h(5 + i * 6.2), 0))
  for (const z of [-1, 1]) turret(px - s(24), z * s(8.5), y0, s(3.2), h(33), h(10))
  for (const z of [-1, 1]) turret(px + s(24), z * s(8.5), y0 + h(16), s(2.4), h(19), h(8))
  // west gable turret and the throne-hall balcony
  wh.push(bx(s(4), h(5), s(6), px, y0 + h(37), 0))
  turret(-0.07, -0.07, y0, s(4.6), h(50), h(17))
  turret(-0.07, -0.07 + s(4.4), y0 + h(36), s(1.8), h(16), h(6))
  turret(-0.07, 0.065, y0, s(3.6), h(36), h(11))
  // Bower on the south and Knights' House on the north of the upper court
  wh.push(bx(s(34), h(20), s(9), 0.06, y0, 0.07))
  sl.push(roof(s(34), s(9.6), h(7), 0.06, y0 + h(20), 0.07))
  wh.push(bx(s(28), h(19), s(9), 0.08, y0, -0.075))
  sl.push(roof(s(28), s(9.6), h(7), 0.08, y0 + h(19), -0.075))
  // square tower
  wh.push(bx(s(9), h(36), s(9), 0.19, y0, -0.07))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) turret(0.19 + sx * s(4.5), -0.07 + sz * s(4.5), y0 + h(30), s(1.4), h(8), h(4))
  sl.push(cone(s(4), h(9), 0.19, y0 + h(36), -0.07, 4, PI / 4))
  // walls of the lower court and the gatehouse
  for (const z of [-1, 1]) wh.push(bx(s(18), h(10), s(2), 0.27, y0, z * 0.1))
  gt.push(bx(s(13), h(20), s(27), 0.37, y0, 0))
  sl.push(roof(s(27), s(13.6), h(7), 0.37, y0 + h(20), 0, PI / 2))
  for (const z of [-1, 1]) turret(0.4, z * s(13.5), y0, s(3.6), h(25), h(8), gt)
  dk.push(bx(s(0.6), h(9), s(5), 0.37 + s(6.6), y0, 0))
  put(k, wh, white); put(k, sl, slate); put(k, gt, gate); put(k, cr, crag); put(k, dk, k.dark)
}

function malbork(k: Kit) {
  // Teutonic Order's seat, the largest brick castle: High Castle (61 x 52 m round a court) with its tower and the
  // Gdanisko latrine tower on a bridge, Middle Castle with the Grand Master's Palace by the Nogat, the outer bailey south
  const u = 1 / 400, V = 1.8, s = (m: number) => m * u, h = (m: number) => m * u * V
  const brick = tint(k, '#a24a32', 0.78), tile = tint(k, '#7e3524', 0.75, 0.85), light = tint(k, '#d9c3a0', 0.6)
  const br: G[] = [], tl: G[] = [], lt: G[] = [], dk: G[] = []
  const zs = -0.04
  // four wings round a court; roofs only on the given sides
  const court = (x: number, z: number, w: number, d: number, t: number, hh: number, rh: number, sides = [1, 1, 1, 1]) => {
    const wings: [number, number, number, number, boolean][] = [
      [x, z - d / 2 + t / 2, w, t, false], [x + w / 2 - t / 2, z, t, d, true], [x, z + d / 2 - t / 2, w, t, false], [x - w / 2 + t / 2, z, t, d, true],
    ]
    wings.forEach(([wx, wz, ww, wd, alongZ], i) => {
      if (!sides[i]) return
      br.push(bx(ww, hh, wd, wx, 0, wz))
      tl.push(roof(alongZ ? wd : ww, (alongZ ? ww : wd) * 1.04, rh, wx, hh, wz, alongZ ? PI / 2 : 0))
    })
  }
  // High Castle
  const hx = 0.05, hz = zs - 0.3
  court(hx, hz, s(61), s(52), s(14), h(24), h(14))
  br.push(bx(s(14), h(52), s(14), hx - s(24), 0, hz + s(19)))
  tl.push(cone(s(9), h(10), hx - s(24), h(52), hz + s(19), 4, PI / 4))
  br.push(cyl(s(8), s(8), h(22), hx + s(34), 0, hz, 5))
  tl.push(cone(s(8.5), h(8), hx + s(34), h(22), hz, 5))
  // Gdanisko on its arcaded bridge to the west
  const gx = hx - s(30) - s(55)
  br.push(bx(s(55), h(7), s(7), hx - s(30) - s(27.5), h(14), hz))
  for (let i = 0; i < 4; i++) br.push(bx(s(5), h(14), s(7), hx - s(38) - i * s(13), 0, hz))
  br.push(bx(s(14), h(34), s(14), gx, 0, hz))
  tl.push(cone(s(10.5), h(10), gx, h(34), hz, 4, PI / 4))
  // Middle Castle, open to the south
  const mx = 0.02, mz = zs - 0.02
  court(mx, mz, s(120), s(110), s(15), h(18), h(12), [1, 1, 0, 1])
  br.push(wall([mx - s(60), mz + s(55)], [mx + s(60), mz + s(55)], h(10), s(3)))
  // Grand Master's Palace and the Great Refectory on the river side
  const gpx = mx - s(60) - s(8), gpz = mz + s(36)
  br.push(bx(s(28), h(34), s(30), gpx, 0, gpz))
  merlons(br, [gpx - s(14), gpz - s(15)], [gpx - s(14), gpz + s(15)], 7, h(34), s(2.2), h(3), s(2.4))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    br.push(cyl(s(2.6), s(2.6), h(39), gpx + sx * s(14), 0, gpz + sz * s(15), 8))
    tl.push(cone(s(3), h(6), gpx + sx * s(14), h(39), gpz + sz * s(15), 8))
  }
  tl.push(cone(s(14), h(5), gpx + s(2), h(34), gpz, 4, PI / 4))
  br.push(bx(s(16), h(24), s(40), mx - s(60) - s(4), 0, mz - s(8)))
  tl.push(roof(s(40), s(16.8), h(12), mx - s(60) - s(4), h(24), mz - s(8), PI / 2))
  // outer bailey: low walls with towers, a few barns and St Lawrence's church
  const O: P[] = [[-0.17, zs + 0.15], [0.26, zs + 0.15], [0.3, zs + 0.3], [0.18, zs + 0.47], [-0.12, zs + 0.47], [-0.2, zs + 0.3]]
  for (let i = 0; i < O.length; i++) {
    const a = O[i], b = O[(i + 1) % O.length]
    br.push(wall(a, b, h(11), s(3)))
    br.push(cyl(s(5), s(5), h(17), a[0], 0, a[1], 8))
    tl.push(cone(s(5.6), h(6), a[0], h(17), a[1], 8))
  }
  for (const [x, z, l, d, ry] of [[0.05, zs + 0.22, 0.18, 0.04, 0], [-0.08, zs + 0.37, 0.12, 0.035, 0.3], [0.17, zs + 0.33, 0.1, 0.035, -1.2]]) {
    lt.push(bx(l, h(9), d, x, 0, z, ry))
    tl.push(roof(l, d * 1.05, h(8), x, h(9), z, ry))
  }
  br.push(bx(s(30), h(16), s(14), 0.1, 0, zs + 0.4), bx(s(8), h(30), s(8), 0.1 - s(15), 0, zs + 0.4))
  tl.push(roof(s(30), s(14.6), h(9), 0.1, h(16), zs + 0.4), cone(s(6), h(8), 0.1 - s(15), h(30), zs + 0.4, 4, PI / 4))
  // gate passages
  dk.push(bx(s(8), h(10), s(3.4), mx, 0, mz + s(55)))
  put(k, br, brick); put(k, tl, tile); put(k, lt, light); put(k, dk, k.dark)
}

function dubrovnik(k: Kit) {
  // 1,940 m of walls up to 25 m high round a city on a slope down to the sea; round Minčeta tower (1464) at the
  // high north-west corner, Bokar and Pile gate to the west, St John's fortress over the old harbour, Revelin outside the east gate
  const u = 1 / 520, V = 2, h = (m: number) => m * u * V
  const stone = tint(k, '#dacba9', 0.72), house = tint(k, '#ece2cc', 0.72), tile = tint(k, '#c2653d', 0.75)
  const st: G[] = [], hs: G[] = [], tl: G[] = [], dk: G[] = []
  const W: P[] = [[-0.2, -0.3], [0.05, -0.27], [0.28, -0.2], [0.34, -0.04], [0.33, 0.2], [0.15, 0.27], [-0.08, 0.29], [-0.36, 0.1], [-0.37, -0.08]]
  const slope = (z: number) => (z < 0 ? -z * 0.22 : z * 0.06)
  for (let i = 0; i < W.length; i++) {
    const a = W[i], b = W[(i + 1) % W.length]
    for (let j = 0; j < 3; j++) {
      const p = lerp2(a, b, j / 3), q = lerp2(a, b, (j + 1) / 3), mz = (p[1] + q[1]) / 2
      st.push(wall(p, q, h(mz < 0 ? 22 : 16) + slope(mz), 0.016))
    }
    st.push(bx(0.028, h(a[1] < 0 ? 26 : 19) + slope(a[1]), 0.028, a[0], 0, a[1]))
  }
  const inside = (x: number, z: number) => {
    let c = false
    for (let i = 0, j = W.length - 1; i < W.length; j = i++) {
      const [xi, zi] = W[i], [xj, zj] = W[j]
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c
    }
    return c
  }
  // houses packed in blocks either side of the Stradun, stepping up the hill
  let n = 0
  for (let x = -0.32; x <= 0.3; x += 0.047) for (let z = -0.25; z <= 0.26; z += 0.052) {
    n++
    if (Math.abs(z + 0.005) < 0.02) continue
    if (!inside(x * 1.12, z * 1.14) || !inside(x, z)) continue
    const hx = x + (((n * 13) % 5) - 2) * 0.003, hz = z + (((n * 7) % 3) - 1) * 0.004
    const hh = 0.032 + ((n * 37) % 7) * 0.004, y = slope(z) + hh
    hs.push(bx(0.038, y, 0.042, hx, 0, hz))
    tl.push(roof(0.04, 0.044, 0.016, hx, y, hz, n % 3 ? 0 : PI / 2))
  }
  // Minčeta: polygonal bastion, round tower, crown of merlons
  const [mx, mz] = W[0]
  st.push(cyl(0.072, 0.062, h(30), mx, 0, mz, 10))
  st.push(cyl(0.046, 0.046, h(26), mx, h(30), mz, 14))
  st.push(cyl(0.05, 0.05, h(4), mx, h(56), mz, 14))
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2
    st.push(bx(0.012, h(4), 0.01, mx + Math.cos(a) * 0.045, h(60), mz + Math.sin(a) * 0.045, -a + PI / 2))
  }
  st.push(cyl(0.02, 0.02, h(8), mx, h(60), mz, 8))
  // Bokar, Pile gate, St John, Revelin
  st.push(cyl(0.038, 0.034, h(26), W[7][0], 0, W[7][1], 10))
  st.push(bx(0.05, h(26), 0.05, W[8][0] - 0.01, 0, W[8][1]))
  st.push(bx(0.09, h(24), 0.06, W[4][0] - 0.01, 0, W[4][1] - 0.02), cyl(0.038, 0.038, h(28), W[4][0] + 0.02, 0, W[4][1] + 0.02, 10))
  st.push(bx(0.09, h(22), 0.08, 0.45, 0, -0.08, 0.3))
  // clock tower at the end of the Stradun, cathedral dome, Franciscan belfry by the Pile gate
  hs.push(bx(0.02, h(36), 0.02, 0.27, 0, -0.005))
  dk.push(cone(0.016, h(6), 0.27, h(36), -0.005, 4, PI / 4))
  hs.push(bx(0.06, h(22), 0.04, 0.2, 0, 0.15), cyl(0.014, 0.014, h(6), 0.2, h(22), 0.15, 10))
  dk.push(at(new THREE.SphereGeometry(0.015, 10, 4, 0, PI * 2, 0, PI / 2), 0.2, h(28), 0.15))
  hs.push(bx(0.018, h(34), 0.018, -0.29, 0, -0.04))
  dk.push(cone(0.012, h(6), -0.29, h(34), -0.04, 8))
  put(k, st, stone); put(k, hs, house); put(k, tl, tile); put(k, dk, k.dark)
}

function segovia(k: Kit) {
  // 818 m of dry granite arches, two tiers where it crosses the Azoguejo square at 28.5 m, a single tier
  // dwindling into the rising ground at both ends; heights stretched more than usual so the line reads
  const u = 1 / 900, V = 3.6, h = (m: number) => m * u * V
  const granite = tint(k, '#aaa192', 0.72)
  const o: G[] = []
  const L: P[] = [[-0.52, -0.12], [-0.2, 0.0], [0.24, 0.1], [0.52, 0.03]]
  const seg = L.slice(1).map((b, i) => Math.hypot(b[0] - L[i][0], b[1] - L[i][1]))
  const total = seg.reduce((a, b) => a + b, 0), sA = seg[0]
  const Hmax = h(28.5)
  const height = (d: number) => d < sA ? Hmax * (0.3 + 0.7 * Math.pow(d / sA, 0.8)) : Hmax * (1 - 0.86 * Math.pow((d - sA) / (total - sA), 0.75))
  const pointAt = (d: number): [number, number, number] => {
    let i = 0
    while (i < seg.length - 1 && d > seg[i]) d -= seg[i++]
    const a = L[i], b = L[i + 1], t = d / seg[i]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -Math.atan2(b[1] - a[1], b[0] - a[0])]
  }
  // one bay: half a pier each side and the arch between, as a single extruded outline
  const bay = (b: number, ht: number, t: number) => {
    const r = b * 0.31, spring = ht - r - Math.min(ht * 0.12, 0.012), sh = new THREE.Shape()
    sh.moveTo(-b / 2, 0); sh.lineTo(-r, 0); sh.lineTo(-r, spring)
    sh.absarc(0, spring, r, PI, 0, true)
    sh.lineTo(r, 0); sh.lineTo(b / 2, 0); sh.lineTo(b / 2, ht); sh.lineTo(-b / 2, ht); sh.closePath()
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 3 })
    g.translate(0, 0, -t / 2)
    return g
  }
  const N = 42, b = total / N, upper = h(9)
  for (let i = 0; i < N; i++) {
    const d = (i + 0.5) * b, H = height(d), [x, z, ry] = pointAt(d)
    const parts: G[] = []
    if (H > upper * 2.1) {
      parts.push(bay(b, H - upper - h(1.2), 0.014))
      parts.push(at(new THREE.BoxGeometry(b, h(1.2), 0.017), 0, H - upper - h(0.6), 0))
      parts.push(at(bay(b, upper, 0.012), 0, H - upper, 0))
    } else parts.push(bay(b, H, 0.012))
    for (const p of parts) { p.rotateY(ry); o.push(at(p, x, 0, z)) }
  }
  put(k, o, granite)
}

export const batch_g: Record<string, Builder> = {
  'moscow-kremlin': kremlin,
  'kizhi-pogost': kizhi,
  meteora,
  'florence-historic-centre': florence,
  neuschwanstein,
  'malbork-castle': malbork,
  'old-city-dubrovnik': dubrovnik,
  'aqueduct-of-segovia': segovia,
}
