import * as THREE from 'three';
import { type Builder, band, doubleSided, gable, type Kit, merge, staged } from './kit';

// 1460 Ottoman mosque with a minaret, 1687 Venetian shell blew up the powder store, 1843 mosque and minaret cleared
const parthenon = staged([1460, 1687, 1843], (k, year) => {
  // 69.5 x 30.9 m stylobate, peristyle of 8 x 17 Doric columns, low pediments at both ends
  const V = 2,
    W = 1,
    D = 0.445;
  [0, 1, 2].forEach(i => k.box(W + 0.04 - i * 0.02, 0.016, D + 0.04 - i * 0.02, i * 0.016));
  const y0 = 0.048,
    colH = 0.15 * V,
    r = 0.0137,
    ruin = year >= 1687;
  const cols: THREE.BufferGeometry[] = [];
  const col = (x: number, z: number, h = colH) => {
    const c = new THREE.CylinderGeometry(r * 0.8, r, h, 8);
    c.translate(x, y0 + h / 2, z);
    cols.push(c);
  };
  const cx = W / 2 - 0.025,
    cz = D / 2 - 0.025,
    step = (2 * cx) / 16;
  // the blast took out 8 columns on the north side and 6 on the south, leaving drums
  const lost = (i: number, z: number) => ruin && (z < 0 ? i >= 5 && i <= 12 : i >= 6 && i <= 11);
  for (let i = 0; i < 17; i++)
    for (const z of [-cz, cz]) col(-cx + i * step, z, lost(i, z) ? colH * (0.08 + ((i * 7) % 3) * 0.05) : colH);
  for (let i = 1; i < 7; i++) for (const x of [-cx, cx]) col(x, -cz + (i * 2 * cz) / 7);
  merge(k, cols);
  const top = y0 + colH;
  if (!ruin) {
    k.box(0.8, colH, 0.27, y0, 0, 0, k.dark);
    k.box(W - 0.01, 0.06, D - 0.01, top);
    k.add(gable(W - 0.01, D - 0.01, 0.075), top + 0.06);
  } else {
    // roofless: low cella walls with the west end still standing, entablature only over surviving columns
    k.box(0.8, colH * 0.18, 0.27, y0, 0, 0, k.dark);
    k.box(0.16, colH * 0.85, 0.27, y0, -0.32, 0, k.dark);
    const beam = (x0: number, x1: number, z: number) => k.box(x1 - x0, 0.06, 0.04, top, (x0 + x1) / 2, z);
    beam(-W / 2 + 0.005, -cx + 4.5 * step, -cz);
    beam(-cx + 12.5 * step, W / 2 - 0.005, -cz);
    beam(-W / 2 + 0.005, -cx + 5.5 * step, cz);
    beam(-cx + 11.5 * step, W / 2 - 0.005, cz);
    for (const s of [-1, 1]) {
      k.box(0.05, 0.06, D - 0.01, top, s * (W / 2 - 0.03), 0);
      k.add(gable(0.03, D - 0.01, 0.075), top + 0.06, s * (W / 2 - 0.02), 0);
    }
  }
  if (year >= 1460 && year < 1843) {
    // minaret at the south-west corner of the cella; only the shaft survived the blast
    const mx = -0.36,
      mz = 0.1,
      mh = ruin ? 0.5 : 0.62;
    k.add(new THREE.CylinderGeometry(0.016, 0.019, mh, 10), mh / 2 + y0, mx, mz);
    if (!ruin) {
      k.add(new THREE.CylinderGeometry(0.027, 0.02, 0.012, 10), y0 + mh * 0.85, mx, mz);
      k.add(new THREE.ConeGeometry(0.018, 0.08, 10), y0 + mh + 0.04, mx, mz, k.dark);
    }
  }
});

