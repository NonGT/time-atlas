import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { gable, staged, type Builder, type Kit } from './kit'

type G = THREE.BufferGeometry
const PI = Math.PI

const at = <T extends G>(g: T, x: number, y: number, z: number) => { g.translate(x, y, z); return g }
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z)
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 16) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n), x, y + h / 2, z)
function lathe(pts: number[][], seg: number, sr: number, sh: number, rot = 0) {
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)), seg)
  if (rot) g.rotateY(rot)
  return g
}
const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// mixes indexed and extruded geometry, so drop uvs and index before merging
const put = (k: Kit, geos: G[], m: THREE.Material = k.mat) => {
  if (!geos.length) return
  const n = geos.map(g => { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return q })
  k.add(mergeGeometries(n)!, 0, 0, 0, m)
}
const solid = (c: string, e = 0.22) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(e) })

/** Wedge (stair or ramp) of width w, rising h over length l toward (x, z), pointing outward along (dx, dz). */
function wedge(w: number, h: number, l: number, x: number, y: number, z: number, dx: number, dz: number) {
  const s = new THREE.Shape()
  s.moveTo(0, 0); s.lineTo(l, 0); s.lineTo(0, h); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false })
  g.translate(0, 0, -w / 2)
  g.rotateY(Math.atan2(-dz, dx))
  return at(g, x, y, z)
}

/** Low-poly rock: a cone with its vertices pushed about by a fixed pattern. */
function crag(r: number, h: number, seg: number, seed: number, rough = 0.18) {
  const g = new THREE.ConeGeometry(r, h, seg, 3)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    if (v.y > h / 2 - 1e-6) continue
    const a = Math.atan2(v.z, v.x), f = 1 + rough * Math.sin(a * 3 + seed) * Math.cos(a * 2 - seed * 1.7 + v.y * 9)
    p.setXYZ(i, v.x * f, v.y, v.z * f)
  }
  g.computeVertexNormals()
  g.translate(0, h / 2, 0)
  return g
}

// ~1572: Vilcabamba falls, the estate is left and its thatch rots away, leaving bare gable walls
const machuPicchu = staged([1572], (k, year) => {
  // city ~530 x 200 m on the saddle between Machu Picchu and Huayna Picchu (2,720 m, 260 m above the city)
  const ruin = year >= 1572
  const stone = solid('#bdb6a6', 0.24), forest = solid('#5a7a45', 0.2), grass = solid('#9cb873', 0.22)
  const thatch = solid('#b8955a', 0.22)
  const s: G[] = [], f: G[] = [], gr: G[] = [], th: G[] = []
  // steep forested mountain falling away on all sides
  f.push(lathe([[1, 0], [0.8, 0.4], [0.55, 0.85], [0, 1]], 18, 0.46, 0.08).scale(1, 1, 1.15))
  // terraces stepping up to the city, deeper on the south and east flanks
  for (let i = 0; i < 6; i++) {
    const t = new THREE.CylinderGeometry(1, 1, 0.014, 20)
    t.scale(0.36 - i * 0.03, 1, 0.48 - i * 0.04)
    gr.push(at(t, -i * 0.008, 0.055 + i * 0.014 + 0.007, -i * 0.012))
    const wall = new THREE.CylinderGeometry(1, 1, 0.012, 20, 1, true)
    wall.scale(0.362 - i * 0.03, 1, 0.482 - i * 0.04)
    s.push(at(wall, -i * 0.008, 0.055 + i * 0.014 + 0.005, -i * 0.012))
  }
  const top = 0.055 + 6 * 0.014, cz = -0.06
  // sunken main plaza running along the ridge
  gr.push(bx(0.09, 0.006, 0.3, -0.03, top, cz))
  const house = (x: number, z: number, w: number, d: number, h = 0.028, alongZ = false) => {
    s.push(bx(w, h, d, x, top, z))
    const L = alongZ ? d : w, D = alongZ ? w : d
    if (!ruin) {
      const r = gable(L + 0.008, D + 0.01, D * 0.75)
      if (alongZ) r.rotateY(PI / 2)
      th.push(at(r, x, top + h, z))
    } else {
      for (const e of [-1, 1]) {
        const r = gable(0.004, D, D * 0.7)
        if (alongZ) r.rotateY(PI / 2)
        s.push(at(r, x + (alongZ ? 0 : e * (L / 2 - 0.002)), top + h, z + (alongZ ? e * (L / 2 - 0.002) : 0)))
      }
    }
  }
  // west (sacred and royal) sector and east (residential) sector either side of the plaza
  for (let i = 0; i < 5; i++) {
    house(-0.12, cz - 0.13 + i * 0.06, 0.07, 0.038)
    house(0.06, cz - 0.14 + i * 0.06, 0.06, 0.036)
    house(0.12, cz - 0.11 + i * 0.06, 0.045, 0.034, 0.024, true)
  }
  house(-0.17, cz + 0.12, 0.04, 0.06, 0.026, true)
  house(0.03, cz + 0.18, 0.08, 0.035)
  // Temple of the Sun, the curved torreón
  s.push(cyl(0.022, 0.022, 0.035, -0.07, top, cz + 0.08, 12))
  // Intihuatana hill at the north-west corner
  for (let i = 0; i < 3; i++) s.push(bx(0.08 - i * 0.022, 0.012, 0.07 - i * 0.02, -0.1, top + i * 0.012, cz - 0.21))
  s.push(bx(0.01, 0.014, 0.01, -0.1, top + 0.036, cz - 0.21))
  // Huayna Picchu, the sugarloaf peak behind the city to the north
  f.push(at(crag(0.14, 0.62, 8, 1.3, 0.14), 0.03, 0, -0.43))
  f.push(at(crag(0.09, 0.32, 7, 2.4), -0.14, 0, -0.42))
  put(k, s, stone); put(k, f, forest); put(k, gr, grass); put(k, th, thatch)
})

