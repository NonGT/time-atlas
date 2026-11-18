import * as THREE from 'three';
import { type Builder, gable, type Kit, staged } from './kit';

type G = THREE.BufferGeometry;
const PI = Math.PI;

const at = <T extends G>(g: T, x: number, y: number, z: number) => {
  g.translate(x, y, z);
  return g;
};
const bx = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  at(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z);
const cyl = (rb: number, rt: number, h: number, x: number, y: number, z: number, n = 12) =>
  at(new THREE.CylinderGeometry(rt, rb, h, n), x, y + h / 2, z);
const lathe = (pts: number[][], seg: number) =>
  new THREE.LatheGeometry(
    pts.map(([r, h]) => new THREE.Vector2(r, h)),
    seg,
  );

/** Box whose top face is resized to w1 x d1, for battered walls and hip roofs. */
function frus(w0: number, d0: number, w1: number, d1: number, h: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w0, h, d0),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    if (p.getY(i) > 0) {
      p.setX(i, (p.getX(i) * w1) / w0);
      p.setZ(i, (p.getZ(i) * d1) / d0);
    }
  g.computeVertexNormals();
  return at(g, x, y + h / 2, z);
}
/** Hip roof over w x d with its ridge along the longer side. */
const hip = (w: number, d: number, h: number, x: number, y: number, z: number) =>
  w >= d
    ? frus(w, d, Math.max(w - d, 0.001), 0.001, h, x, y, z)
    : frus(w, d, 0.001, Math.max(d - w, 0.001), h, x, y, z);

// deterministic noise from a vertex position, so duplicated box corners move together
const hash = (x: number, y: number, z: number) => {
  const s =
    Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 991) * 78.233 + Math.round(z * 983) * 37.719) * 43758.5453;
  return s - Math.floor(s);
};
function rough(g: G, a: number, keepBase = true) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    if (keepBase && y <= 1e-4) continue;
    p.setXYZ(i, x + (hash(x, y, z) - 0.5) * a, y + (hash(z, x, y) - 0.5) * a * 0.6, z + (hash(y, z, x) - 0.5) * a);
  }
  g.computeVertexNormals();
  return g;
}

const lam = (c: string, e = 0.28) =>
  new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(e) });

// mixes indexed and extruded geometries, so everything goes in as plain triangles with position and normal
function put(k: Kit, geos: G[], m: THREE.Material) {
  if (!geos.length) return;
  const parts = geos.map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.normal) n.computeVertexNormals();
    for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
    return n;
  });
  k.add(mergeAll(parts), 0, 0, 0, m);
}
function mergeAll(parts: G[]) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3),
    nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o);
    nor.set(p.attributes.normal.array as Float32Array, o);
    o += p.attributes.position.count * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

const tri = (w: number, h: number, x: number, y: number, z: number, rot = 0) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateY(rot);
  return at(g, x, y, z);
};
const gableZ = (l: number, d: number, h: number, x: number, y: number, z: number) => {
  const g = gable(l, d, h);
  g.rotateY(PI / 2);
  return at(g, x, y, z);
};
const gableX = (l: number, d: number, h: number, x: number, y: number, z: number) => at(gable(l, d, h), x, y, z);

/** Rows of window openings on a south face at z. */
function windows(o: G[], x0: number, x1: number, rows: number[], z: number, n: number, w = 0.012, h = 0.016) {
  for (const y of rows) for (let i = 0; i < n; i++) o.push(bx(w, h, 0.006, x0 + ((i + 0.5) * (x1 - x0)) / n, y, z));
}

