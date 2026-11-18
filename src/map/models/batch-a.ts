import * as THREE from 'three';
import { type Builder, band, doubleSided, gable, type Kit, merge, staged } from './kit';

type G = THREE.BufferGeometry;

/** Box geometry with its base at y. Optional rotation about Y. */
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
};
const cy = (rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 8) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
};
const flat = (g: G) => {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
};
/** Copy of a material with its colour pulled toward another and scaled. */
const tone = (m: THREE.Material, f: number, to = '#ffffff', t = 0) => {
  const c = m.clone() as THREE.MeshLambertMaterial;
  c.color.lerp(new THREE.Color(to), t).multiplyScalar(f);
  return c;
};

/** Rectangular frustum, base at y=0. */
function frustum(wb: number, db: number, wt: number, dt: number, h: number) {
  const g = new THREE.BoxGeometry(1, h, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setXYZ(i, p.getX(i) * (top ? wt : wb), p.getY(i) + h / 2, p.getZ(i) * (top ? dt : db));
  }
  g.computeVertexNormals();
  return g;
}

const pyramid = (w: number, h: number) => {
  const g = new THREE.ConeGeometry(w * Math.SQRT1_2, h, 4);
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2, 0);
  return flat(g);
};

/** A flight of n steps rising toward +x (rotate to aim it), from 0 to run, width w centred on z. */
function stairs(w: number, run: number, h: number, rot = 0, n = 12) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(run, 0);
  s.lineTo(run, h);
  for (let i = n; i >= 1; i--) {
    s.lineTo(((i - 1) * run) / n, (i * h) / n);
    s.lineTo(((i - 1) * run) / n, ((i - 1) * h) / n);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(rot);
  return g;
}

/** Flat polygon of (x, z) points extruded up by h; a bevel gives a chamfered rock edge. */
function slab(pts: number[][], h: number, bevel = 0) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: h,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  if (bevel) g.translate(0, bevel, 0);
  return g;
}

/** Wall segment from a to b. */
const seg = (a: number[], b: number[], t: number, h: number, y: number) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  return bx(Math.hypot(dx, dz) + t, h, t, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, Math.atan2(-dz, dx));
};

/** A kit drawing into a rotated subgroup. */
function sub(k: Kit, ry: number): Kit {
  const g = new THREE.Group();
  g.rotation.y = ry;
  k.g.add(g);
  const add = (geo: G, y: number, x = 0, z = 0, m = k.mat) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number, y: number, x = 0, z = 0, m = k.mat) =>
    add(new THREE.BoxGeometry(w, h, d), y + h / 2, x, z, m);
  return { g, mat: k.mat, dark: k.dark, add, box };
}

function anuZiggurat(k: Kit) {
  // Uruk, c. 3500 BC: a 13 m mud-brick terrace with sloping sides and a ramp, the whitewashed
  // White Temple (17.5 x 22.3 m, buttressed, tripartite) standing near its western edge
  const V = 1.6,
    h = (13 / 70) * V;
  k.add(frustum(1, 0.9, 0.97, 0.87, 0.04), 0);
  k.add(frustum(0.95, 0.85, 0.86, 0.76, h - 0.04), 0.04);
  // buttress strips down the sloping faces
  const ribs: G[] = [];
  for (let i = -5; i <= 5; i++) {
    for (const s of [-1, 1]) {
      const r = new THREE.BoxGeometry(0.025, h * 0.97, 0.03);
      r.rotateX(-s * 0.17);
      r.translate(i * 0.08, h / 2 - 0.004, s * 0.415);
      ribs.push(r);
      if (Math.abs(i) <= 4) {
        const q = new THREE.BoxGeometry(0.03, h * 0.97, 0.025);
        q.rotateZ(s * 0.17);
        q.translate(s * 0.465, h / 2 - 0.004, i * 0.08);
        ribs.push(q);
      }
    }
  }
  merge(k, ribs);
  k.add(stairs(0.07, 0.62, h, Math.PI / 2, 20), 0, 0.47, 0.31);
  // White Temple
  const tx = -0.13,
    tz = 0.02,
    tw = 0.25,
    td = 0.32,
    th = 0.12;
  k.box(tw + 0.04, 0.015, td + 0.04, h, tx, tz);
  k.box(tw, th, td, h + 0.015, tx, tz);
  k.box(0.1, 0.05, td - 0.02, h + 0.015 + th, tx, tz);
  const pil: G[] = [];
  for (let i = 0; i < 8; i++)
    for (const s of [-1, 1]) pil.push(bx(0.016, th, 0.02, tx + s * (tw / 2), h + 0.015, tz - td / 2 + 0.02 + i * 0.04));
  for (let i = 0; i < 6; i++)
    for (const s of [-1, 1])
      pil.push(bx(0.02, th, 0.016, tx - tw / 2 + 0.025 + i * 0.04, h + 0.015, tz + s * (td / 2)));
  merge(k, pil);
  k.box(0.04, 0.07, 0.03, h + 0.015, tx, tz + td / 2 + 0.002, k.dark);
  k.box(0.03, 0.07, 0.04, h + 0.015, tx + tw / 2 + 0.002, tz, k.dark);
}

const zigguratOfUr = staged([-400, 1985], (k, year) => {
  // Ur-Nammu, c. 2100 BC: 62.5 x 43 m first stage 11 m high with sloping buttressed walls, two
  // stages above, and three stairways of 100 steps meeting at a gatehouse on the NE face
  const V = 1.6,
    s = 1 / 64,
    zc = -0.2;
  const h1 = 11 * s * V,
    h2 = 5.7 * s * V,
    h3 = 4 * s * V;
  const ruin = year >= -400,
    rebuilt = year >= 1985,
    worn = tone(k.mat, 0.85);
  if (ruin && !rebuilt) {
    // -400: abandoned with Ur, the brick slumping into a mound with the upper stages worn away
    const r = h1 * 0.7;
    k.add(frustum(1.12, 0.8, 1, 0.68, r * 0.35), 0, 0, zc + 0.03, worn);
    k.add(frustum(0.98, 0.66, 0.84, 0.54, r), 0, 0, zc, worn);
    k.add(frustum(0.6, 0.44, 0.34, 0.24, h2 * 0.85), r, 0.02, zc - 0.07, worn);
    k.add(frustum(0.26, 0.2, 0.12, 0.1, h2 * 0.4), r + h2 * 0.85, -0.03, zc - 0.09, worn);
    // the central stair reduced to a tongue of rubble
    k.add(frustum(0.16, 0.24, 0.08, 0.1, r * 0.5), 0, 0, 0.2, worn);
    return;
  }
  k.add(frustum(1, 0.68, 0.92, 0.6, h1), 0, 0, zc);
  const ribs: G[] = [];
  for (let i = -5; i <= 5; i++) {
    for (const sz of [-1, 1]) {
      const r = new THREE.BoxGeometry(0.03, h1 * 0.97, 0.03);
      r.rotateX(-sz * 0.145);
      r.translate(i * 0.085, h1 / 2, zc + sz * 0.33);
      if (Math.abs(i) > 1 || sz < 0) ribs.push(r);
    }
  }
  for (let i = -3; i <= 3; i++)
    for (const sx of [-1, 1]) {
      const r = new THREE.BoxGeometry(0.03, h1 * 0.97, 0.03);
      r.rotateZ(sx * 0.145);
      r.translate(sx * 0.49, h1 / 2, zc + i * 0.085);
      ribs.push(r);
    }
  merge(k, ribs);
  // central stair, two side stairs against the facade, gatehouse where they meet
  k.add(stairs(0.08, 0.43, h1, Math.PI / 2, 24), 0, 0, 0.55);
  k.add(stairs(0.065, 0.4, h1, 0, 24), 0, -0.46, 0.165);
  k.add(stairs(0.065, 0.4, h1, Math.PI, 24), 0, 0.46, 0.165);
  if (rebuilt) {
    // 1985: lower facade and stairs rebuilt, the upper stages left as Woolley's excavated stump
    k.add(frustum(0.58, 0.4, 0.44, 0.3, h2 * 0.75), h1, 0, zc - 0.08, worn);
    k.add(frustum(0.2, 0.16, 0.1, 0.08, h2 * 0.35), h1 + h2 * 0.75, -0.02, zc - 0.1, worn);
    return;
  }
  k.add(frustum(0.6, 0.42, 0.55, 0.37, h2), h1, 0, zc - 0.08);
  k.add(frustum(0.32, 0.24, 0.29, 0.21, h3), h1 + h2, 0, zc - 0.1);
  k.box(0.17, 0.07, 0.11, h1 + h2 + h3, 0, zc - 0.1);
  k.box(0.04, 0.045, 0.012, h1 + h2 + h3, 0, zc - 0.1 + 0.056, k.dark);
  k.box(0.12, 0.07, 0.07, h1, 0, 0.06);
  k.box(0.035, 0.045, 0.074, h1, 0, 0.06, k.dark);
  k.add(stairs(0.06, 0.1, h2, Math.PI / 2, 8), h1, 0, 0.025);
});