// ~1800 the moai are pulled down in the island's wars; Ahu Tongariki's fifteen go back up 1992-96
const rapaNui = staged([1800, 1995], (k, year) => {
  // Ahu Tongariki: platform ~100 m long, fifteen moai 5.6-8.7 m tall with their backs to the sea
  const down = year >= 1800 && year < 1995
  const tuff = solid('#7d7064'), scoria = solid('#9a5238'), grass = solid('#8fae66', 0.22)
  const st = solid('#a39d92', 0.22)
  const m: G[] = [], red: G[] = [], gr: G[] = [], p: G[] = []
  gr.push(bx(1.0, 0.006, 0.34, 0, 0, 0.06))
  // the ahu: stone platform with a sloping pavement on the inland side
  p.push(bx(0.98, 0.035, 0.07, 0, 0.006, -0.04))
  p.push(wedge(0.96, 0.03, 0.1, 0, 0.006, -0.005, 0, 1))
  const n = 15
  for (let i = 0; i < n; i++) {
    const x = -0.44 + (i * 0.88) / (n - 1)
    const s = 0.85 + 0.3 * ((i * 7) % 5) / 4 // heights vary moai to moai
    const parts: G[] = [
      bx(0.044, 0.05, 0.026, 0, 0, 0),
      bx(0.04, 0.062, 0.03, 0, 0.05, 0.001),
      bx(0.044, 0.01, 0.01, 0, 0.093, 0.012),
      bx(0.012, 0.03, 0.012, 0, 0.06, 0.017),
      bx(0.03, 0.012, 0.008, 0, 0.048, 0.015),
      bx(0.048, 0.03, 0.008, 0, 0.055, -0.004),
    ]
    const hat = i === 9 ? [cyl(0.017, 0.016, 0.016, 0, 0.112, 0.002, 10)] : []
    const all = [...parts, ...hat]
    for (const g of all) g.scale(s * 1.1, s * 1.9, s * 1.1)
    if (down) {
      // face down, fallen inland off the platform; the topknot rolled away
      const yaw = (((i * 37) % 11) - 5) * 0.05
      for (const g of all) { g.rotateX(PI / 2); g.rotateY(yaw); g.translate(x, 0.022, 0.0) }
      if (hat.length) hat[0].translate(0.035, -0.006, 0.01)
    } else for (const g of all) g.translate(x, 0.041, -0.04)
    m.push(...parts); red.push(...hat)
  }
  // scattered loose topknots on the ground
  if (down) for (const [x, z] of [[-0.3, 0.17], [0.18, 0.2]]) red.push(cyl(0.018, 0.017, 0.018, x, 0.006, z, 10))
  put(k, m, tuff); put(k, red, scoria); put(k, gr, grass); put(k, p, st)
})

