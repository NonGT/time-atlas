import * as THREE from 'three'
import type { Shape } from '../data/schema'
import { MODELS } from './models'

/**
 * Low-poly landmark models. Each is built Y-up at unit footprint (about 1 x 1) with its base at y=0,
 * then wrapped so that Y becomes Z (the map's up axis).
 * To add a shape: add a case here and its name to SHAPES in data/schema.ts.
 * A landmark with a model registered under its id in models/ uses that instead of its generic shape.
 */
export function buildShape(shape: Shape, color: string, id?: string): THREE.Object3D {
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
  if (model) model({ g, mat, dark, add, box })
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
  }
  const zUp = new THREE.Group()
  g.rotation.x = Math.PI / 2
  zUp.add(g)
  return zUp
}