const greatPyramid = staged([1356], (k, year) => {
  // Khufu: 230.3 m square, 146.6 m high (51.8 degree faces), entrance 17 m up the north face,
  // inside a paved court and enclosure wall
  const V = 1.1,
    h = (146.6 / 230) * V,
    y0 = 0.006;
  k.box(1.08, y0, 1.08, 0);
  for (const s of [-1, 1]) {
    k.box(1.1, 0.03, 0.01, 0, 0, s * 0.545);
    k.box(0.01, 0.03, 1.08, 0, s * 0.545, 0);
  }
  const ey = (17 / 230) * V;
  if (year < 1356) {
    k.add(pyramid(1, h), y0, 0, 0, tone(k.mat, 1, '#fbf6ea', 0.35));
  } else {
    // 1356: casing loosened by the 1303 quake carted off for Cairo, stepped core and a flat top left
    const top = h * (138.5 / 146.6),
      n = 30,
      steps: G[] = [];
    for (let i = 0; i < n; i++) {
      const w = 0.985 * (1 - ((i + 1) * top) / n / h);
      steps.push(bx(w, top / n, w, 0, y0 + (i * top) / n, 0));
    }
    merge(k, steps, tone(k.mat, 0.82));
    // al-Ma'mun's robbers' tunnel below the true entrance
    k.box(0.024, 0.02, 0.03, y0 + ey * 0.35, 0.02, -0.5 * (1 - (ey * 0.35) / h), k.dark);
  }
  k.box(0.022, 0.026, 0.03, y0 + ey, 0, -0.5 * (1 - ey / h), k.dark);
  // mortuary temple against the east face and the start of the causeway
  k.box(0.04, 0.035, 0.2, y0, 0.52, 0);
});

function etemenanki(k: Kit) {
  // Babylon, Schmid's reconstruction: 91 m square, seven stages to about 91 m with the temple of
  // Marduk on top, buttressed walls, a monumental stairway projecting from the south face
  const V = 1.2,
    s = 0.8 / 91,
    zc = -0.12;
  const stages: [number, number][] = [
    [91, 33],
    [78, 18],
    [60, 6],
    [51, 6],
    [42, 6],
    [33, 6],
  ];
  const pil: G[] = [];
  let y = 0;
  for (const [w, hm] of stages) {
    const W = w * s,
      h = hm * s * V;
    k.box(W, h, W, y, 0, zc);
    const n = Math.round(W / 0.05);
    for (let i = 0; i <= n; i++) {
      const p = -W / 2 + (i * W) / n;
      for (const side of [-1, 1]) {
        pil.push(bx(0.014, h, 0.01, p, y, zc + side * (W / 2)));
        pil.push(bx(0.01, h, 0.014, side * (W / 2), y, zc + p));
      }
    }
    k.box(W + 0.01, 0.008, W + 0.01, y + h - 0.008, 0, zc);
    y += h;
  }
  merge(k, pil);
  const tw = 24 * s,
    td = 21 * s,
    th = 15 * s * V;
  k.box(tw, th, td, y, 0, zc);
  k.box(tw + 0.012, 0.025, td + 0.012, y + th - 0.025, 0, zc, k.dark);
  k.box(0.04, th * 0.6, 0.01, y, 0, zc + td / 2 + 0.003, k.dark);
  const h1 = 33 * s * V,
    front = zc + (91 * s) / 2;
  k.add(stairs(0.085, 0.55 - front, h1, Math.PI / 2, 30), 0, 0, 0.55);
  k.add(stairs(0.06, 0.32, h1, 0, 24), 0, -0.38, front + 0.03);
  k.add(stairs(0.06, 0.32, h1, Math.PI, 24), 0, 0.38, front + 0.03);
  k.box(0.13, 0.06, 0.06, h1, 0, front - 0.03);
  k.box(0.04, 0.04, 0.064, h1, 0, front - 0.03, k.dark);
}

function byrsa(k: Kit) {
  // the citadel hill of Carthage: terraced slopes of Punic houses (the "Hannibal quarter"), a
  // walled summit with the temple of Eshmun at the head of its 60 steps
  const wall = doubleSided(k.mat),
    e = 0.8;
  const rings: [number, number, number, number][] = [
    [0.5, 0.47, 0, 0.05],
    [0.36, 0.33, 0.05, 0.1],
    [0.22, 0.19, 0.1, 0.16],
  ];
  const houses: G[] = [];
  rings.forEach(([r0, r1, y0, y1], i) => {
    k.add(band([r0, r0 * e, y0], [r1, r1 * e, y1]), 0, 0, 0, wall);
    const next = i < 2 ? rings[i + 1][0] : 0;
    if (next) {
      k.add(band([r1, r1 * e, y1], [next, next * e, y1]), 0, 0, 0, wall);
      const rm = (r1 + next) / 2,
        n = Math.round(rm * 60);
      for (let j = 0; j < n; j++) {
        const t = ((j + 0.5) / n) * Math.PI * 2;
        if (Math.abs(t - Math.PI / 2) < 0.22) continue;
        const hh = 0.025 + ((j * 7) % 3) * 0.008;
        houses.push(bx(r1 - next - 0.02, hh, 0.035, rm * Math.cos(t), y1, rm * e * Math.sin(t), -t));
      }
    }
  });
  merge(k, houses);
  const top = new THREE.CircleGeometry(1, 40);
  top.rotateX(-Math.PI / 2);
  top.scale(0.19, 1, 0.19 * e);
  k.add(top, 0.16);
  k.add(band([0.19, 0.152, 0.16], [0.19, 0.152, 0.185]), 0, 0, 0, wall);
  k.add(stairs(0.05, 0.27, 0.16, Math.PI / 2, 20), 0, 0, 0.41);
  // temple of Eshmun
  const y0 = 0.16;
  k.box(0.2, 0.025, 0.12, y0, 0, -0.01);
  const cols: G[] = [];
  for (let i = 0; i < 7; i++)
    for (const z of [-0.045, 0.045]) cols.push(cy(0.006, 0.007, 0.07, -0.085 + i * 0.0283, y0 + 0.025, -0.01 + z, 6));
  for (const x of [-0.085, 0.085]) cols.push(cy(0.006, 0.007, 0.07, x, y0 + 0.025, -0.01, 6));
  merge(k, cols);
  k.box(0.12, 0.07, 0.06, y0 + 0.025, 0, -0.01, k.dark);
  k.box(0.2, 0.015, 0.11, y0 + 0.095, 0, -0.01);
  k.add(gable(0.2, 0.11, 0.035), y0 + 0.11, 0, -0.01);
}