// 1349 earthquake brought down the south side of the outer wall; 1874 digs exposed the hypogeum, earth-filled since late antiquity
const colosseum = staged([1349, 1874], (k, year) => {
  // 189 x 156 m ellipse, three arcaded storeys of 80 arches and a solid attic, about 48 m high
  const V = 1.6,
    rx = 0.5,
    rz = 0.413,
    t = 0.03,
    n = 40,
    ruin = year >= 1349;
  const tiers = [10.5, 11.8, 11.6].map(h => (h / 189) * V),
    attic = (14 / 189) * V;
  const wall = doubleSided(k.mat);
  const pt = (i: number, o = 0) => [
    (rx - o) * Math.cos((i / n) * Math.PI * 2),
    (rz - o) * Math.sin((i / n) * Math.PI * 2),
  ];
  // one flat panel per chord of the ellipse, with an arch cut through it (or solid for the attic)
  const panel = (i: number, y: number, h: number, arch: boolean, o = 0) => {
    const [x0, z0] = pt(i, o),
      [x1, z1] = pt(i + 1, o),
      w = Math.hypot(x1 - x0, z1 - z0) + 0.002;
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h);
    s.lineTo(-w / 2, h);
    s.closePath();
    if (arch) {
      const r = w * 0.3,
        foot = y ? h * 0.14 : 0,
        spring = h * 0.86 - r;
      const hole = new THREE.Path();
      hole.moveTo(-r, foot);
      hole.lineTo(r, foot);
      hole.lineTo(r, spring);
      hole.absarc(0, spring, r, 0, Math.PI, false);
      hole.lineTo(-r, foot);
      s.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 6 });
    geo.translate(0, 0, -t / 2);
    geo.rotateY(Math.atan2(-(z1 - z0), x1 - x0));
    geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    return geo;
  };
  const wallH = tiers[0] + tiers[1] + tiers[2],
    fullH = wallH + attic;
  // storeys left standing on each chord of the outer ring after 1349; the gap faces south (+z)
  const storeys = (i: number) => (!ruin || i < 1 || i > 20 ? 4 : i === 1 || i === 20 ? 3 : i === 2 || i === 19 ? 2 : 0);
  const panels: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    let y = 0;
    for (let s = 0; s < storeys(i); s++) {
      const h = s < 3 ? tiers[s] : attic;
      panels.push(panel(i, y, h, s < 3));
      y += h;
    }
  }
  const innerH = tiers[0] + tiers[1];
  if (ruin)
    for (let i = 2; i <= 19; i++) {
      // the second ring of arcades, now the outer face on the south
      panels.push(panel(i, 0, tiers[0], true, t * 2), panel(i, tiers[0], tiers[1], true, t * 2));
    }
  merge(k, panels);
  if (!ruin) {
    // the dark inner ring shows through the arches
    k.add(band([rx - t * 2, rz - t * 2, 0], [rx - t * 2, rz - t * 2, wallH]), 0, 0, 0, doubleSided(k.dark));
    k.add(band([rx, rz, fullH], [rx - t * 2, rz - t * 2, fullH]), 0, 0, 0, wall);
  } else {
    const dk: THREE.BufferGeometry[] = [],
      caps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      if (i < 2 || i > 19) dk.push(panel(i, 0, wallH, false, t * 2));
      const s = storeys(i);
      if (!s) continue;
      const h = s === 4 ? fullH : tiers.slice(0, s).reduce((a, b) => a + b, 0);
      const [x0, z0] = pt(i),
        [x1, z1] = pt(i + 1),
        [x2, z2] = pt(i + 1, t * 2),
        [x3, z3] = pt(i, t * 2);
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute([x0, h, z0, x1, h, z1, x2, h, z2, x3, h, z3], 3));
      q.setIndex([0, 2, 1, 0, 3, 2]);
      q.computeVertexNormals();
      caps.push(q);
    }
    merge(k, dk, doubleSided(k.dark));
    merge(k, caps, wall);
  }
  // seating slopes down to an 83 x 48 m arena
  const ax = 0.22,
    az = 0.127,
    podium = 0.05;
  if (!ruin)
    k.add(band([rx - t * 2, rz - t * 2, fullH - 0.03], [ax + 0.02, az + 0.02, podium]), 0, 0, 0, doubleSided(k.dark));
  else {
    // the cavea drops to the inner ring where the outer wall fell, and is gapped and uneven all round
    const pos: number[] = [],
      idx: number[] = [],
      m = 80;
    for (let j = 0; j <= m; j++) {
      const f = (j / m) * n,
        a = (j / m) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a);
      const drop = Math.min(1, Math.max(0, Math.min(f - 2, 20 - f)));
      const h = fullH - 0.03 - drop * (fullH - innerH - 0.02) - 0.025 * Math.abs(Math.sin(a * 7));
      pos.push((rx - t * 2) * c, h, (rz - t * 2) * s, (ax + 0.02) * c, podium, (az + 0.02) * s);
    }
    for (let j = 0; j < m; j++) {
      const b = j * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    k.add(g, 0, 0, 0, doubleSided(k.dark));
  }
  k.add(band([ax, az, 0], [ax, az, podium]), 0, 0, 0, wall);
  const floor = new THREE.CircleGeometry(1, 32);
  floor.rotateX(-Math.PI / 2);
  floor.scale(ax, 1, az);
  if (year < 1874) k.add(floor, 0.004);
  else {
    // the hypogeum: rows of corridor walls under the vanished arena floor
    const pit = k.dark.clone() as THREE.MeshLambertMaterial;
    pit.color.multiplyScalar(0.4);
    k.add(floor, 0.002, 0, 0, pit);
    const walls: THREE.BufferGeometry[] = [];
    for (let j = -3; j <= 3; j++) {
      const z = (j / 4) * az,
        l = 2 * ax * Math.sqrt(1 - (z / az) ** 2) * 0.94;
      const b = new THREE.BoxGeometry(l, 0.04, 0.006);
      b.translate(0, 0.02, z);
      walls.push(b);
    }
    for (let j = -2; j <= 2; j++) {
      const x = (j / 3) * ax,
        l = 2 * az * Math.sqrt(1 - (x / ax) ** 2) * 0.9;
      const b = new THREE.BoxGeometry(0.006, 0.04, l);
      b.translate(x, 0.02, 0);
      walls.push(b);
    }
    merge(k, walls);
  }
});

