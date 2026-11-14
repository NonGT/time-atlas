import type { City, HistEvent, Landmark, Tag } from './data/schema'
import type { Store } from './store'
import { setupTimeline } from './timeline'
import { fmtBE, fmtPop, fmtPopShort, fmtYear, valueAt } from './time'
import { t } from './i18n'

const TAG_COLOR: Record<Tag, string> = {
  founding: '#f0b35e',
  culture: '#8fb3e0',
  war: '#e5786a',
  tech: '#7fcfb4',
  religion: '#c9a2ea',
  politics: '#d9cfa8',
  disaster: '#a7b0b8',
}
export const TAG_INFO = Object.fromEntries(
  Object.entries(TAG_COLOR).map(([k, color]) => [k, { name: t.tags[k as Tag], color }]),
) as Record<Tag, { name: string; color: string }>

/** "1914–1918", or the span of possible years for an uncertain one */
export const eventWhen = (e: HistEvent) =>
  e.range ? t.about + fmtSpan(e.range) : e.end !== undefined ? fmtSpan([e.year, e.end]) : fmtYear(e.year)

export const fmtSpan = ([a, b]: [number, number]) => t.span(a, b)

export interface Actions {
  goToCity(c: City): void
  goToLandmark(l: Landmark): void
  goToEvent(e: HistEvent): void
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function setupUI(store: Store, act: Actions) {
  const { data, scale } = store
  const tl = data.timeline

  const modeBtns = document.querySelectorAll<HTMLButtonElement>('[data-mode]')
  const syncMode = () => modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === store.mode)))
  modeBtns.forEach(b => b.addEventListener('click', () => store.setMode(b.dataset.mode as 'city' | 'glow')))
  store.on('mode', syncMode)
  syncMode()
  $<HTMLInputElement>('opt-borders').addEventListener('change', e => store.setBorders((e.target as HTMLInputElement).checked))
  $<HTMLInputElement>('opt-unc').addEventListener('change', e => store.setUncertain((e.target as HTMLInputElement).checked))
  $<HTMLInputElement>('opt-stop').addEventListener('change', e => (store.stopAtEvents = (e.target as HTMLInputElement).checked))

  const timeline = setupTimeline(store, e => act.goToEvent(e))
  // panels above the timeline sit on its real height, which changes with wrapping and screen size
  const tlPanel = document.querySelector<HTMLElement>('.timeline')!
  new ResizeObserver(() => document.documentElement.style.setProperty('--tl-h', `${tlPanel.offsetHeight}px`)).observe(tlPanel)

  const eventNow = $<HTMLButtonElement>('event-now')
  let currentEvent: HistEvent | null = null
  eventNow.addEventListener('click', () => currentEvent && act.goToEvent(currentEvent))

  const renderYear = () => {
    const y = store.year
    timeline.onYear()
    $('y-main').textContent = fmtYear(y)
    $('y-be').textContent = fmtBE(y)
    currentEvent = null
    for (const e of data.events) if (e.year <= y && store.shows(e)) currentEvent = e
    eventNow.hidden = !currentEvent
    if (currentEvent) eventNow.innerHTML = `<b>${fmtYear(currentEvent.year)}</b>${esc(currentEvent.title)}`
    renderRank()
    renderInfo()
  }

  const playBtn = $<HTMLButtonElement>('play')
  playBtn.addEventListener('click', () => {
    if (!store.playing && store.year >= tl.end) store.setYear(tl.start)
    store.setPlaying(!store.playing)
  })
  store.on('play', p => {
    playBtn.querySelector('span')!.textContent = p ? t.pause : t.play
    playBtn.querySelector('path')!.setAttribute('d', p ? 'M2 1h3v10H2zM7 1h3v10H7z' : 'M2 1l9 5-9 5z')
  })
  $('prev-ev').addEventListener('click', () => {
    const e = [...data.events].reverse().find(e => e.year < store.year && store.shows(e))
    if (e) act.goToEvent(e)
  })
  $('next-ev').addEventListener('click', () => {
    const e = data.events.find(e => e.year > store.year && store.shows(e))
    if (e) act.goToEvent(e)
  })

  const rank = $('rank')
  const renderRank = () => {
    const top = data.cities.map(c => ({ c, p: store.pop(c) })).filter(x => x.p >= 0.5).sort((a, b) => b.p - a.p).slice(0, 7)
    const sel = store.selection?.kind === 'city' ? store.selection.city : null
    rank.innerHTML = top.length
      ? top.map(({ c, p }) => `<li><button type="button" data-id="${c.id}" class="${c === sel ? 'sel' : ''}"><span class="n"><i style="background:${store.colorOfCity(c)}"></i>${esc(c.name)}</span><b>${fmtPopShort(p)}</b><span class="bar"><u style="width:${Math.sqrt(p / top[0].p) * 100}%;background:${store.colorOfCity(c)}"></u></span></button></li>`).join('')
      : `<li class="empty">${t.noCities}</li>`
  }
  rank.addEventListener('click', e => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id
    const c = id && store.cityById.get(id)
    if (c) { store.select({ kind: 'city', city: c }); act.goToCity(c) }
  })

  const info = $('info')
  const body = $('info-body')
  $('info-x').addEventListener('click', () => store.select(null))

  // Thai has no spaces between words and browsers sometimes split a word, so only break at the spaces in a name
  const heading = (s: string) => s.split(' ').map(w => `<span class="w">${esc(w)}</span>`).join(' ')
  const pill = (text: string, cls: string) => `<span class="pill ${cls}">${text}</span>`
  const uncNote = (u?: string) => (u ? `<div class="unc-note"><b>${t.uncertain}</b>${esc(u)}</div>` : '')
  // the English name under the heading, unless the heading already is the English name
  const alsoEn = (name: string, en?: string) => (en && en !== name ? esc(en) : '')
  const cityStatus = (c: City) => {
    const y = store.year, cur = store.pop(c), pmax = store.pmax.get(c.id)!
    const last = c.population[c.population.length - 1][0]
    const later = store.pop(c, y + 60)
    if (y < store.firstYear(c)) return pill(t.notFounded, 'none')
    if (cur < 0.05) return pill(t.abandoned, 'none')
    if (cur >= pmax * 0.92) return pill(t.atPeak, 'peak')
    if (y < last && later > cur * 1.04) return pill(t.growing, 'up')
    if (y < last && later < cur * 0.96) return pill(t.declining, 'down')
    return pill(t.stable, 'none')
  }

  // a single chunk wider than the card (a long proper noun) would be split mid-word, so shrink the heading instead
  const fitHeading = () => {
    const h = body.querySelector<HTMLElement>('h2')
    if (!h) return
    h.style.fontSize = ''
    for (let size = parseFloat(getComputedStyle(h).fontSize); size > 15; size -= 1) {
      const lh = parseFloat(getComputedStyle(h).lineHeight)
      if (![...h.querySelectorAll('.w')].some(w => w.getBoundingClientRect().height > lh * 1.5)) break
      h.style.fontSize = `${size - 1}px`
    }
  }

  const renderInfo = () => {
    const s = store.selection
    info.hidden = !s
    if (!s) return
    renderBody(s)
    fitHeading()
  }
  const renderBody = (s: NonNullable<typeof store.selection>) => {
    if (s.kind === 'city') {
      const c = s.city
      const lms = data.landmarks.filter(l => l.city === c.id && store.shows(l))
      body.innerHTML = `
        <p class="eyebrow">${t.city}</p>
        <h2>${heading(c.name)}</h2>
        <div class="sub">${[alsoEn(c.name, c.en), esc(store.civ.get(c.civ)!.name)].filter(Boolean).join(' · ')}</div>
        <div class="stat"><span class="pop">${fmtPop(store.pop(c))}</span>${cityStatus(c)}</div>
        <canvas class="city-spark"></canvas>
        ${c.desc ? `<p>${esc(c.desc)}</p>` : ''}
        ${c.peak ? `<div class="meta">${t.largest(esc(c.peak), fmtPop(store.pmax.get(c.id)!).replace('≈ ', ''))}</div>` : ''}
        ${lms.length ? `<div class="links">${lms.map(l => `<button type="button" class="chip" data-lm="${l.id}">${esc(l.name)}</button>`).join('')}</div>` : ''}
        <button type="button" class="go" data-go>${t.zoomToCity}</button>`
      drawCitySpark(body.querySelector('canvas')!, c)
      body.querySelector('[data-go]')!.addEventListener('click', () => act.goToCity(c))
      body.querySelectorAll<HTMLElement>('[data-lm]').forEach(b => b.addEventListener('click', () => {
        const l = data.landmarks.find(x => x.id === b.dataset.lm)!
        store.select({ kind: 'landmark', landmark: l }); act.goToLandmark(l)
      }))
    } else if (s.kind === 'landmark') {
      const l = s.landmark
      const city = l.city ? store.cityById.get(l.city) : undefined
      const status = store.year < l.built ? pill(t.notBuilt, 'none') : store.landmarkStanding(l) ? pill(t.standing, 'up') : pill(t.destroyed, 'down')
      body.innerHTML = `
        <p class="eyebrow">${t.landmark}</p>
        <h2>${heading(l.name)}</h2>
        <div class="sub">${[alsoEn(l.name, l.en), city ? esc(city.name) : ''].filter(Boolean).join(' · ')}</div>
        <div class="stat"><span class="pop">${t.built(fmtYear(l.built), !!l.builtRange)}</span>${status}</div>
        ${l.builtRange ? `<div class="meta">${t.maybeBuilt(fmtSpan(l.builtRange))}</div>` : ''}
        ${l.gone !== undefined ? `<div class="meta">${l.goneRange ? t.goneSpan(fmtSpan(l.goneRange), fmtYear(l.gone)) : t.gone(fmtYear(l.gone))}</div>` : ''}
        ${l.desc ? `<p>${esc(l.desc)}</p>` : ''}
        ${uncNote(l.uncertain)}
        <figure class="lm-photo" hidden><a target="_blank" rel="noopener"><img alt=""></a><figcaption></figcaption></figure>
        <div class="meta">${t.realSize(l.size.toLocaleString('en-US'))}</div>
        <button type="button" class="go" data-go>${t.goLook}</button>`
      body.querySelector('[data-go]')!.addEventListener('click', () => act.goToLandmark(l))
      const google = document.createElement('a')
      google.className = 'go ghost'
      google.target = '_blank'; google.rel = 'noopener'
      google.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(l.en ?? l.name)}`
      google.textContent = t.googleImages
      body.querySelector('[data-go]')!.after(google)
      void showPhoto(l)
    } else {
      const e = s.event
      const place = store.eventPlace(e)
      body.innerHTML = `
        <p class="eyebrow" style="color:${TAG_INFO[e.tag].color}">${TAG_INFO[e.tag].name}</p>
        <h2>${heading(e.title)}</h2>
        <div class="sub">${[eventWhen(e), e.range || e.end !== undefined ? '' : fmtBE(e.year), place?.city ? esc(place.city.name) : ''].filter(Boolean).join(' · ')}</div>
        ${e.desc ? `<p>${esc(e.desc)}</p>` : ''}
        ${uncNote(e.uncertain)}
        ${place ? `<button type="button" class="go" data-go>${t.goToPlace}</button>` : ''}`
      body.querySelector('[data-go]')?.addEventListener('click', () => act.goToEvent(e))
    }
  }

  interface Photo { src: string; page: string; title: string; file: string; artist: string; license: string; licenseUrl?: string }
  const text = (html = '') => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? ''
  const httpUrl = (u?: string) => (u && /^https?:\/\//.test(u) ? u : undefined)

  // Most Commons photos are CC BY-SA, so a photo is only shown when its author and licence could be fetched.
  const loadPhoto = async (title: string): Promise<Photo | null> => {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`)
    const j = r.ok ? await r.json() : null
    const original: string | undefined = j?.originalimage?.source
    if (!j?.thumbnail || !original || j.type === 'disambiguation') return null
    // either .../commons/a/ab/NAME or .../commons/thumb/a/ab/NAME/3840px-NAME?query
    const parts = new URL(original).pathname.split('/')
    const t = parts.indexOf('thumb')
    const name = decodeURIComponent(t >= 0 ? parts[t + 3] : parts[parts.length - 1])
    const q = new URLSearchParams({
      action: 'query', titles: `File:${name}`, prop: 'imageinfo', iiprop: 'extmetadata|url',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl', format: 'json', origin: '*',
    })
    const m = await (await fetch(`https://en.wikipedia.org/w/api.php?${q}`)).json()
    const info = (Object.values(m?.query?.pages ?? {})[0] as { imageinfo?: { descriptionurl: string; extmetadata: Record<string, { value: string }> }[] })?.imageinfo?.[0]
    const meta = info?.extmetadata
    const license = text(meta?.LicenseShortName?.value)
    if (!info || !license) return null
    return {
      src: j.thumbnail.source, page: j.content_urls.desktop.page, title: j.title,
      file: info.descriptionurl, artist: text(meta?.Artist?.value), license, licenseUrl: httpUrl(meta?.LicenseUrl?.value),
    }
  }
  const photos = new Map<string, Promise<Photo | null>>()
  const fetchPhoto = (title: string) => {
    let p = photos.get(title)
    if (!p) {
      p = loadPhoto(title).catch(() => { photos.delete(title); return null })
      photos.set(title, p)
    }
    return p
  }
  const showPhoto = async (l: Landmark) => {
    const title = l.wiki ?? l.en
    if (!title) return
    const photo = await fetchPhoto(title)
    const s = store.selection
    const fig = body.querySelector<HTMLElement>('.lm-photo')
    if (!photo || !fig || s?.kind !== 'landmark' || s.landmark !== l) return
    const img = fig.querySelector('img')!
    img.onload = () => (fig.hidden = false)
    img.src = photo.src
    img.alt = l.name
    fig.querySelector('a')!.href = photo.file
    const link = (href: string, label: string) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`
    const lic = photo.licenseUrl ? link(photo.licenseUrl, photo.license) : esc(photo.license)
    fig.querySelector('figcaption')!.innerHTML =
      t.photoBy(`${photo.artist ? `${esc(photo.artist)} · ` : ''}${lic} · ${link(photo.file, 'Wikimedia Commons')}`) +
      `<br>${t.photoFrom(link(photo.page, `Wikipedia: ${photo.title}`))}`
  }

  const drawCitySpark = (cv: HTMLCanvasElement, c: City) => {
    const dpr = Math.min(devicePixelRatio, 2), W = cv.offsetWidth, H = cv.offsetHeight
    if (!W) return
    cv.width = W * dpr; cv.height = H * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    const pmax = store.pmax.get(c.id)!, color = store.colorOfCity(c)
    const ys = (p: number) => H - 3 - (p / pmax) * (H - 8)
    g.strokeStyle = 'rgba(222,204,168,.16)'
    g.beginPath(); g.moveTo(0, H - 2.5); g.lineTo(W, H - 2.5); g.stroke()
    g.beginPath()
    for (let i = 0; i <= 250; i++) { const x = (i / 250) * W, y = ys(valueAt(c.population, scale.toYear(i / 250))); i ? g.lineTo(x, y) : g.moveTo(x, y) }
    g.strokeStyle = color; g.lineWidth = 1.5; g.stroke()
    g.lineTo(W, H - 3); g.lineTo(0, H - 3); g.closePath()
    g.globalAlpha = 0.16; g.fillStyle = color; g.fill(); g.globalAlpha = 1
    const x = scale.toPos(store.year) * W
    g.strokeStyle = 'rgba(240,179,94,.8)'; g.setLineDash([2, 2])
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([])
    g.fillStyle = '#f0b35e'; g.beginPath(); g.arc(x, ys(store.pop(c)), 3, 0, 7); g.fill()
  }

  const toast = $('toast')
  let toastTimer = 0
  const showToast = (e: HistEvent) => {
    toast.innerHTML = `<b style="color:${TAG_INFO[e.tag].color}">${fmtYear(e.year)}</b>${esc(e.title)}`
    toast.hidden = false
    toast.onclick = () => act.goToEvent(e)
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => (toast.hidden = true), 4500)
  }

  store.on('year', renderYear)
  store.on('select', () => { renderInfo(); renderRank() })
  store.on('uncertain', renderYear)

  addEventListener('keydown', e => {
    const t = e.target as HTMLElement
    if (t.matches('input, textarea, select') || e.metaKey || e.ctrlKey) return
    if (e.key === ' ' && !t.matches('button')) { e.preventDefault(); playBtn.click() }
    else if (e.key === 'Escape') store.select(null)
  })

  renderYear()
  return { showToast }
}