function potala(k: Kit) {
  // 400 m long, 13 storeys rising about 117 m up the south face of Marpo Ri
  const white = lam('#efe9dc', 0.22),
    red = lam('#9c3a2c', 0.25),
    maroon = lam('#5e2a22', 0.25);
  const gold = lam('#d2a64a', 0.3),
    hill = lam('#8a7a5e', 0.25),
    win = lam('#3a302a', 0.15);
  const W: G[] = [],
    R: G[] = [],
    M: G[] = [],
    Au: G[] = [],
    H: G[] = [],
    D: G[] = [];

  const mound = new THREE.SphereGeometry(1, 28, 8, 0, PI * 2, 0, PI / 2);
  mound.scale(0.58, 0.3, 0.36);
  H.push(rough(at(mound, 0, 0, -0.08), 0.03));

  // battered outer walls along the foot, with round bastions at the ends
  W.push(frus(0.9, 0.09, 0.88, 0.07, 0.1, 0, 0, 0.24));
  for (const s of [-1, 1]) W.push(cyl(0.055, 0.048, 0.13, s * 0.46, 0, 0.22, 14));
  M.push(bx(0.88, 0.012, 0.075, 0, 0.1, 0.24));
  // zigzag stairs up the front
  for (const [x, a] of [
    [-0.25, 0.35],
    [-0.12, -0.35],
    [0.14, 0.35],
    [0.27, -0.35],
  ]) {
    const st = new THREE.BoxGeometry(0.15, 0.012, 0.02);
    st.rotateZ(a);
    W.push(at(st, x, 0.06, 0.29));
  }

  // White Palace terraces stepping up; east wing taller and longer
  W.push(bx(0.72, 0.2, 0.14, -0.02, 0, 0.13));
  M.push(bx(0.72, 0.014, 0.14, -0.02, 0.2, 0.13));
  W.push(bx(0.3, 0.34, 0.22, 0.24, 0, 0.0));
  M.push(bx(0.3, 0.02, 0.22, 0.24, 0.34, 0.0));
  W.push(bx(0.22, 0.3, 0.2, -0.27, 0, 0.0));
  M.push(bx(0.22, 0.02, 0.2, -0.27, 0.3, 0.0));
  windows(D, -0.36, 0.32, [0.06, 0.13], 0.2, 22);
  windows(D, 0.11, 0.37, [0.23, 0.29], 0.11, 8);
  windows(D, -0.37, -0.17, [0.23], 0.1, 6);

  // Red Palace in the middle, rising highest, with the maroon pembe frieze and gilded roofs
  R.push(bx(0.24, 0.46, 0.2, -0.02, 0, -0.01));
  W.push(bx(0.05, 0.4, 0.2, -0.165, 0, -0.01), bx(0.05, 0.4, 0.2, 0.125, 0, -0.01));
  M.push(
    bx(0.25, 0.04, 0.21, -0.02, 0.44, -0.01),
    bx(0.06, 0.02, 0.21, -0.165, 0.4, -0.01),
    bx(0.06, 0.02, 0.21, 0.125, 0.4, -0.01),
  );
  windows(D, -0.12, 0.08, [0.24, 0.3, 0.36], 0.092, 7);
  // the long hanging banner panel on the Red Palace front
  D.push(bx(0.05, 0.12, 0.004, -0.02, 0.22, 0.093));
  for (const [x, z, s] of [
    [-0.02, -0.04, 1],
    [-0.1, 0.03, 0.7],
    [0.06, 0.03, 0.7],
    [0.05, -0.08, 0.6],
    [-0.09, -0.08, 0.6],
  ]) {
    Au.push(bx(0.06 * s, 0.025, 0.05 * s, x, 0.48, z), hip(0.085 * s, 0.07 * s, 0.035, x, 0.505, z));
  }
  for (const x of [0.34, 0.15]) Au.push(bx(0.02, 0.025, 0.02, x, 0.36, 0.08));

  put(k, H, hill);
  put(k, W, white);
  put(k, R, red);
  put(k, M, maroon);
  put(k, Au, gold);
  put(k, D, win);
}

function himeji(k: Kit) {
  // main keep 46 m over the hill top, five roofs outside, linked to three small keeps round a court
  const white = lam('#f3f0ea', 0.22),
    roof = lam('#5d6570', 0.22),
    stone = lam('#9d968b', 0.25),
    hill = lam('#6f8650', 0.25);
  const Wh: G[] = [],
    Ro: G[] = [],
    St: G[] = [],
    Hl: G[] = [];

  Hl.push(frus(1.0, 0.8, 0.86, 0.66, 0.06, 0, 0, 0));
  St.push(frus(0.86, 0.66, 0.8, 0.6, 0.05, 0, 0.06, 0));

  const keep = (
    x: number,
    z: number,
    y0: number,
    base: number,
    ws: number[],
    ds: number[],
    hs: number[],
    gables: boolean,
  ) => {
    St.push(frus(ws[0] + 0.07, ds[0] + 0.07, ws[0] + 0.005, ds[0] + 0.005, base, x, y0, z));
    let y = y0 + base;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i],
        d = ds[i],
        h = hs[i];
      Wh.push(bx(w, h, d, x, y, z));
      y += h;
      const ov = 0.045 - i * 0.004,
        last = i === ws.length - 1;
      if (last) {
        Ro.push(hip(w + ov, d + ov, 0.07, x, y, z));
        // hip-and-gable ends, plus the shachi on the ridge
        Wh.push(
          tri(d * 0.5, 0.045, x - w / 2 + 0.01, y + 0.02, z, -PI / 2),
          tri(d * 0.5, 0.045, x + w / 2 - 0.01, y + 0.02, z, PI / 2),
        );
        Ro.push(
          bx(0.008, 0.02, 0.008, x - (w - d) / 2, y + 0.065, z),
          bx(0.008, 0.02, 0.008, x + (w - d) / 2, y + 0.065, z),
        );
      } else {
        const nw = ws[i + 1],
          nd = ds[i + 1];
        Ro.push(frus(w + ov, d + ov, nw * 0.98, nd * 0.98, 0.035, x, y, z));
        if (gables && i % 2 === 0) {
          // chidori hafu, triangular dormer gables on the south and east slopes
          Ro.push(gableZ(0.05, w * 0.42, 0.045, x, y + 0.012, z + d / 2 - 0.005));
          Wh.push(tri(w * 0.36, 0.035, x, y + 0.016, z + d / 2 + 0.021));
          Ro.push(gableX(0.05, d * 0.45, 0.045, x + w / 2 - 0.005, y + 0.012, z));
          Wh.push(tri(d * 0.38, 0.035, x + w / 2 + 0.021, y + 0.016, z, PI / 2));
        } else if (gables) {
          Ro.push(
            gableZ(0.045, w * 0.3, 0.04, x - w * 0.22, y + 0.01, z + d / 2 - 0.005),
            gableZ(0.045, w * 0.3, 0.04, x + w * 0.22, y + 0.01, z + d / 2 - 0.005),
          );
          Wh.push(
            tri(w * 0.25, 0.03, x - w * 0.22, y + 0.014, z + d / 2 + 0.018),
            tri(w * 0.25, 0.03, x + w * 0.22, y + 0.014, z + d / 2 + 0.018),
          );
        }
        y += 0.02;
      }
    }
  };
  keep(
    0.1,
    0.08,
    0.11,
    0.13,
    [0.3, 0.27, 0.23, 0.19, 0.15],
    [0.24, 0.21, 0.18, 0.15, 0.12],
    [0.11, 0.1, 0.085, 0.075, 0.075],
    true,
  );
  for (const [x, z] of [
    [-0.24, 0.08],
    [-0.24, -0.22],
    [0.1, -0.22],
  ])
    keep(x, z, 0.11, 0.07, [0.14, 0.11, 0.08], [0.12, 0.095, 0.07], [0.07, 0.06, 0.055], false);
  // watari-yagura, the roofed corridors closing the court
  for (const [x, z, l, alongX] of [
    [-0.07, -0.22, 0.2, 1],
    [-0.24, -0.07, 0.18, 0],
    [-0.07, 0.08, 0.1, 1],
    [0.1, -0.07, 0.1, 0],
  ] as const) {
    if (alongX) {
      Wh.push(bx(l, 0.07, 0.07, x, 0.18, z));
      Ro.push(gableX(l, 0.09, 0.035, x, 0.25, z));
      St.push(bx(l, 0.07, 0.08, x, 0.11, z));
    } else {
      Wh.push(bx(0.07, 0.07, l, x, 0.18, z));
      Ro.push(gableZ(l, 0.09, 0.035, x, 0.25, z));
      St.push(bx(0.08, 0.07, l, x, 0.11, z));
    }
  }
  put(k, Hl, hill);
  put(k, St, stone);
  put(k, Wh, white);
  put(k, Ro, roof);
}