// copper turns from brown to green over about twenty years
const statueOfLiberty = staged([1906], (k, year) => {
  // 46 m statue on a 47 m pedestal set inside the 11-pointed star of Fort Wood (1811)
  const copper = year >= 1906 ? solid('#6fae98', 0.2) : solid('#b07a52', 0.2)
  const granite = solid('#d4ccbc', 0.26), grass = solid('#8fae6a', 0.22), gold = solid('#e0b84a', 0.35)
  const s: G[] = [], c: G[] = [], gr: G[] = [], au: G[] = []
  const isl = new THREE.CylinderGeometry(1, 1, 0.01, 24)
  isl.scale(0.5, 1, 0.4)
  gr.push(at(isl, 0, 0.005, 0.03))
  // Fort Wood
  const star = new THREE.Shape()
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * PI * 2, r = i % 2 ? 0.22 : 0.3
    i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const fort = new THREE.ExtrudeGeometry(star, { depth: 0.055, bevelEnabled: false })
  fort.rotateX(-PI / 2)
  s.push(at(fort, 0, 0.01, 0))
  // pedestal: stepped plinth, tapering shaft, balcony cornice
  const pTop = 0.46
  s.push(bx(0.2, 0.03, 0.2, 0, 0.065, 0), bx(0.17, 0.03, 0.17, 0, 0.095, 0))
  s.push(at(lathe([[1, 0], [0.92, 0.5], [0.84, 0.8], [0.84, 0.82], [0.95, 0.86], [0.95, 0.9], [0.8, 0.92], [0.78, 1], [0, 1]], 4, 0.09, pTop - 0.125, PI / 4), 0, 0.125, 0))
  // the statue faces south-east, out to the Narrows
  const fig: G[] = [], fl: G[] = []
  const H = 0.43
  fig.push(lathe([[0.052, 0], [0.05, 0.05], [0.042, 0.3], [0.038, 0.52], [0.04, 0.6], [0.03, 0.64], [0.012, 0.66], [0, 0.66]], 12, 1, H))
  fig.push(cyl(0.009, 0.008, 0.02, 0, H * 0.65, 0, 8))
  fig.push(at(new THREE.SphereGeometry(0.02, 10, 8).scale(0.9, 1.1, 1), 0, H * 0.71, 0.002))
  fig.push(cyl(0.021, 0.02, 0.008, 0, H * 0.73, 0, 10))
  for (let i = 0; i < 7; i++) {
    // spikes fan out from the diadem, mostly to the front and sides
    const a = PI * (-0.1 + (i / 6) * 1.2)
    const ray = new THREE.ConeGeometry(0.005, 0.045, 4)
    ray.translate(0, 0.0225, 0)
    ray.rotateZ(PI / 2 - 0.35)
    ray.rotateY(-a)
    fig.push(at(ray, Math.cos(a) * 0.018, H * 0.745, Math.sin(a) * 0.018))
  }
  // raised right arm with the torch
  const tilt = 0.28, al = 0.15
  const arm = new THREE.CylinderGeometry(0.009, 0.012, al, 8)
  arm.translate(0, al / 2, 0); arm.rotateZ(-tilt)
  fig.push(at(arm, 0.032, H * 0.58, 0))
  const tx = 0.032 + Math.sin(tilt) * al, ty = H * 0.58 + Math.cos(tilt) * al
  fig.push(cyl(0.006, 0.01, 0.03, tx, ty, 0, 8))
  fig.push(cyl(0.015, 0.015, 0.006, tx, ty + 0.03, 0, 10))
  fl.push(at(lathe([[0.9, 0], [1, 0.3], [0.6, 0.7], [0, 1]], 8, 0.013, 0.04), tx, ty + 0.036, 0))
  // tablet held in the crook of the left arm
  const tab = new THREE.BoxGeometry(0.03, 0.06, 0.012)
  tab.rotateZ(0.3)
  fig.push(at(tab, -0.048, H * 0.48, 0.012))
  fig.push(at(new THREE.BoxGeometry(0.015, 0.07, 0.016).rotateZ(0.35), -0.04, H * 0.52, 0.004))
  const face = PI / 4
  for (const g of fig) { g.rotateY(face); g.translate(0, pTop, 0) }
  for (const g of fl) { g.rotateY(face); g.translate(0, pTop, 0) }
  c.push(...fig); au.push(...fl)
  put(k, s, granite); put(k, c, copper); put(k, gr, grass); put(k, au, gold)
})

