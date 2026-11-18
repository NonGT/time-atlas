import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Builder, gable, type Kit, staged } from './kit';

type G = THREE.BufferGeometry;
const SQ2 = Math.SQRT2,
  PI = Math.PI;

const at = <T extends G>(g: T, x: number, y: number, z: number) => {
  g.translate(x, y, z);
  return g;
};
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z);
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 12) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n), x, y + h / 2, z);
function lathe(pts: number[][], seg: number, sr: number, sh: number, rot = 0) {
  const g = new THREE.LatheGeometry(
    pts.map(([r, h]) => new THREE.Vector2(Math.max(0, r * sr), h * sh)),
    seg,
  );
  if (rot) g.rotateY(rot);
  return g;
}
const dirs: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
// cheap repeatable jitter for ruins
const rnd = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const COL = {
  st: '#efe9dc',
  gd: '#d9a93a',
  br: '#a55a3c',
  lt: '#9a4a2e',
  ro: '#c8622e',
  rg: '#2f7a4a',
  rd: '#a8322a',
  gy: '#c9c2b4',
  ms: '#5f7d3f',
  bz: '#5a4a32',
} as const;
type Key = keyof typeof COL;
type Bag = Record<Key | 'dk', G[]>;
const bag = (): Bag => Object.fromEntries([...Object.keys(COL), 'dk'].map(k => [k, []])) as unknown as Bag;

function flush(k: Kit, b: Bag, f = 1) {
  for (const key of [...Object.keys(COL), 'dk'] as (Key | 'dk')[]) {
    if (!b[key].length) continue;
    const n = b[key].map(g => {
      const q = g.index ? g.toNonIndexed() : g;
      if (q.attributes.uv) q.deleteAttribute('uv');
      return f === 1 ? q : q.scale(f, f, f);
    });
    const m =
      key === 'dk'
        ? new THREE.MeshLambertMaterial({ color: '#3b2a22', emissive: '#120c08' })
        : new THREE.MeshLambertMaterial({
            color: COL[key],
            emissive: key === 'gd' ? new THREE.Color('#3a2a08') : new THREE.Color(COL[key]).multiplyScalar(0.2),
          });
    k.add(mergeGeometries(n)!, 0, 0, 0, m);
  }
}

/** Moves everything built in a local frame (front facing +x) into b, turned by rot about y. */
function into(b: Bag, t: Bag, x: number, z: number, rot = 0) {
  for (const key of Object.keys(t) as (Key | 'dk')[])
    for (const g of t[key]) {
      if (rot) g.rotateY(rot);
      b[key].push(g.translate(x, 0, z));
    }
}

/** Redented (ย่อมุม) square tier: two crossed boxes and a middle one, so each corner steps in twice. */
function redent(o: G[], w: number, h: number, x: number, y: number, z: number, f = 0.74) {
  o.push(bx(w, h, w * f, x, y, z), bx(w * f, h, w, x, y, z));
  // the second step only shows on the bigger tiers
  if (w > 0.08) o.push(bx((w * (1 + f)) / 2, h, (w * (1 + f)) / 2, x, y, z));
}

function stairs(
  o: G[],
  dx: number,
  dz: number,
  r0: number,
  l: number,
  h: number,
  w: number,
  y0 = 0,
  n = 6,
  cx = 0,
  cz = 0,
) {
  for (let i = 0; i < n; i++) {
    const L = (l * (n - i)) / n,
      c = r0 + L / 2;
    o.push(bx(dx ? L : w, h / n, dx ? w : L, cx + dx * c, y0 + (i * h) / n, cz + dz * c));
  }
}

/** Corn-cob tiers on a convex taper closing to a bud and a spike, unit radius and height. */
function prangPts(tiers = 7) {
  const pts: number[][] = [[1, 0]],
    top = 0.8;
  const r = (t: number) => 1 - 0.76 * t ** 2.2;
  for (let i = 0; i < tiers; i++) {
    const y0 = (i / tiers) * top,
      y1 = ((i + 1) / tiers) * top,
      r0 = r(i / tiers),
      r1 = r((i + 1) / tiers);
    pts.push([r0 * 1.07, y0 + 0.004], [r0 * 1.07, y0 + 0.02], [r0 * 0.97, y0 + 0.03], [r1 * 0.99, y1]);
  }
  pts.push([0.22, top + 0.03], [0.12, top + 0.08], [0.05, top + 0.1], [0.015, 1], [0, 1]);
  return pts;
}

/**
 * Prang: plinth, redented cella with four porches (the east one longer), crossed corn-cob spire and a vajra finial.
 * w is the half-width of the cella, h the full height above y.
 */
