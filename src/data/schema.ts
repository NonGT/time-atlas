import { z } from 'zod'
import { parse } from 'yaml'

export const SHAPES = [
  'pyramid', 'ziggurat', 'step', 'temple', 'arena', 'dome', 'pagoda',
  'hall', 'prang', 'stupa', 'citadel', 'mound', 'ring', 'tower', 'cathedral',
  'town', 'cave', 'terrace', 'bridge', 'castle', 'wall', 'factory', 'monolith', 'mosque', 'church', 'garden',
  'mountain', 'volcano', 'hills', 'valley', 'lake', 'forest', 'rockart', 'islands',
] as const

export const TAGS = ['founding', 'culture', 'war', 'tech', 'religion', 'politics', 'disaster'] as const

const year = z.number().int()
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'สีต้องเป็นรูปแบบ "#rrggbb"')
const id = z.string().regex(/^[a-z0-9-]+$/, 'id ใช้ได้เฉพาะ a-z, 0-9 และ -')
const lat = z.number().min(-90).max(90)
const lon = z.number().min(-180).max(180)
const range = z.tuple([year, year])
// what is unclear about an item; items with it form the toggleable "uncertain" layer
const uncertain = z.string().optional()

const Timeline = z.object({
  start: year,
  end: year,
  initialYear: year,
  playSeconds: z.number().positive().default(45),
  scale: z.array(z.tuple([year, z.number().min(0).max(1)])).min(2),
  eras: z.array(z.object({ id, from: year, name: z.string() })),
  ticks: z.array(year),
  initialView: z.object({ lat, lon, zoom: z.number() }),
})

const Civilization = z.object({
  id, name: z.string(), en: z.string().optional(), color,
})

const City = z.object({
  id, name: z.string(), en: z.string(), civ: z.string(),
  lat, lon,
  peak: z.string().optional(),
  desc: z.string().optional(),
  population: z.array(z.tuple([year, z.number().min(0)])).min(2),
})

const Landmark = z.object({
  id, name: z.string(), en: z.string().optional(),
  shape: z.enum(SHAPES),
  // a place rather than a building (a sacred mountain, a wine region): `built` is when it starts to matter
  site: z.boolean().optional(),
  lat, lon,
  built: year,
  gone: year.optional(),
  size: z.number().positive(),
  city: z.string().optional(),
  civ: z.string().optional(),
  desc: z.string().optional(),
  // English Wikipedia page title for the reference photo, when it differs from `en`
  wiki: z.string().optional(),
  uncertain,
  builtRange: range.optional(),
  goneRange: range.optional(),
  // UNESCO World Heritage site number (whc.unesco.org/en/list/<whs>) and the year it was inscribed
  whs: z.number().int().positive().optional(),
  inscribed: year.optional(),
})

const Event = z.object({
  id,
  year,
  // last year, for wars, pandemics and other things that lasted
  end: year.optional(),
  title: z.string(),
  desc: z.string().optional(),
  city: z.string().optional(),
  lat: lat.optional(),
  lon: lon.optional(),
  zoom: z.number().optional(),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  tag: z.enum(TAGS).default('culture'),
  uncertain,
  range: range.optional(),
})

const Polity = z.object({
  match: z.union([z.string(), z.array(z.string())]),
  name: z.string().optional(),
  civ: z.string().optional(),
  color: color.optional(),
  kind: z.enum(['state', 'culture', 'hidden']).optional(),
  // the source data sometimes labels land with a name from a later era; hide it in snapshots before this year
  from: year.optional(),
})

export type Timeline = z.infer<typeof Timeline>
export type Civilization = z.infer<typeof Civilization>
export type City = z.infer<typeof City>
export type Landmark = z.infer<typeof Landmark>
export type HistEvent = z.infer<typeof Event>
export type Polity = z.infer<typeof Polity>
export type Shape = (typeof SHAPES)[number]

