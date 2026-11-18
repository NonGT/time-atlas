import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Gets the year the model is being built for; models that change over time list those years in phases. */
export type Builder = ((k: Kit, year: number) => void) & { phases?: number[] };

export const staged = (phases: number[], build: (k: Kit, year: number) => void): Builder =>
  Object.assign(build, { phases });

export interface Kit {
  g: THREE.Group;
  mat: THREE.Material;
  dark: THREE.Material;
  add(geo: THREE.BufferGeometry, y: number, x?: number, z?: number, m?: THREE.Material): THREE.Mesh;
  box(w: number, h: number, d: number, y: number, x?: number, z?: number, m?: THREE.Material): THREE.Mesh;
}

/*
 * Models of individual buildings, same conventions as shapes.ts: Y-up, longest side about 1, base at y=0,
 * +x east and +z south. Heights are stretched (V) so they still read from the map's tilted camera.
 */

export const merge = (k: Kit, geos: THREE.BufferGeometry[], m = k.mat) => k.add(mergeGeometries(geos)!, 0, 0, 0, m);

/** Surface joining two horizontal ellipses, used for walls (same radii) and slopes (different radii). */
export function band(a: [number, number, number], b: [number, number, number], n = 64) {
  const pos: number[] = [],
    idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2,
      c = Math.cos(t),
      s = Math.sin(t);
    pos.push(a[0] * c, a[2], a[1] * s, b[0] * c, b[2], b[1] * s);
  }
  for (let i = 0; i < n; i++) {
    const j = i * 2;
    idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Gable roof running along x: a triangle of width d and height h, length l. */
export function gable(l: number, d: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  geo.translate(-l / 2, 0, 0);
  return geo;
}

export const doubleSided = (m: THREE.Material) => {
  const c = m.clone();
  c.side = THREE.DoubleSide;
  return c;
};