const pharos = staged([956, 1303], (k, year) => {
  // Thiersch's reconstruction: a square tapering shaft about 56 m, an octagonal stage 27 m, a
  // round lantern with the statue of Zeus on top, over 100 m in all; tritons at the corners
  const y0 = 0.05,
    h1 = 1.75,
    h2 = 0.85;
  k.box(1, y0, 1, 0);
  k.box(0.94, 0.02, 0.94, y0);
  if (year >= 1303) {
    // 1303: the Crete quake brought down all but a stump of the square shaft, rubble at its foot
    const worn = tone(k.mat, 0.85),
      hs = 0.62;
    k.add(frustum(0.84, 0.84, 0.81, 0.81, hs), y0 + 0.02, 0, 0, worn);
    const top = 0.81 - (0.07 * hs) / h1;
    merge(
      k,
      [
        bx(top * 0.45, 0.14, top * 0.3, -top * 0.27, y0 + 0.02 + hs, -top * 0.35),
        bx(top * 0.3, 0.08, top * 0.5, top * 0.35, y0 + 0.02 + hs, top * 0.25),
        bx(top * 0.2, 0.22, top * 0.2, -top * 0.4, y0 + 0.02 + hs, top * 0.4),
        bx(0.2, 0.06, 0.12, 0.5, y0, 0.25, 0.4),
        bx(0.14, 0.05, 0.18, -0.3, y0, 0.52, -0.3),
        bx(0.16, 0.04, 0.1, 0.1, y0, -0.53, 0.2),
      ],
      worn,
    );
    const win: G[] = [];
    for (const c of [-0.2, 0, 0.2])
      win.push(bx(0.045, 0.08, 0.09, c, y0 + 0.2, 0.42), bx(0.09, 0.08, 0.045, 0.42, y0 + 0.2, c));
    merge(k, win, k.dark);
    return;
  }
  k.add(frustum(0.84, 0.84, 0.74, 0.74, h1), y0 + 0.02);
  const win: G[] = [];
  for (let r = 0; r < 6; r++) {
    const y = y0 + 0.2 + r * 0.26,
      half = 0.42 - (0.05 * (y - y0)) / h1;
    for (const c of [-0.2, 0, 0.2]) {
      win.push(bx(0.045, 0.08, 0.09, c, y, half), bx(0.045, 0.08, 0.09, c, y, -half));
      win.push(bx(0.09, 0.08, 0.045, half, y, c), bx(0.09, 0.08, 0.045, -half, y, c));
    }
  }
  merge(k, win, k.dark);
  let y = y0 + 0.02 + h1;
  k.box(0.82, 0.05, 0.82, y);
  const tr: G[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) tr.push(cy(0.015, 0.035, 0.14, sx * 0.37, y + 0.05, sz * 0.37, 6));
  merge(k, tr);
  y += 0.05;
  const oct = new THREE.CylinderGeometry(0.29, 0.32, h2, 8);
  oct.rotateY(Math.PI / 8);
  oct.translate(0, h2 / 2, 0);
  k.add(flat(oct), y);
  const ow: G[] = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    for (const hy of [0.25, 0.55]) ow.push(bx(0.03, 0.08, 0.06, 0.3 * Math.cos(t), y + hy, 0.3 * Math.sin(t), -t));
  }
  merge(k, ow, k.dark);
  y += h2;
  if (year >= 956) {
    // 956: a quake threw down the lantern and statue, leaving the octagon's broken top
    const r: G[] = [bx(0.2, 0.06, 0.12, 0.06, y, 0.08), bx(0.12, 0.1, 0.12, -0.12, y, -0.06)];
    merge(k, r, tone(k.mat, 0.85));
    return;
  }
  k.add(flat(new THREE.CylinderGeometry(0.33, 0.31, 0.04, 8)), y + 0.02);
  y += 0.04;
  // lantern: open colonnade round the fire
  k.add(new THREE.CylinderGeometry(0.13, 0.13, 0.24, 12), y + 0.12, 0, 0, k.dark);
  const lc: G[] = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    lc.push(cy(0.018, 0.018, 0.24, 0.18 * Math.cos(t), y, 0.18 * Math.sin(t), 6));
  }
  merge(k, lc);
  y += 0.24;
  k.add(new THREE.CylinderGeometry(0.21, 0.21, 0.035, 12), y + 0.0175);
  y += 0.035;
  k.add(new THREE.CylinderGeometry(0.03, 0.2, 0.12, 12), y + 0.06);
  y += 0.12;
  k.add(new THREE.CylinderGeometry(0.03, 0.04, 0.16, 6), y + 0.08);
  k.add(new THREE.SphereGeometry(0.03, 8, 6), y + 0.18);
});

