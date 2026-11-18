import { t } from './i18n';

export type Series = [number, number][];

/** Piecewise-linear mapping between years and slider position (0..1). */
export class TimeScale {
  constructor(private pts: Series) {}

  toPos(y: number) {
    const p = this.pts;
    if (y <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      const [ya, a] = p[i - 1],
        [yb, b] = p[i];
      if (y <= yb) return a + ((y - ya) / (yb - ya)) * (b - a);
    }
    return p[p.length - 1][1];
  }

  toYear(v: number) {
    const p = this.pts;
    if (v <= p[0][1]) return p[0][0];
    for (let i = 1; i < p.length; i++) {
      const [ya, a] = p[i - 1],
        [yb, b] = p[i];
      if (v <= b) return ya + ((v - a) / (b - a)) * (yb - ya);
    }
    return p[p.length - 1][0];
  }
}

export function valueAt(s: Series, y: number) {
  if (y < s[0][0]) return 0;
  if (y === s[0][0]) return s[0][1];
  const last = s[s.length - 1];
  if (y >= last[0]) return last[1];
  for (let i = 1; i < s.length; i++) {
    if (y <= s[i][0]) {
      const [a, pa] = s[i - 1],
        [b, pb] = s[i];
      return pa + ((y - a) / (b - a)) * (pb - pa);
    }
  }
  return 0;
}

export const fmtYear = (y: number) => t.year(y);
export const fmtYearShort = (y: number) => t.yearShort(y);
/** the Buddhist Era in Thai, nothing in other languages */
export const fmtBE = (y: number) => t.yearAlt(y);
export const fmtPop = (k: number) => t.pop(k);
export const fmtPopShort = (k: number) => t.popShort(k);