function rio(k: Kit) {
  // Christ the Redeemer: 30 m figure, 28 m arm span, on an 8 m pedestal atop Corcovado (710 m); the statue is greatly enlarged
  const rock = solid('#9a9488', 0.22), forest = solid('#5a7a45', 0.2), soap = solid('#e6e2d8', 0.3)
  const r: G[] = [], f: G[] = [], w: G[] = []
  f.push(crag(0.5, 0.2, 11, 0.7, 0.16))
  f.push(at(crag(0.3, 0.36, 9, 1.4, 0.2), -0.04, 0, 0.02))
  // granite summit leaning out over its sheer southern face
  const pk = crag(0.2, 0.58, 8, 2.1, 0.22)
  pk.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0.06, 0, 0.12))
  r.push(at(pk, 0.0, 0, -0.04))
  const x0 = 0.035, y0 = 0.565, z0 = 0.03
  r.push(cyl(0.045, 0.04, 0.02, x0, y0 - 0.02, z0, 10))
  const fig: G[] = []
  fig.push(bx(0.03, 0.035, 0.03, 0, 0, 0))
  fig.push(lathe([[0.034, 0], [0.032, 0.03], [0.026, 0.1], [0.028, 0.14], [0.03, 0.16], [0.016, 0.175], [0, 0.175]], 10, 1, 1).translate(0, 0.035, 0))
  fig.push(bx(0.2, 0.02, 0.024, 0, 0.19, 0))
  fig.push(bx(0.05, 0.026, 0.028, 0, 0.183, 0))
  fig.push(at(new THREE.SphereGeometry(0.013, 10, 8), 0, 0.225, 0.002))
  // it looks east-south-east over the bay
  for (const g of fig) { g.rotateY(0.9); g.translate(x0, y0, z0) }
  w.push(...fig)
  put(k, r, rock); put(k, f, forest); put(k, w, soap)
}

function brasilia(k: Kit) {
  // National Congress (Niemeyer, 1960): 200 m platform, Senate dome to the north, Chamber bowl to the south,
  // twin 28-storey office towers (100 m) joined by a bridge, standing in a reflecting pool
  const white = solid('#ecebe6', 0.3), glass = solid('#5f7480', 0.2), lawn = solid('#9cb873', 0.22), water = solid('#7ea6b8', 0.25)
  const m: G[] = [], gl: G[] = [], gr: G[] = [], wa: G[] = []
  gr.push(bx(1.0, 0.006, 0.9, -0.02, 0, 0))
  wa.push(bx(0.26, 0.004, 0.5, 0.26, 0.006, 0))
  const px = -0.06, ph = 0.05, py = 0.006
  m.push(bx(0.32, ph, 0.82, px, py, 0))
  gl.push(bx(0.322, ph * 0.55, 0.822, px, py + 0.008, 0))
  m.push(bx(0.33, 0.006, 0.83, px, py + ph, 0))
  // ramp up to the roof from the Esplanada
  m.push(wedge(0.07, ph + 0.006, 0.28, px - 0.165, py, 0, -1, 0))
  const roof = py + ph + 0.006
  m.push(at(new THREE.SphereGeometry(0.1, 20, 8, 0, PI * 2, 0, PI / 2).scale(1, 0.55, 1), px, roof, -0.2))
  m.push(at(lathe([[0.03, 0], [0.06, 0.012], [0.11, 0.035], [0.15, 0.06], [0.155, 0.064], [0.148, 0.064]], 24, 1, 1), px, roof, 0.2))
  const bowl = at(lathe([[0, 0.028], [0.06, 0.036], [0.1, 0.047], [0.148, 0.064]], 24, 1, 1), px, roof, 0.2)
  m.push(cyl(0.032, 0.03, 0.012, px, roof - 0.004, 0.2, 12))
  // towers: thin slabs with their broad glass faces to east and west
  const tx = 0.24, th = 0.62
  for (const s of [-1, 1]) {
    const z = s * 0.048
    m.push(bx(0.034, th, 0.07, tx, 0.006, z))
    for (const e of [-1, 1]) gl.push(bx(0.002, th - 0.04, 0.056, tx + e * 0.0175, 0.02, z))
  }
  m.push(bx(0.034, 0.03, 0.03, tx, th * 0.52, 0), bx(0.034, 0.03, 0.03, tx, th - 0.05, 0))
  put(k, m, white); put(k, gl, glass); put(k, gr, lawn); put(k, wa, water)
  const inner = solid('#c9c8c2', 0.2)
  inner.side = THREE.DoubleSide
  put(k, [bowl], inner)
}