function prang(
  body: G[],
  fin: G[],
  dk: G[],
  x: number,
  z: number,
  y: number,
  w: number,
  h: number,
  tiers = 7,
  porch = 0.9,
  cross = true,
) {
  redent(body, w * 2.8, h * 0.05, x, y, z);
  redent(body, w * 2.45, h * 0.05, x, y + h * 0.05, z);
  redent(body, w * 2, h * 0.2, x, y + h * 0.1, z);
  redent(body, w * 2.3, h * 0.025, x, y + h * 0.3, z);
  if (porch)
    for (const [dx, dz] of dirs) {
      const L = w * (dx > 0 ? porch : porch * 0.6),
        px = x + dx * (w + L / 2),
        pz = z + dz * (w + L / 2);
      body.push(bx(dx ? L : w * 0.9, h * 0.17, dx ? w * 0.9 : L, px, y + h * 0.1, pz));
      const g = gable(L + w * 0.3, w * 0.95, h * 0.08);
      if (dz) g.rotateY(PI / 2);
      body.push(at(g, px - dx * w * 0.15, y + h * 0.27, pz - dz * w * 0.15));
      dk.push(
        bx(
          dx ? 0.003 : w * 0.38,
          h * 0.12,
          dx ? w * 0.38 : 0.003,
          x + dx * (w + L + 0.0015),
          y + h * 0.1,
          z + dz * (w + L + 0.0015),
        ),
      );
    }
  const s = lathe(prangPts(tiers), 4, w * SQ2 * 0.95, h * 0.6, PI / 4);
  if (cross)
    body.push(at(s.clone().scale(1, 1, 0.74), x, y + h * 0.325, z), at(s.scale(0.74, 1, 1), x, y + h * 0.325, z));
  else body.push(at(s.scale(0.9, 1, 0.9), x, y + h * 0.325, z));
  fin.push(
    cyl(w * 0.07, w * 0.012, h * 0.1, x, y + h * 0.9, z, 6),
    cyl(w * 0.13, w * 0.13, h * 0.008, x, y + h * 0.93, z, 6),
  );
}

/** Square tiered prasat roof (for porches, mondops and meru), unit half-width. */
const prasatPts = (() => {
  const pts: number[][] = [[1, 0]];
  for (let i = 0; i < 4; i++) {
    const r = 1 - i * 0.17,
      y0 = i * 0.11;
    pts.push([r, y0 + 0.08], [r * 0.82, y0 + 0.11]);
  }
  pts.push([0.4, 0.5], [0.3, 0.58], [0.16, 0.7], [0.05, 0.86], [0, 1]);
  return pts;
})();
const prasatStub = [...prasatPts.filter(p => p[1] < 0.25), [0.6, 0.27], [0, 0.27]];
function prasat(o: G[], x: number, z: number, y: number, w: number, h: number, stub = false) {
  o.push(at(lathe(stub ? prasatStub : prasatPts, 4, w * SQ2, h, PI / 4), x, y, z));
}

function spirePts(n = 7) {
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const r0 = 1 - 0.7 * (i / n),
      y0 = (0.6 * i) / n;
    pts.push([r0, y0], [r0 * 0.86, y0 + (0.6 / n) * 0.95]);
  }
  pts.push([0.24, 0.62], [0.12, 0.76], [0.07, 0.86], [0.1, 0.89], [0.03, 0.93], [0, 1]);
  return pts;
}

/** Sri Lankan bell chedi (ทรงลังกา): three rings, bell, harmika with its little columns, ringed spire. */
function bell(body: G[], top: G[], dk: G[], x: number, z: number, y: number, R: number, H: number, seg = 16) {
  const pts = [
    [1, 0],
    [1, 0.035],
    [0.92, 0.05],
    [0.92, 0.075],
    [0.84, 0.09],
    [0.84, 0.115],
    [0.76, 0.13],
    [0.7, 0.14],
    [0.72, 0.2],
    [0.7, 0.27],
    [0.61, 0.34],
    [0.46, 0.39],
    [0.28, 0.415],
    [0, 0.42],
  ];
  body.push(at(lathe(pts, seg, R, H), x, y, z));
  body.push(bx(R * 0.52, H * 0.05, R * 0.52, x, y + H * 0.41, z));
  body.push(bx(R * 0.6, H * 0.012, R * 0.6, x, y + H * 0.46, z));
  dk.push(cyl(R * 0.17, R * 0.17, H * 0.04, x, y + H * 0.472, z, 8));
  top.push(at(lathe(spirePts(8), seg >> 1, R * 0.2, H * 0.49), x, y + H * 0.51, z));
}
/** Small bell chedi in one lathe. */
function chedi(o: G[], x: number, z: number, y: number, R: number, H: number, seg = 8) {
  const p = [
    [1, 0],
    [1, 0.06],
    [0.82, 0.09],
    [0.72, 0.13],
    [0.74, 0.22],
    [0.58, 0.34],
    [0.3, 0.4],
    [0.2, 0.44],
    [0.17, 0.5],
    [0.04, 0.82],
    [0, 1],
  ];
  o.push(at(lathe(p, seg, R, H), x, y, z));
}

