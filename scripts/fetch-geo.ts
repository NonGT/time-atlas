// Downloads historical border snapshots (aourednik/historical-basemaps, GPL-3.0) and Natural Earth
// 10m land (via world-atlas), simplifies the borders and writes them to public/geo.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SNAPSHOTS = [
  'bc10000',
  'bc8000',
  'bc5000',
  'bc4000',
  'bc3000',
  'bc2000',
  'bc1500',
  'bc1000',
  'bc700',
  'bc500',
  'bc400',
  'bc323',
  'bc300',
  'bc200',
  'bc100',
  'bc1',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '1000',
  '1100',
  '1200',
  '1279',
  '1300',
  '1400',
  '1492',
  '1500',
  '1530',
  '1600',
  '1650',
  '1700',
  '1715',
  '1783',
  '1800',
  '1815',
  '1880',
  '1900',
  '1914',
  '1920',
  '1930',
  '1938',
  '1945',
  '1960',
  '1994',
  '2000',
  '2010',
];
// The 1492 file maps the Americas as ~1,200 ethnographic territories while 1400 and 1500 have a few dozen
// polities, so for eight years the continent turned into noise. Use the 1500 Americas there instead.
const AMERICAS_FROM: Record<string, string> = { '1492': '1500' };
const BASE = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/';
const out = join(import.meta.dirname, '..', 'public', 'geo');
const bordersDir = join(out, 'borders');
const tmp = join(tmpdir(), 'time-atlas-geo');
mkdirSync(join(bordersDir, 'hi'), { recursive: true });
mkdirSync(tmp, { recursive: true });

const yearOf = (k: string) => (k.startsWith('bc') ? -Number(k.slice(2)) : Number(k));
const mapshaper = join(import.meta.dirname, '..', 'node_modules', '.bin', 'mapshaper');

async function download(url: string, file: string) {
  if (existsSync(file)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

type FC = { type: 'FeatureCollection'; features: { geometry: { coordinates: unknown } | null }[] };
const meanLon = (f: FC['features'][number]) => {
  let s = 0,
    n = 0;
  const walk = (a: unknown): void => {
    if (Array.isArray(a) && typeof a[0] === 'number') {
      s += a[0];
      n++;
    } else if (Array.isArray(a)) a.forEach(walk);
  };
  walk(f.geometry?.coordinates);
  return n ? s / n : 0;
};
const inAmericas = (f: FC['features'][number]) => meanLon(f) < -30;

function patchAmericas() {
  for (const [key, donor] of Object.entries(AMERICAS_FROM))
    for (const dir of [bordersDir, join(bordersDir, 'hi')]) {
      const target = join(dir, `${key}.json`);
      const fc: FC = JSON.parse(readFileSync(target, 'utf8'));
      const from: FC = JSON.parse(readFileSync(join(dir, `${donor}.json`), 'utf8'));
      fc.features = [...fc.features.filter(f => !inAmericas(f)), ...from.features.filter(inAmericas)];
      writeFileSync(target, JSON.stringify(fc));
      console.log('americas', key, '<-', donor, dir.endsWith('hi') ? '(hi)' : '');
    }
}

// `--patch-only` reapplies the fixes above to files already in public/geo without downloading again
if (process.argv.includes('--patch-only')) {
  patchAmericas();
  process.exit(0);
}

const index: { year: number; file: string }[] = [];
for (const key of SNAPSHOTS) {
  const raw = join(tmp, `world_${key}.geojson`);
  await download(`${BASE}world_${key}.geojson`, raw);
  const file = `${key}.json`;
  const shape = (simplify: string[], dest: string, precision: string) =>
    execFileSync(
      mapshaper,
      [
        '-i',
        raw,
        '-filter',
        'NAME != null && NAME.trim() != ""',
        ...simplify,
        '-filter-fields',
        'NAME,BORDERPRECISION',
        '-rename-fields',
        'name=NAME,precision=BORDERPRECISION',
        '-o',
        dest,
        'format=geojson',
        `precision=${precision}`,
      ],
      { stdio: 'pipe' },
    );
  // light version for the globe, full detail loaded only when zoomed in
  shape(['-simplify', '20%', 'keep-shapes'], join(bordersDir, file), '0.001');
  shape([], join(bordersDir, 'hi', file), '0.0001');
  index.push({ year: yearOf(key), file });
  console.log('borders', key);
}
patchAmericas();
index.sort((a, b) => a.year - b.year);
writeFileSync(join(bordersDir, 'index.json'), JSON.stringify(index));

const land = join(out, 'land-10m.json');
await download('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-10m.json', land);
JSON.parse(readFileSync(land, 'utf8'));
console.log('land ok');
rmSync(tmp, { recursive: true, force: true });
