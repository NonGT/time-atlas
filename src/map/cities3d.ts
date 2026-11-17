import * as THREE from 'three'
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MLMap } from 'maplibre-gl'
import { isNatural, shownFrom, type City, type Landmark } from '../data/schema'
import type { Store } from '../store'
import type { IsLand } from './landMask'
import { buildShape, phasesOf } from './shapes'
import { MODELS } from './models'
import { FLAT_ZOOM } from './style'

const CITY_ZOOM = FLAT_ZOOM + 0.1
// Landmarks are exaggerated so they read at city zoom; size in data is the real footprint.
const LM_EXAG = 22
const LM_MIN = 1400
const LM_MAX = 5000
// heights follow the real height/footprint ratio, a little taller so they still read from the tilted camera
const HEIGHT_EXAG = 1.3
// drawn taller on purpose (long, low structures that are a sliver at true proportions), or whose `size`
// covers more ground than the model shows, so the ratio would squash them
const DRAWN_TALL: ReadonlySet<string> = new Set(['forth-bridge', 'aqueduct-of-segovia', 'great-wall', 'aksum-obelisk'])
const GROUPS: ReadonlySet<string> = new Set(['town', 'citadel', 'garden', 'wall', 'terrace', 'factory', 'cave', 'mound', 'ring', 'bridge', 'rockart', 'hills', 'monolith'])
const M_PER_DEG_LAT = 110574
const M_PER_DEG_LON = 111320

// grows slower past ~1M so a megacity stays a city, not a province
export const cityRadius = (pmax: number) => 300 * Math.sqrt(Math.min(pmax, 1000)) + 120 * Math.sqrt(Math.max(pmax - 1000, 0)) + 600
export const landmarkSize = (l: Landmark) => Math.min(LM_MAX, Math.max(LM_MIN, l.size * LM_EXAG))