/** Sukhothai lotus-bud chedi (ดอกบัวตูม), s is the full height. */
function lotusBud(body: G[], tip: G[], dk: G[], x: number, z: number, y: number, s: number, seg = 12) {
  const u = s / 0.64;
  redent(body, 0.2 * u, 0.03 * u, x, y, z, 0.8);
  redent(body, 0.17 * u, 0.03 * u, x, y + 0.03 * u, z, 0.8);
  redent(body, 0.14 * u, 0.03 * u, x, y + 0.06 * u, z, 0.8);
  redent(body, 0.1 * u, 0.1 * u, x, y + 0.09 * u, z, 0.76);
  body.push(bx(0.125 * u, 0.012 * u, 0.125 * u, x, y + 0.19 * u, z));
  redent(body, 0.095 * u, 0.07 * u, x, y + 0.202 * u, z, 0.76);
  for (const [dx, dz] of dirs)
    dk.push(
      bx(
        dx ? 0.003 : 0.03 * u,
        0.045 * u,
        dx ? 0.03 * u : 0.003,
        x + dx * 0.0485 * u,
        y + 0.205 * u,
        z + dz * 0.0485 * u,
      ),
    );
  const bud = [
    [0.62, 0],
    [0.7, 0.03],
    [0.55, 0.05],
    [0.62, 0.08],
    [0.48, 0.1],
    [0.55, 0.13],
    [0.42, 0.15],
    [0.5, 0.18],
    [0.56, 0.25],
    [0.5, 0.33],
    [0.35, 0.42],
    [0.18, 0.5],
    [0.1, 0.54],
    [0.12, 0.56],
    [0.08, 0.58],
    [0, 0.58],
  ];
  body.push(at(lathe(bud, seg, 0.08 * u, 0.4 * u, PI / seg), x, y + 0.272 * u, z));
  tip.push(
    at(
      lathe(
        [
          [0.08, 0],
          [0.07, 0.1],
          [0.1, 0.12],
          [0.05, 0.14],
          [0.02, 0.3],
          [0, 0.3],
        ],
        6,
        0.08 * u,
        0.4 * u,
      ),
      x,
      y + 0.272 * u + 0.232 * u,
      z,
    ),
  );
}

const smallLotus = (o: G[], x: number, z: number, y: number, w: number, h: number) => {
  o.push(bx(w * 1.6, h * 0.12, w * 1.6, x, y, z), bx(w, h * 0.3, w, x, y + h * 0.12, z));
  o.push(
    at(
      lathe(
        [
          [0.75, 0],
          [0.9, 0.06],
          [0.72, 0.16],
          [0.4, 0.3],
          [0.14, 0.38],
          [0.1, 0.42],
          [0, 0.58],
        ],
        6,
        w,
        h,
      ),
      x,
      y + h * 0.42,
      z,
    ),
  );
};

/** Hall roof along x: overlapping gable tiers stepping down at both ends, green-bordered orange tiles, gold bargeboards, chofa and pediments. */
function roof(
  b: Bag,
  l: number,
  d: number,
  x: number,
  y: number,
  z: number,
  o: {
    alongZ?: boolean;
    tiers?: number;
    ext?: number;
    drop?: number;
    pitch?: number;
    plain?: boolean;
    skirt?: number;
  } = {},
) {
  const n = o.tiers ?? 3,
    ext = o.ext ?? 0.03,
    drop = o.drop ?? d * 0.14,
    pitch = o.pitch ?? 0.6;
  const put = (g: G, list: G[]) => {
    if (o.alongZ) g.rotateY(PI / 2);
    list.push(g.translate(x, 0, z));
  };
  for (let j = 0; j < n; j++) {
    const L = l - 2 * ext * j,
      D = d * (1 - 0.07 * j),
      H = D * pitch,
      yy = y + drop * j;
    put(at(gable(L, D, H), 0, yy, 0), b.rg);
    put(at(gable(L - 0.003, D * 0.8, H * 0.8), 0, yy + H * 0.2 + 0.0012, 0), b.ro);
    if (o.plain) continue;
    const s = Math.hypot(D / 2, H),
      a = Math.atan2(H, D / 2);
    for (const e of [-1, 1]) {
      const ex = e * (L / 2 + 0.002);
      for (const side of [-1, 1])
        put(
          at(new THREE.BoxGeometry(0.004, 0.005, s + 0.006).rotateX(side * a), ex, yy + H / 2 + 0.002, (side * D) / 4),
          b.gd,
        );
      put(at(new THREE.BoxGeometry(0.004, 0.026, 0.005).rotateZ(-e * 0.55), ex + e * 0.006, yy + H + 0.009, 0), b.gd);
      for (const side of [-1, 1])
        put(at(new THREE.BoxGeometry(0.004, 0.012, 0.004).rotateX(side * 0.6), ex, yy + 0.004, (side * D) / 2), b.gd);
      put(at(gable(0.003, D * 0.82, H * 0.82), ex + e * 0.0005, yy + H * 0.04, 0), b.rd);
      put(at(gable(0.003, D * 0.5, H * 0.5), ex + e * 0.002, yy + H * 0.22, 0), b.gd);
    }
  }
  if (o.skirt) {
    // lean-to aisles (กันสาด) under the main tiers, flatter and wider so they show only past the eaves
    const W = d + o.skirt,
      H = W * 0.32,
      yy = y - H * (1 - d / W) - 0.003;
    put(at(gable(l - 0.01, W, H), 0, yy, 0), b.rg);
    put(at(gable(l - 0.013, W * 0.86, H * 0.86), 0, yy + H * 0.14 + 0.0012, 0), b.ro);
  }
}