const NATURAL: ReadonlySet<string> = new Set(['mountain', 'volcano', 'lake', 'forest', 'valley', 'islands'])
/** Year a landmark appears on the map. Natural places were there long before the year they came to matter. */
export const shownFrom = (l: Landmark) => (l.site && NATURAL.has(l.shape) ? -Infinity : l.built)
export type Tag = (typeof TAGS)[number]

export interface Dataset {
  timeline: Timeline
  civilizations: Civilization[]
  cities: City[]
  landmarks: Landmark[]
  events: HistEvent[]
  polities: Polity[]
  /** display names for border polities by source name, outside Thai */
  polityNames?: Record<string, string>
}

const KINDS = {
  timeline: { schema: Timeline, list: false },
  civilizations: { schema: Civilization, list: true },
  cities: { schema: City, list: true },
  landmarks: { schema: Landmark, list: true },
  events: { schema: Event, list: true },
  polities: { schema: Polity, list: true },
} as const

export class DataError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'))
  }
}

const inRange = ([a, b]: [number, number], y: number) => a <= y && y <= b

function label(item: unknown, i: number) {
  const o = item as Record<string, unknown> | null
  const name = o && (o.id ?? o.title ?? o.match)
  return name ? `${String(name)} (รายการที่ ${i + 1})` : `รายการที่ ${i + 1}`
}

/** "events/wars.yaml" and "events.yaml" both hold events */
export const kindOf = (path: string) => path.split('/')[0].replace(/\.yaml$/, '')

/**
 * Parses and validates the YAML files, keyed by path relative to data/ ("cities.yaml", "events/core.yaml").
 * A list kind can be split over any number of files in a folder of that name. Throws DataError listing every problem found.
 */
