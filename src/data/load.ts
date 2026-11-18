import { parse } from 'yaml';
import type { Locale } from '../i18n';
import { localize, type Translations } from './localize';
import { buildDataset, type Dataset, kindOf } from './schema';

const files = import.meta.glob(['../../data/**/*.yaml', '!../../data/i18n/**', '!../../data/detail/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
// only the chosen language is fetched
const i18n = import.meta.glob('../../data/i18n/**/*.yaml', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>;

export function loadDataset(): Dataset {
  const raw: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) raw[path.replace('../../data/', '')] = text;
  return buildDataset(raw);
}

export async function loadTranslations(locale: Locale): Promise<Translations> {
  const prefix = `../../data/i18n/${locale}/`;
  const out: Record<string, Record<string, unknown>> = {};
  await Promise.all(
    Object.entries(i18n)
      .filter(([p]) => p.startsWith(prefix))
      .map(async ([p, load]) => {
        const doc = parse(await load());
        if (doc && typeof doc === 'object') Object.assign((out[kindOf(p.slice(prefix.length))] ??= {}), doc);
      }),
  );
  return out as Translations;
}

export async function loadLocalized(locale: Locale) {
  const d = loadDataset();
  return locale === 'th' ? d : localize(d, await loadTranslations(locale));
}