const smallBuddha = (o: G[], x: number, y: number, z: number, s: number, head = true) => {
  o.push(bx(s, s * 0.28, s * 0.7, x, y, z), bx(s * 0.45, s * 0.42, s * 0.32, x - s * 0.08, y + s * 0.28, z));
  if (head) o.push(bx(s * 0.22, s * 0.24, s * 0.22, x - s * 0.08, y + s * 0.7, z));
};
const bigBuddha = (o: G[], x: number, y: number, z: number, s: number) =>
  o.push(
    at(
      lathe(
        [
          [1, 0],
          [1, 0.16],
          [0.9, 0.2],
          [0.82, 0.3],
          [0.45, 0.4],
          [0.42, 0.68],
          [0.3, 0.8],
          [0.2, 0.82],
          [0.25, 0.93],
          [0.12, 1.03],
          [0.05, 1.08],
          [0, 1.18],
        ],
        8,
        s * 0.5,
        s,
      ),
      x,
      y,
      z,
    ),
  );

/**
 * Ubosot or vihara, built facing +x then turned by rot: raised base, white walls, red porch columns, tiered roof.
 * A ruin keeps the base, wall stubs, the back wall and rows of column stumps around the main image.
 */
function hall(
  b: Bag,
  x: number,
  z: number,
  rot: number,
  l: number,
  w: number,
  h: number,
  o: {
    ruin?: Key;
    cols?: Key;
    img?: Key;
    tiers?: number;
    base?: number;
    sema?: boolean;
    skirt?: number;
    ext?: number;
    drop?: number;
    open?: boolean;
  } = {},
) {
  const t = bag(),
    bh = o.base ?? 0.018;
  if (!o.ruin) {
    t.st.push(bx(l + 0.03, bh, w + 0.03, 0, 0, 0));
    if (o.open) {
      // open pillared hall, image at the back
      for (let i = 0; i < Math.round(l / 0.04); i++)
        for (const s of [-1, 1])
          t[o.cols ?? 'rd'].push(cyl(0.006, 0.006, h, -l / 2 + 0.02 + i * 0.04, bh, s * w * 0.42, 6));
      t.st.push(bx(0.012, h, w, -l / 2 + 0.006, bh, 0));
      bigBuddha(t[o.img ?? 'gd'], -l / 2 + 0.04, bh, 0, h * 0.8);
    } else {
      t.st.push(bx(l - 0.035, h, w, -0.0175, bh, 0));
      for (const s of [-1, -0.33, 0.33, 1]) t.rd.push(cyl(0.006, 0.006, h, l / 2 - 0.01, bh, s * w * 0.42, 6));
      t.dk.push(bx(0.003, h * 0.62, w * 0.2, l / 2 - 0.035 + 0.0015, bh, 0));
      const nw = Math.max(2, Math.round(l / 0.05));
      for (let i = 0; i < nw; i++)
        for (const s of [-1, 1])
          t.dk.push(
            bx(0.014, h * 0.42, 0.003, -l / 2 + ((l - 0.035) * (i + 0.5)) / nw, bh + h * 0.3, s * (w / 2 + 0.0015)),
          );
    }
    roof(t, l + 0.03, w + 0.05, 0, bh + h, 0, {
      tiers: o.tiers ?? 3,
      ext: o.ext ?? l * 0.09,
      skirt: o.skirt,
      drop: o.drop,
    });
    if (o.sema)
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        t.st.push(bx(0.008, 0.016, 0.004, sx * (l / 2 + 0.035), 0, sz * (w / 2 + 0.03)));
  } else {
    const m = t[o.ruin],
      c = t[o.cols ?? o.ruin];
    m.push(bx(l + 0.03, bh, w + 0.03, 0, 0, 0));
    for (const s of [-1, 1]) {
      m.push(bx(l * 0.95, h * (0.2 + 0.15 * rnd(l + s)), 0.01, -l * 0.025, bh, s * (w / 2 - 0.005)));
      m.push(bx(0.01, h * 0.45, w * 0.28, l / 2 - 0.005, bh, s * w * 0.36));
    }
    m.push(bx(0.012, h * 1.05, w, -l / 2 + 0.006, bh, 0));
    const n = Math.round(l / 0.04);
    for (let i = 0; i < n; i++)
      for (const s of [-1, 1])
        c.push(
          cyl(
            0.0065,
            0.0065,
            h * (0.45 + 0.55 * rnd(i * 3 + s + l)),
            -l / 2 + 0.05 + (i * (l - 0.07)) / Math.max(1, n - 1),
            bh,
            s * w * 0.24,
            6,
          ),
        );
    m.push(bx(0.05, 0.02, w * 0.4, -l / 2 + 0.035, bh, 0));
    bigBuddha(t[o.img ?? o.ruin], -l / 2 + 0.04, bh + 0.02, 0, h * 0.75);
  }
  into(b, t, x, z, rot);
}

/** Roofed gallery (ระเบียงคด) run between two points on a line parallel to x or z; a ruin leaves low wall stubs. */
function gallery(
  b: Bag,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  t: number,
  h: number,
  wall: Key,
  roofed: boolean,
  y = 0.008,
) {
  const alongZ = Math.abs(x1 - x0) < 1e-6,
    l = Math.hypot(x1 - x0, z1 - z0),
    cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  b[wall].push(bx(alongZ ? t : l, roofed ? h : h * 0.4, alongZ ? l : t, cx, y, cz));
  if (roofed) roof(b, l, t + 0.014, cx, y + h, cz, { alongZ, tiers: 1, plain: true, pitch: 0.5 });
}

const tree = (o: G[], x: number, z: number, r: number) =>
  o.push(at(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.8, 1), x, r * 0.8, z));