function libraryAlexandria(k: Kit) {
  // the Mouseion's library as usually reconstructed: ranges of book rooms round a peristyle court,
  // a pedimented great hall on the north side and a columned gateway from the street
  const W = 1,
    D = 0.72,
    y0 = 0.02,
    H = 0.13,
    H2 = 0.2,
    t = 0.13,
    tn = 0.17;
  k.box(W, y0, D, 0);
  const zn = -D / 2 + tn / 2,
    zs = D / 2 - t / 2,
    zi0 = -D / 2 + tn,
    zi1 = D / 2 - t;
  k.box(W, H2, tn, y0, 0, zn);
  k.add(gable(W, tn, 0.055), y0 + H2, 0, zn);
  k.box(W, H, t, y0, 0, zs);
  k.add(gable(W, t, 0.045), y0 + H, 0, zs);
  for (const s of [-1, 1]) {
    k.box(t, H, zi1 - zi0, y0, s * (W / 2 - t / 2), (zi0 + zi1) / 2);
    const g = gable(zi1 - zi0, t, 0.045);
    g.rotateY(Math.PI / 2);
    k.add(g, y0 + H, s * (W / 2 - t / 2), (zi0 + zi1) / 2);
  }
  // court peristyle
  const cols: G[] = [],
    ch = H - 0.02,
    ix = W / 2 - t - 0.035;
  for (let i = 0; i <= 12; i++)
    for (const z of [zi0 + 0.035, zi1 - 0.035]) {
      const x = -ix + (i * 2 * ix) / 12;
      if (z < 0 && Math.abs(x) < 0.16) continue;
      cols.push(cy(0.007, 0.008, ch, x, y0, z, 6));
    }
  for (let i = 1; i < 7; i++)
    for (const x of [-ix, ix]) cols.push(cy(0.007, 0.008, ch, x, y0, zi0 + 0.035 + (i * (zi1 - zi0 - 0.07)) / 7, 6));
  // great hall porch and street gateway
  for (let i = 0; i < 6; i++) cols.push(cy(0.009, 0.01, H2 - 0.03, -0.125 + i * 0.05, y0, zi0 + 0.06, 6));
  for (let i = 0; i < 4; i++) cols.push(cy(0.009, 0.01, H - 0.01, -0.075 + i * 0.05, y0, D / 2 + 0.06, 6));
  merge(k, cols);
  const roofs: G[] = [
    bx(2 * ix + 0.05, 0.015, 0.05, 0, y0 + ch, zi1 - 0.025),
    bx(2 * ix - 0.3, 0.015, 0.05, -0.27, y0 + ch, zi0 + 0.025),
    bx(2 * ix - 0.3, 0.015, 0.05, 0.27, y0 + ch, zi0 + 0.025),
    bx(0.05, 0.015, zi1 - zi0, -ix + 0.015, y0 + ch, (zi0 + zi1) / 2),
    bx(0.05, 0.015, zi1 - zi0, ix - 0.015, y0 + ch, (zi0 + zi1) / 2),
    bx(0.3, 0.02, 0.08, 0, y0 + H2 - 0.03, zi0 + 0.04),
    bx(0.2, 0.02, 0.1, 0, y0 + H - 0.01, D / 2 + 0.04),
  ];
  merge(k, roofs);
  const ped = gable(0.08, 0.3, 0.05);
  ped.rotateY(Math.PI / 2);
  k.add(ped, y0 + H2 - 0.01, 0, zi0 + 0.04);
  const ped2 = gable(0.1, 0.2, 0.04);
  ped2.rotateY(Math.PI / 2);
  k.add(ped2, y0 + H + 0.01, 0, D / 2 + 0.04);
  k.box(0.06, 0.09, 0.01, y0, 0, D / 2 + 0.003, k.dark);
  k.box(0.08, 0.12, 0.01, y0, 0, zi0 - 0.002, k.dark);
  k.box(0.1, 0.02, 0.08, y0, 0, D / 2 + 0.04);
}

function serapeum(k: Kit) {
  // Ptolemaic temple of Serapis on its rock platform inside a colonnaded court, approached by a
  // stair from the east; Diocletian's column ("Pompey's Pillar", 26.9 m) stood in the court from 297
  const V = 1.5,
    s = 1 / 70,
    y0 = 0.06,
    W = 1,
    D = 0.62;
  k.add(frustum(W, D, W - 0.03, D - 0.03, y0), 0);
  k.add(stairs(0.2, 0.06, y0, Math.PI, 6), 0, 0.545, 0);
  // court portico: back wall with a colonnade inside it
  const wh = 0.07,
    wx = (W - 0.03) / 2 - 0.01,
    wz = (D - 0.03) / 2 - 0.01;
  const back: G[] = [
    bx(2 * wx, wh, 0.015, 0, y0, -wz),
    bx(2 * wx, wh, 0.015, 0, y0, wz),
    bx(0.015, wh, 2 * wz, -wx, y0, 0),
  ];
  for (const sz of [-1, 1]) back.push(bx(0.015, wh, wz - 0.06, wx, y0, sz * (wz / 2 + 0.03)));
  back.push(bx(2 * wx, 0.012, 0.05, 0, y0 + wh, -wz + 0.02), bx(2 * wx, 0.012, 0.05, 0, y0 + wh, wz - 0.02));
  back.push(bx(0.05, 0.012, 2 * wz, -wx + 0.02, y0 + wh, 0), bx(0.05, 0.012, 2 * wz, wx - 0.02, y0 + wh, 0));
  back.push(bx(0.06, 0.11, 0.14, wx, y0, 0));
  merge(k, back);
  const cols: G[] = [];
  for (let i = 0; i <= 18; i++)
    for (const z of [-wz + 0.04, wz - 0.04])
      cols.push(cy(0.005, 0.006, wh, -wx + 0.04 + (i * (2 * wx - 0.08)) / 18, y0, z, 6));
  for (let i = 1; i < 10; i++)
    for (const x of [-wx + 0.04, wx - 0.04]) {
      const z = -wz + 0.04 + (i * (2 * wz - 0.08)) / 10;
      if (x > 0 && Math.abs(z) < 0.06) continue;
      cols.push(cy(0.005, 0.006, wh, x, y0, z, 6));
    }
  // the temple, peripteral, facing east
  const tx = 0.02,
    tw = 0.42,
    td = 0.22,
    ty = y0 + 0.025,
    ch = 0.13;
  k.box(tw + 0.03, 0.025, td + 0.03, y0, tx, 0);
  for (let i = 0; i < 10; i++)
    for (const z of [-td / 2 + 0.015, td / 2 - 0.015])
      cols.push(cy(0.008, 0.009, ch, tx - tw / 2 + 0.015 + (i * (tw - 0.03)) / 9, ty, z, 6));
  for (let i = 1; i < 5; i++)
    for (const x of [tx - tw / 2 + 0.015, tx + tw / 2 - 0.015])
      cols.push(cy(0.008, 0.009, ch, x, ty, -td / 2 + 0.015 + (i * (td - 0.03)) / 5, 6));
  merge(k, cols);
  k.box(tw - 0.1, ch, td - 0.08, ty, tx - 0.02, 0, k.dark);
  k.box(tw, 0.03, td, ty + ch, tx, 0);
  k.add(gable(tw, td, 0.045), ty + ch + 0.03, tx, 0);
  // Diocletian's column
  const px = -0.3,
    pz = 0.17,
    ph = 26.9 * s * V;
  k.box(0.05, 0.04, 0.05, y0, px, pz);
  k.add(new THREE.CylinderGeometry(0.013, 0.016, ph - 0.07, 10), y0 + 0.04 + (ph - 0.07) / 2, px, pz);
  k.box(0.04, 0.03, 0.04, y0 + ph - 0.03, px, pz);
}

function bibliothecaAlexandrina(k: Kit) {
  // Snøhetta, 2002: a 160 m disc cut by a roof tilted toward the sea, rising from the pool on the
  // north to 32 m on the south, a carved granite drum wall, the planetarium sphere on the plaza
  const R = 0.46,
    n = 64,
    top = (z: number) => 0.13 + 0.12 * (z / R);
  const pos: number[] = [],
    idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2,
      x = R * Math.cos(t),
      z = R * Math.sin(t);
    pos.push(x, 0, z, x, top(z), z);
  }
  for (let i = 0; i < n; i++) {
    const j = i * 2;
    idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wall.setIndex(idx);
  wall.computeVertexNormals();
  k.add(wall, 0, 0, 0, doubleSided(k.mat));
  const rp = [0, top(0), 0],
    ri: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2,
      z = R * Math.sin(t);
    rp.push(R * Math.cos(t), top(z), z);
  }
  for (let i = 1; i <= n; i++) ri.push(0, i + 1, i);
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  roof.setIndex(ri);
  roof.computeVertexNormals();
  k.add(roof, 0, 0, 0, doubleSided(k.dark));
  // light panel ribs across the glazed roof
  const ribs: G[] = [];
  for (let i = -8; i <= 8; i++) {
    const z = i * 0.052,
      c = 2 * Math.sqrt(Math.max(0, R * R - z * z)) - 0.02;
    if (c > 0.05) ribs.push(bx(c, 0.008, 0.01, 0, top(z) - 0.002, z));
  }
  merge(k, ribs);
  // reflecting pool along the north edge
  const pool = new THREE.RingGeometry(R, R + 0.05, 32, 1, Math.PI * 0.15, Math.PI * 0.7);
  pool.rotateX(-Math.PI / 2);
  k.add(pool, 0.003, 0, 0, doubleSided(k.dark));
  k.add(new THREE.SphereGeometry(0.05, 16, 10), 0.035, 0.36, -0.36);
  k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), 0.006, 0.36, -0.36, k.dark);
  // footbridge from the university over the south plaza
  k.box(0.03, 0.012, 0.12, top(0.42) - 0.03, -0.12, 0.49);
}

