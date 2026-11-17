import * as THREE from 'three'
import { band, merge, staged, type Kit } from './kit'

type G = THREE.BufferGeometry
const lambert = (color: string, emissive = '#000000') => new THREE.MeshLambertMaterial({ color, emissive })

// Mount Fuji from the north-east: the snow-capped cone and Lake Kawaguchi at its foot, with the Sengen
// shrine torii from 806 and the Chureito pagoda (1963) on the hill opposite.
const fuji = staged([806, 1963], (k, year) => {
  const h = 0.62, pts: THREE.Vector2[] = []
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.5 - 0.43 * Math.pow(t, 0.55), h * t)) }
  pts.push(new THREE.Vector2(0.045, h * 0.96))
  const cone = new THREE.LatheGeometry(pts, 40).toNonIndexed()
  // snow line dips down the gullies, so it is ragged rather than a clean ring
  const p = cone.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color()
  const snow = new THREE.Color('#f1f3f5'), rock = new THREE.Color('#5c5a63'), forest = new THREE.Color('#47603a')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x)
    const line = 0.66 - 0.12 * Math.max(0, Math.sin(a * 9)) ** 3
    const t = y / h
    if (t > line) c.copy(snow)
    else if (t < 0.22) c.copy(forest)
    else c.copy(forest).lerp(rock, Math.min(1, (t - 0.22) / 0.12))
    col.set([c.r, c.g, c.b], i * 3)
  }
  cone.setAttribute('color', new THREE.BufferAttribute(col, 3))
  cone.computeVertexNormals()
  k.add(cone, 0, 0, -0.08, new THREE.MeshLambertMaterial({ vertexColors: true }))
  k.add(new THREE.CircleGeometry(0.05, 20).rotateX(-Math.PI / 2), h * 0.96 + 0.002, 0, -0.08, lambert('#3b3536'))

  // Lake Kawaguchi along the northern foot
  const lake = new THREE.CircleGeometry(0.2, 24).rotateX(-Math.PI / 2).scale(1.5, 1, 0.45)
  k.add(lake, 0.012, 0.12, 0.4, lambert('#4f7891', '#0d1b26'))

  k.add(new THREE.SphereGeometry(0.14, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 0.8), 0, -0.36, 0.38, lambert('#5e7a44', '#141c0c'))
  const red = lambert('#b8402e', '#2a0c08'), roofs = lambert('#2f2a2a')
  if (year >= 806) {
    // a torii of the Sengen shrine at the foot of the climbing route
    const t: G[] = []
    for (const dx of [-0.025, 0.025]) t.push(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6).translate(0.36 + dx, 0.035, 0.14))
    t.push(new THREE.BoxGeometry(0.075, 0.008, 0.01).translate(0.36, 0.072, 0.14), new THREE.BoxGeometry(0.06, 0.005, 0.008).translate(0.36, 0.058, 0.14))
    merge(k, t, red)
  }
  if (year < 1963) return
  // the red five-storey Chureito pagoda on the hill opposite
  const body: G[] = [], tops: G[] = []
  for (let i = 0; i < 5; i++) {
    const w = 0.05 - i * 0.006, y = 0.08 + i * 0.03
    body.push(new THREE.BoxGeometry(w * 0.7, 0.024, w * 0.7).translate(-0.36, y + 0.012, 0.38))
    tops.push(new THREE.ConeGeometry(w * 0.8, 0.012, 4).rotateY(Math.PI / 4).translate(-0.36, y + 0.028, 0.38))
  }
  tops.push(new THREE.CylinderGeometry(0.002, 0.002, 0.05, 4).translate(-0.36, 0.25, 0.38))
  merge(k, body, red); merge(k, tops, roofs)
})

// Uluru: one rounded, flat-topped block of red arkose with fluted sides, on the desert plain
function uluru(k: Kit) {
  const rock = new THREE.SphereGeometry(0.4, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()
  const p = rock.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x)
    // steep sides, a broad rounded top, vertical gullies
    const f = 1 + 0.04 * Math.sin(a * 14)
    p.setXYZ(i, x * 1.3 * f, Math.min(y, 0.26) * 1.3 + Math.max(0, y - 0.26) * 0.5, z * 0.6 * f)
  }
  rock.computeVertexNormals()
  k.add(rock, 0, 0, 0, lambert('#b5532f', '#2c0f06'))
  for (let i = 0; i < 9; i++) k.add(new THREE.SphereGeometry(0.025, 6, 4), 0.02, -0.5 + i * 0.12, 0.38 + (i % 3) * 0.03, lambert('#6c7a3e'))
}

// Ngorongoro: the collapsed caldera, a green rim around a grassy floor with Lake Magadi
function ngorongoro(k: Kit) {
  const rim = lambert('#4e6d3a', '#121c0c'), floor = lambert('#8a9a55', '#1a2010')
  k.add(band([0.5, 0.42, 0], [0.4, 0.33, 0.26], 48), 0, 0, 0, rim)
  k.add(band([0.4, 0.33, 0.26], [0.33, 0.27, 0.06], 48), 0, 0, 0, rim)
  k.add(new THREE.CircleGeometry(0.33, 40).rotateX(-Math.PI / 2).scale(1, 1, 0.82), 0.06, 0, 0, floor)
  k.add(new THREE.CircleGeometry(0.1, 20).rotateX(-Math.PI / 2).scale(1.4, 1, 0.7), 0.062, 0.06, 0.05, lambert('#9ab6c4', '#18242a'))
}

// Nazca: figures scratched into the desert, here the hummingbird and long straight lines
function nazca(k: Kit) {
  k.add(new THREE.CylinderGeometry(0.56, 0.56, 0.015, 32).scale(1, 1, 0.8), 0.0075, 0, 0, lambert('#a5784f', '#20120a'))
  const lines: G[] = [], seg = (x0: number, z0: number, x1: number, z1: number, w = 0.012) => {
    const l = Math.hypot(x1 - x0, z1 - z0)
    lines.push(new THREE.BoxGeometry(l, 0.004, w).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, 0.017, (z0 + z1) / 2))
  }
  seg(-0.5, -0.3, 0.45, 0.1, 0.02); seg(-0.4, 0.35, 0.5, -0.25, 0.02); seg(-0.2, -0.42, 0.2, 0.42, 0.016)
  // hummingbird: body, wings, long beak and fanned tail
  const bird: [number, number][] = [[0, -0.2], [0, 0.12], [-0.03, 0.05], [-0.2, -0.05], [-0.04, 0], [0.04, 0], [0.2, -0.05], [0.03, 0.05], [0, 0.12], [-0.05, 0.22], [0, 0.18], [0.05, 0.22], [0, 0.12]]
  for (let i = 1; i < bird.length; i++) seg(bird[i - 1][0] + 0.15, bird[i - 1][1], bird[i][0] + 0.15, bird[i][1], 0.01)
  seg(0.15, -0.2, 0.15, -0.36, 0.006)
  merge(k, lines, lambert('#e3cfa8', '#2a2418'))
}

export const sites = {
  'mount-fuji': fuji,
  uluru,
  ngorongoro,
  'nazca-lines': nazca,
}