// Prasat Thong's temple of 1630 on the Chao Phraya. Central prang 35 m on a terrace with four corner prangs,
// gallery about 100 m a side with eight meru chapels (corners and mid-sides), ubosot in front on the river (east).
// 1767 burnt with the city; 1987-1992 the Fine Arts Department cleared and consolidated it.
const chaiwatthanaram = staged([1767, 1987], (k, year) => {
  const ruin = year >= 1767,
    wild = ruin && year < 1987;
  const b = bag(),
    body = ruin ? b.br : b.st,
    gold = ruin ? b.br : b.gd,
    X = -0.04;
  body.push(bx(0.44, 0.008, 0.44, X, 0, 0));
  const S = 0.38,
    m = 0.06,
    t = 0.028,
    gh = 0.022;
  // gallery runs between the eight meru
  for (const s of [-1, 1])
    for (const [a, c] of [
      [-S / 2 + m / 2, -m / 2],
      [m / 2, S / 2 - m / 2],
    ]) {
      gallery(b, X + a, (s * S) / 2, X + c, (s * S) / 2, t, gh, ruin ? 'br' : 'st', !ruin);
      gallery(b, X + (s * S) / 2, a, X + (s * S) / 2, c, t, gh, ruin ? 'br' : 'st', !ruin);
      if (ruin)
        for (let i = 0; i < 3; i++) {
          // the rows of headless Buddhas along the gallery
          const u = a + 0.03 + i * 0.065;
          smallBuddha(b.br, X + u, 0.008, s * (S / 2 - 0.004), 0.022, false);
          smallBuddha(b.br, X + s * (S / 2 - 0.004), 0.008, u, 0.022, false);
        }
    }
  for (const [mx, mz] of [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]) {
    const x = X + (mx * S) / 2,
      z = (mz * S) / 2,
      broken = ruin && (wild ? rnd(mx * 3 + mz) < 0.6 : true);
    redent(body, m, 0.012, x, 0.008, z, 0.8);
    body.push(bx(m * 0.84, 0.024, m * 0.46, x, 0.018, z), bx(m * 0.46, 0.024, m * 0.84, x, 0.018, z));
    for (const [dx, dz] of dirs)
      b.dk.push(
        bx(
          dx ? 0.003 : m * 0.2,
          0.017,
          dx ? m * 0.2 : 0.003,
          x + dx * (m * 0.42 + 0.0015),
          0.018,
          z + dz * (m * 0.42 + 0.0015),
        ),
      );
    body.push(bx(m * 0.62, 0.005, m * 0.62, x, 0.042, z));
    prasat(body, x, z, 0.047, m * 0.27, 0.036, broken);
    if (!ruin) b.gd.push(cyl(0.0025, 0.0008, 0.01, x, 0.081, z, 5));
  }
  // central terrace: two redented tiers with stairs, the east one wider
  redent(body, 0.23, 0.02, X, 0.008, 0);
  redent(body, 0.2, 0.02, X, 0.028, 0);
  for (const [dx, dz] of dirs)
    stairs(body, dx, dz, 0.09, 0.045, 0.04, dx > 0 ? 0.036 : 0.024, 0.008, dx > 0 ? 6 : 4, X, 0);
  prang(body, gold, b.dk, X, 0, 0.048, 0.024, 0.18, 7, 1.0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) prang(body, gold, b.dk, X + sx * 0.072, sz * 0.072, 0.048, 0.01, 0.085, 5, 0, false);
  if (!ruin) {
    hall(b, 0.25, 0, 0, 0.16, 0.085, 0.045, { sema: true, tiers: 3 });
    for (const s of [-1, 1]) {
      chedi(b.st, 0.2, s * 0.09, 0, 0.022, 0.1, 6);
      b.gd.push(cyl(0.002, 0.0005, 0.02, 0.2, 0.098, s * 0.09, 5));
    }
  } else {
    hall(b, 0.25, 0, 0, 0.16, 0.085, 0.045, { ruin: 'br' });
    for (const s of [-1, 1]) chedi(b.br, 0.2, s * 0.09, 0, 0.022, wild ? 0.07 : 0.1, 6);
  }
  if (wild) {
    // overgrown: grass on the terraces, trees in the courtyard
    b.ms.push(bx(0.18, 0.003, 0.18, X, 0.048, 0));
    for (const [x, z, r] of [
      [-0.2, 0.12, 0.03],
      [0.04, -0.13, 0.035],
      [-0.16, -0.14, 0.03],
      [0.07, 0.12, 0.03],
      [0.28, -0.14, 0.045],
      [0.36, 0.13, 0.035],
    ])
      tree(b.ms, x, z, r);
  }
  // drawn at true proportions, then the whole site scaled up to fill its footprint
  flush(k, b, 1.45);
});

