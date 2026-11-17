import type { IControl, Map as MapLibre } from 'maplibre-gl'
import { t } from './i18n'

const MAX_PITCH = 70
const ROTATE_STEP = 45
const TILT_STEP = 15
const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`
const ICONS = {
  left: icon('M5 12a7 7 0 1 0 2-5M5 4v4h4'),
  right: icon('M19 12a7 7 0 1 1-2-5M19 4v4h-4'),
  // a ground square seen in perspective (tilt for 3D) and straight from above
  up: icon('M7.5 7h9L21 18H3z'),
  down: icon('M5 5h14v14H5z'),
}

/** Rotate, tilt and reset buttons, with a compass needle on the reset button that shows the current bearing. */
export class CameraControl implements IControl {
  private el = document.createElement('div')
  private needle!: SVGElement
  private map?: MapLibre

  constructor(private orbit?: Orbit) {}

  onAdd(map: MapLibre) {
    this.map = map
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group camera-ctl'
    const btn = (key: string, label: string, html: string, run: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `cam-${key}`
      b.title = label
      b.setAttribute('aria-label', label)
      b.innerHTML = html
      b.addEventListener('click', run)
      this.el.append(b)
      return b
    }
    const ease = (o: { bearing?: number; pitch?: number }) => map.easeTo({ ...o, duration: 350, essential: true })
    // while orbiting, an ease would be cut short by the next frame of the orbit, so the orbit takes the change
    const turn = (deg: number) => this.orbit?.nudge({ turn: deg }) || ease({ bearing: map.getBearing() + deg })
    const tilt = (deg: number) => {
      const pitch = Math.max(0, Math.min(MAX_PITCH, (this.orbit?.pitch ?? map.getPitch()) + deg))
      if (!this.orbit?.nudge({ pitch })) ease({ pitch })
    }
    const reset = btn('reset', t.camReset, '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="needle"><path class="n" d="M12 3l3.5 9h-7z"/><path class="s" d="M12 21l-3.5-9h7z"/></g></svg>',
      () => { this.orbit?.stop(); ease({ bearing: 0, pitch: 0 }) })
    this.needle = reset.querySelector('.needle')!
    btn('left', t.camLeft, ICONS.left, () => turn(-ROTATE_STEP))
    btn('right', t.camRight, ICONS.right, () => turn(ROTATE_STEP))
    btn('up', t.camTilt, ICONS.up, () => tilt(TILT_STEP))
    btn('down', t.camFlat, ICONS.down, () => tilt(-TILT_STEP))
    map.on('rotate', this.sync)
    map.on('pitch', this.sync)
    this.sync()
    return this.el
  }

  onRemove() {
    this.map?.off('rotate', this.sync)
    this.map?.off('pitch', this.sync)
    this.el.remove()
  }

  private sync = () => {
    const m = this.map!
    // squash the needle with the tilt, as MapLibre's own compass does
    this.needle.style.transform = `scale(1, ${1 / Math.cos((m.getPitch() * Math.PI) / 180) ** 0.5}) rotate(${-m.getBearing()}deg)`
  }
}

/**
 * Slowly circles the camera round a point until the user touches the map. The year can still be changed
 * or played meanwhile, so a model can be watched changing through the ages.
 */
export class Orbit {
  private id: string | null = null
  private flying = false
  private last = 0
  private raf = 0
  private listeners = new Set<(id: string | null) => void>()
  private target = { pitch: 60, turn: 0 }

  constructor(private map: MapLibre) {
    const canvas = map.getCanvasContainer()
    for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const) canvas.addEventListener(ev, () => this.stop(), { passive: true })
    addEventListener('keydown', e => {
      if (/^(Arrow|Page)|^[-+=_]$/.test(e.key) && !(e.target as HTMLElement).matches('input, textarea, select')) this.stop()
    })
    map.on('moveend', () => {
      if (!this.flying || !this.id) return
      this.flying = false
      this.last = 0
      this.raf = requestAnimationFrame(this.spin)
    })
  }

  get current() { return this.id }
  get pitch() { return this.id ? this.target.pitch : undefined }

  /** Steers a running orbit; false when there is none. */
  nudge(o: { pitch?: number; turn?: number }) {
    if (!this.id) return false
    if (o.pitch !== undefined) this.target.pitch = o.pitch
    this.target.turn += o.turn ?? 0
    return true
  }

  onChange(f: (id: string | null) => void) { this.listeners.add(f) }

  start(id: string, center: [number, number], zoom: number) {
    this.stop()
    this.id = id
    this.flying = true
    this.target = { pitch: 60, turn: 0 }
    this.emit()
    this.map.flyTo({ center, zoom, pitch: 60, speed: 1.1, curve: 1.5, essential: true })
  }

  stop() {
    if (!this.id) return
    this.id = null
    this.flying = false
    cancelAnimationFrame(this.raf)
    this.emit()
  }

  private spin = (now: number) => {
    if (!this.id) return
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
    this.last = now
    const secs = matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 40
    // ease toward any tilt or extra turn asked for by the camera buttons
    const k = Math.min(1, dt * 6), turn = this.target.turn * k
    this.target.turn -= turn
    const pitch = this.map.getPitch() + (this.target.pitch - this.map.getPitch()) * k
    this.map.jumpTo({ bearing: this.map.getBearing() + (dt * 360) / secs + turn, pitch })
    this.raf = requestAnimationFrame(this.spin)
  }

  private emit() { for (const f of this.listeners) f(this.id) }
}