const karnak = staged([-1450, -1290, -350], (k, year) => {
  // precinct of Amun-Re along its east-west axis: the 113 m first pylon, the great court with the
  // kiosk of Taharqa, the hypostyle hall of 134 columns (central 12 rising 21 m), obelisks of
  // Thutmose I and Hatshepsut, the inner pylons, the Akh-menu, and the sacred lake to the south
  // -1450: Thutmoside pylons IV-VI, obelisks, festival hall, enclosure and lake
  // -1290: 3rd pylon (Amenhotep III), 2nd pylon and the hypostyle hall (Horemheb, Seti I)
  // -350: Nectanebo I's unfinished 1st pylon closing the great court
  const V = 1.5,
    s = 1 / 250;
  const tuth = year >= -1450,
    rams = year >= -1290,
    late = year >= -350;
  const pylon = (x: number, w: number, d: number, h: number) => {
    const gate = w * 0.13,
      tw = (w - gate) / 2;
    for (const sz of [-1, 1]) {
      k.add(frustum(tw, d, tw * 0.9, d * 0.7, h), 0, x, sz * (gate / 2 + tw / 2));
      k.box(tw * 0.92, 0.008, d * 0.78, h, x, sz * (gate / 2 + tw / 2));
    }
    k.box(gate + 0.004, h * 0.7, d * 0.8, 0, x, 0);
    k.box(gate * 0.5, h * 0.45, d * 0.8 + 0.006, 0, x, 0, k.dark);
  };
  const cols: G[] = [],
    small: G[] = [],
    walls: G[] = [];
  if (late) {
    pylon(-0.47, 0.45, 0.06, 43 * s * V);
    // great court
    walls.push(
      bx(0.34, 0.06, 0.012, -0.27, 0, -0.2),
      bx(0.12, 0.06, 0.012, -0.38, 0, 0.2),
      bx(0.12, 0.06, 0.012, -0.16, 0, 0.2),
    );
    for (let i = 0; i < 16; i++)
      for (const z of [-0.18, 0.18]) {
        const x = -0.425 + i * 0.02;
        if (z > 0 && x > -0.32 && x < -0.2) continue;
        small.push(cy(0.005, 0.006, 0.06, x, 0, z, 6));
      }
    for (let i = 0; i < 5; i++)
      for (const z of [-0.025, 0.025]) cols.push(cy(0.008, 0.009, 21 * s * V, -0.36 + i * 0.045, 0, z, 6));
  }
  if (rams) {
    // temple of Ramesses III (c. 1170 BC), later breaking through the court's south wall
    k.box(0.1, 0.05, 0.16, 0, -0.26, 0.2);
    k.add(frustum(0.03, 0.12, 0.025, 0.1, 0.085), 0, -0.26, 0.13 - 0.0);
    pylon(-0.085, 0.4, 0.04, 0.18);
    // hypostyle hall
    walls.push(bx(0.21, 0.08, 0.012, 0.04, 0, -0.205), bx(0.21, 0.08, 0.012, 0.04, 0, 0.205));
    const cH = 21 * s * V,
      sH = 13 * s * V;
    for (let i = 0; i < 6; i++)
      for (const z of [-0.025, 0.025]) cols.push(cy(0.009, 0.01, cH, -0.045 + i * 0.034, 0, z, 6));
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 6; j++)
        for (const sz of [-1, 1]) small.push(cy(0.0065, 0.007, sH, -0.05 + i * 0.0225, 0, sz * (0.065 + j * 0.024), 6));
    walls.push(bx(0.19, 0.012, 0.016, 0.04, cH, -0.025), bx(0.19, 0.012, 0.016, 0.04, cH, 0.025));
    for (const sz of [-1, 1]) walls.push(bx(0.2, 0.008, 0.012, 0.04, sH, sz * 0.065));
    pylon(0.16, 0.38, 0.03, 0.15);
  }
  if (tuth) {
    // obelisks
    for (const [x, z] of [
      [0.19, 0.03],
      [0.24, -0.03],
    ]) {
      const o = frustum(0.012, 0.012, 0.008, 0.008, 0.17);
      k.add(o, 0, x, z);
      k.add(pyramid(0.008, 0.012), 0.17, x, z);
    }
    pylon(0.215, 0.26, 0.022, 0.1);
    pylon(0.265, 0.22, 0.02, 0.08);
    pylon(0.29, 0.18, 0.016, 0.07);
  }
  k.box(0.04, 0.05, 0.04, 0, 0.33, 0);
  if (!tuth) {
    // Senusret I's limestone temple and its court, later swallowed by the Thutmoside rebuild
    k.box(0.1, 0.045, 0.09, 0, 0.29, 0);
    k.box(0.03, 0.03, 0.02, 0, 0.235, 0, k.dark);
    walls.push(seg([0.2, -0.08], [0.4, -0.08], 0.008, 0.035, 0), seg([0.2, 0.08], [0.4, 0.08], 0.008, 0.035, 0));
    walls.push(
      seg([0.4, -0.08], [0.4, 0.08], 0.008, 0.035, 0),
      seg([0.2, -0.08], [0.2, -0.02], 0.008, 0.035, 0),
      seg([0.2, 0.02], [0.2, 0.08], 0.008, 0.035, 0),
    );
    merge(k, walls);
    return;
  }
  // Thutmose III's enclosure and festival hall
  walls.push(
    bx(0.34, 0.04, 0.01, 0.33, 0, -0.13),
    bx(0.34, 0.04, 0.01, 0.33, 0, 0.13),
    bx(0.01, 0.04, 0.27, 0.5, 0, 0),
  );
  k.box(0.1, 0.05, 0.2, 0, 0.44, 0);
  k.box(0.07, 0.006, 0.16, 0.05, 0.44, 0, k.dark);
  merge(k, walls);
  if (rams) merge(k, [...cols, ...small]);
  // sacred lake
  k.box(0.22, 0.004, 0.14, 0, 0.21, 0.37, k.dark);
  merge(k, [
    bx(0.23, 0.008, 0.008, 0.21, 0, 0.3),
    bx(0.23, 0.008, 0.008, 0.21, 0, 0.44),
    bx(0.008, 0.008, 0.14, 0.1, 0, 0.37),
    bx(0.008, 0.008, 0.14, 0.32, 0, 0.37),
  ]);
});