// Wat Phra Si Sanphet, the royal temple in the palace: three bell chedis 1492-1530 on one platform, each with four
// porches, small mondops between them, the Wihan Luang of the 16 m gilded standing Buddha to the east.
// 1767 the Burmese melted the image and burnt the halls; the brick chedis survived (rebuilt from their cores in the 1950s).
const phraSiSanphet = staged([1767], (k, year) => {
  const ruin = year >= 1767;
  const b = bag(),
    body = ruin ? b.br : b.st,
    gold = ruin ? b.br : b.gd;
  const xs = [-0.42, -0.135, 0.15],
    R = 0.12;
  body.push(bx(0.9, 0.022, 0.34, -0.135, 0, 0));
  for (const [i, x] of xs.entries()) {
    redent(body, 0.29, 0.034, x, 0.022, 0, 0.78);
    redent(body, 0.24, 0.03, x, 0.056, 0, 0.78);
    // porches north and south, and at the two outer ends; the chedis are joined by mondops between them
    for (const [dx, dz] of dirs) {
      if ((dx < 0 && i > 0) || (dx > 0 && i < 2)) continue;
      const px = x + dx * 0.135,
        pz = dz * 0.135;
      body.push(bx(dx ? 0.05 : 0.066, 0.064, dx ? 0.066 : 0.05, px, 0.056, pz));
      b.dk.push(bx(dx ? 0.003 : 0.026, 0.044, dx ? 0.026 : 0.003, px + dx * 0.0265, 0.056, pz + dz * 0.0265));
      if (!ruin) {
        prasat(b.st, px, pz, 0.12, 0.032, 0.12);
        b.gd.push(cyl(0.003, 0.0006, 0.02, px, 0.235, pz, 5));
      } else prasat(b.br, px, pz, 0.12, 0.032, 0.12, true);
    }
    bell(body, gold, b.dk, x, 0, 0.086, R, 0.64);
  }
  for (const x of [(xs[0] + xs[1]) / 2, (xs[1] + xs[2]) / 2]) {
    body.push(bx(0.07, 0.1, 0.075, x, 0.022, 0));
    b.dk.push(bx(0.024, 0.05, 0.003, x, 0.022, 0.039), bx(0.024, 0.05, 0.003, x, 0.022, -0.039));
    if (!ruin) {
      prasat(b.st, x, 0, 0.122, 0.04, 0.2);
      b.gd.push(cyl(0.003, 0.0006, 0.03, x, 0.315, 0, 5));
    } else prasat(b.br, x, 0, 0.122, 0.04, 0.2, true);
  }
  if (!ruin) hall(b, 0.45, 0, 0, 0.26, 0.17, 0.085, { tiers: 3, base: 0.022 });
  else hall(b, 0.45, 0, 0, 0.26, 0.17, 0.085, { ruin: 'br', base: 0.022 });
  flush(k, b);
});

// Wat Ratchaburana, 1424, King Borommaracha II for his two brothers. Prang about 45 m on a high redented base with
// stairs to the crypt porch, small chedis at the corners of the terrace, a cloister, the vihara east and ubosot west.
// 1767 burnt; the prang still stands, with some of its stucco garudas and nagas.
const ratchaburana = staged([1767], (k, year) => {
  const ruin = year >= 1767;
  const b = bag(),
    body = ruin ? b.br : b.st,
    gold = ruin ? b.br : b.gd,
    X = -0.06;
  body.push(bx(0.96, 0.01, 0.74, 0.0, 0, 0));
  const S = 0.54,
    gk = ruin ? 'br' : 'st';
  for (const s of [-1, 1]) {
    gallery(b, X - S / 2, (s * S) / 2, X + S / 2, (s * S) / 2, 0.03, 0.04, gk, !ruin, 0.01);
    gallery(b, X - S / 2, -S / 2 + 0.015, X - S / 2, S / 2 - 0.015, 0.03, 0.04, gk, !ruin, 0.01);
    gallery(b, X + S / 2, s * 0.06, X + S / 2, s * (S / 2 - 0.015), 0.03, 0.04, gk, !ruin, 0.01);
  }
  redent(body, 0.34, 0.07, X, 0.01, 0, 0.8);
  redent(body, 0.28, 0.07, X, 0.08, 0, 0.8);
  redent(body, 0.22, 0.06, X, 0.15, 0, 0.78);
  for (const [dx, dz] of dirs)
    stairs(body, dx, dz, 0.1, dx > 0 ? 0.2 : 0.13, 0.2, dx > 0 ? 0.05 : 0.034, 0.01, 10, X, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      chedi(body, X + sx * 0.12, sz * 0.12, 0.15, 0.024, 0.14, 10);
      if (!ruin) b.gd.push(cyl(0.002, 0.0005, 0.03, X + sx * 0.12, 0.28, sz * 0.12, 5));
    }
  prang(body, gold, b.dk, X, 0, 0.21, 0.062, 0.75, 8, 1.1);
  if (ruin) {
    // patches of the old stucco still on the spire
    b.gy.push(
      at(
        lathe(
          [
            [1, 0],
            [1.01, 0.02],
            [0.92, 0.05],
            [0, 0.05],
          ],
          4,
          0.062 * SQ2 * 0.84,
          0.75,
          PI / 4,
        ).scale(1, 1, 0.8),
        X,
        0.21 + 0.75 * 0.47,
        0,
      ),
    );
  }
  if (!ruin) {
    hall(b, 0.38, 0, 0, 0.24, 0.15, 0.08, { tiers: 3 });
    hall(b, -0.44, 0, PI, 0.14, 0.1, 0.06, { tiers: 2, sema: true });
  } else {
    hall(b, 0.38, 0, 0, 0.24, 0.15, 0.08, { ruin: 'br' });
    hall(b, -0.44, 0, PI, 0.14, 0.1, 0.06, { ruin: 'br' });
  }
  flush(k, b);
});

