import * as THREE from 'three';
import { type Builder, doubleSided, gable, type Kit, merge, staged } from './kit';

const PI = Math.PI;
// rotations that turn a slab's +z face towards south, east, north, west
const S = 0,
  E = PI / 2,
  N = PI,
  W = -PI / 2;

const lathe = (pts: number[][], seg = 16) =>
  new THREE.LatheGeometry(
    pts.map(([r, h]) => new THREE.Vector2(r, h)),
    seg,
  );
const cyl = (r0: number, r1: number, h: number, seg = 16, y = 0, x = 0, z = 0) => {
  const c = new THREE.CylinderGeometry(r1, r0, h, seg);
  c.translate(x, y + h / 2, z);
  return c;
};
const boxg = (w: number, h: number, d: number, y: number, x = 0, z = 0) => {
  const b = new THREE.BoxGeometry(w, h, d);
  b.translate(x, y + h / 2, z);
  return b;
};

/** Scales each vertex's distance from the y axis by f(angle, y), for flutes, ribs and twisted stripes. */
function warp(geo: THREE.BufferGeometry, f: (t: number, y: number) => number) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      s = f(Math.atan2(x, z), p.getY(i));
    p.setX(i, x * s);
    p.setZ(i, z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function arch(w: number, h: number, pointed = true) {
  const r = w / 2,
    s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  if (pointed) {
    const spring = h - r * 1.25;
    s.lineTo(r, spring);
    s.quadraticCurveTo(r, spring + r * 0.9, 0, h);
    s.quadraticCurveTo(-r, spring + r * 0.9, -r, spring);
  } else {
    s.lineTo(r, h - r);
    s.absarc(0, h - r, r, 0, PI, false);
  }
  s.closePath();
  return s;
}

/** An extruded shape standing upright, its face turned by rot (S/E/N/W), centred in depth on (x, z). */
function slab(shape: THREE.Shape, d: number, rot: number, x: number, y: number, z: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}

const disc = (r: number, d: number, rot: number, x: number, y: number, z: number, seg = 20) => {
  const c = new THREE.CylinderGeometry(r, r, d, seg);
  c.rotateX(PI / 2);
  c.rotateY(rot);
  c.translate(x, y, z);
  return c;
};

function onion(r: number, h: number, seg = 16) {
  return lathe(
    [
      [r * 0.62, 0],
      [r * 0.9, h * 0.12],
      [r, h * 0.3],
      [r * 0.9, h * 0.48],
      [r * 0.55, h * 0.68],
      [r * 0.2, h * 0.84],
      [r * 0.06, h * 0.93],
      [0, h],
    ],
    seg,
  );
}

const pantheon = staged([1626, 1883], (k, year) => {
  // rotunda 58 m across with a shallow stepped dome and oculus; portico of 16 columns facing north
  const u = 1 / 84,
    V = 1.3,
    h = (m: number) => m * u * V;
  const R = 29 * u,
    cz = 0.5 - R;
  k.add(cyl(R, R, h(21), 48), 0, 0, cz);
  k.add(cyl(R + 0.005, R + 0.005, h(1.2), 48), h(11), 0, cz);
  k.add(cyl(R + 0.006, R + 0.006, h(1.5), 48), h(20), 0, cz);
  k.add(cyl(R * 0.985, R * 0.985, h(8), 48), h(21.5), 0, cz);
  let y = h(29.5);
  for (const f of [0.95, 0.89, 0.83]) {
    k.add(cyl(R * f, R * f, h(1.6), 48), y, 0, cz);
    y += h(1.6);
  }
  const dome = new THREE.SphereGeometry(R * 0.8, 48, 10, 0, PI * 2, 0, PI / 2);
  dome.scale(1, h(9) / (R * 0.8), 1);
  k.add(dome, y - 0.002, 0, cz);
  k.add(cyl(4.5 * u, 4.5 * u, 0.01, 20), y + h(9) - 0.006, 0, cz, k.dark);

  // intermediate block with its own higher pediment, then the portico
  const pw = 34 * u,
    front = -0.5,
    pd = 16 * u;
  k.box(pw + 0.02, h(24), 0.15, 0, 0, front + pd + 0.06);
  k.add(rotGable(0.15, pw + 0.02, 0.06), h(24), 0, front + pd + 0.06);
  k.box(pw * 0.75, h(14), 0.006, h(1.3), 0, front + pd - 0.014, k.dark);
  k.box(pw, h(1.3), pd + 0.01, 0, 0, front + pd / 2);
  const colH = h(14.2),
    cols: THREE.BufferGeometry[] = [];
  const xs = Array.from({ length: 8 }, (_, i) => -pw / 2 + 0.018 + (i * (pw - 0.036)) / 7);
  for (const x of xs) cols.push(cyl(0.012, 0.0095, colH, 8, h(1.3), x, front + 0.018));
  for (const z of [front + 0.075, front + 0.135])
    for (const i of [0, 2, 5, 7]) cols.push(cyl(0.012, 0.0095, colH, 8, h(1.3), xs[i], z));
  merge(k, cols);
  k.box(pw, h(2.6), pd + 0.01, h(1.3) + colH, 0, front + pd / 2);
  k.add(rotGable(pd + 0.01, pw, 0.07), h(3.9) + colH, 0, front + pd / 2);
  // 1626: Bernini's two bell towers on the intermediate block, the "ass's ears", pulled down in 1883
  if (year >= 1626 && year < 1883) {
    const bt: THREE.BufferGeometry[] = [],
      z = front + pd + 0.06;
    for (const s of [-1, 1]) {
      const x = s * (pw / 2 - 0.008);
      bt.push(
        boxg(0.04, h(7), 0.04, h(24), x, z),
        boxg(0.046, h(1), 0.046, h(31), x, z),
        boxg(0.032, h(6), 0.032, h(32), x, z),
      );
      const cap = new THREE.ConeGeometry(0.024, h(6), 4);
      cap.rotateY(PI / 4);
      cap.translate(x, h(38) + h(3), z);
      k.add(cap, 0, 0, 0, k.dark);
    }
    merge(k, bt);
    const op: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1])
      for (const rot of [N, S, E, W]) {
        const x = s * (pw / 2 - 0.008),
          d = 0.0165;
        op.push(slab(arch(0.016, h(4.5), false), 0.004, rot, x + Math.sin(rot) * d, h(32.7), z + Math.cos(rot) * d));
      }
    merge(k, op, k.dark);
  }
});

/** Gable whose ridge runs north-south. */
function rotGable(l: number, d: number, h: number) {
  const g = gable(l, d, h);
  g.rotateY(PI / 2);
  return g;
}

function minaret(k: Kit, x: number, z: number, y0: number, h: number, r: number, balconies: number[], cap = 0.12) {
  // slender Ottoman pencil minaret: shaft, balconies, tall cone
  const g: THREE.BufferGeometry[] = [
    boxg(r * 2.6, h * 0.1, r * 2.6, y0, x, z),
    cyl(r * 1.15, r, h * 0.9, 12, y0 + h * 0.1, x, z),
  ];
  for (const b of balconies) g.push(cyl(r * 1.15, r * 1.55, h * 0.025, 12, y0 + h * b, x, z));
  merge(k, g);
  k.add(cyl(r * 1.05, 0, cap, 12), y0 + h, x, z, k.dark);
}