export function buildDataset(raw: Record<string, string>): Dataset {
  const problems: string[] = []
  const out: Record<string, unknown> = {}
  const paths = Object.keys(raw).sort()

  for (const [key, { schema, list }] of Object.entries(KINDS)) {
    const files = paths.filter(p => kindOf(p) === key)
    if (!files.length) { problems.push(`ไม่พบไฟล์ ${key}.yaml`); continue }
    if (!list && files.length > 1) problems.push(`${key}: ต้องมีไฟล์เดียว (${files.join(', ')})`)
    const items: unknown[] = []
    for (const file of files) {
      let doc: unknown
      try {
        doc = parse(raw[file])
      } catch (e) {
        problems.push(`${file}: YAML อ่านไม่ได้ – ${(e as Error).message}`)
        continue
      }
      if (list) {
        if (doc == null) continue
        if (!Array.isArray(doc)) { problems.push(`${file}: ต้องเป็นรายการ (เริ่มแต่ละบรรทัดด้วย "- ")`); continue }
        doc.forEach((item, i) => {
          const r = (schema as z.ZodType).safeParse(item)
          if (r.success) items.push(r.data)
          else for (const iss of r.error.issues) problems.push(`${file} › ${label(item, i)} › ${iss.path.join('.') || '(ทั้งรายการ)'}: ${iss.message}`)
        })
      } else {
        const r = (schema as z.ZodType).safeParse(doc)
        if (r.success) out[key] = r.data
        else for (const iss of r.error.issues) problems.push(`${file} › ${iss.path.join('.')}: ${iss.message}`)
      }
    }
    if (list) out[key] = items
  }
  if (problems.length) throw new DataError(problems)

  const d = out as unknown as Dataset
  const civIds = new Set(d.civilizations.map(c => c.id))
  const cityIds = new Set(d.cities.map(c => c.id))
  const dupes = (file: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const x of ids) { if (seen.has(x)) problems.push(`${file}: id "${x}" ซ้ำกัน`); seen.add(x) }
  }
  dupes('civilizations.yaml', d.civilizations.map(c => c.id))
  dupes('cities.yaml', d.cities.map(c => c.id))
  dupes('landmarks.yaml', d.landmarks.map(l => l.id))
  dupes('events', d.events.map(e => e.id))
  dupes('timeline.yaml › eras', d.timeline.eras.map(e => e.id))

  for (const c of d.cities) {
    if (!civIds.has(c.civ)) problems.push(`cities.yaml › ${c.id} › civ: ไม่มีอารยธรรม "${c.civ}" ใน civilizations.yaml`)
    for (let i = 1; i < c.population.length; i++)
      if (c.population[i][0] <= c.population[i - 1][0])
        problems.push(`cities.yaml › ${c.id} › population: ปีต้องเรียงจากน้อยไปมาก (${c.population[i - 1][0]} → ${c.population[i][0]})`)
  }
  for (const l of d.landmarks) {
    if (l.city && !cityIds.has(l.city)) problems.push(`landmarks.yaml › ${l.id} › city: ไม่มีเมือง "${l.city}"`)
    if (l.civ && !civIds.has(l.civ)) problems.push(`landmarks.yaml › ${l.id} › civ: ไม่มีอารยธรรม "${l.civ}"`)
    if (!l.city && !l.civ) problems.push(`landmarks.yaml › ${l.id}: ต้องระบุ city หรือ civ อย่างน้อยหนึ่งอย่าง (ใช้กำหนดสี)`)
    if (l.gone !== undefined && l.gone <= l.built) problems.push(`landmarks.yaml › ${l.id} › gone: ต้องมากกว่า built`)
    if (l.builtRange && !inRange(l.builtRange, l.built)) problems.push(`landmarks.yaml › ${l.id} › builtRange: ต้องครอบปี built และเรียงจากน้อยไปมาก`)
    if (l.goneRange && (l.gone === undefined || !inRange(l.goneRange, l.gone))) problems.push(`landmarks.yaml › ${l.id} › goneRange: ต้องใส่ gone และช่วงต้องครอบปี gone`)
    if ((l.whs === undefined) !== (l.inscribed === undefined)) problems.push(`landmarks.yaml › ${l.id}: whs และ inscribed ต้องใส่คู่กัน`)
    if ((l.builtRange || l.goneRange) && !l.uncertain) problems.push(`landmarks.yaml › ${l.id}: ใส่ช่วงปีแล้วต้องใส่ uncertain อธิบายด้วย`)
  }
  d.events.forEach((e, i) => {
    if (e.end !== undefined && e.end <= e.year) problems.push(`events › ${label(e, i)} › end: ต้องมากกว่า year`)
    if (e.city && !cityIds.has(e.city)) problems.push(`events › ${label(e, i)} › city: ไม่มีเมือง "${e.city}"`)
    if ((e.lat === undefined) !== (e.lon === undefined)) problems.push(`events › ${label(e, i)}: ต้องใส่ lat และ lon คู่กัน`)
    if (e.range && !inRange(e.range, e.year)) problems.push(`events › ${label(e, i)} › range: ต้องครอบปี year และเรียงจากน้อยไปมาก`)
    if (e.range && !e.uncertain) problems.push(`events › ${label(e, i)}: ใส่ range แล้วต้องใส่ uncertain อธิบายด้วย`)
  })
  const matched = new Set<string>()
  for (const p of d.polities) {
    if (p.civ && !civIds.has(p.civ)) problems.push(`polities.yaml › ${String(p.match)} › civ: ไม่มีอารยธรรม "${p.civ}"`)
    for (const m of [p.match].flat()) {
      if (matched.has(m)) problems.push(`polities.yaml › ${m}: ชื่อนี้ซ้ำกับรายการก่อนหน้า`)
      matched.add(m)
    }
  }
  const t = d.timeline
  if (t.scale[0][0] !== t.start || t.scale[t.scale.length - 1][0] !== t.end)
    problems.push('timeline.yaml › scale: จุดแรกและจุดสุดท้ายต้องตรงกับ start และ end')

  if (problems.length) throw new DataError(problems)
  d.events.sort((a, b) => a.year - b.year)
  return d
}
