import * as THREE from 'three'
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MLMap } from 'maplibre-gl'
import type { City, Landmark } from '../data/schema'
import type { Store } from '../store'
import type { IsLand } from './landMask'
import { buildShape } from './shapes'
import { FLAT_ZOOM } from './style'

const CITY_ZOOM = FLAT_ZOOM + 0.1
// Landmarks are exaggerated so they read at city zoom; size in data is the real footprint.
const LM_EXAG = 22
const LM_MIN = 1400
const LM_MAX = 5000
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
interface CityModel { city: City; pmax: number; mesh: THREE.InstancedMesh; blds: Building[]; vis: number }
interface LandmarkModel { lm: Landmark; obj: THREE.Object3D; size: number; s: number }

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
  private cities: CityModel[] = []
  private landmarks: LandmarkModel[] = []
  private last = performance.now()
  private wasVisible = false

  constructor(private store: Store, private isLand: IsLand) {}

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true })
    this.renderer.autoClear = false

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1))
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2)
    sun.position.set(0.35, -0.55, 1)
    this.scene.add(sun)

    const lmByCity = new Map<string, Landmark[]>()
    for (const l of this.store.data.landmarks) if (l.city) (lmByCity.get(l.city) ?? lmByCity.set(l.city, []).get(l.city)!).push(l)

    for (const c of this.store.data.cities) this.buildCity(c, lmByCity.get(c.id) ?? [])
    for (const l of this.store.data.landmarks) this.buildLandmark(l)
    this.store.on('year', () => this.onYear())
    this.store.on('mode', () => map.triggerRepaint())
    this.store.on('uncertain', () => map.triggerRepaint())
    this.onYear()
    for (const m of this.cities) for (const b of m.blds) b.s = b.i < m.vis ? 1 : 0
    for (const l of this.landmarks) l.s = this.store.landmarkShown(l.lm) ? 1 : 0
  }

  private buildCity(c: City, lms: Landmark[]) {
    const pmax = this.store.pmax.get(c.id)!
    const N = Math.round(3.2 * Math.sqrt(pmax)) + 2
    const Rc = cityRadius(pmax)
    const sp = Rc * Math.sqrt(Math.PI / N)
    const kx = M_PER_DEG_LON * Math.cos((c.lat * Math.PI) / 180)
    const avoid = lms.map(l => ({ x: (l.lon - c.lon) * kx, y: (l.lat - c.lat) * M_PER_DEG_LAT, r: landmarkSize(l) * 0.75 }))
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
    this.scene.add(g)
    this.cities.push({ city: c, pmax, mesh, blds, vis: 0 })
  }

  private buildLandmark(l: Landmark) {
    const obj = buildShape(l.shape, this.store.colorOfLandmark(l))
    if (l.uncertain) obj.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m) { m.transparent = true; m.opacity = 0.45; m.depthWrite = false }
    })
    const g = anchor(l.lon, l.lat)
    g.add(obj)
    obj.visible = false
    this.scene.add(g)
    this.landmarks.push({ lm: l, obj, size: landmarkSize(l), s: 0 })
  }

  private onYear() {
    for (const m of this.cities) m.vis = m.blds.length * Math.sqrt(this.store.pop(m.city) / m.pmax)
    this.map.triggerRepaint()
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
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
      m.blds.forEach((b, k) => {
        const t = b.i < m.vis ? 1 : 0
        b.s = step(b.s, t, b.spd)
        if (Math.abs(t - b.s) > 0.003) animating = true
        const s = b.s * zf
        if (s < 0.003) M.makeScale(0, 0, 0)
        else {
          const xy = b.w * Math.min(1, s * 3)
          M.compose(P.set(b.x, b.y, 0), Q.setFromAxisAngle(Z, b.yaw), S.set(xy, xy, b.h * s))
        }
        m.mesh.setMatrixAt(k, M)
      })
      m.mesh.instanceMatrix.needsUpdate = true
    }
    for (const l of this.landmarks) {
      const t = this.store.landmarkShown(l.lm) ? 1 : 0
      l.s = step(l.s, t, 2.5)
      if (Math.abs(t - l.s) > 0.003) animating = true
      const s = l.s * zf
      l.obj.visible = s > 0.003
      l.obj.scale.set(l.size * Math.min(1, s * 2), l.size * Math.min(1, s * 2), l.size * s)
    }
    this.wasVisible = visible
    if (!visible) return

    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(FLIP_Y)
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
    if (animating) this.map.triggerRepaint()
  }
}