const hagiaSophia = staged([1481, 1574], (k, year) => {
  // 82 x 73 m, central dome 31 m across and 55.6 m high on pendentives, half domes east and west,
  // huge buttress piers north and south, four Ottoman minarets
  const u = 1 / 100,
    V = 1.5,
    h = (m: number) => m * u * V;
  const R = 0.165;
  // aisles and galleries, narthex, apse
  k.box(0.66, h(21), 0.68, 0, 0.03, 0);
  k.box(0.68, 0.012, 0.7, h(21), 0.03, 0, k.dark);
  k.box(0.12, h(16), 0.66, 0, -0.36, 0);
  k.box(0.13, 0.012, 0.67, h(16), -0.36, 0, k.dark);
  k.add(cyl(0.1, 0.1, h(26), 20), 0, 0.36, 0);
  const ap = new THREE.SphereGeometry(0.1, 16, 6, 0, PI * 2, 0, PI / 2);
  ap.scale(1, 0.5, 1);
  k.add(ap, h(26), 0.36, 0, k.dark);
  // buttress piers
  const piers: THREE.BufferGeometry[] = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) piers.push(boxg(0.1, h(35), 0.12, 0, x * 0.2, z * 0.27));
  // central square and the north and south tympanum walls
  piers.push(boxg(0.36, h(36), 0.36, 0));
  merge(k, piers);
  const win: THREE.BufferGeometry[] = [];
  for (const z of [-1, 1])
    for (let i = 0; i < 7; i++)
      for (const yy of [h(25), h(30)]) win.push(boxg(0.018, h(3), 0.006, yy, -0.12 + i * 0.04, z * 0.18));
  merge(k, win, k.dark);
  // half domes east and west, small exedra domes beside them
  const half = (r: number, x: number, z: number, y: number, rot: number) => {
    const s = new THREE.SphereGeometry(r, 20, 8, PI / 2, PI, 0, PI / 2);
    s.scale(1, 0.85, 1);
    s.rotateY(rot);
    k.add(s, y, x, z, k.dark);
  };
  half(0.17, 0.18, 0, h(31), 0);
  half(0.17, -0.18, 0, h(31), PI);
  for (const x of [-1, 1]) for (const z of [-1, 1]) half(0.075, x * 0.3, z * 0.1, h(21), x > 0 ? 0 : PI);
  // drum of 40 windows and the shallow dome
  const drum = h(5);
  k.add(cyl(R, R, drum, 40), h(36), 0, 0);
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * PI * 2,
      b = new THREE.BoxGeometry(0.012, drum * 0.7, 0.012);
    b.translate(Math.sin(t) * R, h(36) + drum * 0.45, Math.cos(t) * R);
    ribs.push(b);
  }
  merge(k, ribs, k.dark);
  const dome = new THREE.SphereGeometry(R * 1.01, 40, 10, 0, PI * 2, 0, PI / 2);
  dome.scale(1, h(14) / R, 1);
  k.add(dome, h(36) + drum, 0, 0, k.dark);
  k.add(cyl(0.004, 0.002, 0.04, 6), h(36) + drum + h(14) - 0.004, 0, 0);
  // 1481: first minaret at the south-east corner; 1574: Sinan's buttresses and the other three
  if (year >= 1481) minaret(k, 0.44, 0.38, 0, 0.78, 0.018, [0.55, 0.8]);
  if (year >= 1574) {
    for (const [x, z] of [
      [-0.46, -0.4],
      [-0.46, 0.4],
      [0.42, -0.42],
    ])
      minaret(k, x, z, 0, 0.78, 0.018, [0.55, 0.8]);
    const bt: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1])
      for (const x of [-0.26, -0.08, 0.14, 0.3]) bt.push(wedge(0.04, 0.07, h(19), s > 0 ? S : N, x, s * 0.34));
    merge(k, bt);
  }
});

/** Sloping buttress against a wall: base d deep, face turned by rot (S/E/N/W), back against (x, z). */
function wedge(w: number, d: number, hh: number, rot: number, x: number, z: number) {
  const s = new THREE.Shape([
    new THREE.Vector2(-w / 2, 0),
    new THREE.Vector2(w / 2, 0),
    new THREE.Vector2(w / 2, hh),
    new THREE.Vector2(-w / 2, hh),
  ]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > hh / 2) p.setZ(i, p.getZ(i) * 0.25);
  g.computeVertexNormals();
  g.rotateY(rot);
  g.translate(x, 0, z);
  return g;
}

const mezquita = staged([833, 961, 987, 1523], (k, year) => {
  // 178 x 128 m, long axis north-south: a prayer hall of 19 parallel aisles under ridged roofs,
  // the orange-tree court to the north and its minaret on the north wall.
  // 785: Abd al-Rahman I's hall of 11 aisles; 833 and 961: extended south; 987: al-Mansur's
  // 8 aisles along the whole east side; 1523: the cathedral rising out of the middle
  const u = 1 / 178,
    V = 1.6,
    h = (m: number) => m * u * V;
  const w = 128 * u,
    hallZ = -0.5 + 58 * u;
  const t = 0.012;
  const n = year >= 987 ? 19 : 11,
    aw = (w - 2 * t) / 19;
  const x0 = -w / 2,
    x1 = x0 + 2 * t + aw * n,
    cw = x1 - x0,
    cx = (x0 + x1) / 2;
  const zAt = (f: number) => hallZ + (0.5 - hallZ) * f;
  const z1 = zAt(year >= 961 ? 1 : year >= 833 ? 0.55 : 0.32);
  // outer walls with buttresses
  const walls: THREE.BufferGeometry[] = [
    boxg(cw, h(9), t, 0, cx, -0.5 + t / 2),
    boxg(t, h(9), z1 + 0.5, 0, x0 + t / 2, (z1 - 0.5) / 2),
    boxg(t, h(9), z1 + 0.5, 0, x1 - t / 2, (z1 - 0.5) / 2),
    boxg(cw, h(9), t, 0, cx, z1 - t / 2),
    boxg(cw, h(9), t, 0, cx, hallZ),
  ];
  for (let i = 0; i <= 14; i++) {
    const z = -0.48 + i * 0.069;
    if (z < z1 - 0.01)
      walls.push(boxg(0.014, h(10.5), 0.016, 0, x0 - 0.004, z), boxg(0.014, h(10.5), 0.016, 0, x1 + 0.004, z));
  }
  for (let i = 0; i <= 9; i++) {
    const x = x0 + 0.03 + i * ((w - 0.06) / 9);
    if (x < x1 - 0.02)
      walls.push(boxg(0.016, h(10.5), 0.014, 0, x, -0.504), boxg(0.016, h(10.5), 0.014, 0, x, z1 + 0.004));
  }
  // court arcades on three sides
  walls.push(boxg(cw - 2 * t, h(7), 0.03, 0, cx, -0.5 + t + 0.015));
  for (const x of [x0 + t + 0.015, x1 - t - 0.015])
    walls.push(boxg(0.03, h(7), hallZ + 0.5 - t, 0, x, (hallZ - 0.5 + t) / 2));
  const mx = -0.04,
    mz = -0.5 + 0.02;
  if (year >= 1523) {
    // the minaret encased in the Christian bell tower, square in stages with a belfry lantern
    walls.push(
      boxg(0.06, h(36), 0.06, 0, mx, mz),
      boxg(0.07, h(1.5), 0.07, h(36), mx, mz),
      boxg(0.05, h(10), 0.05, h(37.5), mx, mz),
      boxg(0.035, h(6), 0.035, h(47.5), mx, mz),
    );
    k.add(cyl(0.012, 0, 0.04, 8), h(53.5), mx, mz, k.dark);
  } else {
    walls.push(
      boxg(0.052, h(34), 0.052, 0, mx, mz),
      boxg(0.062, h(1.2), 0.062, h(34), mx, mz),
      boxg(0.03, h(6), 0.03, h(35.2), mx, mz),
    );
    const cap = new THREE.SphereGeometry(0.017, 10, 5, 0, PI * 2, 0, PI / 2);
    k.add(cap, h(41.2), mx, mz, k.dark);
  }
  merge(k, walls);
  // the hall shows light between narrowed roofs so the parallel ridges read
  const rl = z1 - hallZ - t,
    rz = (hallZ + z1 - t) / 2;
  k.box(cw - 2 * t, h(7.5), rl, 0, cx, rz);
  const roofs: THREE.BufferGeometry[] = [],
    caps: THREE.BufferGeometry[] = [];
  // the sixth aisle is the axis of the original hall and leads to the mihrab
  const ridge = (i: number) => (i === 5 ? 0.06 : 0.048);
  for (let i = 0; i < n; i++) {
    const g = rotGable(rl - 0.01, aw * 0.86, ridge(i));
    g.translate(x0 + t + aw * (i + 0.5), h(7.5), rz);
    roofs.push(g);
    caps.push(boxg(0.006, 0.004, rl - 0.01, h(7.5) + ridge(i) - 0.003, x0 + t + aw * (i + 0.5), rz));
  }
  if (year >= 961) {
    // al-Hakam II's ribbed domes before the mihrab and at the head of his extension
    for (const [i, z] of [
      [4, 0.47],
      [5, 0.47],
      [6, 0.47],
      [5, zAt(0.57)],
    ]) {
      const x = x0 + t + aw * (i + 0.5);
      caps.push(boxg(aw * 0.95, 0.03, aw * 0.95, h(7.5) + 0.035, x, z));
      const d = new THREE.SphereGeometry(aw * 0.45, 12, 5, 0, PI * 2, 0, PI / 2);
      d.translate(x, h(7.5) + 0.065, z);
      roofs.push(d.toNonIndexed());
    }
  }
  merge(k, roofs, k.dark);
  merge(k, caps);
  if (year >= 1523) {
    // Renaissance nave and transept with a lantern over the crossing
    const ccx = 0.04,
      ccz = zAt(0.5),
      ch = h(28);
    const cath: THREE.BufferGeometry[] = [
      boxg(0.36, ch, 0.09, 0, ccx, ccz),
      boxg(0.09, ch, 0.26, 0, ccx, ccz),
      boxg(0.1, h(5), 0.1, ch, ccx, ccz),
    ];
    merge(k, cath);
    const nr = gable(0.36, 0.1, 0.055),
      tr = rotGable(0.26, 0.1, 0.055);
    nr.translate(ccx, ch, ccz);
    tr.translate(ccx, ch, ccz);
    const lan = new THREE.SphereGeometry(0.05, 16, 6, 0, PI * 2, 0, PI / 2);
    lan.scale(1, 0.7, 1);
    lan.translate(ccx, ch + h(5), ccz);
    merge(k, [nr, tr, lan.toNonIndexed()], k.dark);
  }
  // orange trees in rows across the court
  const trees: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 3; j++) {
      const x = x0 + 0.08 + i * ((w - 0.16) / 6);
      if (x > x1 - 0.05) continue;
      const s = new THREE.IcosahedronGeometry(0.022, 0);
      s.translate(x, 0.022, -0.5 + 0.09 + j * 0.08);
      trees.push(s);
    }
  merge(k, trees, k.dark);
});