function itsukushima(k: Kit) {
  // O-torii 16 m tall, about 200 m out in the bay, in front of red corridors on piers
  const red = lam('#d4583c', 0.3),
    black = lam('#2f2b29', 0.2),
    white = lam('#f1ece2', 0.22);
  const roof = lam('#6e6660', 0.22),
    deck = lam('#b39272', 0.25),
    water = lam('#4d6b7c', 0.25),
    hill = lam('#55703f', 0.25);
  const Re: G[] = [],
    Bk: G[] = [],
    Wh: G[] = [],
    Ro: G[] = [],
    Dk: G[] = [];

  const sea = new THREE.CylinderGeometry(1, 1, 0.006, 40);
  sea.scale(0.57, 1, 0.47);
  k.add(sea, 0.003, 0, 0.04, water);
  const misen = new THREE.SphereGeometry(1, 20, 6, 0, PI * 2, 0, PI / 2);
  misen.scale(0.52, 0.3, 0.15);
  put(k, [rough(at(misen, 0.05, 0, -0.4), 0.06)], hill);

  // torii: two main pillars, each braced fore and aft by a smaller leg
  const tx = -0.12,
    tz = 0.3,
    sp = 0.085;
  for (const s of [-1, 1]) {
    Re.push(cyl(0.02, 0.016, 0.34, tx + s * sp, 0, tz, 12));
    for (const dz of [-0.045, 0.045]) Re.push(cyl(0.011, 0.009, 0.15, tx + s * sp, 0, tz + dz, 8));
    Re.push(bx(0.012, 0.01, 0.1, tx + s * sp, 0.13, tz), bx(0.012, 0.01, 0.1, tx + s * sp, 0.06, tz));
    Bk.push(bx(0.028, 0.012, 0.028, tx + s * sp, 0, tz));
  }
  Re.push(
    bx(0.27, 0.016, 0.016, tx, 0.255, tz),
    bx(0.016, 0.06, 0.012, tx, 0.27, tz),
    bx(0.26, 0.016, 0.022, tx, 0.33, tz),
  );
  const kasagi = new THREE.BoxGeometry(0.34, 0.022, 0.032, 10, 1, 1),
    kp = kasagi.attributes.position;
  for (let i = 0; i < kp.count; i++) {
    const x = kp.getX(i);
    kp.setY(i, kp.getY(i) + 0.75 * x * x);
  }
  kasagi.computeVertexNormals();
  Bk.push(at(kasagi, tx, 0.357, tz));

  // shrine halls and corridors on piers, red walls, white panels, bark roofs
  const hall = (x: number, z: number, w: number, d: number, h: number, alongX: boolean) => {
    Dk.push(bx(w + 0.02, 0.008, d + 0.02, x, 0.006, z));
    Re.push(bx(w, h * 0.7, d, x, 0.014, z));
    Wh.push(bx(w * 0.9, h * 0.35, d + 0.002, x, 0.014 + h * 0.2, z));
    if (alongX) {
      Ro.push(hip(w + 0.03, d + 0.03, h * 0.55, x, 0.014 + h * 0.7, z));
    } else Ro.push(hip(w + 0.03, d + 0.03, h * 0.55, x, 0.014 + h * 0.7, z));
  };
  const corridor = (x: number, z: number, l: number, alongX: boolean) => {
    const w = alongX ? l : 0.035,
      d = alongX ? 0.035 : l;
    Dk.push(bx(w + 0.008, 0.008, d + 0.008, x, 0.006, z));
    Re.push(bx(alongX ? l : 0.03, 0.034, alongX ? 0.03 : l, x, 0.014, z));
    Ro.push(alongX ? gableX(l, 0.044, 0.014, x, 0.048, z) : gableZ(l, 0.044, 0.014, x, 0.048, z));
  };
  hall(0.12, -0.19, 0.24, 0.09, 0.085, true);
  hall(0.12, -0.08, 0.16, 0.07, 0.07, true);
  corridor(-0.13, -0.08, 0.26, true);
  corridor(0.37, -0.08, 0.26, true);
  corridor(-0.26, 0.0, 0.17, false);
  corridor(0.5, 0.0, 0.17, false);
  corridor(-0.17, 0.08, 0.18, true);
  corridor(0.41, 0.08, 0.18, true);
  // hirabutai platform and noh stage reaching towards the torii
  Dk.push(bx(0.12, 0.01, 0.12, 0.12, 0.004, 0.04));
  hall(0.12, 0.13, 0.07, 0.07, 0.06, true);
  put(k, Dk, deck);
  put(k, Re, red);
  put(k, Wh, white);
  put(k, Ro, roof);
  put(k, Bk, black);
}

