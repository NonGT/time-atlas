import * as THREE from 'three'

// Places that are not buildings keep natural colours; only the small shrine or house on them takes the civ tint.
const C = {
  grass: new THREE.Color('#6d8a4a'),
  forest: new THREE.Color('#3f5f34'),
  rock: new THREE.Color('#8a8072'),
  darkRock: new THREE.Color('#5f5850'),
  snow: new THREE.Color('#eef0f2'),
  ash: new THREE.Color('#6a5f58'),
  sand: new THREE.Color('#b9a57e'),
  ochre: new THREE.Color('#b0472c'),
}
const water = () => new THREE.MeshLambertMaterial({ color: '#4f7891', emissive: '#0d1b26' })
const flat = (c: THREE.Color) => new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.18) })
const painted = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })

export type Add = (geo: THREE.BufferGeometry, y: number, x?: number, z?: number, material?: THREE.Material) => THREE.Mesh

function rng(id: string) {
  let seed = 7
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) | 0
  return () => { seed = (seed * 1103515245 + 12345) | 0; return ((seed >>> 8) & 0xffff) / 0x10000 }
}

/** Colour each vertex by its height share: below `green` grass, then rock, snow above `snow`. */
function paintByHeight(geo: THREE.BufferGeometry, h: number, green: number, snow = 2, low = C.grass, mid = C.rock) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h
    if (t > snow) c.copy(C.snow)
    else if (t < green) c.copy(low)
    else c.copy(low).lerp(mid, Math.min(1, (t - green) / 0.15))
    col.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

/** A cone with its sides pushed in and out, so it reads as a rocky peak and not a party hat. */
function peak(r: number, h: number, rnd: () => number, segs = 9) {
  const g = new THREE.ConeGeometry(r, h, segs, 4).toNonIndexed().translate(0, h / 2, 0)
  const p = g.attributes.position, key = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
  const moved = new Map<string, [number, number, number]>()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = key(x, y, z)
    let m = moved.get(k)
    if (!m) {
      const top = y > h * 0.99, f = top ? 1 : 0.75 + rnd() * 0.5
      m = [x * f + (top ? (rnd() - 0.5) * r * 0.3 : 0), y > 0.001 && !top ? y * (0.9 + rnd() * 0.2) : y, z * f]
      moved.set(k, m)
    }
    p.setXYZ(i, ...m)
  }
  g.computeVertexNormals()
  return g
}

function shrine(add: Add, mat: THREE.Material, dark: THREE.Material, x: number, z: number, s = 1) {
  add(new THREE.BoxGeometry(0.1 * s, 0.06 * s, 0.08 * s), 0.03 * s, x, z, mat)
  add(new THREE.ConeGeometry(0.085 * s, 0.05 * s, 4).rotateY(Math.PI / 4), 0.085 * s, x, z, dark)
}

function tree(add: Add, m: THREE.Material, x: number, z: number, h: number, y = 0) {
  add(new THREE.ConeGeometry(h * 0.32, h, 6), y + h * 0.6, x, z, m)
}

function ground(add: Add, c: THREE.Color, r = 0.55, sx = 1, sz = 0.85) {
  add(new THREE.CylinderGeometry(r, r, 0.02, 32).scale(sx, 1, sz), 0.01, 0, 0, flat(c))
}

/** Rolling hills: squashed half-spheres. */
function hill(add: Add, m: THREE.Material, x: number, z: number, r: number, h: number, sz = 0.8) {
  add(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, h / r, sz), 0, x, z, m)
}