const notreDame = staged([1786, 1859, 2019, 2024], (k, year) => {
  // 128 m long, west front with two flat-topped 69 m towers and rose window, transept roses,
  // flying buttresses, rounded east end and the 96 m crossing spire
  const u = 1 / 128,
    V = 1.5,
    h = (m: number) => m * u * V;
  const nz = 0.065,
    az = 0.19,
    x0 = -0.4,
    x1 = 0.36,
    cx = 0.03;
  const body: THREE.BufferGeometry[] = [
    boxg(x1 - x0, h(18), az * 2, 0, (x0 + x1) / 2),
    boxg(x1 - x0, h(33), nz * 2, 0, (x0 + x1) / 2),
    boxg(0.1, h(33), 0.42, 0, cx),
    cyl(nz, nz, h(33), 16, 0, x1),
    cyl(az, az, h(18), 24, 0, x1),
  ];
  // west front
  body.push(boxg(0.1, h(45), 0.33, 0, -0.45));
  for (const z of [-1, 1]) body.push(boxg(0.11, h(24), 0.11, h(45), -0.45, z * 0.11));
  for (const z of [-1, 1])
    for (const x of [-1, 1]) body.push(boxg(0.015, h(3), 0.015, h(69), -0.45 + x * 0.045, z * 0.11 + 0.045));
  merge(k, body);
  // roofs; 2019: the fire took the lead roof and spire, leaving the vaults open to the sky
  const burnt = year >= 2019 && year < 2024;
  const ridge = 0.13;
  const amb = new THREE.ConeGeometry(az + 0.005, 0.05, 24, 1, true, 0, PI);
  amb.translate(x1, h(18) + 0.025, 0);
  const aisle: THREE.BufferGeometry[] = [amb];
  if (burnt) {
    const charred = new THREE.MeshLambertMaterial({ color: '#2a2622' });
    merge(
      k,
      [
        boxg(x1 - x0, 0.006, nz * 2, h(33), (x0 + x1) / 2),
        boxg(0.1, 0.006, 0.42, h(33), cx),
        cyl(nz, nz, 0.006, 16, h(33), x1),
      ],
      charred,
    );
    // the stone gables of the west front and transepts stood
    merge(
      k,
      [-1, 1].map(z => {
        const g = rotGable(0.012, 0.1, ridge);
        g.translate(cx, h(33), z * 0.204);
        return g;
      }),
    );
  } else {
    const nave = gable(x1 - x0, nz * 2 + 0.01, ridge);
    nave.translate((x0 + x1) / 2, h(33), 0);
    const tr = rotGable(0.43, 0.1, ridge);
    tr.translate(cx, h(33), 0);
    merge(k, [nave, tr], k.dark);
    const apse = new THREE.ConeGeometry(nz + 0.005, ridge, 16, 1, false, 0, PI);
    apse.translate(x1, h(33) + ridge / 2, 0);
    aisle.push(apse);
  }
  for (const z of [-1, 1]) {
    const a = new THREE.BoxGeometry(x1 - x0, 0.008, az - nz);
    a.translate((x0 + x1) / 2, h(18) + 0.004, (z * (az + nz)) / 2);
    aisle.push(a);
  }
  merge(k, aisle, doubleSided(k.dark));
  // flying buttresses along the sides and round the apse
  const fb: THREE.BufferGeometry[] = [];
  const flyer = (x: number, z: number, ang: number) => {
    const pier = new THREE.BoxGeometry(0.02, h(26), 0.02);
    pier.translate(0, h(13), az + 0.012);
    const span = az - nz + 0.012,
      arm = new THREE.BoxGeometry(0.008, 0.01, Math.hypot(span, 0.12));
    arm.rotateX(Math.atan2(0.12, span));
    arm.translate(0, h(26) + 0.06 - 0.01, nz + span / 2);
    for (const g of [pier, arm]) {
      g.rotateY(ang);
      g.translate(x, 0, z);
      fb.push(g);
    }
  };
  for (let x = x0 + 0.04; x < x1 - 0.01; x += 0.055) {
    if (Math.abs(x - cx) < 0.07) continue;
    flyer(x, 0, 0);
    flyer(x, 0, PI);
  }
  for (let i = 1; i < 6; i++) flyer(x1, 0, PI / 2 - (i / 6) * PI + PI);
  merge(k, fb);
  // rose windows, portals, gallery of kings
  const dk: THREE.BufferGeometry[] = [disc(0.055, 0.006, W, -0.5, h(31), 0, 24)];
  for (const z of [-1, 1]) dk.push(disc(0.045, 0.006, S, cx, h(26), z * 0.21, 24));
  for (const z of [-0.105, 0, 0.105]) dk.push(boxg(0.006, h(17), 0.06, 0, -0.5, z));
  dk.push(boxg(0.006, h(2.5), 0.31, h(19.5), -0.5, 0));
  for (const z of [-1, 1])
    for (const x of [-0.035, 0.035]) dk.push(boxg(0.006, h(14), 0.022, h(48), -0.5, z * 0.11 + x));
  merge(k, dk, k.dark);
  // crossing spire: the 13th-century one taken down in 1786, Viollet-le-Duc's taller one from 1859
  const top = year < 1786 ? 78 : year >= 1859 && !burnt ? 96 : 0;
  if (top) {
    k.add(cyl(0.03, 0.026, h(10), 8), h(33) + ridge - 0.04, cx, 0);
    k.add(
      cyl(0.026, 0, h(top) - h(43) - h(10) + 0.04, 8),
      h(43) + h(10) - 0.04 + (h(33) + ridge - h(43)),
      cx,
      0,
      k.dark,
    );
  }
});

function venetianDome(
  k: Kit,
  x: number,
  z: number,
  y: number,
  r: number,
  hgt: number,
  parts: THREE.BufferGeometry[],
  tall = true,
) {
  // drum, tall wooden outer shell that bulges a little, lantern with a small onion and cross
  parts.push(cyl(r * 0.92, r * 0.92, hgt * 0.18, 20, y, x, z));
  if (!tall) {
    // the original low brick dome with a ring of windows at its foot
    const d = new THREE.SphereGeometry(r * 0.92, 20, 6, 0, PI * 2, 0, PI / 2);
    d.scale(1, 0.6, 1);
    d.translate(x, y + hgt * 0.18, z);
    k.add(d, 0, 0, 0, k.dark);
    parts.push(cyl(0.003, 0.003, hgt * 0.1, 4, y + hgt * 0.18 + r * 0.55, x, z));
    return;
  }
  const shell = lathe(
    [
      [r * 0.95, 0],
      [r * 1.03, hgt * 0.12],
      [r * 1.0, hgt * 0.3],
      [r * 0.86, hgt * 0.5],
      [r * 0.58, hgt * 0.68],
      [r * 0.3, hgt * 0.76],
      [r * 0.16, hgt * 0.79],
    ],
    20,
  );
  shell.translate(x, y + hgt * 0.18, z);
  k.add(shell, 0, 0, 0, k.dark);
  parts.push(cyl(r * 0.16, r * 0.16, hgt * 0.1, 8, y + hgt * 0.93, x, z));
  const o = onion(r * 0.2, hgt * 0.16, 8);
  o.translate(x, y + hgt * 1.03, z);
  k.add(o, 0, 0, 0, k.dark);
  parts.push(cyl(0.003, 0.003, hgt * 0.12, 4, y + hgt * 1.17, x, z));
}