function leshan(k: Kit) {
  // 71 m tall seated Buddha cut into the Lingyun cliff, feet at the river; shoulders 28 m, head 14.7 m
  const rock = lam('#8c6a54', 0.25),
    stone = lam('#b29c86', 0.28),
    hair = lam('#4b3d35', 0.2);
  const green = lam('#5d7c44', 0.25),
    water = lam('#4d6b7c', 0.25);
  const Rk: G[] = [],
    Bd: G[] = [],
    Hr: G[] = [],
    Gr: G[] = [];

  const river = new THREE.BoxGeometry(1.1, 0.006, 0.32);
  k.add(river, 0.003, 0, 0.36, water);
  // cliff behind and the two flanks of the niche
  Rk.push(rough(at(new THREE.BoxGeometry(1.0, 0.82, 0.3, 6, 6, 2), 0, 0.41, -0.32), 0.04));
  for (const s of [-1, 1])
    Rk.push(rough(at(new THREE.BoxGeometry(0.32, 0.78, 0.38, 3, 6, 3), s * 0.34, 0.39, 0.0), 0.05));
  // the rock left as his seat
  Rk.push(bx(0.4, 0.03, 0.12, 0, 0, 0.13), bx(0.36, 0.3, 0.3, 0, 0, -0.06));
  Gr.push(rough(at(new THREE.BoxGeometry(1.02, 0.05, 0.32, 6, 1, 2), 0, 0.84, -0.32), 0.04));
  for (const s of [-1, 1])
    Gr.push(rough(at(new THREE.BoxGeometry(0.34, 0.05, 0.4, 3, 1, 3), s * 0.34, 0.8, 0.0), 0.04));
  for (const [x, z, r] of [
    [-0.3, -0.3, 0.07],
    [0.05, -0.35, 0.08],
    [0.32, -0.28, 0.07],
    [-0.42, 0.05, 0.06],
    [0.4, 0.08, 0.06],
    [-0.15, -0.38, 0.06],
  ]) {
    const c = new THREE.IcosahedronGeometry(r, 0);
    c.scale(1, 0.8, 1);
    Gr.push(at(c, x, 0.88, z));
  }

  // seated with feet planted and hands on the knees
  const limb = (p: number[], q: number[], r0: number, r1: number) => {
    const a = new THREE.Vector3(...p),
      b = new THREE.Vector3(...q),
      d = b.clone().sub(a);
    const c = new THREE.CylinderGeometry(r1, r0, d.length(), 10);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    const m = a.add(b).multiplyScalar(0.5);
    return at(c, m.x, m.y, m.z);
  };
  const ball = (r: number, x: number, y: number, z: number) => at(new THREE.SphereGeometry(r, 8, 5), x, y, z);
  for (const s of [-1, 1]) {
    const x = s * 0.07;
    Bd.push(bx(0.08, 0.04, 0.11, x, 0.03, 0.215));
    Bd.push(limb([x, 0.06, 0.19], [x, 0.33, 0.175], 0.056, 0.06));
    Bd.push(limb([x, 0.33, -0.06], [x, 0.33, 0.175], 0.068, 0.062), ball(0.062, x, 0.33, 0.175));
    // upper arm hanging from the shoulder, forearm resting along the thigh, hand over the knee
    const sh = [s * 0.155, 0.6, -0.05],
      el = [s * 0.165, 0.43, -0.02],
      hd = [s * 0.11, 0.38, 0.15];
    Bd.push(limb(sh, el, 0.05, 0.044), ball(0.05, sh[0], sh[1], sh[2]), ball(0.044, el[0], el[1], el[2]));
    Bd.push(limb(el, hd, 0.044, 0.036), bx(0.06, 0.03, 0.07, hd[0] - s * 0.01, 0.37, 0.165));
  }
  const torso = lathe(
    [
      [0.12, 0],
      [0.14, 0.08],
      [0.15, 0.18],
      [0.165, 0.25],
      [0.13, 0.29],
      [0.04, 0.3],
    ],
    14,
  );
  torso.scale(1, 1, 0.62);
  Bd.push(at(torso, 0, 0.32, -0.05));
  Bd.push(cyl(0.04, 0.04, 0.05, 0, 0.6, -0.05, 10));
  const hy = 0.715,
    hz = -0.04,
    hr = 0.082;
  const head = new THREE.SphereGeometry(hr, 14, 8, 0, PI * 2, PI * 0.3, PI * 0.7);
  head.scale(0.92, 1.18, 0.92);
  Bd.push(at(head, 0, hy, hz));
  for (const s of [-1, 1]) Bd.push(bx(0.016, 0.09, 0.028, s * hr * 0.92, hy - 0.06, hz - 0.01));
  const cap = new THREE.SphereGeometry(hr * 1.06, 14, 6, 0, PI * 2, 0, PI * 0.36);
  cap.scale(0.92, 1.18, 0.92);
  Hr.push(at(cap, 0, hy + 0.004, hz));
  Hr.push(at(new THREE.SphereGeometry(0.036, 10, 6), 0, hy + hr * 1.16, hz - 0.01));
  // snail-shell curls
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4,
      e = 0.7 + (i % 4) * 0.22,
      rr = hr * 1.04;
    Hr.push(
      at(
        new THREE.IcosahedronGeometry(0.011, 0),
        rr * 0.92 * Math.cos(e) * Math.sin(a),
        hy + 0.004 + rr * 1.18 * Math.sin(e),
        hz + rr * 0.92 * Math.cos(e) * Math.cos(a),
      ),
    );
  }
  Hr.push(
    bx(0.03, 0.006, 0.006, -0.026, hy - 0.005, hz + hr * 0.91),
    bx(0.03, 0.006, 0.006, 0.026, hy - 0.005, hz + hr * 0.91),
  );
  put(k, Rk, rock);
  put(k, Gr, green);
  put(k, Bd, stone);
  put(k, Hr, hair);
}

