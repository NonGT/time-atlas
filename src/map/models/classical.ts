import * as THREE from 'three'
import { band, doubleSided, gable, merge, type Builder, type Kit } from './kit'

function parthenon(k: Kit) {
  // 69.5 x 30.9 m stylobate, peristyle of 8 x 17 Doric columns, low pediments at both ends
  const V = 2, W = 1, D = 0.445
  ;[0, 1, 2].forEach(i => k.box(W + 0.04 - i * 0.02, 0.016, D + 0.04 - i * 0.02, i * 0.016))
  const y0 = 0.048, colH = 0.15 * V, r = 0.0137
  const cols: THREE.BufferGeometry[] = []
  const col = (x: number, z: number) => {
    const c = new THREE.CylinderGeometry(r * 0.8, r, colH, 8)
    c.translate(x, y0 + colH / 2, z)
    cols.push(c)
  }
  const cx = W / 2 - 0.025, cz = D / 2 - 0.025
  for (let i = 0; i < 17; i++) for (const z of [-cz, cz]) col(-cx + (i * 2 * cx) / 16, z)
  for (let i = 1; i < 7; i++) for (const x of [-cx, cx]) col(x, -cz + (i * 2 * cz) / 7)
  merge(k, cols)
  k.box(0.8, colH, 0.27, y0, 0, 0, k.dark)
  k.box(W - 0.01, 0.06, D - 0.01, y0 + colH)
  k.add(gable(W - 0.01, D - 0.01, 0.075), y0 + colH + 0.06)
}

function colosseum(k: Kit) {
  // 189 x 156 m ellipse, three arcaded storeys of 80 arches and a solid attic, about 48 m high
  const V = 1.6, rx = 0.5, rz = 0.413, t = 0.03, n = 40
  const tiers = [10.5, 11.8, 11.6].map(h => (h / 189) * V), attic = (14 / 189) * V
  const wall = doubleSided(k.mat)
  const pt = (i: number) => [rx * Math.cos((i / n) * Math.PI * 2), rz * Math.sin((i / n) * Math.PI * 2)]
  // one flat panel per chord of the ellipse, with an arch cut through it (or solid for the attic)
  const panel = (i: number, y: number, h: number, arch: boolean) => {
    const [x0, z0] = pt(i), [x1, z1] = pt(i + 1), w = Math.hypot(x1 - x0, z1 - z0) + 0.002
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath()
    if (arch) {
      const r = w * 0.3, foot = y ? h * 0.14 : 0, spring = h * 0.86 - r
      const hole = new THREE.Path()
      hole.moveTo(-r, foot); hole.lineTo(r, foot); hole.lineTo(r, spring)
      hole.absarc(0, spring, r, 0, Math.PI, false); hole.lineTo(-r, foot)
      s.holes.push(hole)
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 6 })
    geo.translate(0, 0, -t / 2)
    geo.rotateY(Math.atan2(-(z1 - z0), x1 - x0))
    geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2)
    return geo
  }
  const panels: THREE.BufferGeometry[] = []
  let y = 0
  for (const h of tiers) {
    for (let i = 0; i < n; i++) panels.push(panel(i, y, h, true))
    y += h
  }
  for (let i = 0; i < n; i++) panels.push(panel(i, y, attic, false))
  merge(k, panels)
  // the dark inner ring shows through the arches
  k.add(band([rx - t * 2, rz - t * 2, 0], [rx - t * 2, rz - t * 2, y]), 0, 0, 0, doubleSided(k.dark))
  y += attic
  k.add(band([rx, rz, y], [rx - t * 2, rz - t * 2, y]), 0, 0, 0, wall)
  // seating slopes down to an 83 x 48 m arena
  const ax = 0.22, az = 0.127, podium = 0.05
  k.add(band([rx - t * 2, rz - t * 2, y - 0.03], [ax + 0.02, az + 0.02, podium]), 0, 0, 0, doubleSided(k.dark))
  k.add(band([ax, az, 0], [ax, az, podium]), 0, 0, 0, wall)
  const floor = new THREE.CircleGeometry(1, 32)
  floor.rotateX(-Math.PI / 2); floor.scale(ax, 1, az)
  k.add(floor, 0.004)
}

function angkorWat(k: Kit) {
  // three concentric galleries rising to five lotus-bud towers in a quincunx; entered from the west
  const V = 1.6
  const gallery = (w: number, d: number, y: number, h = 0.035, t = 0.03) => {
    for (const z of [-1, 1]) k.box(w, h, t, y, 0, (z * (d - t)) / 2)
    for (const x of [-1, 1]) k.box(t, h, d - 2 * t, y, (x * (w - t)) / 2, 0)
    for (const z of [-1, 1]) k.box(w + 0.008, 0.012, t + 0.008, y + h, 0, (z * (d - t)) / 2, k.dark)
    for (const x of [-1, 1]) k.box(t + 0.008, 0.012, d - 2 * t, y + h, (x * (w - t)) / 2, 0, k.dark)
  }
  const tower = (x: number, z: number, y: number, s: number) => {
    // a tall base then tiers that step in, each with a small lip, closing to a bud
    const pts: number[][] = [[1, 0], [1, 0.3]]
    for (let i = 0; i < 5; i++) {
      const r = 1.02 - i * 0.17, h = 0.3 + i * 0.13
      pts.push([r + 0.06, h], [r + 0.06, h + 0.03], [r - 0.04, h + 0.04], [r - 0.08, h + 0.13])
    }
    pts.push([0.1, 0.98], [0, 1.08])
    const lathe = pts.map(([r, h]) => new THREE.Vector2(r * 0.055 * s, h * 0.2 * s * V))
    k.box(0.12 * s, 0.03, 0.12 * s, y, x, z)
    k.add(new THREE.LatheGeometry(lathe, 8), y + 0.03, x, z)
  }
  // outer (third) gallery 187 x 215 m on a low terrace
  k.box(0.92, 0.015, 1.04, 0)
  gallery(0.87, 1, 0.015)
  k.box(0.07, 0.07, 0.18, 0.015, -0.435, 0)
  k.box(0.34, 0.012, 0.05, 0, -0.6, 0)
  // second level 100 x 115 m
  k.box(0.465, 0.065, 0.535, 0.015)
  gallery(0.465, 0.535, 0.08)
  // top level 60 x 60 m, central tower 65 m above the ground
  k.box(0.28, 0.1, 0.28, 0.08)
  gallery(0.28, 0.28, 0.18, 0.03, 0.025)
  for (const x of [-1, 1]) for (const z of [-1, 1]) tower(x * 0.115, z * 0.115, 0.18, 0.75)
  k.box(0.1, 0.04, 0.1, 0.18)
  tower(0, 0, 0.22, 1.05)
}

export const classical: Record<string, Builder> = {
  parthenon,
  colosseum,
  'angkor-wat': angkorWat,
}