const stMarks = staged([1230], (k, year) => {
  // 76.5 x 62.6 m Greek cross under five domes; west front of five portals topped by ogee arches
  const u = 1 / 77,
    V = 1.4,
    h = (m: number) => m * u * V;
  const parts: THREE.BufferGeometry[] = [
    boxg(0.88, h(16), 0.8, 0, -0.06, 0),
    boxg(0.78, h(26), 0.26, 0, -0.01, 0),
    boxg(0.26, h(26), 0.74, 0, 0, 0),
    cyl(0.1, 0.1, h(26), 16, 0, 0.38, 0),
  ];
  const domes: [number, number, number][] = [
    [0, 0, 0.115],
    [0.27, 0, 0.1],
    [-0.27, 0, 0.1],
    [0, 0.26, 0.1],
    [0, -0.26, 0.1],
  ];
  // c. 1230: lead-covered timber shells raised high over the low brick domes
  for (const [x, z, r] of domes) venetianDome(k, x, z, h(26), r, r === 0.115 ? 0.25 : 0.215, parts, year >= 1230);
  merge(k, parts);
  // upper facade: five arches with ogee crowns rising above the terrace
  const fz = 0.4,
    fx = -0.48;
  const crown = new THREE.Shape();
  const bays = [-0.32, -0.16, 0, 0.16, 0.32],
    bw = [0.13, 0.13, 0.17, 0.13, 0.13];
  crown.moveTo(-fz, 0);
  for (let i = 0; i < 5; i++) {
    const c = bays[i],
      r = bw[i] / 2,
      top = i === 2 ? 0.3 : 0.24;
    crown.lineTo(c - r, top - r * 1.2);
    crown.quadraticCurveTo(c - r, top - r * 0.2, c, top);
    crown.quadraticCurveTo(c + r, top - r * 0.2, c + r, top - r * 1.2);
  }
  crown.lineTo(fz, 0);
  crown.closePath();
  k.add(slab(crown, 0.04, W, fx + 0.04, 0, 0), h(16));
  const dk: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const r = bw[i] * 0.4;
    dk.push(slab(arch(r * 2, h(13), false), 0.006, W, fx - 0.04, 0, bays[i]));
    dk.push(slab(arch(r * 1.8, i === 2 ? 0.2 : 0.14, false), 0.006, W, fx + 0.02, h(16) + 0.01, bays[i]));
  }
  k.add(
    slab(
      new THREE.Shape([
        new THREE.Vector2(-fz, 0),
        new THREE.Vector2(fz, 0),
        new THREE.Vector2(fz, h(16)),
        new THREE.Vector2(-fz, h(16)),
      ]),
      0.08,
      W,
      fx,
      0,
      0,
    ),
    0,
  );
  merge(k, dk, k.dark);
});

const towerOfLondon = staged([1240, 1285], (k, year) => {
  // the White Tower (36 x 32 m, four corner turrets with lead cupolas, the north-east one round)
  // inside two rings of curtain walls with drum towers; the Thames is to the south
  const V = 2,
    h = (m: number) => (m / 180) * V;
  const walls: THREE.BufferGeometry[] = [];
  const merlons = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0),
      n = Math.floor(L / 0.03);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n,
        b = new THREE.BoxGeometry(0.014, 0.012, 0.014);
      b.translate(x0 + (x1 - x0) * t, y + 0.006, z0 + (z1 - z0) * t);
      walls.push(b);
    }
  };
  const ring = (hw: number, hd: number, hh: number, t: number, towers: number[][], tr: number, th: number) => {
    walls.push(
      boxg(hw * 2, hh, t, 0, 0, -hd),
      boxg(hw * 2, hh, t, 0, 0, hd),
      boxg(t, hh, hd * 2, 0, -hw, 0),
      boxg(t, hh, hd * 2, 0, hw, 0),
    );
    merlons(-hw, -hd, hw, -hd, hh);
    merlons(-hw, hd, hw, hd, hh);
    merlons(-hw, -hd, -hw, hd, hh);
    merlons(hw, -hd, hw, hd, hh);
    for (const [x, z] of towers) walls.push(cyl(tr, tr, th, 12, 0, x * hw, z * hd));
  };
  // 1240: Henry III's inner curtain; 1285: Edward I's outer ring, moat and the south-west gate towers
  if (year >= 1285) {
    ring(
      0.49,
      0.45,
      h(9),
      0.02,
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [0, 1],
        [-0.35, 1],
        [0.4, -1],
      ],
      0.035,
      h(12),
    );
    walls.push(cyl(0.04, 0.04, h(14), 12, 0, -0.44, 0.49), cyl(0.04, 0.04, h(14), 12, 0, -0.52, 0.49));
    const water = new THREE.MeshLambertMaterial({ color: '#5d7684' }),
      mw = 0.05,
      o = 0.035 + mw / 2;
    merge(
      k,
      [
        boxg(2 * (0.49 + o + mw / 2), 0.004, mw, 0, 0, -0.45 - o),
        boxg(2 * (0.49 + o + mw / 2), 0.004, mw, 0, 0, 0.45 + o),
        boxg(mw, 0.004, 2 * (0.45 + o), 0, -0.49 - o, 0),
        boxg(mw, 0.004, 2 * (0.45 + o), 0, 0.49 + o, 0),
      ],
      water,
    );
  }
  if (year >= 1240)
    ring(
      0.37,
      0.34,
      h(13),
      0.022,
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [0, -1],
        [0.5, -1],
        [-0.5, -1],
        [1, 0],
        [-1, 0],
        [0.4, 1],
        [-0.4, 1],
      ],
      0.035,
      h(17),
    );
  // White Tower
  const wx = 0.03,
    wz = -0.02,
    ww = 0.26,
    wd = 0.23,
    wh = h(27);
  walls.push(boxg(ww, wh, wd, 0, wx, wz));
  merlons(wx - ww / 2, wz - wd / 2, wx + ww / 2, wz - wd / 2, wh);
  merlons(wx - ww / 2, wz + wd / 2, wx + ww / 2, wz + wd / 2, wh);
  merlons(wx - ww / 2, wz - wd / 2, wx - ww / 2, wz + wd / 2, wh);
  merlons(wx + ww / 2, wz - wd / 2, wx + ww / 2, wz + wd / 2, wh);
  const th = h(33);
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, 1],
  ])
    walls.push(boxg(0.05, th, 0.05, 0, wx + sx * (ww / 2 - 0.02), wz + sz * (wd / 2 - 0.02)));
  walls.push(cyl(0.033, 0.033, th, 14, 0, wx + ww / 2 - 0.01, wz - wd / 2 + 0.01));
  merge(k, walls);
  const caps: THREE.BufferGeometry[] = [],
    dk: THREE.BufferGeometry[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ]) {
    const round = sx > 0 && sz < 0,
      x = wx + sx * (ww / 2 - (round ? 0.01 : 0.02)),
      z = wz + sz * (wd / 2 - (round ? 0.01 : 0.02));
    const o = onion(round ? 0.03 : 0.029, 0.07, round ? 14 : 4);
    if (!round) o.rotateY(PI / 4);
    o.translate(x, th, z);
    caps.push(o, cyl(0.002, 0.002, 0.03, 4, th + 0.065, x, z));
  }
  for (const [rot, fx, fz, n] of [
    [S, 0, 1, 5],
    [N, 0, -1, 5],
    [E, 1, 0, 4],
    [W, -1, 0, 4],
  ] as const) {
    const len = fx ? wd : ww;
    for (let i = 0; i < n; i++)
      for (const yy of [h(12), h(20)]) {
        const o = -len / 2 + 0.045 + (i * (len - 0.09)) / (n - 1);
        dk.push(
          slab(
            arch(0.016, 0.04, false),
            0.006,
            rot,
            wx + (fx * ww) / 2 + (fx ? 0 : o),
            yy,
            wz + (fz * wd) / 2 + (fz ? 0 : o),
          ),
        );
      }
  }
  merge(k, caps, k.dark);
  merge(k, dk, k.dark);
});

