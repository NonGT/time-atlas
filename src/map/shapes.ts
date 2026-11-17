import * as THREE from 'three'
import type { Shape } from '../data/schema'
import { MODELS } from './models'

/** Years at which a landmark's model changes, after it is built. */
export const phasesOf = (id: string, built: number) => [built, ...(MODELS[id]?.phases ?? []).filter(y => y > built)]

/**
 * Low-poly landmark models. Each is built Y-up at unit footprint (about 1 x 1) with its base at y=0,
 * then wrapped so that Y becomes Z (the map's up axis).
 * To add a shape: add a case here and its name to SHAPES in data/schema.ts.
 * A landmark with a model registered under its id in models/ uses that instead of its generic shape.
 */
export function buildShape(shape: Shape, color: string, id?: string, year = 0): THREE.Object3D {
  const g = new THREE.Group()
  const base = new THREE.Color(color)
  const mat = new THREE.MeshLambertMaterial({
    color: base.clone().lerp(new THREE.Color('#fff4dc'), 0.55),
    emissive: base.clone().multiplyScalar(0.3),
  })
  const dark = new THREE.MeshLambertMaterial({
    color: base.clone().lerp(new THREE.Color('#fff4dc'), 0.2).multiplyScalar(0.6),
    emissive: base.clone().multiplyScalar(0.18),
  })
  const add = (geo: THREE.BufferGeometry, y: number, x = 0, z = 0, material: THREE.Material = mat) => {
    const m = new THREE.Mesh(geo, material)
    m.position.set(x, y, z)
    g.add(m)
    return m
  }
  const box = (w: number, h: number, d: number, y: number, x = 0, z = 0, material: THREE.Material = mat) =>
    add(new THREE.BoxGeometry(w, h, d), y + h / 2, x, z, material)
  const cone4 = (r: number, h: number) => { const c = new THREE.ConeGeometry(r, h, 4); c.rotateY(Math.PI / 4); return c }

  const model = id ? MODELS[id] : undefined
  if (model) model({ g, mat, dark, add, box }, year)
  else switch (shape) {
    case 'pyramid':
      add(cone4(0.72, 0.9), 0.45)
      add(cone4(0.32, 0.4), 0.2, 0.75, 0.5)
      add(cone4(0.22, 0.28), 0.14, 1.05, 0.85)
      break
    case 'ziggurat':
      box(1, 0.22, 1, 0); box(0.72, 0.22, 0.72, 0.22); box(0.46, 0.22, 0.46, 0.44); box(0.22, 0.18, 0.22, 0.66)
      box(0.12, 0.62, 0.5, 0, 0, 0.62).rotation.x = -0.6
      break
    case 'step':
      ;[1, 0.8, 0.62, 0.46].forEach((w, i) => box(w, 0.18, w, i * 0.18))
      box(0.24, 0.2, 0.24, 0.72)
      box(0.14, 0.1, 0.5, 0, 0, 0.6)
      break
    case 'temple': {
      box(1, 0.08, 0.62, 0)
      for (let i = 0; i < 8; i++) for (const z of [0.25, -0.25]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 6), 0.26, -0.42 + i * 0.12, z)
      box(0.98, 0.06, 0.6, 0.44)
      const roof = new THREE.CylinderGeometry(0.32, 0.32, 0.98, 3)
      roof.rotateZ(Math.PI / 2); roof.rotateX(Math.PI / 6); roof.scale(1, 0.45, 0.95)
      add(roof, 0.6)
      break
    }
    case 'arena': {
      const wall = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 32, 1, true)
      wall.scale(1, 1, 0.82)
      const m = add(wall, 0.16)
      m.material = mat.clone()
      ;(m.material as THREE.Material).side = THREE.DoubleSide
      const floor = new THREE.CylinderGeometry(0.36, 0.36, 0.05, 24)
      floor.scale(1, 1, 0.78)
      add(floor, 0.025)
      break
    }
    case 'dome':
      add(new THREE.CylinderGeometry(0.48, 0.52, 0.3, 20), 0.15)
      add(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0.3)
      for (const [x, z] of [[0.62, 0.62], [-0.62, 0.62], [0.62, -0.62], [-0.62, -0.62]]) {
        add(new THREE.CylinderGeometry(0.035, 0.05, 0.95, 8), 0.475, x, z)
        add(new THREE.ConeGeometry(0.05, 0.14, 8), 1.0, x, z)
      }
      break
    case 'pagoda':
      for (let i = 0; i < 6; i++) {
        const w = 0.66 - i * 0.08
        box(w * 0.7, 0.14, w * 0.7, i * 0.19)
        box(w + 0.12, 0.05, w + 0.12, i * 0.19 + 0.14)
      }
      add(new THREE.CylinderGeometry(0.015, 0.03, 0.25, 6), 1.26)
      break
    case 'hall': {
      box(1, 0.12, 0.62, 0); box(0.82, 0.26, 0.46, 0.12)
      const r = cone4(0.66, 0.26); r.scale(1, 1, 0.64)
      add(r, 0.51)
      break
    }
    case 'prang': {
      const tower = (h: number, x: number, z: number, s: number) => {
        add(new THREE.CylinderGeometry(0.05 * s, 0.2 * s, h, 8), h / 2 + 0.12, x, z)
        add(new THREE.SphereGeometry(0.08 * s, 8, 6), h + 0.12, x, z)
      }
      box(1, 0.12, 1, 0)
      tower(1.05, 0, 0, 1.15)
      for (const [x, z] of [[0.34, 0.34], [-0.34, 0.34], [0.34, -0.34], [-0.34, -0.34]]) tower(0.6, x, z, 0.8)
      break
    }
    case 'stupa':
      add(new THREE.CylinderGeometry(0.52, 0.56, 0.14, 20), 0.07)
      add(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0.14)
      box(0.14, 0.1, 0.14, 0.54)
      add(new THREE.ConeGeometry(0.07, 0.42, 10), 0.85)
      break
    case 'citadel':
      box(1, 0.22, 0.72, 0); box(0.5, 0.1, 0.36, 0.22)
      add(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.32, 0.2)
      break
    case 'mound': {
      const m = new THREE.CylinderGeometry(0.34, 0.66, 0.4, 4); m.rotateY(Math.PI / 4)
      add(m, 0.2); box(0.26, 0.16, 0.26, 0.4)
      break
    }
    case 'ring': {
      const t = new THREE.TorusGeometry(0.48, 0.05, 6, 40); t.rotateX(Math.PI / 2); t.scale(1, 3.2, 0.82)
      add(t, 0.08)
      add(new THREE.CylinderGeometry(0.05, 0.11, 0.5, 10), 0.25, 0.2, 0.05)
      break
    }
    case 'tower':
      box(0.5, 0.3, 0.5, 0)
      add(new THREE.CylinderGeometry(0.17, 0.22, 0.7, 8), 0.65)
      add(new THREE.CylinderGeometry(0.11, 0.15, 0.45, 12), 1.22)
      add(new THREE.ConeGeometry(0.12, 0.2, 12), 1.54)
      break
    case 'cathedral': {
      box(0.95, 0.38, 0.4, 0, 0.05)
      const roof = new THREE.CylinderGeometry(0.2, 0.2, 0.95, 3)
      roof.rotateZ(Math.PI / 2); roof.rotateX(Math.PI / 6); roof.scale(1, 0.6, 1)
      add(roof, 0.48, 0.05)
      box(0.28, 0.32, 0.7, 0, 0.12)
      for (const z of [0.13, -0.13]) box(0.16, 0.72, 0.16, 0, -0.5, z)
      add(new THREE.ConeGeometry(0.035, 0.3, 6), 0.6, 0.2)
      break
    }
    case 'town': {
      // houses around a square with a church or temple tower; deterministic jitter so every town differs a little
      let seed = 0
      for (const ch of id ?? color) seed = (seed * 31 + ch.charCodeAt(0)) | 0
      const rnd = () => { seed = (seed * 1103515245 + 12345) | 0; return ((seed >>> 8) & 0xffff) / 0x10000 }
      for (let i = 0; i < 22; i++) {
        const a = i * 2.4 + rnd() * 0.6, r = 0.2 + 0.28 * Math.sqrt(i / 22) + rnd() * 0.04
        const w = 0.09 + rnd() * 0.06, h = 0.07 + rnd() * 0.08, x = Math.cos(a) * r, z = Math.sin(a) * r
        const b = box(w, h, w * 0.7, 0, x, z, i % 3 ? mat : dark)
        b.rotation.y = a
        const roof = new THREE.CylinderGeometry(w * 0.4, w * 0.4, w * 0.7 + 0.01, 3)
        roof.rotateX(Math.PI / 2); roof.rotateY(a + Math.PI / 2); roof.scale(1, 0.6, 1)
        add(roof, h + w * 0.1, x, z)
      }
      box(0.1, 0.42, 0.1, 0, 0.04, -0.03)
      add(new THREE.ConeGeometry(0.075, 0.2, 4).rotateY(Math.PI / 4), 0.52, 0.04, -0.03)
      break
    }
    case 'cave': {
      const rock = new THREE.DodecahedronGeometry(0.5, 1)
      rock.scale(1, 0.55, 0.8)
      const p = rock.attributes.position
      for (let i = 0; i < p.count; i++) p.setY(i, Math.max(0, p.getY(i)))
      rock.computeVertexNormals()
      add(rock, 0, 0, 0, dark)
      const mouth = new THREE.CircleGeometry(0.13, 12, 0, Math.PI)
      mouth.scale(1.3, 1.2, 1)
      add(mouth, 0.01, 0, 0.405, new THREE.MeshBasicMaterial({ color: '#141210' }))
      box(0.5, 0.012, 0.25, 0, 0, 0.5)
      break
    }
    case 'terrace':
      for (let i = 0; i < 6; i++) {
        const t = new THREE.CylinderGeometry(0.5 - i * 0.075, 0.52 - i * 0.075, 0.06, 28)
        t.scale(1, 1, 0.75)
        add(t, 0.03 + i * 0.06, i * 0.02, 0, i % 2 ? dark : mat)
      }
      break
    case 'bridge': {
      box(1.04, 0.035, 0.14, 0.2)
      for (const x of [-0.5, -0.17, 0.17, 0.5]) box(0.07, 0.2, 0.16, 0, x, 0)
      for (const x of [-0.335, 0, 0.335]) {
        const arch = new THREE.TorusGeometry(0.135, 0.03, 6, 16, Math.PI)
        arch.scale(1, 1, 2.6)
        add(arch, 0.07, x)
      }
      break
    }
    case 'castle': {
      const t = 0.06
      for (const z of [-0.4, 0.4]) box(0.8, 0.22, t, 0, 0, z)
      for (const x of [-0.4, 0.4]) box(t, 0.22, 0.8, 0, x, 0)
      for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) {
        add(new THREE.CylinderGeometry(0.08, 0.09, 0.32, 12), 0.16, x, z)
        add(new THREE.ConeGeometry(0.1, 0.16, 12), 0.4, x, z, dark)
      }
      box(0.3, 0.46, 0.3, 0, -0.05, -0.05)
      add(new THREE.ConeGeometry(0.22, 0.18, 4).rotateY(Math.PI / 4), 0.55, -0.05, -0.05, dark)
      break
    }
    case 'wall':
      // a stretch zigzagging along a ridge, with watchtowers at the turns
      for (let i = 0; i < 4; i++) {
        const z0 = i % 2 ? 0.08 : -0.08, z1 = -z0
        const seg = box(Math.hypot(0.25, z1 - z0), 0.12, 0.05, 0, -0.375 + i * 0.25, 0)
        seg.rotation.y = -Math.atan2(z1 - z0, 0.25)
      }
      for (let i = 0; i <= 4; i++) box(0.09, 0.2, 0.09, 0, -0.5 + i * 0.25, i % 2 ? 0.08 : -0.08, dark)
      break
    case 'factory':
      box(0.8, 0.16, 0.5, 0)
      for (let i = 0; i < 5; i++) {
        const tooth = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 3)
        tooth.rotateX(Math.PI / 2); tooth.rotateZ(Math.PI / 6)
        add(tooth, 0.19, -0.32 + i * 0.16, 0, dark)
      }
      for (const [x, h] of [[0.44, 0.75], [0.5, 0.55]]) add(new THREE.CylinderGeometry(0.03, 0.045, h, 10), h / 2, x, -0.18)
      box(0.3, 0.3, 0.2, 0, -0.25, 0.32)
      break
    case 'monolith':
      box(0.95, 0.05, 0.3, 0)
      for (let i = 0; i < 5; i++) {
        const st = box(0.11, 0.48 + (i % 2) * 0.08, 0.08, 0.05, -0.38 + i * 0.19, 0, i % 2 ? dark : mat)
        st.rotation.z = (i - 2) * 0.03
        box(0.13, 0.08, 0.1, 0.53 + (i % 2) * 0.08, -0.38 + i * 0.19, 0)
      }
      break
    case 'mosque':
      box(0.72, 0.24, 0.72, 0)
      add(new THREE.SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.24)
      for (const [x, z] of [[0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]])
        add(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.24, x, z)
      box(0.4, 0.04, 0.26, 0, 0, 0.5)
      for (const x of [-0.46, 0.46]) {
        add(new THREE.CylinderGeometry(0.03, 0.04, 0.85, 8), 0.425, x, 0.46)
        add(new THREE.ConeGeometry(0.045, 0.14, 8), 0.92, x, 0.46)
      }
      break
    case 'church': {
      box(0.75, 0.24, 0.3, 0, 0.08)
      const roof = new THREE.CylinderGeometry(0.17, 0.17, 0.75, 3)
      roof.rotateZ(Math.PI / 2); roof.rotateX(Math.PI / 6); roof.scale(1, 0.6, 1)
      add(roof, 0.29, 0.08)
      add(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 12, 1, false, 0, Math.PI), 0.12, 0.45, 0)
      box(0.18, 0.5, 0.18, 0, -0.38)
      add(new THREE.ConeGeometry(0.12, 0.32, 4).rotateY(Math.PI / 4), 0.66, -0.38, 0, dark)
      break
    }
    case 'garden': {
      const green = new THREE.MeshLambertMaterial({ color: '#6f8f4a', emissive: '#1a2410' })
      box(1, 0.03, 0.8, 0, 0, 0, green)
      const water = new THREE.MeshLambertMaterial({ color: '#5d7f94' })
      box(0.9, 0.035, 0.06, 0, 0, 0, water); box(0.06, 0.035, 0.7, 0, 0, 0, water)
      box(0.2, 0.12, 0.16, 0.03, 0, 0)
      add(new THREE.ConeGeometry(0.16, 0.1, 4).rotateY(Math.PI / 4), 0.2, 0, 0)
      for (const [x, z] of [[0.3, 0.22], [-0.3, 0.22], [0.3, -0.22], [-0.3, -0.22], [0.42, 0], [-0.42, 0]])
        add(new THREE.SphereGeometry(0.07, 8, 6), 0.11, x, z, green)
      break
    }
  }
  const zUp = new THREE.Group()
  g.rotation.x = Math.PI / 2
  zUp.add(g)
  return zUp
}
