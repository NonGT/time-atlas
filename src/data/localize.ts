import type { Dataset } from './schema';

/** Translatable fields per kind. Names fall back to the item's `en` field. */
export const FIELDS = {
  cities: ['name', 'desc', 'peak'],
  landmarks: ['name', 'desc', 'uncertain'],
  civilizations: ['name'],
  events: ['title', 'desc', 'uncertain'],
} as const;

type Entries = Record<string, Record<string, string>>;
/** Translation files merged per kind: events → id → field → text, timeline → { eras: id → name }, polities → source name → name */
export interface Translations {
  cities?: Entries;
  landmarks?: Entries;
  civilizations?: Entries;
  events?: Entries;
  timeline?: { eras?: Record<string, string> };
  polities?: Record<string, string>;
}

/** Swaps the Thai texts for another language in place. Anything untranslated stays Thai, except names, which use `en`. */
export function localize(d: Dataset, tr: Translations) {
  for (const kind of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) {
    for (const item of d[kind] as unknown as Record<string, unknown>[]) {
      const e = tr[kind]?.[item.id as string];
      for (const f of FIELDS[kind]) {
        if (typeof e?.[f] === 'string') item[f] = e[f];
        else if (f === 'name' && typeof item.en === 'string') item.name = item.en;
      }
    }
  }
  for (const era of d.timeline.eras) era.name = tr.timeline?.eras?.[era.id] ?? era.name;
  // the Thai names often merge several source names (Siam, Thailand) into one; elsewhere the source names are more precise
  for (const p of d.polities) p.name = undefined;
  d.polityNames = tr.polities ?? {};
  return d;
}
