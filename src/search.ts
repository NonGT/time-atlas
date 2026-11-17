import type { City, Landmark } from './data/schema'
import type { Store } from './store'
import type { Actions } from './ui'
import { fmtYear } from './time'
import { t } from './i18n'

type Hit = { kind: 'city'; item: City } | { kind: 'landmark'; item: Landmark }
interface Entry { hit: Hit; keys: string[] }

const MAX = 8
// Latin accents only: Thai vowels and tone marks are combining marks too and must stay
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_]/g, ' ').trim()
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function score(keys: string[], q: string) {
  let best = 0
  for (const k of keys) {
    if (k === q) return 4
    if (k.startsWith(q)) best = Math.max(best, 3)
    else if (k.includes(' ' + q)) best = Math.max(best, 2)
    else if (k.includes(q)) best = Math.max(best, 1)
  }
  return best
}

/** Place search with autocomplete. Cmd/Ctrl+F jumps to it instead of the browser's find. */
export function setupSearch(store: Store, act: Actions) {
  const input = document.getElementById('search') as HTMLInputElement
  const list = document.getElementById('search-list') as HTMLUListElement
  input.placeholder = t.searchHint
  input.setAttribute('aria-label', t.search)
  document.getElementById('search-kbd')!.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘F' : 'Ctrl F'

  const entries: Entry[] = [
    ...store.data.cities.map(c => ({ hit: { kind: 'city', item: c } as Hit, keys: [c.name, c.en, c.id].map(norm) })),
    ...store.data.landmarks.map(l => ({ hit: { kind: 'landmark', item: l } as Hit, keys: [l.name, l.en ?? '', l.id].filter(Boolean).map(norm) })),
  ]
  let hits: Hit[] = []
  let active = -1

  const render = () => {
    list.hidden = !hits.length && !input.value.trim()
    if (!hits.length) {
      list.innerHTML = input.value.trim() ? `<li class="none">${t.searchNone}</li>` : ''
      input.setAttribute('aria-expanded', String(!list.hidden))
      return
    }
    list.innerHTML = hits.map((h, i) => {
      const it = h.item
      const en = it.en && it.en !== it.name ? ` · ${esc(it.en)}` : ''
      const when = h.kind === 'city' ? fmtYear(store.firstYear(h.item)) : fmtYear(h.item.built)
      return `<li role="option" id="sr-${i}" aria-selected="${i === active}" data-i="${i}">` +
        `<span class="nm">${esc(it.name)}</span><span class="dt">${h.kind === 'city' ? t.searchCity : t.searchLandmark} · ${when}${en}</span></li>`
    }).join('')
    input.setAttribute('aria-expanded', 'true')
    if (active >= 0) input.setAttribute('aria-activedescendant', `sr-${active}`)
    else input.removeAttribute('aria-activedescendant')
  }

  const find = () => {
    const q = norm(input.value)
    active = -1
    if (!q) { hits = []; return render() }
    hits = entries
      .filter(e => e.hit.kind === 'city' || store.shows(e.hit.item as Landmark))
      .map(e => ({ e, s: score(e.keys, q) }))
      .filter(x => x.s > 0)
      // better match first, then cities before buildings, then shorter names
      .sort((a, b) => b.s - a.s || (a.e.hit.kind === 'city' ? 0 : 1) - (b.e.hit.kind === 'city' ? 0 : 1) || a.e.hit.item.name.length - b.e.hit.item.name.length)
      .slice(0, MAX)
      .map(x => x.e.hit)
    if (hits.length) active = 0
    render()
  }

  const close = () => { hits = []; active = -1; list.hidden = true; input.setAttribute('aria-expanded', 'false') }

  const choose = (h: Hit) => {
    input.value = h.item.name
    close()
    input.blur()
    store.setPlaying(false)
    if (h.kind === 'city') {
      const c = h.item
      // a city that does not exist yet (or any more) is shown at its largest
      if (store.pop(c) < 0.05) store.setYear(c.population.reduce((a, b) => (b[1] > a[1] ? b : a))[0])
      store.select({ kind: 'city', city: c })
      act.goToCity(c)
    } else {
      store.select({ kind: 'landmark', landmark: h.item })
      act.goToLandmark(h.item)
    }
  }

  input.addEventListener('input', find)
  input.addEventListener('focus', () => { input.select(); if (input.value.trim()) find() })
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return
      e.preventDefault()
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length
      render()
      list.querySelector(`#sr-${active}`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      if (hits[active]) { e.preventDefault(); choose(hits[active]) }
    } else if (e.key === 'Escape') {
      close()
      input.blur()
    }
  })
  // mousedown so the choice lands before the input's blur closes the list
  list.addEventListener('mousedown', e => {
    const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i
    if (i !== undefined) { e.preventDefault(); choose(hits[+i]) }
  })
  input.addEventListener('blur', () => setTimeout(close, 0))

  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      input.focus()
    }
  })
}