// Wat Mahathat, the royal temple at the centre of Sukhothai, late 13th century. Lotus-bud chedi on a platform with
// eight satellite towers (Khmer prangs at the corners), two mondops of 9 m standing Buddhas north and south, the great
// vihara of laterite columns east, smaller chedis all around. ~1600 the city is deserted and the timber roofs go.
const mahathatSukhothai = staged([1600], (k, year) => {
  const ruin = year >= 1600;
  const b = bag(),
    body = ruin ? b.br : b.st,
    base = ruin ? b.lt : b.st,
    tip = ruin ? b.br : b.gd,
    cx = -0.14;
  for (const s of [-1, 1]) {
    b.lt.push(bx(0.98, 0.022, 0.018, 0, 0, s * 0.47), bx(0.018, 0.022, 0.92, s * 0.49, 0, 0));
  }
  base.push(bx(0.3, 0.028, 0.3, cx, 0, 0));
  lotusBud(body, tip, b.dk, cx, 0, 0.028, 0.34);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      prang(ruin ? b.lt : b.st, tip, b.dk, cx + sx * 0.1, sz * 0.1, 0.028, 0.012, 0.13, 4, 0, false);
  for (const [dx, dz] of dirs) {
    // Lanna-style stepped satellites between the corner prangs
    const x = cx + dx * 0.11,
      z = dz * 0.11;
    redent(body, 0.04, 0.03, x, 0.028, z);
    redent(body, 0.03, 0.03, x, 0.058, z);
    redent(body, 0.022, 0.025, x, 0.088, z);
    tip.push(cyl(0.008, 0.001, 0.035, x, 0.113, z, 6));
  }
  for (const s of [-1, 1]) {
    // mondop of the standing Buddha (Phra Attharot), open to the east
    const z = s * 0.23;
    base.push(bx(0.07, 0.01, 0.07, cx, 0, z));
    body.push(
      bx(0.01, 0.12, 0.066, cx - 0.03, 0.01, z),
      bx(0.066, 0.12, 0.01, cx, 0.01, z + s * 0.03),
      bx(0.024, 0.12, 0.01, cx + 0.021, 0.01, z - s * 0.03),
    );
    const im = ruin ? b.gy : b.gd;
    im.push(
      cyl(0.01, 0.012, 0.085, cx - 0.008, 0.01, z, 8),
      bx(0.026, 0.024, 0.01, cx - 0.008, 0.07, z),
      cyl(0.007, 0.007, 0.012, cx - 0.008, 0.095, z, 8),
      cyl(0.0035, 0, 0.01, cx - 0.008, 0.107, z, 6),
    );
  }
  // great vihara east, platform 36 x 15 m here, the seated Buddha against the west end
  if (!ruin) hall(b, 0.2, 0, 0, 0.36, 0.15, 0.08, { open: true, cols: 'st', img: 'gd', tiers: 3 });
  else hall(b, 0.2, 0, 0, 0.36, 0.15, 0.08, { ruin: 'lt', cols: 'lt', img: 'gy' });
  const small = ruin ? b.br : b.st;
  for (const [x, z, kind] of [
    [0.08, -0.33, 0],
    [0.18, -0.33, 1],
    [0.28, -0.33, 0],
    [0.38, -0.33, 1],
    [0.08, 0.33, 1],
    [0.18, 0.33, 0],
    [0.28, 0.33, 1],
    [0.38, 0.33, 0],
    [-0.42, -0.24, 0],
    [-0.42, 0, 1],
    [-0.42, 0.24, 0],
    [-0.3, -0.38, 1],
    [-0.3, 0.38, 1],
    [0.44, -0.2, 0],
    [0.44, 0.2, 0],
  ]) {
    base.push(bx(0.05, 0.01, 0.05, x, 0, z));
    if (kind) smallLotus(small, x, z, 0.01, 0.025, 0.12);
    else chedi(small, x, z, 0.01, 0.02, 0.1, 6);
  }
  flush(k, b);
});

/** Stucco elephant forequarters coming out of a wall at the origin, facing +z. */
function elephant(o: G[], x: number, z: number, rot: number, s: number) {
  const parts = [
    bx(0.044, 0.05, 0.03, 0, 0.012, 0.012),
    bx(0.032, 0.034, 0.022, 0, 0.05, 0.032),
    bx(0.066, 0.038, 0.006, 0, 0.046, 0.024),
    bx(0.009, 0.05, 0.009, 0, 0.008, 0.046),
    bx(0.012, 0.03, 0.012, -0.012, 0, 0.022),
    bx(0.012, 0.03, 0.012, 0.012, 0, 0.022),
  ];
  for (const g of parts) o.push(at(g.scale(s, s, s).rotateY(rot), x, 0, z));
}