function bigBen(k: Kit) {
  // Elizabeth Tower, 96 m high on a 12 m square base: panelled shaft, projecting clock stage with
  // four 7 m dials, belfry, then a steep cast-iron spire. Height kept a little short of real
  const b = 0.46,
    y1 = 1.45,
    y2 = 1.95,
    y3 = 2.22,
    top = 2.95;
  const parts: THREE.BufferGeometry[] = [
    boxg(b + 0.04, 0.12, b + 0.04, 0),
    boxg(b, y1, b, 0),
    boxg(b + 0.03, 0.03, b + 0.03, y1 - 0.03),
    boxg(b + 0.05, y2 - y1, b + 0.05, y1),
    boxg(b + 0.07, 0.04, b + 0.07, y2),
    boxg(b - 0.04, y3 - y2, b - 0.04, y2 + 0.04),
  ];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (b / 2 + 0.01),
        z = sz * (b / 2 + 0.01);
      parts.push(boxg(0.04, 0.05, 0.04, y1 - 0.02, x, z), cyl(0.02, 0, 0.12, 4, y1 + 0.03, x, z));
      const px = sx * (b / 2 - 0.02),
        pz = sz * (b / 2 - 0.02);
      parts.push(boxg(0.04, 0.22, 0.04, y2 + 0.04, px, pz), cyl(0.024, 0, 0.18, 4, y2 + 0.26, px, pz));
    }
  merge(k, parts);
  const spire = new THREE.ConeGeometry(b * 0.55, top - y3 - 0.05, 4);
  spire.rotateY(PI / 4);
  k.add(spire, y3 + 0.04 + (top - y3 - 0.05) / 2, 0, 0, k.dark);
  k.add(cyl(0.006, 0.004, 0.1, 6), top - 0.05, 0, 0);
  const dk: THREE.BufferGeometry[] = [],
    faces: THREE.BufferGeometry[] = [];
  const cr = 0.17,
    cy = (y1 + y2) / 2;
  for (const [rot, fx, fz] of [
    [S, 0, 1],
    [N, 0, -1],
    [E, 1, 0],
    [W, -1, 0],
  ] as const) {
    const off = (b + 0.05) / 2,
      px = fx * off,
      pz = fz * off;
    dk.push(disc(cr + 0.012, 0.008, rot, px, cy, pz, 28));
    faces.push(disc(cr, 0.014, rot, px, cy, pz, 28));
    // panel strips on the shaft and lancets in the belfry
    for (let i = 0; i < 5; i++) {
      const o = -0.16 + i * 0.08,
        w = 0.016;
      const g = new THREE.BoxGeometry(fx ? 0.006 : w, y1 - 0.25, fx ? w : 0.006);
      g.translate((fx * b) / 2 + (fx ? 0 : o), 0.16 + (y1 - 0.25) / 2, (fz * b) / 2 + (fz ? 0 : o));
      dk.push(g);
    }
    for (const o of [-0.09, 0, 0.09])
      dk.push(
        slab(
          arch(0.05, 0.18),
          0.008,
          rot,
          (fx * (b - 0.04)) / 2 + (fx ? 0 : o),
          y2 + 0.07,
          (fz * (b - 0.04)) / 2 + (fz ? 0 : o),
        ),
      );
  }
  merge(k, faces);
  // hands at about ten past ten
  for (const [rot, fx, fz] of [
    [S, 0, 1],
    [N, 0, -1],
    [E, 1, 0],
    [W, -1, 0],
  ] as const) {
    const off = (b + 0.05) / 2 + 0.008;
    for (const [len, ang] of [
      [0.13, 0.35],
      [0.09, -1.1],
    ]) {
      const hnd = new THREE.BoxGeometry(0.012, len, 0.004);
      hnd.translate(0, len / 2, 0);
      hnd.rotateZ(ang);
      hnd.rotateY(rot);
      hnd.translate(fx * off, cy, fz * off);
      dk.push(hnd);
    }
  }
  merge(
    k,
    dk.filter(g => g.index),
    k.dark,
  );
  merge(
    k,
    dk.filter(g => !g.index),
    k.dark,
  );
}

function stBasils(k: Kit) {
  // central tented church (47.5 m) ringed by eight chapels with twisted and ribbed onion domes,
  // on a raised gallery, with the tented bell tower to the south-east
  const u = 1 / 70,
    V = 1.4,
    h = (m: number) => m * u * V;
  const base: THREE.BufferGeometry[] = [boxg(0.8, h(6), 0.8, 0)];
  const y0 = h(6);
  // central church: octagon, kokoshnik tiers, tent, small onion
  base.push(cyl(0.12, 0.12, h(17), 8, y0));
  base.push(cyl(0.1, 0.1, h(4), 8, y0 + h(17)));
  const ty = y0 + h(21),
    tentH = h(17);
  base.push(cyl(0.035, 0.035, h(3), 8, ty + tentH));
  const kok: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++)
    for (const [r, y, s] of [
      [0.12, y0 + h(17), 1],
      [0.1, y0 + h(21), 0.8],
    ]) {
      const t = (i / 8) * PI * 2 + PI / 8,
        g = new THREE.ConeGeometry(0.04 * s, 0.05 * s, 3);
      g.rotateY(PI / 6);
      g.scale(1, 1, 0.35);
      g.rotateY(t);
      g.translate(Math.sin(t) * r * 0.93, y + 0.025 * s, Math.cos(t) * r * 0.93);
      kok.push(g);
    }
  const tent = new THREE.ConeGeometry(0.1, tentH, 8);
  tent.translate(0, ty + tentH / 2, 0);
  k.add(tent, 0);
  const onions: THREE.BufferGeometry[] = [],
    onionsD: THREE.BufferGeometry[] = [];
  const dome = (x: number, z: number, y: number, r: number, hh: number, style: number, dark: boolean) => {
    const o = onion(r, hh, 24);
    o.translate(0, 0, 0);
    const p = o.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i),
        pz = p.getZ(i),
        py = p.getY(i),
        t = Math.atan2(px, pz);
      const s =
        style === 0
          ? 1 + 0.07 * Math.cos(8 * t + py * 60)
          : style === 1
            ? 1 + 0.05 * Math.abs(Math.cos(6 * t))
            : 1 + 0.06 * Math.cos(10 * t - py * 50);
      p.setX(i, px * s);
      p.setZ(i, pz * s);
    }
    o.computeVertexNormals();
    o.translate(x, y, z);
    (dark ? onionsD : onions).push(o, cyl(0.002, 0.002, 0.05, 4, y + hh, x, z));
  };
  dome(0, 0, ty + tentH + h(3), 0.045, 0.09, 1, false);
  // four big chapels on the axes, four small ones on the diagonals
  const big = [
      [0, -0.27],
      [0.27, 0],
      [0, 0.27],
      [-0.27, 0],
    ],
    small = [
      [0.2, -0.2],
      [0.2, 0.2],
      [-0.2, 0.2],
      [-0.2, -0.2],
    ];
  big.forEach(([x, z], i) => {
    base.push(cyl(0.085, 0.085, h(13), 8, y0, x, z), cyl(0.055, 0.055, h(5), 12, y0 + h(13), x, z));
    for (let j = 0; j < 8; j++) {
      const t = (j / 8) * PI * 2 + PI / 8,
        g = new THREE.ConeGeometry(0.03, 0.04, 3);
      g.rotateY(PI / 6);
      g.scale(1, 1, 0.35);
      g.rotateY(t);
      g.translate(x + Math.sin(t) * 0.078, y0 + h(13) + 0.02, z + Math.cos(t) * 0.078);
      kok.push(g);
    }
    dome(x, z, y0 + h(18), 0.075, 0.15, i % 3, i % 2 === 0);
  });
  small.forEach(([x, z], i) => {
    base.push(cyl(0.055, 0.055, h(11), 12, y0, x, z), cyl(0.04, 0.04, h(4), 12, y0 + h(11), x, z));
    dome(x, z, y0 + h(15), 0.055, 0.11, (i + 1) % 3, i % 2 === 1);
  });
  // bell tower
  const bx = 0.42,
    bz = 0.4;
  base.push(boxg(0.09, h(14), 0.09, 0, bx, bz), cyl(0.045, 0.045, h(7), 8, h(14), bx, bz));
  const bt = new THREE.ConeGeometry(0.045, h(9), 8);
  bt.translate(bx, h(21) + h(4.5), bz);
  onionsD.push(bt);
  dome(bx, bz, h(30), 0.022, 0.05, 1, false);
  merge(k, base);
  merge(k, kok, k.dark);
  merge(k, onions);
  merge(
    k,
    onionsD.filter(g => g.index),
    k.dark,
  );
}