function apadana(k: Kit) {
  // Persepolis audience hall: 60 m square hall of 36 columns behind mud-brick walls, porticoes of
  // 12 columns on three sides, four corner towers, 20 m columns with double-bull capitals, all on
  // a podium reached by the relief-carved stairways on the north and east
  const V = 1.5,
    y0 = 0.035,
    ch = (20 / 110) * V,
    S = 0.9,
    M = 0.48,
    R = (S - M) / 2;
  k.box(S + 0.02, y0, S + 0.02, 0);
  // central hall
  const t = 0.03;
  for (const sd of [-1, 1]) {
    k.box(M, ch, t, y0, 0, sd * (M / 2 - t / 2));
    k.box(t, ch, M - 2 * t, y0, sd * (M / 2 - t / 2), 0);
  }
  k.box(M, 0.025, M, y0 + ch);
  k.box(M - 0.16, 0.012, M - 0.16, y0 + ch + 0.025);
  // corner towers with stepped merlons
  const mer: G[] = [];
  const th = ch + 0.06;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = sx * (M / 2 + R / 2),
        cz = sz * (M / 2 + R / 2);
      k.box(R, th, R, y0, cx, cz);
      for (let i = 0; i < 5; i++) {
        const p = -R / 2 + 0.02 + (i * (R - 0.04)) / 4;
        mer.push(
          bx(0.018, 0.02, 0.01, cx + p, y0 + th, cz + sz * (R / 2 - 0.005)),
          bx(0.01, 0.02, 0.018, cx + sx * (R / 2 - 0.005), y0 + th, cz + p),
        );
      }
    }
  // porticoes N, E, W; storerooms S
  const cols: G[] = [];
  const portico = (ax: number, az: number) => {
    for (let i = 0; i < 6; i++)
      for (const o of [0.065, 0.15]) {
        const along = -M / 2 + 0.04 + (i * (M - 0.08)) / 5;
        const x = az ? along : ax * (M / 2 + o),
          z = az ? az * (M / 2 + o) : along;
        cols.push(cy(0.0085, 0.0095, ch - 0.012, x, y0, z, 6));
        mer.push(bx(az ? 0.03 : 0.012, 0.012, az ? 0.012 : 0.03, x, y0 + ch - 0.012, z));
      }
    // roof beams only, so the columns read from above
    for (const o of [0.065, 0.15])
      mer.push(bx(az ? M : 0.016, 0.014, az ? 0.016 : M, ax * (M / 2 + o), y0 + ch, az * (M / 2 + o)));
  };
  portico(0, -1);
  portico(1, 0);
  portico(-1, 0);
  merge(k, cols);
  merge(k, mer);
  k.box(M, ch * 0.5, R, y0, 0, M / 2 + R / 2);
  k.box(0.06, ch * 0.4, 0.008, y0, 0, -M / 2 + 0.001, k.dark);
  k.box(0.008, ch * 0.4, 0.06, y0, M / 2 - 0.001, 0, k.dark);
  // double stairways: two flights rising inward against a carved parapet
  for (const [ax, az] of [
    [0, -1],
    [1, 0],
  ]) {
    const out = S / 2 + 0.01,
      d = 0.075,
      w = 0.42;
    const px = ax * (out + d / 2),
      pz = az * (out + d / 2);
    k.box(ax ? d : w, y0 + 0.015, ax ? w : d, 0, px, pz, k.dark);
    for (const sd of [-1, 1]) {
      const rot = ax ? (sd > 0 ? Math.PI / 2 : -Math.PI / 2) : sd > 0 ? Math.PI : 0;
      const sx = ax ? px + 0.0 : sd * (w / 2 + 0.06),
        sz = ax ? sd * (w / 2 + 0.06) : pz;
      k.add(stairs(0.05, 0.08, y0, rot, 8), 0, sx, sz);
    }
  }
}

function buyukkale(k: Kit) {
  // royal citadel of Hattusa on its ridge, about 250 x 140 m, walled with square towers, the
  // palace buildings ranged round lower, middle and upper courts, gate at the south-west end
  const r = sub(k, Math.PI / 6);
  const outline = [
    [-0.48, 0.04],
    [-0.42, 0.19],
    [-0.2, 0.26],
    [0.1, 0.27],
    [0.34, 0.2],
    [0.47, 0.03],
    [0.44, -0.14],
    [0.24, -0.25],
    [-0.06, -0.26],
    [-0.3, -0.19],
    [-0.45, -0.09],
  ];
  const Y = 0.14;
  r.add(slab(outline, Y - 0.06, 0.03), 0, 0, 0, k.dark);
  const walls: G[] = [];
  const inset = outline.map(([x, z]) => [x * 0.96, z * 0.93]);
  for (let i = 0; i < inset.length; i++) {
    const a = inset[i],
      b = inset[(i + 1) % inset.length];
    walls.push(seg(a, b, 0.014, 0.035, Y));
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.max(1, Math.round(L / 0.08));
    for (let j = 0; j < n; j++) {
      const f = j / n,
        x = a[0] + (b[0] - a[0]) * f,
        z = a[1] + (b[1] - a[1]) * f;
      walls.push(bx(0.035, 0.055, 0.035, x, Y, z, Math.atan2(-(b[1] - a[1]), b[0] - a[0])));
    }
  }
  // cross walls between the courts
  walls.push(bx(0.016, 0.035, 0.44, -0.17, Y, 0.01), bx(0.016, 0.035, 0.42, 0.2, Y, -0.01));
  const bld: G[] = [
    bx(0.07, 0.06, 0.09, -0.4, Y, 0.06),
    bx(0.05, 0.065, 0.08, -0.17, Y, 0.01),
    bx(0.05, 0.065, 0.08, 0.2, Y, -0.01),
    bx(0.12, 0.05, 0.08, -0.29, Y, -0.13),
    bx(0.1, 0.045, 0.07, -0.27, Y, 0.18),
    bx(0.15, 0.07, 0.13, 0.0, Y, -0.17),
    bx(0.14, 0.05, 0.07, 0.03, Y, 0.2),
    bx(0.07, 0.045, 0.1, -0.1, Y, 0.17),
    bx(0.12, 0.08, 0.12, 0.36, Y, 0.02),
    bx(0.1, 0.06, 0.06, 0.28, Y, -0.17),
    bx(0.1, 0.055, 0.06, 0.28, Y, 0.19),
  ];
  merge(r, [...walls, ...bld]);
  // light-well and pillared hall roof of the audience hall, gate openings
  r.box(0.07, 0.004, 0.06, Y + 0.07, 0.0, -0.17, k.dark);
  r.box(0.03, 0.04, 0.03, Y, -0.17, 0.01, k.dark).scale.set(1, 1, 3);
  r.box(0.03, 0.04, 0.03, Y, 0.2, -0.01, k.dark).scale.set(1, 1, 3);
  // road up to the gate
  r.add(stairs(0.05, 0.1, Y, 0, 6), 0, -0.56, 0.06);
}