// red stucco when Pakal's city stood; abandoned in the 800s and swallowed by forest; cleared from the 1940s-50s
const palenque = staged([850, 1950], (k, year) => {
  // Temple of the Inscriptions: nine-tiered pyramid ~60 m wide, 27 m high, facing north onto the Palace
  // (~100 x 80 m platform with galleries round its courts and the four-storey tower)
  const phase = year < 850 ? 0 : year < 1950 ? 1 : 2
  const stone = solid(phase ? (phase === 1 ? '#a9a497' : '#c9c4b6') : '#c0695a')
  const roofM = solid(phase ? (phase === 1 ? '#97938a' : '#b3aea2') : '#a85748')
  const ground = solid(phase === 1 ? '#557a42' : '#8fad66', 0.2)
  const tree = solid('#4a7040', 0.2)
  const s: G[] = [], r: G[] = [], gd: G[] = [], t: G[] = [], d: G[] = []
  gd.push(bx(0.98, 0.006, 0.9, 0, 0, 0))
  // hill rising behind the temple
  gd.push(at(crag(0.22, 0.14, 9, 0.4, 0.15).scale(1.3, 1, 0.6), -0.3, 0, 0.38))
  const ix = -0.3, iz = 0.22, y = 0.006
  let h = y
  for (let i = 0; i < 9; i++) {
    const w = 0.3 - i * 0.022, dd = 0.24 - i * 0.017, th = 0.022
    s.push(bx(w, th, dd, ix, h, iz + i * 0.002))
    h += th
  }
  const frontZ = iz - 0.12
  s.push(wedge(0.06, h - y, 0.12, ix, y, frontZ + 0.05, 0, -1))
  // temple: five doorways under a sloping mansard roof
  s.push(bx(0.17, 0.045, 0.08, ix, h, iz + 0.03))
  for (let i = 0; i < 5; i++) d.push(bx(0.016, 0.03, 0.004, ix - 0.064 + i * 0.032, h, iz + 0.03 - 0.0405))
  r.push(at(lathe([[1, 0], [0.75, 1], [0, 1]], 4, 0.13, 0.04, PI / 4).scale(1, 1, 0.5), ix, h + 0.045, iz + 0.03))
  // Palace
  const px = 0.16, pz = -0.08, pw = 0.5, pd = 0.4, ph = 0.045
  s.push(bx(pw, ph, pd, px, y, pz))
  s.push(wedge(0.12, ph, 0.07, px + 0.04, y, pz - pd / 2, 0, -1))
  s.push(wedge(0.12, ph, 0.07, px + pw / 2, y, pz, 1, 0))
  const py = y + ph, gh = 0.032, gw = 0.04
  const gallery = (x: number, z: number, w: number, dd: number) => {
    s.push(bx(w, gh, dd, x, py, z))
    r.push(at(lathe([[1, 0], [0.55, 1], [0, 1]], 4, 1, 0.022, PI / 4).scale(w * 0.72, 1, dd * 0.72), x, py + gh, z))
  }
  // outer galleries and the cross ranges splitting the courts
  gallery(px, pz - pd / 2 + gw / 2 + 0.01, pw - 0.03, gw)
  gallery(px, pz + pd / 2 - gw / 2 - 0.01, pw - 0.03, gw)
  gallery(px - pw / 2 + gw / 2 + 0.01, pz, gw, pd - 0.11)
  gallery(px + pw / 2 - gw / 2 - 0.01, pz, gw, pd - 0.11)
  gallery(px + 0.05, pz, gw, pd - 0.11)
  gallery(px - 0.08, pz + 0.03, 0.18, gw)
  // the tower, south-west court
  const tx = px - 0.08, tz = pz + 0.1
  for (let i = 0; i < 4; i++) {
    const w = 0.06 - i * 0.006
    s.push(bx(w, 0.034, w, tx, py + i * 0.04, tz))
    r.push(bx(w + 0.012, 0.006, w + 0.012, tx, py + i * 0.04 + 0.034, tz))
    for (const [dx, dz] of dirs) d.push(bx(dx ? 0.003 : 0.014, 0.02, dx ? 0.014 : 0.003, tx + dx * (w / 2 + 0.001), py + i * 0.04 + 0.006, tz + dz * (w / 2 + 0.001)))
  }
  if (phase === 1) {
    // forest grown over the ruins
    const spots = [[-0.45, -0.3], [-0.42, 0.05], [-0.15, 0.4], [0.05, 0.3], [0.35, 0.25], [0.48, 0.1], [0.45, -0.35], [0.1, -0.38], [-0.2, -0.2],
      [-0.12, 0.15], [-0.45, 0.32], [0.25, 0.35], [-0.05, -0.05], [0.3, -0.1], [-0.3, 0.12], [0.0, -0.25], [-0.36, 0.3], [-0.24, 0.3]]
    for (const [x, z] of spots) {
      const top = Math.abs(x - ix) < 0.15 && Math.abs(z - iz) < 0.12 ? 0.18 : Math.abs(x - px) < 0.25 && Math.abs(z - pz) < 0.2 ? 0.06 : 0.006
      const c = new THREE.IcosahedronGeometry(0.05, 0).scale(1, 0.8, 1)
      t.push(at(c, x, top + 0.05, z))
    }
  }
  put(k, s, stone); put(k, r, roofM); put(k, gd, ground); put(k, t, tree); put(k, d, solid('#3b302a', 0.1))
})

