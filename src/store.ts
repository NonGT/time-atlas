import type { City, Civilization, Dataset, HistEvent, Landmark } from './data/schema'
import { TimeScale, valueAt } from './time'

export type Mode = 'city' | 'glow'
export type Selection =
  | { kind: 'city'; city: City }
  | { kind: 'landmark'; landmark: Landmark }
  | { kind: 'event'; event: HistEvent }
  | null

type Events = { year: number; mode: Mode; borders: boolean; uncertain: boolean; select: Selection; play: boolean }
type Handler<T> = (v: T) => void

export class Store {
  readonly scale: TimeScale
  readonly civ = new Map<string, Civilization>()
  readonly cityById = new Map<string, City>()
  readonly pmax = new Map<string, number>()
  year: number
  mode: Mode = 'city'
  borders = true
  uncertain = true
  stopAtEvents = true
  playing = false
  selection: Selection = null
  private handlers: { [k: string]: ((v: unknown) => void)[] } = {}

  constructor(readonly data: Dataset) {
    this.scale = new TimeScale(data.timeline.scale)
    this.year = data.timeline.initialYear
    for (const c of data.civilizations) this.civ.set(c.id, c)
    for (const c of data.cities) {
      this.cityById.set(c.id, c)
      this.pmax.set(c.id, Math.max(...c.population.map(p => p[1])))
    }
  }

  on<K extends keyof Events>(k: K, fn: Handler<Events[K]>) {
    ;(this.handlers[k] ??= []).push(fn as (v: unknown) => void)
  }
  private emit<K extends keyof Events>(k: K, v: Events[K]) {
    for (const fn of this.handlers[k] ?? []) fn(v)
  }

  setYear(y: number) {
    const t = this.data.timeline
    const v = Math.min(t.end, Math.max(t.start, Math.round(y)))
    if (v === this.year) return
    this.year = v
    this.emit('year', v)
  }
  setMode(m: Mode) { this.mode = m; this.emit('mode', m) }
  setBorders(b: boolean) { this.borders = b; this.emit('borders', b) }
  setUncertain(u: boolean) {
    this.uncertain = u
    const s = this.selection
    if (!u && s && s.kind !== 'city' && (s.kind === 'event' ? s.event : s.landmark).uncertain) this.select(null)
    this.emit('uncertain', u)
  }
  shows(x: HistEvent | Landmark) { return this.uncertain || !x.uncertain }
  setPlaying(p: boolean) { this.playing = p; this.emit('play', p) }
  select(s: Selection) { this.selection = s; this.emit('select', s) }

  pop(c: City, y = this.year) { return valueAt(c.population, y) }
  colorOfCity(c: City) { return this.civ.get(c.civ)!.color }
  colorOfLandmark(l: Landmark) {
    if (l.civ) return this.civ.get(l.civ)!.color
    return this.colorOfCity(this.cityById.get(l.city!)!)
  }
  landmarkStanding(l: Landmark, y = this.year) { return y >= l.built && (l.gone === undefined || y < l.gone) }
  landmarkShown(l: Landmark) { return this.shows(l) && this.landmarkStanding(l) }
  firstYear(c: City) { return c.population.find(p => p[1] > 0)?.[0] ?? c.population[0][0] }

  eventPlace(e: HistEvent): { lng: number; lat: number; zoom?: number; city?: City } | null {
    const city = e.city ? this.cityById.get(e.city) : undefined
    if (e.lat !== undefined && e.lon !== undefined) return { lng: e.lon, lat: e.lat, zoom: e.zoom, city }
    if (city) return { lng: city.lon, lat: city.lat, zoom: e.zoom, city }
    return null
  }
}