// Wat Chang Lom, Si Satchanalai, finished 1286 by Ram Khamhaeng's inscription: bell chedi on a two-tier square base,
// 39 stucco elephants round the lower tier, Buddhas in niches on the upper, stair on the south.
// Plastered white while the city lived; bare laterite and grey stucco after it emptied (~1600).
const changLom = staged([1600], (k, year) => {
  const ruin = year >= 1600;
  const b = bag(),
    body = ruin ? b.lt : b.st,
    top = ruin ? b.br : b.gd,
    ele = ruin ? b.gy : b.st;
  const S = 0.7,
    S2 = 0.5,
    h1 = 0.125,
    h2 = 0.075;
  for (const s of [-1, 1]) b.lt.push(bx(0.98, 0.025, 0.016, 0, 0, s * 0.49), bx(0.016, 0.025, 0.98, s * 0.49, 0, 0));
  body.push(bx(S, h1, S, 0, 0, 0), bx(S + 0.02, 0.012, S + 0.02, 0, h1 - 0.012, 0));
  for (const [dx, dz] of dirs) {
    for (let i = -4; i <= 4; i++) {
      if (dz > 0 && i === 0) continue;
      const t = i * 0.07,
        x = dx ? (dx * S) / 2 : t,
        z = dz ? (dz * S) / 2 : t;
      elephant(ele, x, z, Math.atan2(dx, dz), 1.35);
      b.dk.push(bx(dx ? 0.003 : 0.062, 0.1, dx ? 0.056 : 0.003, x + dx * 0.0015, 0.005, z + dz * 0.0015));
    }
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) elephant(ele, (sx * S) / 2, (sz * S) / 2, Math.atan2(sx, sz), 1.5);
  body.push(bx(S2, h2, S2, 0, h1, 0), bx(S2 + 0.016, 0.01, S2 + 0.016, 0, h1 + h2 - 0.01, 0));
  for (const [dx, dz] of dirs)
    for (let i = -1.5; i <= 1.5; i++) {
      if (dz > 0 && Math.abs(i) < 1) continue;
      const t = i * 0.1,
        x = dx ? (dx * S2) / 2 : t,
        z = dz ? (dz * S2) / 2 : t;
      b.dk.push(bx(dx ? 0.004 : 0.04, 0.055, dx ? 0.04 : 0.004, x + dx * 0.001, h1 + 0.008, z + dz * 0.001));
      const im = ruin ? b.gy : b.gd;
      im.push(bx(dx ? 0.012 : 0.024, 0.04, dx ? 0.024 : 0.012, x + dx * 0.004, h1 + 0.008, z + dz * 0.004));
    }
  // south stair from the ground to the upper terrace, with naga balustrades
  stairs(body, 0, 1, S2 / 2, S / 2 - S2 / 2 + 0.13, h1 + h2, 0.08, 0, 12);
  for (const s of [-1, 1])
    body.push(
      at(
        new THREE.BoxGeometry(0.012, 0.02, 0.3).rotateX(Math.atan2(h1 + h2, 0.23)),
        s * 0.046,
        (h1 + h2) / 2 + 0.01,
        S2 / 2 + 0.115,
      ),
    );
  bell(body, top, b.dk, 0, 0, h1 + h2, 0.215, 0.45, 20);
  flush(k, b);
});

// Wat Phra Si Rattana Mahathat (Wat Yai), Phitsanulok. Phra Phuttha Chinnarat cast about 1357; its vihara faces west
// to the Nan river under a low three-tier roof with lean-to aisles. The gilded prang (36 m) went up over the older
// chedi under King Borommatrailokanat, who lived here from 1463; galleries round it, viharas north and south.
const phitsanulok = staged([1482], (k, year) => {
  const b = bag(),
    X = 0.14;
  b.gy.push(bx(0.98, 0.006, 0.76, -0.02, 0, 0));
  const S = 0.38;
  for (const s of [-1, 1]) {
    gallery(b, X - S / 2, (s * S) / 2, X + S / 2, (s * S) / 2, 0.032, 0.035, 'st', true);
    gallery(b, X - S / 2, s * 0.05, X - S / 2, s * (S / 2 - 0.016), 0.032, 0.035, 'st', true);
    gallery(b, X + S / 2, -S / 2 + 0.016, X + S / 2, S / 2 - 0.016, 0.032, 0.035, 'st', true);
  }
  redent(b.st, 0.17, 0.035, X, 0.008, 0, 0.8);
  if (year >= 1482) {
    prang(b.gd, b.gd, b.dk, X, 0, 0.043, 0.042, 0.41, 7, 1.0);
    stairs(b.st, -1, 0, 0.085, 0.06, 0.035, 0.04, 0.008, 5, X, 0);
  } else {
    lotusBud(b.st, b.gd, b.dk, X, 0, 0.043, 0.3);
  }
  // Chinnarat vihara: low walls, the big roof sweeping down over the aisles, front to the west
  hall(b, -0.28, 0, PI, 0.38, 0.15, 0.05, { tiers: 3, skirt: 0.1, ext: 0.04, drop: 0.022, base: 0.014 });
  for (const s of [-1, 1]) hall(b, X, s * 0.3, (-s * PI) / 2, 0.16, 0.09, 0.045, { tiers: 2 });
  flush(k, b);
});

export const thai_4: Record<string, Builder> = {
  'wat-chaiwatthanaram': chaiwatthanaram,
  'wat-phra-si-sanphet': phraSiSanphet,
  'wat-ratchaburana': ratchaburana,
  'wat-mahathat-sukhothai': mahathatSukhothai,
  'wat-chang-lom-satchanalai': changLom,
  'wat-phra-si-rattana-mahathat-phitsanulok': phitsanulok,
};