const stPeters = staged([1667], (k, year) => {
  // 220 m long Latin cross facing east; Michelangelo's ribbed dome (42 m wide, 136.6 m to the cross)
  // on a drum of paired columns, two minor domes, Maderno's broad facade with its row of statues
  const u = 1 / 220,
    V = 1.5,
    h = (m: number) => m * u * V;
  const dx = -0.19,
    H = h(46);
  const body: THREE.BufferGeometry[] = [
    boxg(0.42, H, 0.28, 0, dx),
    boxg(0.28, H, 0.6, 0, dx),
    boxg(0.4, H * 0.85, 0.4, 0, dx),
    cyl(0.14, 0.14, H, 24, 0, dx - 0.2, 0),
    cyl(0.14, 0.14, H, 24, 0, dx, -0.3),
    cyl(0.14, 0.14, H, 24, 0, dx, 0.3),
    boxg(0.5, H * 0.92, 0.34, 0, 0.2),
    boxg(0.06, H, 0.52, 0, 0.47),
    boxg(0.064, h(6), 0.53, H, 0.47),
  ];
  // statues along the facade attic
  for (let i = 0; i < 13; i++) body.push(boxg(0.008, 0.026, 0.008, H + h(6), 0.495, -0.24 + i * 0.04));
  // drum with paired column buttresses, attic, ribbed dome, lantern
  const R = 0.13,
    dy = H + 0.01;
  body.push(cyl(R + 0.02, R + 0.02, 0.012, 32, H, dx), cyl(R, R, h(19), 32, dy, dx));
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * PI * 2,
      g = new THREE.BoxGeometry(0.024, h(19), 0.024);
    g.rotateY(t);
    g.translate(dx + Math.sin(t) * R, dy + h(19) / 2, Math.cos(t) * R);
    body.push(g);
  }
  body.push(cyl(R + 0.008, R, h(7), 32, dy + h(19), dx));
  const domeY = dy + h(26);
  const dome = lathe(
    [
      [R, 0],
      [R * 0.99, h(10)],
      [R * 0.92, h(20)],
      [R * 0.77, h(30)],
      [R * 0.52, h(39)],
      [R * 0.24, h(44)],
      [R * 0.2, h(44.5)],
    ],
    32,
  );
  warp(dome, t => 1 + 0.035 * Math.abs(Math.cos(8 * t)) ** 8);
  dome.translate(dx, domeY, 0);
  k.add(dome, 0, 0, 0, k.dark);
  body.push(cyl(R * 0.2, R * 0.2, h(4), 12, domeY + h(44.5), dx));
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * PI * 2;
    body.push(boxg(0.008, h(10), 0.008, domeY + h(48.5), dx + Math.sin(t) * R * 0.19, Math.cos(t) * R * 0.19));
  }
  body.push(cyl(R * 0.2, R * 0.2, h(1.5), 12, domeY + h(58.5), dx));
  body.push(cyl(0.002, 0.002, h(10), 4, domeY + h(66), dx));
  // minor domes east of the great dome
  const minor: THREE.BufferGeometry[] = [];
  for (const z of [-1, 1]) {
    body.push(cyl(0.05, 0.05, h(8), 16, H, dx + 0.17, z * 0.17));
    const m = lathe(
      [
        [0.05, 0],
        [0.045, 0.03],
        [0.03, 0.055],
        [0.012, 0.068],
      ],
      16,
    );
    m.translate(dx + 0.17, H + h(8), z * 0.17);
    minor.push(m);
    body.push(cyl(0.01, 0.01, 0.03, 8, H + h(8) + 0.066, dx + 0.17, z * 0.17));
  }
  body.push(cyl(R * 0.21, 0, h(8.5), 12, domeY + h(60), dx));
  merge(k, body);
  merge(k, minor, k.dark);
  // nave roof, facade columns and openings
  const roof = gable(0.5, 0.2, 0.05);
  roof.translate(0.2, H * 0.92, 0);
  k.add(roof, 0, 0, 0, k.dark);
  const cols: THREE.BufferGeometry[] = [];
  for (const z of [-0.23, -0.17, -0.1, -0.035, 0.035, 0.1, 0.17, 0.23])
    cols.push(cyl(0.011, 0.011, H - 0.02, 8, 0, 0.502, z));
  merge(k, cols);
  const ped = new THREE.Shape([new THREE.Vector2(-0.08, 0), new THREE.Vector2(0.08, 0), new THREE.Vector2(0, 0.035)]);
  k.add(slab(ped, 0.02, E, 0.505, H - 0.02, 0), 0);
  const dk: THREE.BufferGeometry[] = [];
  for (const z of [-0.2, -0.135, -0.068, 0, 0.068, 0.135, 0.2]) {
    dk.push(boxg(0.004, 0.08, 0.026, 0, 0.5, z));
    dk.push(boxg(0.004, 0.05, 0.026, 0.13, 0.5, z));
  }
  merge(k, dk, k.dark);
  // obelisk in the piazza, set up there in 1586
  const ox = 0.86;
  k.add(cyl(0.012, 0.007, 0.16, 4, 0.02, ox), 0);
  k.box(0.03, 0.02, 0.03, 0, ox);
  // 1667: Bernini's colonnade, straight wings from the facade then two arms round the oval piazza
  // (drawn about four fifths of real size so it doesn't swamp its neighbours)
  if (year >= 1667) {
    const ch = h(20),
      cd = 0.04,
      colm: THREE.BufferGeometry[] = [],
      roof: THREE.BufferGeometry[] = [];
    const run = (ax: number, az: number, bx: number, bz: number) => {
      const L = Math.hypot(bx - ax, bz - az),
        r = new THREE.BoxGeometry(L, h(4), cd + 0.006);
      r.rotateY(-Math.atan2(bz - az, bx - ax));
      r.translate((ax + bx) / 2, ch + h(2), (az + bz) / 2);
      roof.push(r);
      const nx = -(bz - az) / L,
        nz = (bx - ax) / L,
        m = Math.max(2, Math.round(L / 0.026));
      for (let i = 0; i <= m; i++)
        for (const o of [-1, 1]) {
          const f = i / m;
          colm.push(
            cyl(0.005, 0.005, ch, 6, 0, ax + (bx - ax) * f + nx * o * cd * 0.4, az + (bz - az) * f + nz * o * cd * 0.4),
          );
        }
      for (let i = 0; i < m; i += 2) {
        const f = (i + 0.5) / m;
        colm.push(boxg(0.006, 0.02, 0.006, ch + h(4), ax + (bx - ax) * f, az + (bz - az) * f));
      }
    };
    const rx = 0.26,
      rz = 0.36;
    for (const s of [-1, 1]) {
      run(0.52, s * 0.27, ox - rx * 0.82, s * rz * 0.57);
      let px = ox - rx * 0.82,
        pz = s * rz * 0.57;
      for (let i = 1; i <= 10; i++) {
        const a = PI * (0.81 - (i / 10) * 0.62),
          nx = ox + rx * Math.cos(a),
          nz = s * rz * Math.sin(a);
        run(px, pz, nx, nz);
        px = nx;
        pz = nz;
      }
    }
    merge(k, colm);
    merge(k, roof);
  }
});

function brandenburg(k: Kit) {
  // 65.5 x 11 m: twelve Doric columns, six to each side, framing five passages (the middle one wider),
  // stepped attic carrying the quadriga that faces east, and the two side guard houses
  const u = 1 / 65.5,
    V = 1.6,
    h = (m: number) => m * u * V;
  const d = 11 * u,
    colH = h(14);
  const zs = [-0.25, -0.155, -0.06, 0.06, 0.155, 0.25];
  const parts: THREE.BufferGeometry[] = [boxg(0.24, h(1), 0.6, 0)];
  const cols: THREE.BufferGeometry[] = [];
  for (const z of zs) {
    for (const x of [-1, 1]) cols.push(cyl(0.022, 0.019, colH, 12, h(1), x * (d / 2 - 0.024), z));
    parts.push(boxg(d - 0.06, colH, 0.02, h(1), 0, z));
  }
  merge(k, cols);
  const ey = h(1) + colH;
  parts.push(boxg(d + 0.02, h(2.6), 0.58, ey));
  parts.push(boxg(d, h(2.4), 0.54, ey + h(2.6)));
  parts.push(boxg(d - 0.03, h(1.4), 0.16, ey + h(5)));
  parts.push(boxg(d - 0.06, h(0.8), 0.1, ey + h(6.4)));
  // side guard houses with their own colonnades
  for (const s of [-1, 1]) {
    parts.push(boxg(0.15, h(8), 0.13, 0, 0, s * 0.42));
    parts.push(boxg(0.16, h(1.2), 0.14, h(8), 0, s * 0.42));
  }
  // quadriga: four horses abreast, chariot and Victoria with her standard
  const qy = ey + h(7.2);
  for (const z of [-0.042, -0.014, 0.014, 0.042]) {
    parts.push(boxg(0.06, 0.028, 0.016, qy + 0.024, 0.02, z));
    parts.push(boxg(0.016, 0.036, 0.013, qy + 0.04, 0.054, z));
    for (const x of [-0.004, 0.044]) parts.push(boxg(0.008, 0.026, 0.01, qy, x, z));
  }
  parts.push(boxg(0.036, 0.036, 0.06, qy, -0.034, 0));
  parts.push(boxg(0.02, 0.06, 0.02, qy + 0.036, -0.04, 0));
  parts.push(boxg(0.004, 0.1, 0.004, qy + 0.036, -0.026, 0.016));
  parts.push(boxg(0.005, 0.024, 0.026, qy + 0.12, -0.026, 0.016));
  merge(k, parts);
  for (const s of [-1, 1]) k.add(rotGable(0.14, 0.16, 0.035), h(9.2), 0, s * 0.42);
  const dk: THREE.BufferGeometry[] = [];
  for (const x of [-1, 1]) dk.push(boxg(0.004, h(1.2), 0.48, ey + h(3.2), (x * d) / 2, 0));
  for (const s of [-1, 1]) for (const x of [-1, 1]) dk.push(boxg(0.004, h(5), 0.09, 0, x * 0.077, s * 0.42));
  merge(k, dk, k.dark);
}

