import { onFarSide } from './farSide'
import { Marker, type Map as MLMap } from 'maplibre-gl'
import type { Landmark } from '../data/schema'
import type { Store } from '../store'
import { fmtPopShort } from '../time'

/** HTML labels (Thai text renders properly here, unlike in WebGL symbol layers). */
export function addLabels(map: MLMap, store: Store, placeOf: (l: Landmark) => [number, number] = l => [l.lon, l.lat]) {
  const cities = store.data.cities.map(c => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'label'
    el.innerHTML = `<i style="background:${store.colorOfCity(c)}"></i><span></span><small></small>`
    el.querySelector('span')!.textContent = c.name
    el.addEventListener('click', e => { e.stopPropagation(); store.select({ kind: 'city', city: c }) })
    const marker = new Marker({ element: el, anchor: 'bottom-left', offset: [6, -4], opacityWhenCovered: '0' })
      .setLngLat([c.lon, c.lat]).addTo(map)
    return { c, el, marker, pop: el.querySelector('small')! }
  })

  const landmarks = store.data.landmarks.map(l => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `label label-lm${l.uncertain ? ' unc' : ''}`
    el.textContent = l.name
    el.addEventListener('click', e => { e.stopPropagation(); store.select({ kind: 'landmark', landmark: l }) })
    const marker = new Marker({ element: el, anchor: 'top', offset: [0, 8], opacityWhenCovered: '0' })
      .setLngLat(placeOf(l)).addTo(map)
    return { l, el, marker }
  })

  const update = () => {
    const z = map.getZoom()
    for (const x of cities) {
      const p = store.pop(x.c)
      x.el.hidden = p < 0.5 || onFarSide(map, x.c.lon, x.c.lat)
      x.el.dataset.rank = String(store.selection?.kind === 'city' && store.selection.city === x.c ? 1e9 : p)
      x.pop.textContent = fmtPopShort(p)
    }
    for (const x of landmarks) x.el.hidden = !(z >= 8 && store.mode === 'city' && store.landmarkShown(x.l))
    scheduleDeclutter()
  }

  // Hide labels that would overlap a more important one: selected city, then bigger cities,
  // then landmarks, and polity names last.
  let pending = 0
  const declutter = () => {
    pending = 0
    const all = [...document.querySelectorAll<HTMLElement>('.label:not([hidden]), .polity:not([hidden])')]
    const weight = (el: HTMLElement) => (el.classList.contains('polity') ? -2 : el.classList.contains('label-lm') ? -1 : Number(el.dataset.rank ?? 0))
    all.sort((a, b) => weight(b) - weight(a))
    const placed: DOMRect[] = []
    for (const el of all) {
      el.style.visibility = ''
      const r = el.getBoundingClientRect()
      const hit = r.width > 0 && placed.some(p => r.left < p.right + 2 && r.right > p.left - 2 && r.top < p.bottom + 1 && r.bottom > p.top - 1)
      if (hit) el.style.visibility = 'hidden'
      else placed.push(r)
    }
  }
  const scheduleDeclutter = () => { if (!pending) pending = requestAnimationFrame(declutter) }
  const highlight = () => {
    const s = store.selection
    for (const x of cities) x.el.classList.toggle('sel', s?.kind === 'city' && s.city === x.c)
    for (const x of landmarks) x.el.classList.toggle('sel', s?.kind === 'landmark' && s.landmark === x.l)
  }
  store.on('year', update)
  store.on('mode', update)
  store.on('uncertain', update)
  store.on('select', () => { highlight(); update() })
  store.on('borders', scheduleDeclutter)
  map.on('zoomend', update)
  map.on('moveend', update)
  map.on('move', scheduleDeclutter)
  update()

  let pulse: Marker | null = null
  return {
    pulseAt(lng: number, lat: number) {
      pulse?.remove()
      const el = document.createElement('div')
      el.className = 'pulse'
      // the ring animates transform, so it must not be the marker element MapLibre positions with transform
      el.appendChild(document.createElement('i'))
      pulse = new Marker({ element: el, opacityWhenCovered: '0' }).setLngLat([lng, lat]).addTo(map)
      const mine = pulse
      setTimeout(() => { if (pulse === mine) { mine.remove(); pulse = null } }, 6000)
    },
  }
}