function angkorWat(k: Kit) {
  // three concentric galleries rising to five lotus-bud towers in a quincunx; entered from the west
  const V = 1.6;
  const gallery = (w: number, d: number, y: number, h = 0.035, t = 0.03) => {
    for (const z of [-1, 1]) k.box(w, h, t, y, 0, (z * (d - t)) / 2);
    for (const x of [-1, 1]) k.box(t, h, d - 2 * t, y, (x * (w - t)) / 2, 0);
    for (const z of [-1, 1]) k.box(w + 0.008, 0.012, t + 0.008, y + h, 0, (z * (d - t)) / 2, k.dark);
    for (const x of [-1, 1]) k.box(t + 0.008, 0.012, d - 2 * t, y + h, (x * (w - t)) / 2, 0, k.dark);
  };
  const tower = (x: number, z: number, y: number, s: number) => {
    // a tall base then tiers that step in, each with a small lip, closing to a bud
    const pts: number[][] = [
      [1, 0],
      [1, 0.3],
    ];
    for (let i = 0; i < 5; i++) {
      const r = 1.02 - i * 0.17,
        h = 0.3 + i * 0.13;
      pts.push([r + 0.06, h], [r + 0.06, h + 0.03], [r - 0.04, h + 0.04], [r - 0.08, h + 0.13]);
    }
    pts.push([0.1, 0.98], [0, 1.08]);
    const lathe = pts.map(([r, h]) => new THREE.Vector2(r * 0.055 * s, h * 0.2 * s * V));
    k.box(0.12 * s, 0.03, 0.12 * s, y, x, z);
    k.add(new THREE.LatheGeometry(lathe, 8), y + 0.03, x, z);
  };
  // outer (third) gallery 187 x 215 m on a low terrace
  k.box(0.92, 0.015, 1.04, 0);
  gallery(0.87, 1, 0.015);
  k.box(0.07, 0.07, 0.18, 0.015, -0.435, 0);
  k.box(0.34, 0.012, 0.05, 0, -0.6, 0);
  // second level 100 x 115 m
  k.box(0.465, 0.065, 0.535, 0.015);
  gallery(0.465, 0.535, 0.08);
  // top level 60 x 60 m, central tower 65 m above the ground
  k.box(0.28, 0.1, 0.28, 0.08);
  gallery(0.28, 0.28, 0.18, 0.03, 0.025);
  for (const x of [-1, 1]) for (const z of [-1, 1]) tower(x * 0.115, z * 0.115, 0.18, 0.75);
  k.box(0.1, 0.04, 0.1, 0.18);
  tower(0, 0, 0.22, 1.05);
}

export const classical: Record<string, Builder> = {
  parthenon,
  colosseum,
  'angkor-wat': angkorWat,
};