function mulberry(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

interface Building { i: number; x: number; y: number; w: number; h: number; yaw: number; s: number; spd: number }
interface CityModel { city: City; pmax: number; mesh: THREE.InstancedMesh; blds: Building[]; vis: number; settled?: number }
// one obj per phase, starting at the years in starts, built on first use; reach: how far the model extends from its anchor, as a multiple of size
interface LandmarkModel { lm: Landmark; g: THREE.Group; objs: (THREE.Object3D | undefined)[]; starts: number[]; phase: number; size: number; reach: number; s: number; zf?: number }

// an uncertain landmark is drawn see-through until the latest year it could have been built
const sureFrom = (l: Landmark) => l.builtRange?.[1] ?? l.built
const FADED = 0.45
function setFaded(obj: THREE.Object3D, faded: boolean) {
  if (obj.userData.faded === faded) return
  obj.userData.faded = faded
  obj.traverse(o => {
    const mats = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    for (const mat of mats ? [mats].flat() : []) {
      const own = (mat.userData.own ??= { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite })
      mat.transparent = faded || own.transparent
      mat.opacity = faded ? own.opacity * FADED : own.opacity
      mat.depthWrite = faded ? false : own.depthWrite
      mat.needsUpdate = true
    }
  })
}

const reachOf = (obj: THREE.Object3D) => {
  obj.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(obj)
  return Math.hypot(Math.max(-b.min.x, b.max.x), Math.max(-b.min.y, b.max.y))
}

// Mercator y points south. The flip to north lives in the camera (see render) rather than in each object,
// because three.js reverses face culling for mirrored objects and doesn't know the camera mirrors too.
const FLIP_Y = new THREE.Matrix4().makeScale(1, -1, 1)

/** Anchors a local frame (x east, y north, z up, in meters) at a lng/lat on the y-flipped mercator plane. */
function anchor(lng: number, lat: number) {
  const g = new THREE.Group()
  const mc = MercatorCoordinate.fromLngLat([lng, lat], 0)
  const s = mc.meterInMercatorCoordinateUnits()
  g.matrixAutoUpdate = false
  g.matrix.makeTranslation(mc.x, -mc.y, mc.z).multiply(new THREE.Matrix4().makeScale(s, s, s))
  return g
}

export class Cities3D implements CustomLayerInterface {
  readonly id = 'cities-3d'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const
  private map!: MLMap
  private renderer!: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  // Everything is placed relative to the view centre, moved each frame. Mercator coordinates near 1 lose about two
  // metres to float32 rounding on the GPU, so at close zoom vertices would snap around as the camera moves.
  private world = new THREE.Group()
  private origin = new THREE.Matrix4()
  private compiled = false
  private cities: CityModel[] = []
  private landmarks: LandmarkModel[] = []
  private last = performance.now()
  private wasVisible = false
  private placed = new Map<string, [number, number]>()

  constructor(private store: Store, private isLand: IsLand) {}

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true })
    this.renderer.autoClear = false

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1))
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2)
    sun.position.set(0.35, -0.55, 1)
    this.scene.add(sun)
    this.world.matrixAutoUpdate = false
    this.scene.add(this.world)

    for (const l of this.store.data.landmarks) this.buildLandmark(l)
    this.fitLandmarks()
    const lmByCity = new Map<string, LandmarkModel[]>()
    for (const m of this.landmarks) if (m.lm.city) (lmByCity.get(m.lm.city) ?? lmByCity.set(m.lm.city, []).get(m.lm.city)!).push(m)
    for (const c of this.store.data.cities) this.buildCity(c, lmByCity.get(c.id) ?? [])
    this.store.on('year', () => this.onYear())
    this.store.on('mode', () => map.triggerRepaint())
    this.store.on('uncertain', () => map.triggerRepaint())
    this.onYear()
    for (const m of this.cities) for (const b of m.blds) b.s = b.i < m.vis ? 1 : 0
    for (const l of this.landmarks) l.s = this.store.landmarkShown(l.lm) ? 1 : 0
  }

  private buildCity(c: City, lms: LandmarkModel[]) {
    const pmax = this.store.pmax.get(c.id)!
    const N = Math.round(3.2 * Math.sqrt(pmax)) + 2
    const Rc = cityRadius(pmax)
    const sp = Rc * Math.sqrt(Math.PI / N)
    const kx = M_PER_DEG_LON * Math.cos((c.lat * Math.PI) / 180)
    const avoid = lms.map(({ lm, size, reach }) => {
      const [lon, lat] = this.placeOf(lm)
      return { x: (lon - c.lon) * kx, y: (lat - c.lat) * M_PER_DEG_LAT, r: size * reach }
    })
    const rnd = mulberry(hash(c.id))
    const yaw0 = rnd() * Math.PI
    const blds: Building[] = []
    // Golden-angle spiral outward from the center; spots in the water or on a landmark are skipped,
    // which pushes coastal cities inland instead of into the sea.
    for (let k = 0; blds.length < N && k < N * 8; k++) {
      const r = Rc * Math.sqrt((k + 0.5) / N)
      const a = k * 2.39996 + rnd() * 0.5
      const x = Math.cos(a) * r, y = Math.sin(a) * r
      if (!this.isLand(c.lon + x / kx, c.lat + y / M_PER_DEG_LAT)) continue
      if (avoid.some(l => Math.hypot(x - l.x, y - l.y) < l.r + sp * 0.3)) continue
      const cen = 1 - Math.min(1, r / Rc)
      const w = sp * (0.3 + rnd() * 0.2)
      blds.push({ i: blds.length, x, y, w, h: w * (0.4 + rnd() * 0.7) * (0.7 + 1.0 * cen * cen), yaw: yaw0 + (rnd() - 0.5) * 0.25, s: 0, spd: 2.5 + rnd() * 5 })
    }
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1c150c }), Math.max(1, blds.length))
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    const base = new THREE.Color(this.store.colorOfCity(c)).lerp(new THREE.Color('#d9cfba'), 0.3)
    blds.forEach((_, k) => mesh.setColorAt(k, base.clone().multiplyScalar(0.6 + rnd() * 0.35)))
    const g = anchor(c.lon, c.lat)
    g.add(mesh)
    this.world.add(g)
    this.cities.push({ city: c, pmax, mesh, blds, vis: 0 })
  }

  private genericReach = new Map<string, number>()

  private buildLandmark(l: Landmark) {
    const g = anchor(l.lon, l.lat)
    this.world.add(g)
    const from = shownFrom(l)
    // a natural place on a generic shape shows bare until its built year, then with its shrine or village
    const starts = MODELS[l.id] || from === l.built ? phasesOf(l.id, from) : [from, l.built]
    const m: LandmarkModel = { lm: l, g, objs: starts.map(() => undefined), starts, phase: 0, size: landmarkSize(l), reach: 0, s: 0 }
    if (MODELS[l.id]) {
      m.zf = 1
      const objs = starts.map((_, i) => this.phaseObj(m, i))
      m.reach = Math.max(...objs.map(reachOf))
      this.fitHeight(m, objs)
    }
    else {
      // generic shapes all share a footprint, so measure one of each and build the rest when first seen
      let r = this.genericReach.get(l.shape)
      if (r === undefined) this.genericReach.set(l.shape, (r = reachOf(buildShape(l.shape, '#888888'))))
      m.reach = r
    }
    this.landmarks.push(m)
  }

  /**
   * Buildings are squashed or stretched as a whole to their real proportions, measured on the tallest
   * phase so a building under construction stays short. Natural shapes are built at the right relief instead.
   */
  private fitHeight(m: LandmarkModel, objs: THREE.Object3D[]) {
    const l = m.lm
    m.zf = 1
    // towns, complexes and landscapes have their parts drawn wider than life too, so they keep their look
    if (!l.height || isNatural(l) || (!MODELS[l.id] && GROUPS.has(l.shape)) || DRAWN_TALL.has(l.id)) return
    let w = 0, h = 0
    for (const o of objs) {
      const b = new THREE.Box3().setFromObject(o)
      if (b.max.z > h) { h = b.max.z; w = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) }
    }
    // only ever lowered, and not past the point where the shape stops reading
    if (w > 0 && h > 0) m.zf = Math.min(1, Math.max(0.6, ((l.height / l.size) * HEIGHT_EXAG * w) / h))
  }

  private phaseObj(m: LandmarkModel, i: number) {
    let obj = m.objs[i]
    if (obj) return obj
    const l = m.lm
    const ratio = l.height ? (l.height / l.size) * HEIGHT_EXAG : undefined
    obj = buildShape(l.shape, this.store.colorOfLandmark(l), l.id, m.starts[i], isNatural(l) ? ratio : undefined)
    if (m.zf === undefined) this.fitHeight(m, [obj])
    if (l.uncertain) setFaded(obj, this.store.year < sureFrom(l))
    obj.visible = false
    m.g.add(obj)
    return (m.objs[i] = obj)
  }

  /**
   * Landmarks are drawn far larger than life, so neighbours standing at the same time would overlap.
   * Shrink them first, but not below half size so they don't vanish next to the city's blocks,
   * then push whatever still overlaps apart along the line between them.
   */
  private fitLandmarks() {
    const GAP = 0.9, MIN_SCALE = 0.5
    const L = this.landmarks, base = L.map(m => m.size)
    // offsets in meters from each landmark's real spot
    const off = L.map(() => ({ x: 0, y: 0 }))
    const apart = (i: number, j: number) => {
      const a = L[i].lm, b = L[j].lm, kx = M_PER_DEG_LON * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
      return { x: (b.lon - a.lon) * kx + off[j].x - off[i].x, y: (b.lat - a.lat) * M_PER_DEG_LAT + off[j].y - off[i].y }
    }
    const pairs: [number, number][] = []
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i].lm, b = L[j].lm
      if (shownFrom(a) >= (b.gone ?? Infinity) || shownFrom(b) >= (a.gone ?? Infinity)) continue
      if (Math.abs(a.lat - b.lat) > 0.5 || Math.abs(a.lon - b.lon) > 0.5) continue
      pairs.push([i, j])
    }
    const need = (i: number, j: number) => L[i].size * L[i].reach + L[j].size * L[j].reach
    for (const [i, j] of pairs) {
      const v = apart(i, j), d = Math.hypot(v.x, v.y)
      const f = Math.max(MIN_SCALE, (d * GAP) / (base[i] * L[i].reach + base[j] * L[j].reach))
      if (f >= 1) continue
      L[i].size = Math.min(L[i].size, base[i] * f)
      L[j].size = Math.min(L[j].size, base[j] * f)
    }
    for (let it = 0; it < 30; it++) {
      let moved = false
      for (const [i, j] of pairs) {
        const { x: dx, y: dy } = apart(i, j), d = Math.hypot(dx, dy) || 1
        const short = need(i, j) / GAP - d
        if (short <= 1) continue
        moved = true
        // the bigger one moves less
        const wi = L[j].size / (L[i].size + L[j].size), wj = 1 - wi
        off[i].x -= (dx / d) * short * wi; off[i].y -= (dy / d) * short * wi
        off[j].x += (dx / d) * short * wj; off[j].y += (dy / d) * short * wj
      }
      if (!moved) break
    }
    L.forEach((m, i) => {
      if (!off[i].x && !off[i].y) return
      const lat = m.lm.lat + off[i].y / M_PER_DEG_LAT, lon = m.lm.lon + off[i].x / (M_PER_DEG_LON * Math.cos((m.lm.lat * Math.PI) / 180))
      this.placed.set(m.lm.id, [lon, lat])
      const g = anchor(lon, lat)
      m.g.matrix.copy(g.matrix)
    })
  }

  /** Where a landmark is actually drawn, which differs from its real spot when it had to make room for a neighbour. */
  placeOf(l: Landmark): [number, number] {
    return this.placed.get(l.id) ?? [l.lon, l.lat]
  }

  private onYear() {
    const y = this.store.year
    for (const m of this.landmarks) {
      if (m.objs.length < 2) continue
      let i = m.starts.length - 1
      while (i > 0 && y < m.starts[i]) i--
      if (i !== m.phase) { const old = m.objs[m.phase]; if (old) old.visible = false; m.phase = i }
    }
    for (const m of this.landmarks) {
      if (!m.lm.uncertain) continue
      const faded = y < sureFrom(m.lm)
      for (const o of m.objs) if (o) setFaded(o, faded)
    }
    for (const m of this.cities) { m.vis = m.blds.length * Math.sqrt(this.store.pop(m.city) / m.pmax); m.settled = undefined }
    this.map.triggerRepaint()
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    // compile every shader the models need up front (all models are still in the scene on the first frame),
    // off the main thread where the browser allows, instead of stalling when each kind of material first shows
    if (!this.compiled) {
      this.compiled = true
      this.renderer.resetState()
      void this.renderer.compileAsync(this.scene, this.camera)
    }
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    const zoom = this.map.getZoom()
    const zf = this.store.mode === 'city' && zoom >= CITY_ZOOM ? smooth(CITY_ZOOM, CITY_ZOOM + 0.9, zoom) : 0
    const visible = zf > 0.001
    // While hidden, snap to the current year so nothing replays when the user zooms in.
    const step = (s: number, t: number, spd: number) => (visible && this.wasVisible ? s + (t - s) * Math.min(1, dt * spd) : t)
    let animating = false
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1)

    for (const m of this.cities) {
      // nothing to redo for a city whose buildings have finished growing at this zoom
      if (m.settled === zf) continue
      let moving = false
      m.blds.forEach((b, k) => {
        const t = b.i < m.vis ? 1 : 0
        b.s = step(b.s, t, b.spd)
        if (Math.abs(t - b.s) > 0.003) moving = true
        const s = b.s * zf
        if (s < 0.003) M.makeScale(0, 0, 0)
        else {
          const xy = b.w * Math.min(1, s * 3)
          M.compose(P.set(b.x, b.y, 0), Q.setFromAxisAngle(Z, b.yaw), S.set(xy, xy, b.h * s))
        }
        m.mesh.setMatrixAt(k, M)
      })
      m.mesh.instanceMatrix.needsUpdate = true
      if (moving) animating = true
      else m.settled = zf
    }
    // with a thousand-odd landmarks, skip the ones far outside the view (city zoom shows a few tens of km)
    const c = this.map.getCenter(), far = 4 / Math.cos((c.lat * Math.PI) / 180)
    for (const l of this.landmarks) {
      const near = Math.abs(l.lm.lat - c.lat) < 4 && Math.abs(((l.lm.lon - c.lng + 540) % 360) - 180) < far
      const t = this.store.landmarkShown(l.lm) ? 1 : 0
      // out of the scene graph entirely, or three.js would still update its matrices every frame
      if (!near) { l.s = t; if (l.g.parent) this.world.remove(l.g); continue }
      if (!l.g.parent) this.world.add(l.g)
      l.s = step(l.s, t, 2.5)
      if (Math.abs(t - l.s) > 0.003) animating = true
      const s = l.s * zf
      const o = l.objs[l.phase] ?? (s > 0.003 ? this.phaseObj(l, l.phase) : undefined)
      if (!o) continue
      o.visible = s > 0.003
      o.scale.set(l.size * Math.min(1, s * 2), l.size * Math.min(1, s * 2), l.size * s * (l.zf ?? 1))
    }
    this.wasVisible = visible
    if (!visible) return

    const o = MercatorCoordinate.fromLngLat(c, 0)
    this.origin.makeTranslation(o.x, -o.y, 0)
    this.world.matrix.makeTranslation(-o.x, o.y, 0)
    this.world.matrixWorldNeedsUpdate = true
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(FLIP_Y).multiply(this.origin)
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
    if (animating) this.map.triggerRepaint()
  }
}
