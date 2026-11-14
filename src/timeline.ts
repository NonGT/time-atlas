import type { HistEvent } from './data/schema'
import type { Store } from './store'
import { fmtYear, fmtYearShort, valueAt } from './time'
import { TAG_INFO, eventWhen } from './ui'
import { t } from './i18n'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// narrowest window, as a fraction of the whole slider (about 10–20 years near the present)
const MIN_SPAN = 0.006
// marks closer than this (px) to a bigger one step aside, so minor events appear as the timeline is zoomed
const MARK_GAP = 7
const ZOOM_STEP = 2

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

// The track shows a window [v0, v1] of the slider's 0–1 scale, which can be zoomed and panned.
export function setupTimeline(store: Store, goToEvent: (e: HistEvent) => void) {
  const { data, scale } = store
  const tl = data.timeline
  const track = document.querySelector<HTMLElement>('.track')!
  const slider = $<HTMLInputElement>('slider')
  const erasEl = $('eras'), ticksEl = $('ticks'), marksEl = $('ev-marks'), tip = $('ev-tip')
  const spark = $<HTMLCanvasElement>('spark')
  const mini = $('tl-mini'), win = $('tl-win'), now = $('tl-now')
  const btnIn = $<HTMLButtonElement>('tl-in'), btnOut = $<HTMLButtonElement>('tl-out'), btnFit = $<HTMLButtonElement>('tl-fit')

  let v0 = 0, v1 = 1
  const span = () => v1 - v0
  const vx = (pos: number) => (pos - v0) / span()
  const yearPos = () => scale.toPos(store.year)

  const clampView = (a: number, b: number): [number, number] => {
    const s = Math.min(1, Math.max(MIN_SPAN, b - a))
    const lo = Math.min(1 - s, Math.max(0, a))
    return [lo, lo + s]
  }

  const eraEls = tl.eras.map((e, i) => {
    const el = document.createElement('div')
    el.textContent = e.name
    erasEl.appendChild(el)
    return { el, a: scale.toPos(e.from), b: i < tl.eras.length - 1 ? scale.toPos(tl.eras[i + 1].from) : 1 }
  })

  const markEls = data.events.map(e => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `ev ev-${e.importance}${e.uncertain ? ' unc' : ''}`
    b.style.setProperty('--c', TAG_INFO[e.tag].color)
    b.setAttribute('aria-label', `${fmtYear(e.year)}: ${e.title}`)
    b.addEventListener('click', () => goToEvent(e))
    b.addEventListener('pointerenter', () => {
      tip.innerHTML = `<b>${eventWhen(e)}</b>${esc(e.title)}${e.uncertain ? `<em>${t.uncertain}</em>` : ''}`
      tip.hidden = false
      const r = b.getBoundingClientRect(), tr = tip.getBoundingClientRect()
      tip.style.left = `${Math.min(innerWidth - tr.width - 12, Math.max(12, r.left + r.width / 2 - tr.width / 2))}px`
      tip.style.top = `${r.top - tr.height - 8}px`
    })
    b.addEventListener('pointerleave', () => (tip.hidden = true))
    // a hatched band for possible years, a solid bar for something that lasted
    const span = e.range ?? (e.end !== undefined ? [e.year, e.end] : null)
    let band: { el: HTMLElement; a: number; b: number } | null = null
    if (span) {
      const el = document.createElement('i')
      el.className = e.range ? 'ev-range' : 'ev-span'
      el.style.setProperty('--c', TAG_INFO[e.tag].color)
      marksEl.appendChild(el)
      band = { el, a: scale.toPos(span[0]), b: scale.toPos(span[1]) }
    }
    marksEl.appendChild(b)
    return { e, el: b, pos: scale.toPos(e.year), band }
  })
  // bigger events claim their spot first
  const byImportance = [...markEls].sort((a, b) => b.e.importance - a.e.importance)

  const tickYears = (): number[] => {
    const W = track.offsetWidth
    if (span() > 0.999) return W < 640 ? tl.ticks.filter((_, i) => i % 2 === 1) : tl.ticks
    const ya = scale.toYear(v0), yb = scale.toYear(v1)
    const step = Math.max(1, niceStep((yb - ya) / Math.max(2, Math.floor(W / 90))))
    const out: number[] = []
    let lastX = -Infinity
    // the scale is non-linear, so drop ticks that land too close together
    for (let t = Math.ceil(ya / step) * step; t <= yb; t += step) {
      const x = vx(scale.toPos(t)) * W
      if (x - lastX < 64) continue
      out.push(t)
      lastX = x
    }
    return out
  }

  const drawTicks = () => {
    ticksEl.innerHTML = tickYears().map(t => {
      const x = vx(scale.toPos(t))
      return `<span class="${x < 0.03 ? 'l' : x > 0.97 ? 'r' : ''}" style="left:${x * 100}%">${fmtYearShort(t)}</span>`
    }).join('')
  }

  const totalAt = (y: number) => data.cities.reduce((s, c) => s + valueAt(c.population, y), 0)
  // fixed max so the curve keeps its true height when zoomed in
  let sparkMax = 1
  for (let i = 0; i <= 400; i++) sparkMax = Math.max(sparkMax, totalAt(scale.toYear(i / 400)))

  const drawSpark = () => {
    const dpr = Math.min(devicePixelRatio, 2), W = spark.offsetWidth, H = spark.offsetHeight
    if (!W) return
    spark.width = W * dpr; spark.height = H * dpr
    const g = spark.getContext('2d')!
    g.scale(dpr, dpr)
    const N = 300, vals: number[] = []
    for (let i = 0; i <= N; i++) {
      const y = scale.toYear(v0 + (i / N) * span())
      vals.push(totalAt(y))
    }
    const mx = sparkMax
    g.beginPath()
    vals.forEach((p, i) => { const x = (i / N) * W, y = H - 1 - (p / mx) * (H - 4); i ? g.lineTo(x, y) : g.moveTo(x, y) })
    g.strokeStyle = 'rgba(240,179,94,.75)'; g.lineWidth = 1.2; g.stroke()
    g.lineTo(W, H); g.lineTo(0, H); g.closePath()
    const gr = g.createLinearGradient(0, 0, 0, H)
    gr.addColorStop(0, 'rgba(240,179,94,.26)'); gr.addColorStop(1, 'rgba(240,179,94,0)')
    g.fillStyle = gr; g.fill()
  }

  const syncSlider = () => {
    const x = vx(yearPos())
    if (document.activeElement !== slider || store.playing) slider.value = String(Math.round(Math.min(1, Math.max(0, x)) * 1000))
    slider.classList.toggle('out', x < -0.001 || x > 1.001)
    now.style.left = `${yearPos() * 100}%`
  }

  const layout = () => {
    for (const { el, a, b } of eraEls) {
      const l = Math.max(0, vx(a)), r = Math.min(1, vx(b))
      el.hidden = r <= l
      el.style.left = `${l * 100}%`
      el.style.width = `${(r - l) * 100}%`
    }
    const W = track.offsetWidth || 1
    const taken = new Map<number, number[]>()
    const crowded = (px: number) => {
      const cell = Math.floor(px / MARK_GAP)
      for (let c = cell - 1; c <= cell + 1; c++) if (taken.get(c)?.some(q => Math.abs(q - px) < MARK_GAP)) return true
      return false
    }
    for (const { e, el, pos, band } of byImportance) {
      const x = vx(pos), shown = store.shows(e), px = x * W
      // the very major ones always show, even if they overlap
      const inView = x >= -0.002 && x <= 1.002
      const yields = inView && e.importance < 3 && crowded(px)
      el.hidden = !shown || !inView || yields
      if (!el.hidden) {
        const cell = Math.floor(px / MARK_GAP)
        taken.set(cell, [...(taken.get(cell) ?? []), px])
      }
      el.style.left = `${x * 100}%`
      if (band) {
        const l = Math.max(0, vx(band.a)), r = Math.min(1, vx(band.b))
        band.el.hidden = !shown || yields || r <= l
        band.el.style.left = `${l * 100}%`
        band.el.style.width = `${(r - l) * 100}%`
      }
    }
    drawTicks()
    drawSpark()
    syncSlider()
    win.style.left = `${v0 * 100}%`
    win.style.width = `${span() * 100}%`
    const full = span() > 0.999
    btnFit.disabled = full
    btnOut.disabled = full
    btnIn.disabled = span() <= MIN_SPAN * 1.001
    track.classList.toggle('zoomed', !full)
  }

  let frame = 0
  const setView = (a: number, b: number) => {
    ;[v0, v1] = clampView(a, b)
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; layout() })
  }

  let tween = 0
  const animateTo = (a: number, b: number) => {
    cancelAnimationFrame(tween)
    const [ta, tb] = clampView(a, b), [sa, sb] = [v0, v1], t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 240), e = 1 - (1 - t) ** 3
      setView(sa + (ta - sa) * e, sb + (tb - sb) * e)
      if (t < 1) tween = requestAnimationFrame(step)
    }
    tween = requestAnimationFrame(step)
  }

  /** Scale the window by `k` (<1 zooms in) keeping the point at fraction `f` of the track fixed. */
  const zoomAt = (k: number, f: number, animate = false) => {
    const p = v0 + f * span(), s = span() * k
    const a = p - f * s
    animate ? animateTo(a, a + s) : setView(a, a + s)
  }
  // buttons and keys zoom around the current year when it's in view
  const zoomButton = (k: number) => {
    const x = vx(yearPos())
    zoomAt(k, x >= 0 && x <= 1 ? x : 0.5, true)
  }

  slider.addEventListener('input', () => {
    store.setPlaying(false)
    store.setYear(scale.toYear(v0 + (+slider.value / 1000) * span()))
  })

  const frac = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }

  // trackpad pinch arrives as ctrl+wheel in Chrome/Firefox/Edge; a mouse wheel zooms too
  track.addEventListener('wheel', e => {
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? track.offsetWidth : 1
    const dx = (e.shiftKey ? e.deltaY || e.deltaX : e.deltaX) * unit, dy = e.shiftKey ? 0 : e.deltaY * unit
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) {
      setView(v0 + (dx / track.offsetWidth) * span(), v1 + (dx / track.offsetWidth) * span())
      return
    }
    zoomAt(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0025)), frac(e.clientX, track))
  }, { passive: false })

  // two-finger pinch on touch screens
  let pinch: { d: number; p: number; s: number } | null = null
  const touchInfo = (t: TouchList) => {
    const r = track.getBoundingClientRect()
    return { d: Math.max(20, Math.abs(t[0].clientX - t[1].clientX)), f: ((t[0].clientX + t[1].clientX) / 2 - r.left) / r.width }
  }
  track.addEventListener('touchstart', e => {
    if (e.touches.length !== 2) return
    e.preventDefault()
    const { d, f } = touchInfo(e.touches)
    pinch = { d, p: v0 + f * span(), s: span() }
  }, { passive: false })
  track.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return
    e.preventDefault()
    const { d, f } = touchInfo(e.touches)
    const s = pinch.s * (pinch.d / d)
    setView(pinch.p - f * s, pinch.p - f * s + s)
  }, { passive: false })
  track.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null })

  // One finger on touch screens: the slider can't tell a scrub from a pan, so it ignores touch (see CSS)
  // and this decides. Starting on the thumb scrubs the year, starting elsewhere pans, a tap jumps there.
  const THUMB_REACH = 24, PAN_SLOP = 6
  let drag1: { mode: 'scrub' | 'pending' | 'pan'; x: number; a: number; onMark: boolean; vel: number; lx: number; lt: number } | null = null
  // keep gliding after a flick, slowing down like a normal scroll view
  const fling = (vel: number) => {
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(now - last, 50); last = now
      vel *= Math.pow(0.997, dt)
      const before = v0, a = v0 - (vel * dt / track.offsetWidth) * span()
      setView(a, a + span())
      if (Math.abs(vel) > 0.02 && v0 !== before) tween = requestAnimationFrame(step)
    }
    tween = requestAnimationFrame(step)
  }
  const yearAtX = (clientX: number) => scale.toYear(v0 + frac(clientX, track) * span())
  track.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { drag1 = null; return }
    cancelAnimationFrame(tween)
    const x = e.touches[0].clientX, r = track.getBoundingClientRect()
    const nearThumb = Math.abs(x - (r.left + vx(yearPos()) * r.width)) <= THUMB_REACH
    // marks are dense on a phone, so a drag may well start on one; away from the thumb a plain tap still clicks it
    const onMark = !nearThumb && !!(e.target as HTMLElement).closest('.ev')
    if (!onMark) e.preventDefault()
    drag1 = { mode: nearThumb ? 'scrub' : 'pending', x, a: v0, onMark, vel: 0, lx: x, lt: e.timeStamp }
    if (drag1.mode === 'scrub') store.setPlaying(false)
  }, { passive: false })
  track.addEventListener('touchmove', e => {
    if (!drag1 || e.touches.length !== 1) return
    e.preventDefault()
    const x = e.touches[0].clientX, dx = x - drag1.x
    if (drag1.mode === 'scrub') return store.setYear(yearAtX(x))
    if (drag1.mode === 'pending' && Math.abs(dx) < PAN_SLOP) return
    drag1.mode = 'pan'
    const dt = e.timeStamp - drag1.lt
    if (dt > 0) { drag1.vel = 0.7 * ((x - drag1.lx) / dt) + 0.3 * drag1.vel; drag1.lx = x; drag1.lt = e.timeStamp }
    const a = drag1.a - (dx / track.offsetWidth) * span()
    setView(a, a + span())
  }, { passive: false })
  track.addEventListener('touchend', e => {
    if (drag1?.mode === 'pending' && !drag1.onMark && e.touches.length === 0) {
      store.setPlaying(false)
      store.setYear(yearAtX(drag1.x))
    }
    // a finger that stopped before lifting shouldn't fling
    if (drag1?.mode === 'pan' && e.touches.length === 0 && e.timeStamp - drag1.lt < 80) fling(drag1.vel)
    if (e.touches.length === 0) drag1 = null
  })
  track.addEventListener('touchcancel', () => (drag1 = null))

  // Safari's trackpad pinch only comes through as gesture events
  let lastF = 0.5, gesture: { p: number; s: number; f: number } | null = null
  track.addEventListener('pointermove', e => (lastF = frac(e.clientX, track)))
  track.addEventListener('gesturestart', e => {
    e.preventDefault()
    if (!pinch) gesture = { p: v0 + lastF * span(), s: span(), f: lastF }
  })
  track.addEventListener('gesturechange', e => {
    e.preventDefault()
    if (!gesture || pinch) return
    const s = gesture.s / (e as Event & { scale: number }).scale
    setView(gesture.p - gesture.f * s, gesture.p - gesture.f * s + s)
  })
  track.addEventListener('gestureend', () => (gesture = null))

  // overview bar: drag the window to pan, click elsewhere to jump there
  let drag: { dx: number } | null = null
  mini.addEventListener('pointerdown', e => {
    cancelAnimationFrame(tween)
    const f = frac(e.clientX, mini)
    drag = { dx: f >= v0 && f <= v1 ? f - v0 : span() / 2 }
    mini.setPointerCapture(e.pointerId)
    setView(f - drag.dx, f - drag.dx + span())
  })
  mini.addEventListener('pointermove', e => {
    if (!drag) return
    const f = frac(e.clientX, mini)
    setView(f - drag.dx, f - drag.dx + span())
  })
  const endDrag = () => (drag = null)
  mini.addEventListener('pointerup', endDrag)
  mini.addEventListener('pointercancel', endDrag)
  mini.addEventListener('wheel', e => {
    e.preventDefault()
    const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / mini.offsetWidth
    setView(v0 + d, v1 + d)
  }, { passive: false })

  btnIn.addEventListener('click', () => zoomButton(1 / ZOOM_STEP))
  btnOut.addEventListener('click', () => zoomButton(ZOOM_STEP))
  btnFit.addEventListener('click', () => animateTo(0, 1))

  addEventListener('keydown', e => {
    const t = e.target as HTMLElement
    if (t.matches('textarea, select, input:not([type=range]):not([type=checkbox])') || t.closest('.maplibregl-map') || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === '+' || e.key === '=') zoomButton(1 / ZOOM_STEP)
    else if (e.key === '-' || e.key === '_') zoomButton(ZOOM_STEP)
    else if (e.key === '0') animateTo(0, 1)
  })

  addEventListener('resize', () => setView(v0, v1))
  store.on('uncertain', () => setView(v0, v1))

  /** Keep the current year in view: page forward while playing, recentre after a jump. */
  const follow = () => {
    const x = vx(yearPos())
    if (x >= 0 && x <= 1) return syncSlider()
    const s = span(), p = yearPos()
    if (store.playing) setView(p - 0.08 * s, p + 0.92 * s)
    else animateTo(p - s / 2, p + s / 2)
  }

  layout()
  return { onYear: follow }
}
