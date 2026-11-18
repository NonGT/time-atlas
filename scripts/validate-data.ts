import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildDataset, DataError } from '../src/data/schema.ts';

const dir = join(import.meta.dirname, '..', 'data');
const raw: Record<string, string> = {};
for (const f of readdirSync(dir, { recursive: true, encoding: 'utf8' }))
  if (f.endsWith('.yaml') && !f.startsWith('i18n') && !f.startsWith('detail'))
    raw[relative(dir, join(dir, f)).split('\\').join('/')] = readFileSync(join(dir, f), 'utf8');

try {
  const d = buildDataset(raw);
  console.log(
    `ข้อมูลถูกต้อง: ${d.civilizations.length} อารยธรรม, ${d.cities.length} เมือง, ${d.landmarks.length} landmark, ${d.events.length} เหตุการณ์, ${d.polities.length} เขตแดนที่ตั้งชื่อไว้`,
  );
} catch (e) {
  if (!(e instanceof DataError)) throw e;
  console.error(`พบปัญหา ${e.problems.length} จุด:\n${e.problems.map(p => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