export function buildNature(shape: string, id: string, add: Add, mat: THREE.Material, dark: THREE.Material) {
  const rnd = rng(id)
  switch (shape) {
    case 'mountain': {
      const m = painted()
      add(paintByHeight(peak(0.42, 0.75, rnd), 0.75, 0.3, 0.86), 0, 0.02, -0.05, m)
      add(paintByHeight(peak(0.28, 0.48, rnd), 0.48, 0.4), 0, -0.3, 0.05, m)
      add(paintByHeight(peak(0.24, 0.38, rnd), 0.38, 0.45), 0, 0.32, 0.12, m)
      // the shrine or temple that makes it a cultural site, with a path of steps up the front
      shrine(add, mat, dark, 0.05, 0.42)
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.03, 0.012, 0.03), 0.06 + i * 0.07, 0.04 - i * 0.012, 0.33 - i * 0.07, mat)
      return true
    }
    case 'volcano': {
      const h = 0.62, pts: THREE.Vector2[] = []
      // concave flanks rising to a flat-topped crater rim
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.5 - 0.42 * Math.pow(t, 0.62), h * t)) }
      pts.push(new THREE.Vector2(0.05, h * 0.94))
      const cone = new THREE.LatheGeometry(pts, 28)
      add(paintByHeight(cone, h, 0.2, 0.68, C.grass, C.ash), 0, 0, 0, painted())
      add(new THREE.CircleGeometry(0.075, 20).rotateX(-Math.PI / 2), h * 0.94 + 0.002, 0, 0, flat(C.darkRock))
      shrine(add, mat, dark, 0.28, 0.4)
      return true
    }
    case 'hills': {
      const g = flat(C.grass), rows = flat(C.forest)
      ground(add, C.grass.clone().multiplyScalar(0.9))
      for (const [x, z, r, h] of [[-0.3, -0.2, 0.32, 0.18], [0.25, -0.25, 0.28, 0.14], [0.05, 0.18, 0.3, 0.12]] as const) hill(add, g, x, z, r, h)
      // vine or tea rows on a lower terrace in front
      for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.5, 0.025, 0.018), 0.025, 0.05, 0.3 + (i - 3) * 0.035, rows)
      add(new THREE.BoxGeometry(0.1, 0.06, 0.07), 0.13, 0.05, 0.18, mat)
      add(new THREE.ConeGeometry(0.075, 0.05, 4).rotateY(Math.PI / 4), 0.185, 0.05, 0.18, dark)
      for (let i = 0; i < 5; i++) tree(add, rows, -0.45 + rnd() * 0.25, 0.15 + rnd() * 0.25, 0.08 + rnd() * 0.05)
      return true
    }
    case 'valley': {
      const g = flat(C.grass), f = flat(C.forest)
      ground(add, C.grass.clone().multiplyScalar(0.9))
      for (const s of [-1, 1]) {
        hill(add, f, s * 0.4, -0.18, 0.22, 0.3, 1.2)
        hill(add, g, s * 0.4, 0.22, 0.2, 0.2, 1.1)
      }
      // the river winds down the middle
      const w = water()
      let x = 0
      for (let i = 0; i < 8; i++) {
        const z0 = -0.45 + i * 0.12, nx = Math.sin(i * 0.9) * 0.06
        const seg = add(new THREE.BoxGeometry(0.09, 0.02, Math.hypot(0.12, nx - x) + 0.02), 0.02, (x + nx) / 2, z0 + 0.06, w)
        seg.rotation.y = Math.atan2(nx - x, 0.12)
        x = nx
      }
      for (let i = 0; i < 6; i++) {
        const bx = 0.1 + rnd() * 0.06, bz = -0.1 + i * 0.07
        add(new THREE.BoxGeometry(0.04, 0.04, 0.035), 0.02, bx, bz, i % 2 ? mat : dark)
      }
      shrine(add, mat, dark, -0.12, 0.05, 0.8)
      return true
    }
    case 'lake': {
      ground(add, C.grass)
      const lake = new THREE.CircleGeometry(0.34, 24).rotateX(-Math.PI / 2)
      const p = lake.attributes.position
      for (let i = 1; i < p.count; i++) { const f = 0.8 + rnd() * 0.35; p.setX(i, p.getX(i) * f * 1.15); p.setZ(i, p.getZ(i) * f * 0.85) }
      add(lake, 0.025, -0.02, -0.02, water())
      const f = flat(C.forest)
      for (let i = 0; i < 16; i++) {
        const a = rnd() * Math.PI * 2, r = 0.42 + rnd() * 0.1
        tree(add, f, Math.cos(a) * r, Math.sin(a) * r * 0.82, 0.07 + rnd() * 0.06)
      }
      hill(add, flat(C.grass), -0.3, -0.38, 0.22, 0.16)
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.045, 0.04, 0.035), 0.02, 0.28 + i * 0.05, 0.3 - i * 0.02, i % 2 ? mat : dark)
      return true
    }
    case 'forest': {
      ground(add, C.forest.clone().multiplyScalar(0.8))
      const f = flat(C.forest), f2 = flat(C.forest.clone().lerp(C.grass, 0.4))
      for (let i = 0; i < 40; i++) {
        const a = rnd() * Math.PI * 2, r = 0.14 + Math.sqrt(rnd()) * 0.4
        tree(add, i % 3 ? f : f2, Math.cos(a) * r, Math.sin(a) * r * 0.85, 0.12 + rnd() * 0.12)
      }
      // a clearing in the middle where the shrine or settlement stands
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.022, 16), 0.012, 0, 0, flat(C.grass))
      shrine(add, mat, dark, 0, 0, 0.9)
      return true
    }
    case 'rockart': {
      const r = flat(C.rock), dr = flat(C.darkRock)
      ground(add, C.sand.clone().multiplyScalar(0.85))
      for (const [x, z, s] of [[-0.3, -0.15, 0.26], [0.32, -0.2, 0.2], [0.05, -0.3, 0.3]] as const) {
        const b = new THREE.DodecahedronGeometry(s, 0).scale(1, 0.7, 0.8)
        add(b, s * 0.45, x, z, x > 0 ? dr : r)
      }
      // a smooth sloping panel with ochre figures on it
      const panel = add(new THREE.BoxGeometry(0.62, 0.03, 0.34), 0.08, 0, 0.12, r)
      panel.rotation.x = 0.45
      const paint = flat(C.ochre)
      for (let i = 0; i < 7; i++) {
        const fx = -0.24 + i * 0.08, fz = 0.05 + (i % 2) * 0.1
        const fig = add(new THREE.BoxGeometry(0.03, 0.006, i % 3 ? 0.05 : 0.025), 0.08 + (0.12 - fz) * Math.tan(0.45) + 0.018, fx, fz, paint)
        fig.rotation.x = 0.45
      }
      return true
    }
    case 'islands': {
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.012, 32).scale(1, 1, 0.85), 0.006, 0, 0, water())
      const f = flat(C.forest), rk = flat(C.rock)
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1 + rnd(), r = i ? 0.22 + rnd() * 0.2 : 0
        const s = i ? 0.07 + rnd() * 0.06 : 0.15
        // steep-sided, tree-capped: the islets stand well out of the water
        const isl = new THREE.DodecahedronGeometry(s, 1).scale(1, 1.6, 0.85)
        const p = isl.attributes.position
        for (let k = 0; k < p.count; k++) p.setY(k, Math.max(0, p.getY(k)))
        isl.computeVertexNormals()
        add(isl, 0.01, Math.cos(a) * r, Math.sin(a) * r * 0.85, i % 2 ? rk : f)
      }
      add(new THREE.BoxGeometry(0.05, 0.04, 0.04), 0.03 + 0.15 * 1.6 - 0.02, 0, 0, mat)
      return true
    }
  }
  return false
}
