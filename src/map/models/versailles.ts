import * as THREE from 'three'
import { gable, merge, type Kit } from './kit'

type G = THREE.BufferGeometry
const lam = (color: string, emissive: string) => new THREE.MeshLambertMaterial({ color, emissive })
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)

// Versailles, about 600 m to a unit. The palace faces the town to the east across stepped forecourts; the
// long garden front looks west over the water parterre, Latona fountain and the Tapis Vert to the Grand Canal.
export function versailles(k: Kit) {
  const stone = lam('#e6dbc0', '#2a2418'), brick = lam('#ad5a3f', '#2a0f08'), slate = lam('#5b6370', '#12151a')
  const gold = lam('#d6a83c', '#3a2a08'), dark = lam('#2d2a2a', '#000000'), gravel = lam('#cbbd9c', '#221e14')
  const lawn = lam('#6f8f4a', '#18220c'), grove = lam('#3f5f34', '#0e180a'), water = lam('#6b8fa6', '#0e1c26')
  const H = 0.05

  const S: G[] = [], B: G[] = [], R: G[] = [], W: G[] = [], Au: G[] = []
  // a block with a flat balustraded top (garden side) or a slate mansard (court side)
  const block = (x0: number, x1: number, z0: number, z1: number, h: number, roof: 'flat' | 'mansard', mat: G[] = S) => {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    mat.push(bx(w, h, d, cx, 0, cz))
    if (roof === 'flat') S.push(bx(w + 0.004, 0.006, d + 0.004, cx, h, cz))
    else {
      const along = w > d, g = gable(along ? w : d, (along ? d : w) + 0.004, h * 0.45)
      if (!along) g.rotateY(Math.PI / 2)
      R.push(g.translate(cx, h, cz))
    }
    // two rows of windows on the long sides
    const long = Math.max(w, d), n = Math.floor(long / 0.022)
    for (let i = 0; i < n; i++) for (const row of [0.28, 0.62]) {
      const t = -long / 2 + (i + 0.5) * (long / n)
      if (w >= d) for (const s of [-1, 1]) W.push(bx(0.008, h * 0.2, 0.002, cx + t, h * row, cz + s * (d / 2 + 0.001)))
      else for (const s of [-1, 1]) W.push(bx(0.002, h * 0.2, 0.008, cx + s * (w / 2 + 0.001), h * row, cz + t))
    }
  }

  // garden front: the central block with its Hall of Mirrors and the two long wings
  block(-0.1, -0.02, -0.14, 0.14, H, 'flat')
  block(-0.08, 0.0, 0.14, 0.5, H * 0.95, 'flat')
  block(-0.08, 0.0, -0.5, -0.14, H * 0.95, 'flat')
  // the old brick hunting lodge round the Marble Court, opening east
  block(-0.02, 0.07, -0.1, -0.05, H, 'mansard', B)
  block(-0.02, 0.07, 0.05, 0.1, H, 'mansard', B)
  block(-0.02, 0.0, -0.05, 0.05, H, 'mansard', B)
  S.push(bx(0.06, 0.004, 0.1, 0.035, 0, 0))
  // Royal Court wings stepping out to the east
  block(0.0, 0.16, -0.17, -0.1, H * 0.95, 'mansard')
  block(0.0, 0.16, 0.1, 0.17, H * 0.95, 'mansard')
  // ministers' wings either side of the forecourt
  block(0.2, 0.36, -0.22, -0.16, H * 0.8, 'mansard')
  block(0.2, 0.36, 0.16, 0.22, H * 0.8, 'mansard')
  // the Royal Chapel rises above the north wing with its tall ridge roof
  block(0.0, 0.1, -0.27, -0.21, H * 1.5, 'mansard')
  Au.push(bx(0.1, 0.004, 0.004, 0.05, H * 1.5 + H * 0.67, -0.24))
  // gilded gate and the gold trim along the court roofs
  for (let i = 0; i < 9; i++) Au.push(bx(0.003, 0.02, 0.003, 0.18, 0, -0.08 + i * 0.02))
  Au.push(bx(0.004, 0.003, 0.17, 0.18, 0.02, 0))
  // the equestrian statue of Louis XIV in the Place d'Armes
  Au.push(bx(0.012, 0.012, 0.006, 0.42, 0.012, 0))
  S.push(bx(0.016, 0.012, 0.01, 0.42, 0, 0))

  merge(k, S, stone); merge(k, B, brick); merge(k, R, slate); merge(k, W, dark); merge(k, Au, gold)

  // forecourts and the Place d'Armes
  k.add(new THREE.BoxGeometry(0.42, 0.003, 0.36).translate(0.28, 0.0015, 0), 0, 0, 0, gravel)

  // gardens to the west: the water parterre, Latona, the Tapis Vert between the groves, and the canal
  const L: G[] = [], Gr: G[] = [], Wa: G[] = []
  L.push(bx(0.5, 0.004, 0.98, -0.37, 0, 0))
  for (const z of [-0.07, 0.07]) Wa.push(bx(0.06, 0.006, 0.09, -0.16, 0, z))
  Wa.push(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 20).translate(-0.27, 0.003, 0))
  Gr.push(bx(0.24, 0.035, 0.36, -0.42, 0, -0.26), bx(0.24, 0.035, 0.36, -0.42, 0, 0.26))
  Gr.push(bx(0.24, 0.035, 0.12, -0.42, 0, -0.1), bx(0.24, 0.035, 0.12, -0.42, 0, 0.1))
  Wa.push(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16).translate(-0.55, 0.003, 0))
  Wa.push(bx(0.06, 0.006, 0.04, -0.58, 0, 0))
  // parterres to north and south of the main block, with the Orangery below the south one
  L.push(bx(0.12, 0.005, 0.14, -0.18, 0, -0.26), bx(0.12, 0.005, 0.14, -0.18, 0, 0.26))
  S.length = 0
  S.push(bx(0.16, 0.025, 0.03, -0.18, 0, 0.42))
  merge(k, L, lawn); merge(k, Gr, grove); merge(k, Wa, water); merge(k, S, stone)
}