const greatWall = staged([1505], (k, year) => {
  // Badaling: the Ming brick wall of 1505, 7-8 m high with crenellations and two-storey towers;
  // before that the line was held by older rammed-earth walls
  const ming = year >= 1505;
  const ridge = lam('#7d8a58', 0.25),
    brick = lam(ming ? '#aaa293' : '#b99a6e', 0.28),
    dark = lam('#3c3732', 0.15),
    roof = lam('#5b5f63', 0.2);
  const Rd: G[] = [],
    Br: G[] = [],
    Dk: G[] = [],
    Ro: G[] = [];

  const P = (t: number) =>
    new THREE.Vector3(
      -0.5 + t,
      0.15 + 0.1 * Math.sin(PI * t * 2.3 + 0.5) + 0.035 * Math.sin(9 * t),
      0.17 * Math.sin(2 * PI * t * 1.05 + 0.3) - 0.03,
    );
  const tang = (t: number) =>
    P(t + 0.001)
      .sub(P(t - 0.001))
      .normalize();

  // ridge: a crest running under the wall, falling away on both flanks and at the ends
  const NT = 34,
    NS = 7,
    Wd = 0.24,
    pos: number[] = [],
    idx: number[] = [];
  for (let i = 0; i <= NT; i++) {
    const t = -0.08 + (1.16 * i) / NT,
      c = P(Math.min(1, Math.max(0, t))),
      d = tang(Math.min(1, Math.max(0, t)));
    const n = new THREE.Vector3(-d.z, 0, d.x).normalize(),
      end = Math.min(1, Math.max(0, Math.min(t + 0.08, 1.08 - t) / 0.08));
    const cx = -0.5 + t;
    for (let j = 0; j <= NS; j++) {
      const s = -1 + (2 * j) / NS,
        hgt = c.y * Math.sqrt(end) * Math.max(0, 1 - s * s) ** 0.9;
      const jit = (hash(i, j, 3) - 0.5) * 0.035 * (1 - Math.abs(s));
      const wd = Wd * (0.45 + 0.55 * Math.sqrt(end));
      pos.push(cx + n.x * s * wd, Math.max(0, hgt + jit), c.z + n.z * s * wd);
    }
  }
  for (let i = 0; i < NT; i++)
    for (let j = 0; j < NS; j++) {
      const a = i * (NS + 1) + j,
        b = a + NS + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  Rd.push(rg);

  const frame = (t: number) => {
    const d = tang(t),
      z0 = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(),
      u = new THREE.Vector3().crossVectors(z0, d);
    return new THREE.Matrix4().makeBasis(d, u, z0).setPosition(P(t));
  };
  const level = (t: number) => {
    const d = tang(t),
      side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    return new THREE.Matrix4()
      .makeBasis(new THREE.Vector3(d.x, 0, d.z).normalize(), new THREE.Vector3(0, 1, 0), side)
      .setPosition(P(t));
  };
  const place = (g: G, m: THREE.Matrix4) => {
    g.applyMatrix4(m);
    return g;
  };

  const N = 28,
    ww = ming ? 0.036 : 0.032,
    wh = ming ? 0.04 : 0.032;
  for (let i = 0; i < N; i++) {
    const t0 = i / N,
      t1 = (i + 1) / N,
      tm = (t0 + t1) / 2,
      L = P(t1).distanceTo(P(t0)) + 0.012;
    const m = frame(tm);
    if (ming) {
      Br.push(place(at(new THREE.BoxGeometry(L, wh + 0.03, ww), 0, (wh - 0.03) / 2, 0), m));
      // crenellated parapet on the north (outer) side, plain one inside
      for (const f of [-0.25, 0.25])
        Br.push(place(at(new THREE.BoxGeometry(L * 0.3, 0.02, 0.007), f * L, wh + 0.01, -ww / 2 + 0.0035), m));
      Br.push(place(at(new THREE.BoxGeometry(L, 0.01, 0.005), 0, wh + 0.005, ww / 2 - 0.0025), m));
    } else {
      const g = new THREE.BoxGeometry(L, wh + 0.03, ww),
        p = g.attributes.position;
      for (let v = 0; v < p.count; v++) if (p.getY(v) > 0) p.setZ(v, p.getZ(v) * 0.55);
      Br.push(place(at(g, 0, (wh - 0.03) / 2, 0), m));
    }
  }

  const towers = [0.0, 0.19, 0.37, 0.56, 0.77, 1.0];
  towers.forEach((t, i) => {
    const m = level(t);
    if (ming) {
      const th = 0.085;
      Br.push(place(bx(0.07, th, 0.065, 0, -0.02, 0), m));
      Br.push(place(bx(0.076, 0.006, 0.071, 0, th - 0.02, 0), m));
      for (const [cx, cz] of [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ])
        Br.push(place(bx(0.016, 0.014, 0.016, cx * 0.03, th - 0.014, cz * 0.027), m));
      for (const s of [-1, 1])
        for (const x of [-0.018, 0.018]) Dk.push(place(bx(0.012, 0.02, 0.004, x, th - 0.06, s * 0.0335), m));
      if (i === 2 || i === 4) {
        Br.push(place(bx(0.036, 0.022, 0.03, 0, th - 0.014, 0), m));
        Ro.push(place(hip(0.05, 0.044, 0.022, 0, th + 0.008, 0), m));
      }
    } else if (i % 2 === 1) {
      // rammed-earth beacon mound
      Br.push(place(frus(0.06, 0.06, 0.03, 0.03, 0.07, 0, -0.02, 0.05), m));
    }
  });
  put(k, Rd, ridge);
  put(k, Br, brick);
  put(k, Dk, dark);
  put(k, Ro, roof);
});

function sigiriya(k: Kit) {
  // gneiss plug about 180 m high above the plain; Kashyapa's palace on top, lion stair
  // (only the paws survive), mirror wall gallery and water gardens running west
  const rock = lam('#87705f', 0.25),
    green = lam('#5f7f45', 0.25),
    brick = lam('#a8664a', 0.25);
  const water = lam('#5f8293', 0.25),
    plaster = lam('#e3d3a8', 0.25),
    dark = lam('#3b322c', 0.15);
  const Rk: G[] = [],
    Gr: G[] = [],
    Bk: G[] = [],
    Wa: G[] = [],
    Pl: G[] = [],
    Dk: G[] = [];
  const cx = 0.16,
    rx = 0.28,
    rz = 0.18,
    H = 0.52;

  const prof = [
    [1.3, 0],
    [1.12, 0.04],
    [1.02, 0.1],
    [0.97, 0.25],
    [1.0, 0.5],
    [0.98, 0.74],
    [0.92, 0.87],
    [0.78, 0.96],
    [0.45, 1.0],
    [0, 1.01],
  ];
  const g = lathe(prof, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      y = p.getY(i),
      a = Math.atan2(z, x);
    const f =
      1 +
      0.09 * Math.sin(2 * a + 1) +
      0.05 * Math.sin(5 * a) +
      0.03 * Math.sin(11 * a + y * 6) -
      0.04 * y * Math.cos(a);
    p.setXYZ(i, x * f * rx, y * H, z * f * rz);
  }
  g.computeVertexNormals();
  Rk.push(at(g, cx, 0, 0));
  // forest skirt round the foot
  const skirt = new THREE.CylinderGeometry(rx * 1.3, rx * 1.65, 0.05, 26);
  skirt.scale(1, 1, rz / rx);
  Gr.push(rough(at(skirt, cx, 0.025, 0), 0.02));
  const top = new THREE.SphereGeometry(1, 22, 4, 0, PI * 2, 0, PI / 2);
  top.scale(rx * 0.86, 0.03, rz * 0.86);
  Gr.push(at(top, cx, H * 0.985, 0));
  // palace terraces and cistern on the summit
  for (const [x, z, w, d] of [
    [-0.06, -0.04, 0.12, 0.08],
    [0.06, 0.04, 0.1, 0.07],
    [0.03, -0.07, 0.08, 0.04],
  ])
    Bk.push(bx(w, 0.014, d, cx + x, H * 1.0, z));
  Wa.push(bx(0.05, 0.004, 0.03, cx + 0.08, H * 1.0 + 0.014, -0.07));

  // lion platform on the near face: paws with claws either side of the stair
  const lz = rz * 1.05;
  Bk.push(bx(0.26, 0.06, 0.1, cx, 0, lz + 0.02));
  for (const s of [-1, 1]) {
    const px = cx + s * 0.065;
    Bk.push(bx(0.065, 0.09, 0.1, px, 0.06, lz + 0.05));
    for (const c of [-1, 0, 1]) {
      const claw = new THREE.ConeGeometry(0.01, 0.035, 6);
      claw.rotateX(PI / 2);
      Pl.push(at(claw, px + c * 0.021, 0.075, lz + 0.115));
    }
  }
  for (let i = 0; i < 6; i++) Pl.push(bx(0.06, 0.012, 0.014, cx, 0.06 + i * 0.012, lz + 0.09 - i * 0.014));
  // iron stair climbing the cliff above the paws
  const st = new THREE.BoxGeometry(0.014, 0.38, 0.006);
  st.rotateZ(0.2);
  Dk.push(at(st, cx + 0.03, 0.34, rz * 1.04 + 0.008));

  // mirror wall gallery along the west face
  const mw = new THREE.BoxGeometry(0.012, 0.035, 0.26);
  mw.rotateY(0.15);
  Pl.push(at(mw, cx - rx * 1.02, 0.18, 0.02));

  // water gardens on the axis to the west, bounded by the moat
  Gr.push(bx(0.5, 0.008, 0.3, -0.33, 0, 0));
  Pl.push(bx(0.46, 0.01, 0.025, -0.33, 0, 0));
  for (const x of [-0.48, -0.36, -0.22]) for (const s of [-1, 1]) Wa.push(bx(0.08, 0.012, 0.08, x, 0, s * 0.075));
  Wa.push(bx(0.025, 0.01, 0.42, -0.58, 0, 0));
  for (const s of [-1, 1]) Wa.push(bx(0.5, 0.01, 0.02, -0.33, 0, s * 0.17));
  for (const [x, z, r] of [
    [-0.12, 0.13, 0.03],
    [-0.08, -0.12, 0.035],
    [-0.15, -0.14, 0.022],
  ])
    Rk.push(rough(at(new THREE.IcosahedronGeometry(r, 0), x, r * 0.6, z), 0.01, false));

  put(k, Rk, rock);
  put(k, Gr, green);
  put(k, Bk, brick);
  put(k, Wa, water);
  put(k, Pl, plaster);
  put(k, Dk, dark);
}

function prambanan(k: Kit) {
  // inner court 110 m square; Shiva temple 47 m with Brahma and Vishnu (33 m) beside it facing east,
  // the three vahana temples opposite; 224 perwara shrines stood in rows outside
  const stone = lam('#a29b8f', 0.25),
    dark = lam('#4c4741', 0.15),
    ground = lam('#a7a08a', 0.25);
  const S: G[] = [],
    D: G[] = [],
    Gd: G[] = [];

  Gd.push(bx(1.08, 0.012, 1.08, 0, 0, 0));
  S.push(bx(0.66, 0.03, 0.66, 0, 0.012, 0));
  for (const [w, d, x, z] of [
    [0.68, 0.015, 0, 0.33],
    [0.68, 0.015, 0, -0.33],
    [0.015, 0.68, 0.33, 0],
    [0.015, 0.68, -0.33, 0],
  ])
    S.push(bx(w, 0.035, d, x, 0.012, z));

  // fin: ratna finials per roof tier (8, 4 or none); cross: redented tiers
  const candi = (x: number, z: number, s: number, H: number, fin: number, door: number, cross: boolean) => {
    const y0 = 0.042;
    S.push(
      bx(s, 0.12 * H, s, x, y0, z),
      bx(s * 1.18, 0.1 * H, s * 0.34, x, y0, z),
      bx(s * 0.34, 0.1 * H, s * 1.18, x, y0, z),
    );
    let y = y0 + 0.12 * H,
      w = s * 0.62;
    S.push(
      bx(w, 0.26 * H, w, x, y, z),
      bx(w * 1.2, 0.24 * H, w * 0.42, x, y, z),
      bx(w * 0.42, 0.24 * H, w * 1.2, x, y, z),
    );
    D.push(bx(0.006, 0.12 * H, w * 0.22, x + door * (w * 0.6 + 0.002), y, z));
    D.push(
      bx(w * 1.24, 0.012 * H, w * 0.46, x, y + 0.24 * H, z),
      bx(w * 0.46, 0.012 * H, w * 1.24, x, y + 0.24 * H, z),
    );
    y += 0.26 * H;
    const pts =
      fin === 8
        ? [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]
        : fin === 4
          ? [
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ]
          : [];
    for (let i = 0; i < 4; i++) {
      const tw = w * (0.86 - i * 0.16),
        th = 0.085 * H;
      S.push(bx(tw, th, tw, x, y, z));
      if (cross) S.push(bx(tw * 1.14, th * 0.85, tw * 0.5, x, y, z), bx(tw * 0.5, th * 0.85, tw * 1.14, x, y, z));
      for (const [a, b] of pts) {
        const o = a && b ? 0.5 : 0.6;
        S.push(
          at(
            new THREE.ConeGeometry(tw * 0.14, th * 0.95, 4, 1, true),
            x + a * tw * o,
            y + th + th * 0.47,
            z + b * tw * o,
          ),
        );
      }
      y += th;
    }
    S.push(cyl(w * 0.2, w * 0.14, 0.04 * H, x, y, z, 6));
    S.push(
      at(
        lathe(
          [
            [w * 0.16, 0],
            [w * 0.2, 0.025 * H],
            [w * 0.12, 0.06 * H],
            [w * 0.04, 0.09 * H],
            [0, 0.13 * H],
          ],
          6,
        ),
        x,
        y + 0.04 * H,
        z,
      ),
    );
  };
  candi(-0.12, 0, 0.26, 0.95, 8, -1, true);
  candi(-0.12, 0.22, 0.15, 0.62, 4, -1, false);
  candi(-0.12, -0.22, 0.15, 0.62, 4, -1, false);
  for (const z of [0.2, 0, -0.2]) candi(0.18, z, 0.12, 0.44, 0, 1, false);

  // perwara shrines, two of the four rows outside the court
  for (const [half, n] of [
    [0.42, 7],
    [0.51, 9],
  ] as const) {
    for (let i = 0; i < n; i++)
      for (const side of [0, 1, 2, 3]) {
        const f = -half + (2 * half * i) / n;
        const [x, z] = side === 0 ? [f, -half] : side === 1 ? [half, f] : side === 2 ? [-f, half] : [-half, -f];
        const sh = lathe(
          [
            [0.024, 0],
            [0.024, 0.035],
            [0, 0.08],
          ],
          4,
        );
        sh.rotateY(PI / 4);
        S.push(at(sh, x, 0.012, z));
      }
  }
  put(k, Gd, ground);
  put(k, S, stone);
  put(k, D, dark);
}

function mahabodhi(k: Kit) {
  // 55 m straight-sided brick shikhara on a high plinth with four small corner towers, facing east;
  // the Bodhi tree stands behind it on the west
  const tower = lam('#dccb9e', 0.27),
    dark = lam('#5a4a3a', 0.15),
    gold = lam('#d4a84a', 0.3);
  const ground = lam('#bdb196', 0.25),
    leaf = lam('#4f7a3e', 0.25),
    bark = lam('#6b5340', 0.2);
  const T: G[] = [],
    D: G[] = [],
    Au: G[] = [],
    Gd: G[] = [],
    Lf: G[] = [],
    Bk: G[] = [];
  const cx = 0.08;

  Gd.push(bx(1.0, 0.012, 0.8, -0.05, 0, 0));
  // stone railing round the temple
  for (const [w, d, x, z] of [
    [0.6, 0.012, cx, 0.3],
    [0.6, 0.012, cx, -0.3],
    [0.012, 0.6, cx + 0.3, 0],
    [0.012, 0.6, cx - 0.3, 0],
  ])
    Gd.push(bx(w, 0.03, d, x, 0.012, z));

  const shikhara = (x: number, z: number, y: number, w: number, h: number, niches: boolean) => {
    const t = 0.42;
    T.push(frus(w, w * 0.72, w * t, w * t * 0.72, h, x, y, z), frus(w * 0.72, w, w * t * 0.72, w * t, h, x, y, z));
    const tiers = niches ? 8 : 4;
    for (let i = 1; i < tiers; i++) {
      const f = i / tiers,
        ww = w * (1 - (1 - t) * f) + 0.004;
      T.push(frus(ww + 0.008, ww + 0.008, ww + 0.004, ww + 0.004, 0.008, x, y + h * f, z));
      if (niches) {
        const fm = f - 0.5 / tiers,
          wn = (w * (1 - (1 - t) * fm)) / 2 + 0.002,
          nh = (h / tiers) * 0.45,
          yy = y + h * fm - nh / 2;
        for (const o of [-0.3, 0.3]) {
          const ox = o * wn * 1.1;
          D.push(bx(0.016, nh, 0.006, x + ox, yy, z + wn), bx(0.016, nh, 0.006, x + ox, yy, z - wn));
          D.push(bx(0.006, nh, 0.016, x + wn, yy, z + ox), bx(0.006, nh, 0.016, x - wn, yy, z + ox));
        }
      }
    }
    const top = y + h,
      r = w * t * 0.5;
    T.push(cyl(r * 0.7, r * 0.6, h * 0.03, x, top, z, niches ? 10 : 6));
    const seg = niches ? 14 : 8,
      am = new THREE.SphereGeometry(r * 1.05, seg, niches ? 6 : 4);
    am.scale(1, 0.4, 1);
    T.push(at(am, x, top + h * 0.03 + r * 0.35, z));
    Au.push(
      at(
        lathe(
          [
            [r * 0.5, 0],
            [r * 0.55, h * 0.02],
            [r * 0.3, h * 0.05],
            [r * 0.12, h * 0.07],
            [r * 0.08, h * 0.11],
            [0, h * 0.14],
          ],
          niches ? 10 : 6,
        ),
        x,
        top + h * 0.03 + r * 0.7,
        z,
      ),
    );
  };
  T.push(bx(0.36, 0.1, 0.36, cx, 0.012, 0), bx(0.375, 0.012, 0.375, cx, 0.1, 0));
  D.push(bx(0.362, 0.03, 0.362, cx, 0.05, 0));
  shikhara(cx, 0, 0.112, 0.2, 0.68, true);
  for (const [a, b] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    shikhara(cx + a * 0.14, b * 0.14, 0.112, 0.06, 0.17, false);
  // east porch and stair
  T.push(bx(0.06, 0.12, 0.09, cx + 0.12, 0.112, 0));
  T.push(hip(0.07, 0.1, 0.04, cx + 0.12, 0.232, 0));
  D.push(bx(0.004, 0.07, 0.035, cx + 0.151, 0.112, 0));
  for (let i = 0; i < 5; i++) T.push(bx(0.02, 0.1 - i * 0.02, 0.08, cx + 0.19 + i * 0.02, 0.012, 0));

  // Bodhi tree on its platform
  const tx = -0.36,
    tz = -0.02;
  Gd.push(bx(0.16, 0.03, 0.16, tx, 0.012, tz));
  Bk.push(cyl(0.025, 0.018, 0.18, tx, 0.04, tz, 8));
  for (const [x, y, z, r] of [
    [0, 0.27, 0, 0.13],
    [0.07, 0.22, 0.06, 0.09],
    [-0.07, 0.23, -0.05, 0.1],
    [-0.05, 0.2, 0.08, 0.08],
    [0.06, 0.24, -0.07, 0.09],
  ]) {
    const c = new THREE.IcosahedronGeometry(r, 1);
    c.scale(1, 0.75, 1);
    Lf.push(rough(at(c, tx + x, y, tz + z), 0.025, false));
  }
  put(k, Gd, ground);
  put(k, T, tower);
  put(k, D, dark);
  put(k, Au, gold);
  put(k, Lf, leaf);
  put(k, Bk, bark);
}

export const batch_i: Record<string, Builder> = {
  'potala-palace': potala,
  'himeji-castle': himeji,
  'itsukushima-shrine': itsukushima,
  'leshan-giant-buddha': leshan,
  'great-wall': greatWall,
  sigiriya,
  prambanan,
  'mahabodhi-temple': mahabodhi,
};
