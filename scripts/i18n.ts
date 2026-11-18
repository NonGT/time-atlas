// Reports translations that are missing, point at ids that no longer exist, or were written against Thai text
// that has changed since. `npm run i18n -- --update` records the current Thai text as translated.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { FIELDS, type Translations } from '../src/data/localize.ts';
import { buildDataset, kindOf } from '../src/data/schema.ts';

const dir = join(import.meta.dirname, '..', 'data');
const yamlFiles = (root: string) =>
  readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.yaml'))
    .map(f => relative(root, join(root, f)).split('\\').join('/'));

const raw: Record<string, string> = {};
for (const f of yamlFiles(dir))
  if (!f.startsWith('i18n/') && !f.startsWith('detail/')) raw[f] = readFileSync(join(dir, f), 'utf8');
const data = buildDataset(raw);
const update = process.argv.includes('--update');
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 10);

// every translatable Thai text, as "kind/id/field" → text
const sources = new Map<string, string>();
// names fall back to the `en` field, so only a name without one needs translating
for (const kind of Object.keys(FIELDS) as (keyof typeof FIELDS)[])
  for (const item of data[kind] as unknown as Record<string, unknown>[])
    for (const f of FIELDS[kind])
      if (typeof item[f] === 'string' && !(f === 'name' && item.en))
        sources.set(`${kind}/${item.id}/${f}`, item[f] as string);
for (const era of data.timeline.eras) sources.set(`eras/${era.id}/name`, era.name);
const items = new Set(
  [...(Object.keys(FIELDS) as (keyof typeof FIELDS)[])].flatMap(k => data[k].map(x => `${k}/${x.id}`)),
);
for (const era of data.timeline.eras) items.add(`eras/${era.id}`);

for (const lang of readdirSync(join(dir, 'i18n'))) {
  const root = join(dir, 'i18n', lang);
  const tr: Record<string, Record<string, unknown>> = {};
  for (const f of yamlFiles(root))
    Object.assign((tr[kindOf(f)] ??= {}), parse(readFileSync(join(root, f), 'utf8')) ?? {});
  const t = tr as Translations;

  const have = new Map<string, string>();
  for (const kind of Object.keys(FIELDS) as (keyof typeof FIELDS)[])
    for (const [id, fields] of Object.entries(t[kind] ?? {}))
      for (const [f, text] of Object.entries(fields)) have.set(`${kind}/${id}/${f}`, text);
  for (const [id, name] of Object.entries(t.timeline?.eras ?? {})) have.set(`eras/${id}/name`, name);

  const lockFile = join(root, 'source-hashes.json');
  const lock: Record<string, string> = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {};
  const missing: string[] = [],
    orphan: string[] = [],
    stale: string[] = [];
  for (const [key, text] of sources) {
    if (!have.has(key)) missing.push(key);
    else if (lock[key] !== hash(text)) stale.push(`${key}\n      th: ${text}\n      ${lang}: ${have.get(key)}`);
  }
  for (const key of have.keys()) if (!items.has(key.slice(0, key.lastIndexOf('/')))) orphan.push(key);

  const show = (title: string, list: string[]) =>
    list.length && console.log(`\n${title} (${list.length}):\n${list.map(k => `  ${k}`).join('\n')}`);
  console.log(
    `[${lang}] ${have.size} translated, ${missing.length} missing, ${stale.length} out of date, ${orphan.length} orphaned`,
  );
  if (update) {
    const next: Record<string, string> = {};
    for (const [key, text] of [...sources].sort()) if (have.has(key)) next[key] = hash(text);
    writeFileSync(lockFile, `${JSON.stringify(next, null, 1)}\n`);
    console.log(
      `  recorded ${Object.keys(next).length} Thai texts as translated in ${relative(process.cwd(), lockFile)}`,
    );
  } else {
    show('Missing', missing);
    show('Thai text changed since translating (check, then run with --update)', stale);
    show('No longer in the Thai data', orphan);
  }
}