function knossosPalace(k: Kit) {
  // Minoan palace: wings of two to four storeys round a 53 x 28 m north-south central court, west
  // court with three kouloures, theatral area, north entrance bastion, the grand staircase light
  // well, dark down-tapering columns and horns of consecration along the roofs
  const V = 1.6,
    st = (4 / 150) * V;
  k.box(0.19, 0.004, 0.35, 0, 0, 0, k.dark);
  const blocks: [number, number, number, number, number][] = [
    [-0.36, -0.22, -0.26, 0.17, 1.5],
    [-0.22, -0.095, -0.13, -0.03, 2],
    [-0.22, -0.11, -0.03, 0.2, 3],
    [-0.22, -0.095, -0.26, -0.13, 2],
    [-0.36, -0.22, 0.17, 0.3, 2],
    [0.095, 0.26, 0.02, 0.24, 3],
    [0.095, 0.2, -0.24, 0.0, 2],
    [0.29, 0.38, -0.12, 0.22, 2],
    [0.2, 0.36, -0.26, -0.12, 1.5],
    [-0.09, -0.02, -0.36, -0.2, 1],
    [0.02, 0.12, -0.36, -0.2, 2],
    [-0.1, 0.12, -0.44, -0.37, 1],
    [-0.22, 0.24, 0.2, 0.32, 2],
    [0.26, 0.29, 0.22, 0.32, 1],
  ];
  const b: G[] = [];
  for (const [x0, x1, z0, z1, n] of blocks) b.push(bx(x1 - x0, n * st, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2));
  // light wells sunk into the roofs
  merge(k, b);
  const wells: G[] = [
    bx(0.04, 0.004, 0.04, -0.16, 3 * st, 0.08),
    bx(0.035, 0.004, 0.035, 0.18, 3 * st, 0.15),
    bx(0.04, 0.004, 0.04, 0.15, 2 * st, -0.12),
  ];
  merge(k, wells, k.dark);
  // grand staircase: open well between the east wing blocks
  k.box(0.03, 0.004, 0.22, 0, 0.275, 0.05, k.dark);
  // west court kouloures, theatral area steps
  for (const z of [-0.12, 0.0, 0.12]) k.add(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 16), 0.002, -0.44, z, k.dark);
  k.box(0.16, 0.012, 0.05, 0, -0.27, -0.4);
  k.box(0.16, 0.024, 0.025, 0, -0.27, -0.41);
  // Minoan columns, wider at the top, with cushion capitals
  const cols: G[] = [],
    caps: G[] = [];
  const col = (x: number, y: number, z: number, h: number) => {
    cols.push(cy(0.008, 0.0055, h, x, y, z, 8));
    caps.push(cy(0.011, 0.011, 0.006, x, y + h, z, 8));
  };
  for (let i = 0; i < 5; i++) col(-0.085, 0, -0.02 + i * 0.045, 2 * st - 0.006);
  for (let i = 0; i < 3; i++) col(0.03 + i * 0.04, 2 * st, -0.21, st - 0.006);
  for (let i = 0; i < 4; i++) col(-0.2 + i * 0.04, 0, 0.335, st - 0.006);
  for (let i = 0; i < 4; i++) col(0.275, 0, -0.03 + i * 0.06, 2 * st - 0.006);
  merge(k, cols, k.dark);
  merge(k, [
    ...caps,
    bx(0.022, 0.008, 0.21, -0.08, 2 * st, 0.07),
    bx(0.13, 0.01, 0.03, 0.07, 3 * st, -0.215),
    bx(0.16, 0.01, 0.025, -0.14, st, 0.335),
    bx(0.024, 0.01, 0.2, 0.275, 2 * st, 0.06),
  ]);
  // horns of consecration
  const horns: G[] = [];
  const horn = (x: number, y: number, z: number) =>
    horns.push(
      bx(0.008, 0.006, 0.03, x, y, z),
      bx(0.008, 0.022, 0.008, x, y, z - 0.011),
      bx(0.008, 0.022, 0.008, x, y, z + 0.011),
    );
  for (let i = 0; i < 7; i++) horn(-0.355, 1.5 * st, -0.23 + i * 0.065);
  for (let i = 0; i < 4; i++) horn(-0.115, 3 * st, 0.0 + i * 0.05);
  merge(k, horns);
}