function preahVihear(k: Kit) {
  // 800 m of causeways, stairs and five gopuras climbing south up the Dangrek ridge to the sanctuary on the cliff edge
  const ss = solid('#c4b48e', 0.24), rock = solid('#8a8270', 0.2), forest = solid('#5a7a45', 0.2)
  const s: G[] = [], rk: G[] = [], f: G[] = [], d: G[] = []
  // the spur rises gently from the north and ends in a sheer cliff over the Cambodian plain
  const sp = new THREE.Shape()
  sp.moveTo(-0.5, 0); sp.lineTo(-0.5, 0.01); sp.lineTo(0.44, 0.15); sp.lineTo(0.5, 0.145); sp.lineTo(0.5, 0); sp.closePath()
  const hill = new THREE.ExtrudeGeometry(sp, { depth: 0.5, bevelEnabled: false })
  hill.translate(0, 0, -0.25); hill.rotateY(-PI / 2)
  f.push(hill)
  rk.push(bx(0.5, 0.14, 0.012, 0, 0, 0.497))
  for (const [x, z, r] of [[-0.18, 0.52, 0.03], [0.05, 0.53, 0.025], [0.2, 0.52, 0.035]]) rk.push(at(new THREE.DodecahedronGeometry(r, 0), x, 0.01, z))
  // terraces of the temple, each a step higher toward the cliff
  const lv: [number, number, number][] = [[-0.5, -0.3, 0.04], [-0.3, -0.05, 0.08], [-0.05, 0.16, 0.11], [0.16, 0.3, 0.13], [0.3, 0.5, 0.155]]
  for (const [z0, z1, y] of lv) rk.push(bx(0.22, y, z1 - z0 - 0.004, 0, 0, (z0 + z1) / 2))
  const gy = (z: number) => lv.find(([a, b]) => z >= a && z < b)![2]
  // northern stairway and the paved causeways between gopuras
  for (let i = 0; i < 5; i++) s.push(bx(0.06, 0.008, 0.02, 0, 0.004 + i * 0.008, -0.505 + i * 0.012))
  for (const [z0, z1, y] of lv) s.push(bx(0.028, 0.004, z1 - z0 - 0.02, 0, y, (z0 + z1) / 2))
  lv.slice(1).forEach(([z0, , y], i) => s.push(wedge(0.04, y - lv[i][2], 0.03, 0, lv[i][2], z0 + 0.0001, 0, -1)))
  // naga balustrade along the first causeway
  for (const e of [-1, 1]) s.push(bx(0.004, 0.008, 0.16, e * 0.02, 0.04, -0.4))
  const gopura = (z: number, w: number, h: number) => {
    const y = gy(z)
    s.push(bx(w, h, w * 0.36, 0, y, z), bx(w * 0.36, h, w * 0.8, 0, y, z))
    s.push(at(gable(w + 0.01, w * 0.38, w * 0.2), 0, y + h, z))
    s.push(at(gable(w * 0.82, w * 0.38, w * 0.22).rotateY(PI / 2), 0, y + h, z))
    d.push(bx(0.014, h * 0.6, 0.003, 0, y, z - w * 0.4 - 0.001))
  }
  gopura(-0.36, 0.06, 0.035)
  gopura(-0.17, 0.09, 0.04)
  gopura(0.0, 0.12, 0.045)
  // the two long halls flanking gopura III
  for (const e of [-1, 1]) {
    s.push(bx(0.04, 0.035, 0.11, e * 0.11, gy(0.07), 0.07))
    s.push(at(gable(0.11, 0.044, 0.02).rotateY(PI / 2), e * 0.11, gy(0.07) + 0.035, 0.07))
  }
  gopura(0.2, 0.1, 0.04)
  // first enclosure: galleries round the court of the sanctuary, whose tower has fallen
  const ez = 0.4, ew = 0.2, ed = 0.15, y5 = 0.155
  for (const e of [-1, 1]) {
    s.push(bx(ew, 0.03, 0.025, 0, y5, ez + e * (ed / 2 - 0.0125)))
    s.push(at(gable(ew, 0.03, 0.014), 0, y5 + 0.03, ez + e * (ed / 2 - 0.0125)))
    s.push(bx(0.025, 0.03, ed - 0.05, e * (ew / 2 - 0.0125), y5, ez))
    s.push(at(gable(ed - 0.05, 0.03, 0.014).rotateY(PI / 2), e * (ew / 2 - 0.0125), y5 + 0.03, ez))
  }
  gopura(ez - ed / 2, 0.07, 0.04)
  s.push(bx(0.05, 0.03, 0.05, 0, y5, ez + 0.01))
  s.push(bx(0.034, 0.012, 0.034, 0, y5 + 0.03, ez + 0.01))
  s.push(bx(0.04, 0.03, 0.035, 0, y5, ez - 0.035), at(gable(0.035, 0.04, 0.02).rotateY(PI / 2), 0, y5 + 0.03, ez - 0.035))
  for (const [x, z] of [[0.04, 0.03], [-0.035, -0.0], [0.02, -0.01]]) rk.push(at(new THREE.DodecahedronGeometry(0.012, 0), x, y5 + 0.008, ez + z))
  put(k, s, ss); put(k, rk, rock); put(k, f, forest); put(k, d, k.dark)
}