function loft(rings: THREE.Vector3[][]) {
  // flat-shaded tube through rings of equal length
  const pos: number[] = [],
    idx: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r],
      b = rings[r + 1],
      n = a.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        v = pos.length / 3;
      for (const p of [a[i], a[j], b[j], b[i]]) pos.push(p.x, p.y, p.z);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function eiffel(k: Kit) {
  // 125 m square base, real height (300 m plus antenna). Four curved legs joined by the decorative
  // arches under the first floor (57 m), merging at the second floor (116 m), top floor at 276 m
  const s = 1 / 125;
  const wo = (h: number) => 57.5 * Math.exp(-h / 87) + 5;
  const wi = (h: number) => 42 * Math.max(0, 1 - h / 116) ** 1.1;
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x * s, y * s, z * s);
  const legs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const rings: THREE.Vector3[][] = [];
      for (let i = 0; i <= 10; i++) {
        const y = (i / 10) * 116,
          o = wo(y),
          n = wi(y);
        const ring = [P(n * sx, y, n * sz), P(o * sx, y, n * sz), P(o * sx, y, o * sz), P(n * sx, y, o * sz)];
        rings.push(sx * sz > 0 ? ring : ring.reverse());
      }
      legs.push(loft(rings));
    }
  const top: THREE.Vector3[][] = [];
  for (let i = 0; i <= 12; i++) {
    const y = 116 + (i / 12) * 184,
      o = wo(y);
    top.push([P(-o, y, -o), P(-o, y, o), P(o, y, o), P(o, y, -o)]);
  }
  legs.push(loft(top));
  const plat: THREE.BufferGeometry[] = [
    boxg(76 * s, 7 * s, 76 * s, 57 * s),
    boxg(46 * s, 5 * s, 46 * s, 115 * s),
    boxg(19 * s, 4 * s, 19 * s, 274 * s),
    boxg(10 * s, 12 * s, 10 * s, 278 * s),
    boxg(10 * s, 10 * s, 10 * s, 0, 0, 0),
  ];
  plat.pop();
  const arches: THREE.BufferGeometry[] = [];
  for (const rot of [0, PI / 2, PI, -PI / 2]) {
    const a = new THREE.TorusGeometry(33 * s, 2.2 * s, 4, 18, PI);
    a.scale(1, 0.95, 1);
    a.translate(0, 23 * s, 49 * s);
    a.rotateY(rot);
    plat.push(a);
  }
  merge(k, [...legs, ...plat], doubleSided(k.mat));
  // dark railings at the floors read as the tower's banding
  arches.push(boxg(77 * s, 2.5 * s, 77 * s, 63.5 * s), boxg(47 * s, 2.5 * s, 47 * s, 119.5 * s));
  merge(k, arches, k.dark);
  k.add(cyl(0.8 * s, 0.5 * s, 40 * s, 6), 290 * s);
}

function melon(r: number, h: number, ribs: number) {
  // Timurid ribbed dome bulging out over its drum
  const d = lathe(
    [
      [r * 0.85, 0],
      [r * 1.0, h * 0.18],
      [r * 1.02, h * 0.36],
      [r * 0.9, h * 0.6],
      [r * 0.6, h * 0.82],
      [r * 0.25, h * 0.95],
      [0, h],
    ],
    64,
  );
  return warp(d, t => 1 + 0.05 * Math.abs(Math.cos((ribs / 2) * t)));
}

const bibiKhanym = staged([1897, 2000], (k, year) => {
  // 167 x 109 m court mosque: the huge east gateway, the main sanctuary to the west with its 41 m
  // pishtaq and ribbed dome on a tall drum, smaller domed mosques facing the court north and south,
  // and minarets at the corners
  const u = 1 / 167,
    V = 1.8,
    h = (m: number) => m * u * V;
  const hw = 0.5,
    hd = (109 * u) / 2,
    t = 0.025;
  // 1897: the earthquake brought down most of the main dome and the top of its portal; 2000: rebuilt
  const ruin = year >= 1897 && year < 2000;
  const parts: THREE.BufferGeometry[] = [
    boxg(hw * 2, h(10), t, 0, 0, -hd + t / 2),
    boxg(hw * 2, h(10), t, 0, 0, hd - t / 2),
    boxg(t, h(10), hd * 2, 0, -hw + t / 2, 0),
    boxg(t, h(10), hd * 2, 0, hw - t / 2, 0),
  ];
  const cm = ruin ? h(9) : h(32);
  const mins: number[][] = [
    [-hw + 0.02, -hd + 0.02, cm],
    [-hw + 0.02, hd - 0.02, cm * 1.4],
    [hw - 0.02, -hd + 0.02, cm],
    [hw - 0.02, hd - 0.02, cm],
  ];
  // east gateway
  parts.push(boxg(0.09, h(34), 0.17, 0, 0.45));
  mins.push([0.45, -0.1, h(38)], [0.45, 0.1, h(38)]);
  // main sanctuary
  const sx = -0.36;
  parts.push(boxg(0.22, h(28), 0.22, 0, sx));
  if (ruin) {
    // the portal's arch fell, leaving its two flanks standing to different heights
    parts.push(
      boxg(0.05, h(30), 0.06, 0, sx + 0.13, -0.1),
      boxg(0.05, h(36), 0.06, 0, sx + 0.13, 0.1),
      boxg(0.05, h(27), 0.14, 0, sx + 0.13),
    );
    mins.push([sx + 0.13, -0.145, h(22)], [sx + 0.13, 0.145, h(38)]);
    parts.push(cyl(0.095, 0.095, h(9), 24, h(28), sx));
  } else {
    parts.push(boxg(0.05, h(40), 0.26, 0, sx + 0.13));
    mins.push([sx + 0.13, -0.145, h(50)], [sx + 0.13, 0.145, h(50)]);
    parts.push(cyl(0.095, 0.095, h(12), 24, h(28), sx));
  }
  // north and south mosques
  for (const z of [-1, 1]) {
    parts.push(boxg(0.13, h(18), 0.12, 0, -0.04, z * (hd - 0.07)));
    parts.push(boxg(0.15, h(24), 0.03, 0, -0.04, z * (hd - 0.135)));
    parts.push(cyl(0.05, 0.05, h(5), 20, h(18), -0.04, z * (hd - 0.07)));
  }
  for (const [x, z, hh] of mins) parts.push(cyl(0.024, 0.02, hh, 12, 0, x, z), cyl(0.026, 0.026, 0.01, 12, hh, x, z));
  merge(k, parts);
  const domes: THREE.BufferGeometry[] = [];
  if (ruin) {
    // a broken shell of the dome over the west side of the drum
    const d = new THREE.LatheGeometry(
      [
        [0.096, 0],
        [0.11, h(3.4)],
        [0.112, h(6.8)],
        [0.1, h(11)],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      24,
      PI * 0.9,
      PI * 1.05,
    );
    d.translate(sx, h(37), 0);
    k.add(d, 0, 0, 0, doubleSided(k.dark));
  } else {
    const d = melon(0.112, h(19), 32);
    d.translate(sx, h(40), 0);
    domes.push(d);
  }
  for (const z of [-1, 1]) {
    const m = melon(0.058, h(10), 24);
    m.translate(-0.04, h(23), z * (hd - 0.07));
    domes.push(m);
  }
  merge(k, domes, k.dark);
  const dk: THREE.BufferGeometry[] = [
    slab(arch(0.1, h(28)), 0.008, E, 0.495, 0, 0),
    slab(arch(0.1, h(28)), 0.008, W, 0.405, 0, 0),
    slab(arch(0.15, ruin ? h(26) : h(33)), 0.008, E, sx + 0.155, 0, 0),
  ];
  for (const z of [-1, 1]) dk.push(slab(arch(0.09, h(18)), 0.008, z > 0 ? N : S, -0.04, 0, z * (hd - 0.15)));
  // arcade of the court walls
  for (let i = 0; i < 9; i++)
    for (const z of [-1, 1]) {
      const x = -0.18 + i * 0.065;
      if (Math.abs(x + 0.04) < 0.09) continue;
      dk.push(slab(arch(0.03, h(7)), 0.006, z > 0 ? N : S, x, 0, z * (hd - t)));
    }
  merge(k, dk, k.dark);
});

function tajMahal(k: Kit) {
  // 95 m square plinth with four 40 m minarets at its corners; chamfered 57 m mausoleum with a great
  // pishtaq on each face, four chhatris and the onion dome on its tall drum (73 m to the finial)
  const u = 1 / 95,
    V = 1.3,
    h = (m: number) => m * u * V;
  const ph = h(6.7);
  k.box(1, ph, 1, 0);
  k.box(1.004, 0.008, 1.004, ph * 0.35, 0, 0, k.dark);
  const m = 0.3,
    c = 0.08,
    bh = h(31);
  const oct = new THREE.Shape(
    [
      [-m + c, -m],
      [m - c, -m],
      [m, -m + c],
      [m, m - c],
      [m - c, m],
      [-m + c, m],
      [-m, m - c],
      [-m, -m + c],
    ].map(([x, z]) => new THREE.Vector2(x, z)),
  );
  const body = new THREE.ExtrudeGeometry(oct, { depth: bh, bevelEnabled: false });
  body.rotateX(-PI / 2);
  k.add(body, ph);
  const parts: THREE.BufferGeometry[] = [];
  const dk: THREE.BufferGeometry[] = [];
  for (const [rot, fx, fz] of [
    [S, 0, 1],
    [N, 0, -1],
    [E, 1, 0],
    [W, -1, 0],
  ] as const) {
    const pw = 0.25,
      pd = 0.02;
    parts.push(boxg(fx ? pd : pw, h(36), fx ? pw : pd, ph, fx * (m - pd / 2 + 0.008), fz * (m - pd / 2 + 0.008)));
    dk.push(slab(arch(0.15, h(27)), 0.008, rot, fx * (m + 0.008), ph + h(2), fz * (m + 0.008)));
    for (const o of [-1, 1])
      for (const yy of [h(2.5), h(17)]) {
        const off = o * 0.18;
        dk.push(slab(arch(0.055, h(12)), 0.006, rot, fx * m + (fx ? 0 : off), ph + yy, fz * m + (fz ? 0 : off)));
      }
  }
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const rot = Math.atan2(sx, sz),
      cx = sx * (m - c / 2),
      cz = sz * (m - c / 2);
    for (const yy of [h(2.5), h(17)]) dk.push(slab(arch(0.05, h(12)), 0.006, rot, cx, ph + yy, cz));
    parts.push(cyl(0.008, 0.006, h(39), 8, ph, sx * (m - 0.002), sz * (m - c - 0.002)));
    parts.push(cyl(0.008, 0.006, h(39), 8, ph, sx * (m - c - 0.002), sz * (m - 0.002)));
  }
  // drum, onion dome, finial
  const dy = ph + bh;
  parts.push(cyl(0.135, 0.13, h(13), 32, dy));
  const domeY = dy + h(13);
  const dome = lathe(
    [
      [0.13, 0],
      [0.155, 0.04],
      [0.163, 0.09],
      [0.15, 0.15],
      [0.115, 0.21],
      [0.06, 0.26],
      [0.02, 0.29],
      [0.008, 0.3],
    ],
    32,
  );
  dome.translate(0, domeY, 0);
  parts.push(dome);
  parts.push(cyl(0.006, 0.003, 0.07, 6, domeY + 0.3));
  // chhatris
  const chhatri = (x: number, z: number, y: number, r: number, hh: number) => {
    parts.push(cyl(r, r, hh * 0.15, 8, y, x, z));
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * PI * 2;
      parts.push(
        cyl(r * 0.12, r * 0.12, hh * 0.4, 4, y + hh * 0.15, x + Math.sin(t) * r * 0.85, z + Math.cos(t) * r * 0.85),
      );
    }
    parts.push(cyl(r * 1.15, r * 1.15, hh * 0.06, 8, y + hh * 0.55, x, z));
    const d = lathe(
      [
        [r * 0.9, 0],
        [r, hh * 0.12],
        [r * 0.7, hh * 0.3],
        [r * 0.2, hh * 0.4],
        [0, hh * 0.45],
      ],
      12,
    );
    d.translate(x, y + hh * 0.61, z);
    parts.push(d);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chhatri(sx * 0.19, sz * 0.19, dy, 0.05, 0.15);
  // minarets with three balconies and a chhatri on top
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * 0.465,
        z = sz * 0.465,
        mh = h(37);
      parts.push(cyl(0.03, 0.021, mh, 12, ph, x, z));
      for (const f of [0.33, 0.63, 0.93]) parts.push(cyl(0.025, 0.036, 0.012, 12, ph + mh * f, x, z));
      chhatri(x, z, ph + mh + 0.012, 0.026, 0.09);
    }
  merge(k, parts);
  merge(k, dk, k.dark);
}