function roundCity(k: Kit) {
  // al-Mansur's Baghdad: moat, outer and main walls with towers, four gates (Kufa, Basra,
  // Khurasan, Syria) each crowned by a domed hall, arcaded avenues through a ring of houses, an
  // inner wall, and the open centre with the Green Dome palace and the great mosque
  const moat = new THREE.RingGeometry(0.48, 0.5, 64);
  moat.rotateX(-Math.PI / 2);
  k.add(moat, 0.003, 0, 0, doubleSided(k.dark));
  const ds = doubleSided(k.mat);
  const wallRing = (r: number, h: number, t: number) => {
    k.add(band([r, r, 0], [r, r, h], 72), 0, 0, 0, ds);
    k.add(band([r - t, r - t, 0], [r - t, r - t, h], 72), 0, 0, 0, ds);
    k.add(band([r, r, h], [r - t, r - t, h], 72), 0, 0, 0, ds);
  };
  wallRing(0.47, 0.035, 0.01);
  wallRing(0.445, 0.06, 0.02);
  wallRing(0.295, 0.035, 0.012);
  const gates = [0, 1, 2, 3].map(i => Math.PI / 4 + (i * Math.PI) / 2);
  const near = (t: number, w: number) => gates.some(g => Math.abs(Math.atan2(Math.sin(t - g), Math.cos(t - g))) < w);
  const towers: G[] = [];
  for (let i = 0; i < 64; i++) {
    const t = ((i + 0.5) / 64) * Math.PI * 2;
    if (near(t, 0.06)) continue;
    towers.push(cy(0.011, 0.012, 0.072, 0.448 * Math.cos(t), 0, 0.448 * Math.sin(t), 6));
  }
  merge(k, towers);
  const blocks: G[] = [];
  for (const [r, n] of [
    [0.32, 40],
    [0.36, 46],
    [0.4, 52],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * Math.PI * 2;
      if (near(t, 0.1)) continue;
      blocks.push(
        bx(0.028, 0.022 + (i % 3) * 0.006, ((Math.PI * 2 * r) / n) * 0.75, r * Math.cos(t), 0, r * Math.sin(t), -t),
      );
    }
  }
  const domes: G[] = [];
  for (const g of gates) {
    const c = Math.cos(g),
      s = Math.sin(g);
    for (const o of [-1, 1]) {
      const ox = -s * o * 0.028,
        oz = c * o * 0.028;
      blocks.push(bx(0.13, 0.034, 0.014, 0.365 * c + ox, 0, 0.365 * s + oz, -g));
    }
    blocks.push(bx(0.05, 0.08, 0.07, 0.445 * c, 0, 0.445 * s, -g), bx(0.03, 0.045, 0.05, 0.47 * c, 0, 0.47 * s, -g));
    blocks.push(bx(0.03, 0.045, 0.05, 0.295 * c, 0, 0.295 * s, -g));
    const d = new THREE.SphereGeometry(0.022, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    d.translate(0.445 * c, 0.08, 0.445 * s);
    domes.push(d);
  }
  merge(k, blocks);
  merge(k, domes);
  // palace of the Golden Gate under the Green Dome, mosque against its side
  k.box(0.11, 0.06, 0.11, 0);
  k.add(new THREE.CylinderGeometry(0.035, 0.038, 0.035, 16), 0.0775);
  k.add(new THREE.SphereGeometry(0.038, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.095);
  k.add(new THREE.CylinderGeometry(0.003, 0.004, 0.04, 5), 0.15);
  k.box(0.1, 0.03, 0.1, 0, 0, 0.11);
  k.box(0.06, 0.004, 0.06, 0.03, 0, 0.115, k.dark);
}

/** al-Nasir Muhammad mosque (1318) with its green-tiled dome and two minarets. */
function nasirMosque(k: Kit, Y: number) {
  const nx = 0.03,
    nz = 0.17;
  k.box(0.1, 0.035, 0.08, Y, nx, nz);
  k.box(0.06, 0.004, 0.04, Y + 0.035, nx + 0.01, nz, k.dark);
  k.add(new THREE.SphereGeometry(0.018, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), Y + 0.035, nx - 0.035, nz);
  for (const [mx, mz] of [
    [nx + 0.05, nz - 0.04],
    [nx - 0.05, nz - 0.04],
  ]) {
    k.add(new THREE.CylinderGeometry(0.005, 0.006, 0.09, 8), Y + 0.045, mx, mz);
    k.add(new THREE.ConeGeometry(0.006, 0.02, 8), Y + 0.1, mx, mz);
  }
}

const cairoCitadel = staged([1318, 1848], (k, year) => {
  // Salah al-Din's citadel on its spur of the Muqattam: walls with round towers around the
  // southern and northern enclosures; the Muhammad Ali mosque (1848) with its 52 m dome, half
  // domes and two 82 m pencil minarets, and the al-Nasir Muhammad mosque
  const V = 1.5,
    s = 1 / 300,
    Y = 0.08;
  const outline = [
    [-0.48, 0.1],
    [-0.37, 0.4],
    [-0.05, 0.45],
    [0.12, 0.3],
    [0.17, 0.1],
    [0.43, 0.02],
    [0.48, -0.24],
    [0.3, -0.44],
    [0.0, -0.4],
    [-0.14, -0.16],
    [-0.42, -0.12],
  ];
  k.add(slab(outline, Y - 0.04, 0.02), 0, 0, 0, k.dark);
  const walls: G[] = [],
    towers: G[] = [];
  const inset = outline.map(([x, z]) => [x * 0.97, z * 0.97]);
  for (let i = 0; i < inset.length; i++) {
    const a = inset[i],
      b = inset[(i + 1) % inset.length];
    walls.push(seg(a, b, 0.012, 0.035, Y));
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.max(1, Math.round(L / 0.1));
    for (let j = 0; j < n; j++)
      towers.push(cy(0.02, 0.022, 0.05, a[0] + ((b[0] - a[0]) * j) / n, Y, a[1] + ((b[1] - a[1]) * j) / n, 10));
  }
  // wall between the two enclosures, with Bab al-Qulla
  walls.push(seg([-0.14, -0.16], [0.17, 0.1], 0.014, 0.04, Y));
  towers.push(cy(0.022, 0.024, 0.06, 0.02, Y, -0.03, 10));
  const modern = year >= 1848;
  if (modern) {
    // northern enclosure barracks and the Harem palace, Gawhara palace south of the mosque
    walls.push(
      bx(0.2, 0.03, 0.04, 0.22, Y, -0.3, -0.3),
      bx(0.2, 0.03, 0.04, 0.3, Y, -0.12, -0.3),
      bx(0.12, 0.04, 0.12, 0.05, Y, -0.25),
    );
    walls.push(bx(0.12, 0.035, 0.07, -0.1, Y, 0.34));
  } else if (year >= 1318) {
    // al-Nasir Muhammad's Striped Palace on the western edge, cleared by Muhammad Ali for his mosque
    walls.push(bx(0.16, 0.04, 0.12, -0.17, Y, 0.13), bx(0.08, 0.03, 0.1, -0.06, Y, 0.3));
  }
  merge(k, walls);
  merge(k, towers);
  if (year >= 1318) nasirMosque(k, Y);
  if (!modern) return;
  // Muhammad Ali mosque: prayer hall 41 m square, courtyard on the west
  const hx = -0.14,
    hz = 0.12,
    hw = 41 * s,
    hh = 0.07;
  k.box(hw, hh, hw, Y, hx, hz);
  const dr = 0.036,
    dy = Y + hh + 0.035;
  k.add(new THREE.CylinderGeometry(dr, dr, 0.04, 16), dy + 0.0, hx, hz);
  k.add(new THREE.SphereGeometry(dr, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dy + 0.02, hx, hz);
  k.add(new THREE.CylinderGeometry(0.002, 0.003, 0.03, 5), dy + 0.02 + dr + 0.015, hx, hz);
  const half: G[] = [];
  for (let i = 0; i < 4; i++) {
    const t = (i * Math.PI) / 2;
    const g = new THREE.SphereGeometry(0.03, 12, 6, 0, Math.PI, 0, Math.PI / 2);
    g.rotateY(t + Math.PI / 2);
    g.translate(hx + Math.cos(t) * 0.032, Y + hh + 0.004, hz - Math.sin(t) * 0.032);
    half.push(g);
    for (const o of [-1, 1]) {
      const c = new THREE.SphereGeometry(0.016, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      c.translate(hx + o * 0.047, Y + hh, hz + (i < 2 ? -1 : 1) * 0.047);
      if (i % 2 === 0) half.push(c);
    }
  }
  merge(k, half);
  k.box(0.05, 0.03, 0.05, Y + hh, hx, hz);
  const cx = hx - hw / 2 - 0.085,
    cw = 0.17;
  const court: G[] = [
    bx(cw, 0.035, 0.012, cx, Y, hz - cw / 2),
    bx(cw, 0.035, 0.012, cx, Y, hz + cw / 2),
    bx(0.012, 0.035, cw, cx - cw / 2, Y, hz),
  ];
  court.push(bx(0.02, 0.06, 0.02, cx - cw / 2, Y, hz));
  merge(k, court);
  const cd: G[] = [];
  for (let i = 0; i < 7; i++)
    for (const o of [-1, 1]) {
      const d = new THREE.SphereGeometry(0.009, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      d.translate(cx - cw / 2 + 0.012 + i * 0.024, Y + 0.035, hz + o * (cw / 2));
      cd.push(d);
    }
  const f = new THREE.SphereGeometry(0.018, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  f.translate(cx, Y + 0.02, hz);
  cd.push(f);
  merge(k, cd);
  k.box(0.012, 0.02, 0.012, Y, cx, hz);
  const mH = 82 * s * V;
  for (const o of [-1, 1]) {
    const mx = hx - hw / 2 - 0.005,
      mz = hz + o * (hw / 2 + 0.005);
    k.add(new THREE.CylinderGeometry(0.006, 0.008, mH - 0.05, 8), Y + (mH - 0.05) / 2, mx, mz);
    for (const b of [0.45, 0.72])
      k.add(new THREE.CylinderGeometry(0.011, 0.009, 0.008, 8), Y + (mH - 0.05) * b, mx, mz);
    k.add(new THREE.ConeGeometry(0.0065, 0.05, 8), Y + mH - 0.025, mx, mz);
  }
});

export const batch_a: Record<string, Builder> = {
  'anu-ziggurat': anuZiggurat,
  'ziggurat-of-ur': zigguratOfUr,
  'great-pyramid': greatPyramid,
  etemenanki,
  byrsa,
  pharos,
  'library-alexandria': libraryAlexandria,
  serapeum,
  'bibliotheca-alexandrina': bibliothecaAlexandrina,
  karnak,
  apadana,
  buyukkale,
  'knossos-palace': knossosPalace,
  'round-city': roundCity,
  'cairo-citadel': cairoCitadel,
};