// the great tower fell some time before the 1600s; only the porch hall still stands
const konark = staged([1600], (k, year) => {
  // chariot of the sun: 24 carved wheels on the plinth, horses at the east steps, the porch hall (jagamohana, 39 m)
  // in front and the deul behind it, once ~70 m tall
  const ruin = year >= 1600
  const st = solid('#a08a76', 0.24), stD = solid('#6f5c4e', 0.2), sand = solid('#d6c7a0', 0.24)
  const s: G[] = [], dk: G[] = [], g: G[] = []
  g.push(bx(0.98, 0.006, 0.56, 0, 0, 0))
  const x0 = -0.42, x1 = 0.24, pd = 0.3, ph = 0.07, y = 0.006
  s.push(bx(x1 - x0, ph, pd, (x0 + x1) / 2, y, 0))
  dk.push(bx(x1 - x0 + 0.004, 0.008, pd + 0.004, (x0 + x1) / 2, y + ph - 0.016, 0))
  // twelve wheels on each long side
  for (const e of [-1, 1]) for (let i = 0; i < 12; i++) {
    const x = x0 + 0.03 + (i * (x1 - x0 - 0.06)) / 11, z = e * (pd / 2 + 0.004)
    s.push(at(new THREE.CylinderGeometry(0.023, 0.023, 0.008, 8).rotateX(PI / 2), x, y + 0.03, z))
    dk.push(at(new THREE.CircleGeometry(0.017, 8).rotateY(e > 0 ? 0 : PI), x, y + 0.03, z + e * 0.0042))
    for (const a of [PI / 4, -PI / 4]) s.push(at(new THREE.PlaneGeometry(0.034, 0.004).rotateY(e > 0 ? 0 : PI).rotateZ(a), x, y + 0.03, z + e * 0.0046))
  }
  // east stair and the horses straining at the front
  s.push(wedge(0.08, ph, 0.08, x1, y, 0, 1, 0))
  for (const e of [-1, 1]) for (let i = 0; i < 3; i++) {
    const hx = x1 + 0.07 + i * 0.012, hz = e * (0.065 + i * 0.035), hy = y + 0.012
    s.push(bx(0.05, 0.022, 0.018, hx, hy + 0.024, hz))
    s.push(at(new THREE.BoxGeometry(0.014, 0.032, 0.014).rotateZ(-0.6), hx + 0.028, hy + 0.05, hz))
    s.push(bx(0.022, 0.012, 0.012, hx + 0.042, hy + 0.058, hz))
    s.push(bx(0.008, 0.026, 0.016, hx + 0.019, hy - 0.002, hz), bx(0.008, 0.026, 0.016, hx - 0.019, hy - 0.002, hz))
    s.push(bx(0.06, 0.012, 0.024, hx, hy - 0.012, hz))
  }
  const top = y + ph
  // jagamohana: walls then a pyramid of three receding groups of slabs, bell and amalaka on top
  const jx = 0.06, jw = 0.24
  s.push(bx(jw, 0.12, jw, jx, top, 0))
  for (const [dx, dz] of dirs) dk.push(bx(dx ? 0.003 : 0.04, 0.07, dx ? 0.04 : 0.003, jx + dx * (jw / 2 + 0.001), top, dz * (jw / 2 + 0.001)))
  let py = top + 0.12
  for (let grp = 0; grp < 3; grp++) {
    for (let i = 0; i < 4; i++) {
      const w = jw + 0.02 - (grp * 4 + i) * 0.014
      s.push(bx(w, 0.014, w, jx, py, 0))
      dk.push(bx(w - 0.02, 0.006, w - 0.02, jx, py + 0.014, 0))
      py += 0.02
    }
    py += 0.012
    s.push(bx(jw - 0.06 - grp * 0.056, 0.012, jw - 0.06 - grp * 0.056, jx, py - 0.012, 0))
  }
  s.push(at(lathe([[0.5, 0], [0.55, 0.3], [0.42, 0.55], [0.25, 0.65], [0.3, 0.7], [0.62, 0.75], [0.6, 0.86], [0.2, 0.9], [0.14, 1.05], [0.04, 1.2], [0, 1.2]], 8, 0.07, 0.08), jx, py, 0))
  const dx0 = -0.26, dw = 0.24
  if (!ruin) {
    // deul: tall curved shikhara rising from the walls, crowned by a big ribbed amalaka
    s.push(bx(dw, 0.14, dw, dx0, top, 0))
    const prof: number[][] = []
    // bhumi courses: each tier steps in a little at its base
    const rr = (t: number) => 1 - 0.5 * Math.pow(t, 2.6)
    for (let i = 0; i < 10; i++) { const t0 = i / 10, t1 = (i + 1) / 10; prof.push([rr(t0) * 1.03, t0], [rr(t0) * 1.03, t0 + 0.012], [rr(t0) * 0.97, t0 + 0.02], [rr(t1) * 0.99, t1]) }
    prof.push([0, 1])
    const R = (dw / 2) * Math.SQRT2 * 0.98
    s.push(at(lathe(prof, 4, R, 0.62, PI / 4), dx0, top + 0.14, 0))
    // central projections running up each face
    const rib = [...Array(9).keys()].map(i => [rr(i / 8), i / 8]).concat([[0, 1]])
    s.push(at(lathe(rib, 4, R, 0.6, PI / 4).scale(1.1, 1, 0.42), dx0, top + 0.14, 0))
    s.push(at(lathe(rib, 4, R, 0.6, PI / 4).scale(0.42, 1, 1.1), dx0, top + 0.14, 0))
    const ay = top + 0.14 + 0.62
    s.push(cyl(0.035, 0.035, 0.012, dx0, ay - 0.006, 0, 8))
    s.push(at(lathe([[0.5, 0], [1, 0.25], [1, 0.45], [0.5, 0.7], [0.3, 0.8], [0.35, 1.2], [0.05, 1.6], [0, 1.6]], 10, 0.05, 0.05), dx0, ay, 0))
  } else {
    // stump of the walls in a mound of fallen stone
    s.push(bx(dw, 0.07, dw, dx0, top, 0))
    for (const [ex, ez] of [[1, 1], [-1, 1], [-1, -1]]) s.push(bx(0.06, 0.05 + ((ex + 2 * ez + 3) % 3) * 0.02, 0.06, dx0 + ex * 0.08, top + 0.07, ez * 0.08))
    g.push(at(lathe([[1, 0], [0.8, 0.4], [0.4, 0.8], [0, 1]], 9, 0.17, 0.11), dx0 - 0.02, top + 0.0, 0.01))
    for (const [x, z] of [[-0.43, 0.2], [-0.48, -0.18], [-0.35, 0.24], [0.0, 0.25]]) s.push(at(new THREE.DodecahedronGeometry(0.018, 0), x, 0.015, z))
  }
  put(k, s, st); put(k, dk, stD); put(k, g, sand)
})

export const batch_j: Record<string, Builder> = {
  'machu-picchu': machuPicchu,
  'rapa-nui': rapaNui,
  'statue-of-liberty': statueOfLiberty,
  'rio-de-janeiro-landscapes': rio,
  brasilia,
  palenque,
  'preah-vihear': preahVihear,
  'konark-sun-temple': konark,
}
