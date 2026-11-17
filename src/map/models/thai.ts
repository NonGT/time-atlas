import * as THREE from 'three'
import { merge, staged, type Kit } from './kit'

type G = THREE.BufferGeometry
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)

const laterite = (k: Kit, f = 1) => {
  const m = (k.mat as THREE.MeshLambertMaterial).clone()
  m.color.lerp(new THREE.Color('#9a4a2e'), 0.75).multiplyScalar(f)
  m.emissive.lerp(new THREE.Color('#2a0e06'), 0.7)
  return m
}
const grass = () => new THREE.MeshLambertMaterial({ color: '#5f7d3f', emissive: '#1a2410' })

/** Redented square tier: a cross of two boxes plus corner blocks, so each corner steps in twice. */
function tier(o: G[], w: number, h: number, y: number) {
  o.push(bx(w, h, w * 0.72, 0, y, 0), bx(w * 0.72, h, w, 0, y, 0), bx(w * 0.86, h, w * 0.86, 0, y, 0))
}

/** Stair on each side, wider at the main (east) entrance. */
function stairs(o: G[], r: number, top: number, n: number) {
  for (const [dx, dz, w] of [[1, 0, 0.16], [-1, 0, 0.1], [0, 1, 0.1], [0, -1, 0.1]] as const)
    for (let i = 0; i < n; i++) {
      const y = (top * i) / n, run = (r * 0.28 * (n - i)) / n
      o.push(bx(dx ? run : w, top / n, dz ? run : w, dx * (r + run / 2 - 0.02), y, dz * (r + run / 2 - 0.02)))
    }
}

// Khao Klang Nok: a 64 m laterite stupa base about 20 m high outside Si Thep, 8th century
const khaoKlangNok = staged([1300, 2009], (k, year) => {
  const V = 1.6, lat = laterite(k), o: G[] = []
  if (year >= 1300 && year < 2009) {
    // abandoned: a tree-covered hill with only the lowest steps showing
    const hill = new THREE.SphereGeometry(0.46, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    hill.scale(1, 0.7, 1)
    k.add(hill, 0, 0, 0, grass())
    tier(o, 0.98, 0.04, 0)
    merge(k, o, lat)
    return
  }
  const hs = [0.08, 0.07, 0.06].map(h => h * V), ws = [1, 0.8, 0.6]
  let y = 0
  ws.forEach((w, i) => { tier(o, w, hs[i], y); y += hs[i] })
  stairs(o, 0.5, hs[0] + hs[1], 7)
  // small cells (niches) along the lowest tier, darker hollows
  const dark: G[] = []
  for (const s of [-1, 1]) for (const t of [-0.3, -0.15, 0.15, 0.3]) {
    dark.push(bx(0.06, hs[0] * 0.6, 0.012, t, 0, s * 0.506), bx(0.012, hs[0] * 0.6, 0.06, s * 0.506, 0, t))
  }
  if (year < 1300) {
    // the lost superstructure is not known; a brick stupa on a redented drum is the likeliest form
    const pts = [[0.2, 0], [0.2, 0.05], [0.18, 0.06], [0.2, 0.2], [0.14, 0.3], [0.05, 0.34], [0.03, 0.42], [0.008, 0.56]]
    const top = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h * V)), 16).translate(0, y, 0)
    merge(k, [...o, top], lat)
  } else {
    // excavated and consolidated: the tiers stand, the top is a broken platform
    o.push(bx(0.34, 0.03, 0.34, 0, y, 0), bx(0.12, 0.04, 0.1, 0.05, y + 0.03, -0.04))
    merge(k, o, lat)
  }
  merge(k, dark, k.dark)
})

// Khao Klang Nai: a Dvaravati shrine base ringed with stucco dwarfs, in the inner city
const khaoKlangNai = staged([1300, 1990], (k, year) => {
  const V = 1.6, lat = laterite(k), o: G[] = []
  if (year >= 1300 && year < 1990) {
    const hill = new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    hill.scale(1.2, 0.55, 0.9)
    k.add(hill, 0, 0, 0, grass())
    return
  }
  // rectangular base on a platform, the stair to the east
  o.push(bx(1, 0.05, 0.72, 0, 0, 0), bx(0.82, 0.08 * V, 0.56, 0, 0.05, 0), bx(0.66, 0.05 * V, 0.44, 0, 0.05 + 0.08 * V, 0))
  for (let i = 0; i < 5; i++) o.push(bx(0.04, ((i + 1) * 0.13 * V) / 5, 0.16, 0.43 + (4 - i) * 0.03, 0, 0))
  const yTop = 0.05 + 0.13 * V
  // a band of dark niches where the dwarf figures stand
  const dark: G[] = []
  for (let i = -3; i <= 3; i++) dark.push(bx(0.06, 0.03, 0.01, i * 0.11, 0.08, 0.283), bx(0.06, 0.03, 0.01, i * 0.11, 0.08, -0.283))
  if (year < 1300) {
    const pts = [[0.2, 0], [0.2, 0.05], [0.17, 0.18], [0.1, 0.28], [0.03, 0.32], [0.008, 0.46]]
    o.push(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h * V)), 14).translate(0, yTop, 0))
    merge(k, o, lat)
  } else {
    merge(k, o, lat)
    // modern shelter roof over the excavated base
    const roof = new THREE.MeshLambertMaterial({ color: '#8a8f94', emissive: '#202428', transparent: true, opacity: 0.35, depthWrite: false })
    k.add(new THREE.BoxGeometry(1.06, 0.015, 0.8), yTop + 0.16, 0, 0, roof)
    const posts: G[] = []
    for (const x of [-0.5, 0, 0.5]) for (const z of [-0.37, 0.37]) posts.push(bx(0.015, yTop + 0.16, 0.015, x, 0, z))
    merge(k, posts, roof)
  }
  merge(k, dark, k.dark)
})

export const thai = {
  'khao-klang-nok': khaoKlangNok,
  'khao-klang-nai': khaoKlangNai,
}
