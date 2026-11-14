import { Map as MapLibre, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import { loadLocalized } from './data/load'
import { LOCALES, applyStatic, locale, switchLocale, t, takeResume, type Locale } from './i18n'
import { DataError, type City, type HistEvent, type Landmark } from './data/schema'
import { Store, type Selection } from './store'
import { style } from './map/style'
import { loadLandMask } from './map/landMask'
import { Cities3D, cityRadius, landmarkSize } from './map/cities3d'
import { addCityGlow } from './map/cityGlow'
import { Borders } from './map/borders'
import { addLabels } from './map/labels'
import { setupUI } from './ui'

const BASE = import.meta.env.BASE_URL
// bundle the worker ourselves so it is emitted in production builds
setWorkerUrl(workerUrl)

const reveal = () => document.documentElement.classList.remove('booting')
const within = (ms: number, p: Promise<unknown>) => Promise.race([p, new Promise(r => setTimeout(r, ms))])

function showDataError(problems: string[]) {
  reveal()
  const el = document.getElementById('data-error')!
  el.hidden = false
  el.innerHTML = `<h2>${t.dataError(problems.length)}</h2><p>${t.dataErrorHint}</p><ul>${problems.map(p => `<li></li>`).join('')}</ul>`
  el.querySelectorAll('li').forEach((li, i) => (li.textContent = problems[i]))
}

function findSelection(store: Store, sel: Resume['sel']): Selection {
  const city = sel?.kind === 'city' ? store.cityById.get(sel.id) : undefined
  if (city) return { kind: 'city', city }
  const landmark = sel?.kind === 'landmark' ? store.data.landmarks.find(l => l.id === sel.id) : undefined
  if (landmark) return { kind: 'landmark', landmark }
  const event = sel?.kind === 'event' ? store.data.events.find(e => e.id === sel.id) : undefined
  return event ? { kind: 'event', event } : null
}

interface Resume { year: number; lng: number; lat: number; zoom: number; pitch: number; bearing: number; sel?: { kind: string; id: string } }

async function start() {
  applyStatic()
  let store: Store
  try {
    store = new Store(await loadLocalized(locale))
  } catch (e) {
    if (e instanceof DataError) return showDataError(e.problems)
    throw e
  }
  const { timeline } = store.data
  const resume = takeResume<Resume>()
  if (resume) store.setYear(resume.year)

  const map = new MapLibre({
    container: 'map',
    style,
    center: resume ? [resume.lng, resume.lat] : [timeline.initialView.lon, timeline.initialView.lat],
    zoom: resume?.zoom ?? timeline.initialView.zoom,
    pitch: resume?.pitch ?? 0,
    bearing: resume?.bearing ?? 0,
    maxPitch: 70,
    attributionControl: { compact: true, customAttribution: 'Borders: <a href="https://github.com/aourednik/historical-basemaps">historical-basemaps</a>' },
  })
  if (import.meta.env.DEV) Object.assign(window, { __map: map, __store: store })
  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')

  const ease = (target: { lng: number; lat: number; zoom: number; pitch?: number }) => {
    store.setPlaying(false)
    map.flyTo({ center: [target.lng, target.lat], zoom: target.zoom, pitch: target.pitch ?? 0, bearing: target.pitch ? -18 : 0, speed: 1.1, curve: 1.5, essential: true })
  }
  // zoom so a span of `meters` covers about 45% of the shorter side of the screen
  const zoomFor = (meters: number, lat: number) => {
    const px = Math.min(innerWidth, innerHeight) * 0.45
    return Math.log2((40075016 * Math.cos((lat * Math.PI) / 180) * px) / (512 * meters))
  }

  const actions = {
    goToCity(c: City) {
      ease({ lng: c.lon, lat: c.lat, zoom: Math.min(13, zoomFor(cityRadius(store.pmax.get(c.id)!) * 2.6, c.lat)), pitch: 55 })
    },
    goToLandmark(l: Landmark) {
      if (!store.landmarkStanding(l)) store.setYear(l.built + 10)
      ease({ lng: l.lon, lat: l.lat, zoom: Math.min(14, zoomFor(landmarkSize(l) * 5, l.lat)), pitch: 60 })
    },
    goToEvent(e: HistEvent) {
      store.setPlaying(false)
      store.setYear(e.year)
      store.select({ kind: 'event', event: e })
      const place = store.eventPlace(e)
      if (!place) return
      if (place.zoom !== undefined) ease({ lng: place.lng, lat: place.lat, zoom: place.zoom, pitch: place.zoom > 7 ? 55 : 0 })
      else if (place.city) actions.goToCity(place.city)
      labels.pulseAt(place.lng, place.lat)
    },
  }

  const { showToast } = setupUI(store, actions)

  const langSel = document.getElementById('lang') as HTMLSelectElement
  langSel.innerHTML = Object.entries(LOCALES).map(([k, label]) => `<option value="${k}">${label}</option>`).join('')
  langSel.value = locale
  langSel.addEventListener('change', () => {
    const s = store.selection
    const sel = s ? { kind: s.kind, id: s.kind === 'city' ? s.city.id : s.kind === 'landmark' ? s.landmark.id : s.event.id } : undefined
    const c = map.getCenter()
    switchLocale(langSel.value as Locale, { year: store.year, lng: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), sel } satisfies Resume)
  })
  let labels: ReturnType<typeof addLabels>

  await map.once('load')
  const isLand = await loadLandMask(`${BASE}geo/land-10m.json`)
  addCityGlow(map, store, id => store.select({ kind: 'city', city: store.cityById.get(id)! }))
  const cities3d = new Cities3D(store, isLand)
  map.addLayer(cities3d)
  if (import.meta.env.DEV) Object.assign(window, { __c3d: cities3d })
  await new Borders(map, store, `${BASE}geo/borders`).init('water')
  labels = addLabels(map, store, l => cities3d.placeOf(l))

  let last = 0
  // not rounded: where a frame moves less than half a year (stretched scale, 120 Hz), rounding stalled playback
  let head = store.scale.toPos(store.year)
  const loop = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    if (store.playing) {
      const prev = store.year
      // the slider or an event jump moved the year
      if (Math.round(store.scale.toYear(head)) !== prev) head = store.scale.toPos(prev)
      const pos = (head = Math.min(1, head + dt / timeline.playSeconds))
      const next = Math.round(store.scale.toYear(pos))
      const crossed = store.data.events.filter(e => e.year > prev && e.year <= next && store.shows(e))
      const stopAt = store.stopAtEvents ? crossed.find(e => e.importance === 3) : undefined
      if (stopAt) actions.goToEvent(stopAt)
      else {
        store.setYear(next)
        const big = crossed.filter(e => e.importance >= 2).pop()
        if (big) {
          showToast(big)
          const p = store.eventPlace(big)
          if (p) labels.pulseAt(p.lng, p.lat)
        }
        if (pos >= 1) store.setPlaying(false)
      }
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  if (resume) store.select(findSelection(store, resume.sel))
  // on a phone the card would cover most of the map before the user has done anything
  else if (!matchMedia('(max-width: 680px), (max-height: 520px)').matches)
    store.select({ kind: 'city', city: store.cityById.get('athens') ?? store.data.cities[0] })

  // wait for fonts and the first border draw so the page doesn't build itself up on screen
  await within(2500, Promise.all([document.fonts.ready, map.once('idle')]))
  reveal()
}

void start()