const qutbMinar = staged([1369, 1828, 1848], (k, year) => {
  // 72.5 m, 14.3 m across at the base tapering to 2.7 m: five storeys each ending in a corbelled
  // balcony. The first is fluted with alternate round and angular flutes, the second round,
  // the third angular, the top two plain marble. Base drawn narrower than real to keep it slender
  const s = 0.04,
    rad = (y: number) => (7.15 - (5.8 * y) / 72.5) * s;
  // 1220: Iltutmish's four storeys; 1369: Firoz Shah replaced the lightning-struck top with two marble ones
  const rebuilt = year >= 1369;
  const storeys: (readonly [number, number, number])[] = [
    [0, 29.5, 2],
    [29.5, 45, 0],
    [45, 56.5, 1],
  ];
  storeys.push(
    ...(rebuilt
      ? ([
          [56.5, 64.5, 3],
          [64.5, 72.5, 3],
        ] as const)
      : ([[56.5, 66, 4]] as const)),
  );
  const topY = storeys[storeys.length - 1][1];
  const parts: THREE.BufferGeometry[] = [],
    dk: THREE.BufferGeometry[] = [],
    white: THREE.BufferGeometry[] = [];
  for (const [a, b, kind] of storeys) {
    const r0 = rad(a),
      r1 = rad(b),
      hh = (b - a) * s;
    const plain = kind >= 3;
    const g = new THREE.CylinderGeometry(r1, r0, hh, plain ? 20 : 96, 1);
    if (!plain)
      warp(g, t => {
        const p = ((t / (PI * 2)) * 24 + 24) % 1,
          i = Math.floor(((t / (PI * 2)) * 24 + 24) % 24);
        const round = kind === 0 || (kind === 2 && i % 2 === 0);
        return 0.9 + 0.12 * (round ? Math.sqrt(Math.max(0, 1 - (2 * p - 1) ** 2)) : 1 - Math.abs(2 * p - 1));
      });
    g.translate(0, a * s + hh / 2, 0);
    parts.push(g);
    // balcony on muqarnas corbels
    if (b < topY) {
      parts.push(cyl(r1 * 0.98, r1 * 1.22, 0.07, 24, b * s - 0.07));
      dk.push(cyl(r1 * 1.24, r1 * 1.24, 0.012, 24, b * s));
    }
    // inscription bands
    if (!plain)
      for (const f of [0.3, 0.62]) {
        const y = a + (b - a) * f,
          r = rad(y) * 1.035;
        dk.push(cyl(r, r, 0.035, 24, y * s));
      }
    if (kind === 3)
      for (const f of [0.15, 0.5, 0.85]) {
        const y = a + (b - a) * f,
          r = rad(y) * 1.012;
        white.push(cyl(r, r, 0.06, 20, y * s - 0.03));
      }
  }
  parts.push(cyl(0.34, 0.34, 0.03, 24, -0.01));
  const rt = rad(topY) * 0.9,
    yt = topY * s + 0.06;
  parts.push(cyl(rt, rt, 0.06, 12, topY * s));
  // 1828: Major Smith's Bengali-style cupola on top, taken down in 1848
  if (year >= 1828 && year < 1848) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      parts.push(cyl(0.004, 0.004, 0.09, 4, yt, Math.sin(a) * rt * 0.85, Math.cos(a) * rt * 0.85));
    }
    parts.push(cyl(rt * 1.1, rt * 1.1, 0.012, 8, yt + 0.09));
    const d = lathe(
      [
        [rt, 0],
        [rt * 0.95, 0.03],
        [rt * 0.6, 0.06],
        [rt * 0.15, 0.08],
        [0, 0.085],
      ],
      8,
    );
    d.translate(0, yt + 0.102, 0);
    dk.push(d);
  }
  merge(k, parts);
  merge(k, dk, k.dark);
  if (white.length) {
    const m = k.mat.clone() as THREE.MeshLambertMaterial;
    m.color.lerp(new THREE.Color('#ffffff'), 0.6);
    merge(k, white, m);
  }
});

export const batch_b: Record<string, Builder> = {
  pantheon,
  'hagia-sophia': hagiaSophia,
  mezquita,
  'notre-dame': notreDame,
  'st-marks': stMarks,
  'tower-of-london': towerOfLondon,
  'big-ben': bigBen,
  'st-basils': stBasils,
  'st-peters': stPeters,
  brandenburg,
  eiffel,
  'bibi-khanym': bibiKhanym,
  'taj-mahal': tajMahal,
  'qutb-minar': qutbMinar,
};
