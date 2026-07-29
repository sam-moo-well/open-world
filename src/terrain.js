// Procedural rolling-hills world: analytic heightfield, vertex-coloured
// terrain mesh, water plane, and instanced trees / rocks.
import * as THREE from 'three';
import { makeNoise2D, smoothstep } from './noise.js';

export const WORLD_SIZE = 620;      // metres, square
export const WATER_Y = -3.4;

const noise = makeNoise2D(1337);
const moisture = makeNoise2D(9001);

// Smooth range of hills and valleys. Amplitudes/wavelengths chosen so the
// steepest grade stays runnable (~20 deg) and the spawn area is nearly flat.
export function heightAt(x, z) {
  let h = 0;
  h += 11.0 * noise(x * 0.0045 + 13.7, z * 0.0045 - 4.2);   // main hills
  h += 5.0 * noise(x * 0.0016 + 40.0, z * 0.0016 - 25.0);   // broad sweep
  h += 3.4 * noise(x * 0.016 - 7.1, z * 0.016 + 9.4);       // undulation
  h += 0.5 * noise(x * 0.06 + 3.3, z * 0.06 + 1.8);         // detail
  const flat = smoothstep(8, 46, Math.hypot(x, z));         // calm spawn
  return h * (0.10 + 0.90 * flat);
}

// Approximate surface normal by central differences (matches the mesh
// closely enough for slope checks and prop placement).
export function normalAt(x, z, eps = 0.6) {
  const hx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const hz = heightAt(x, z + eps) - heightAt(x, z - eps);
  return new THREE.Vector3(-hx, 2 * eps, -hz).normalize();
}

const GRASS_A = new THREE.Color(0x71b054);
const GRASS_B = new THREE.Color(0x4c8a41);
const ROCK = new THREE.Color(0x8a8272);
const SAND = new THREE.Color(0xc9bb8b);

export function buildTerrain() {
  const segs = 256;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ny = geo.attributes.normal.getY(i);
    const wet = 0.5 + 0.5 * moisture(x * 0.012, z * 0.012);
    c.copy(GRASS_A).lerp(GRASS_B, wet);
    if (y < WATER_Y + 0.9) c.lerp(SAND, smoothstep(WATER_Y + 0.9, WATER_Y + 0.1, y));
    if (ny < 0.90) c.lerp(ROCK, smoothstep(0.90, 0.78, ny));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

export function buildWater() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3f7fae, transparent: true, opacity: 0.78,
    roughness: 0.15, metalness: 0,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_Y;
  mesh.name = 'water';
  return mesh;
}

// Poisson-ish jittered-grid scatter, filtered by slope / water / spawn area.
function scatter(step, seedOffset, filter) {
  const out = [];
  const half = WORLD_SIZE / 2 - 8;
  for (let gx = -half; gx < half; gx += step) {
    for (let gz = -half; gz < half; gz += step) {
      const jx = gx + step * 0.8 * noise(gx * 0.13 + seedOffset, gz * 0.17);
      const jz = gz + step * 0.8 * noise(gz * 0.11 - seedOffset, gx * 0.19);
      const y = heightAt(jx, jz);
      const ny = normalAt(jx, jz).y;
      if (y < WATER_Y + 1.2) continue;
      if (Math.hypot(jx, jz) < 14) continue;
      const r = 0.5 + 0.5 * noise(jx * 0.05 + seedOffset * 2, jz * 0.05);
      if (!filter(jx, jz, y, ny, r)) continue;
      out.push({ x: jx, y, z: jz, r });
    }
  }
  return out;
}

export function buildTrees() {
  const spots = scatter(13, 7, (x, z, y, ny, r) => {
    if (ny < 0.9) return false;
    const density = noise(x * 0.008 + 51, z * 0.008 - 33); // forest patches
    return density > 0.05 && r > 0.35;
  });

  const group = new THREE.Group();
  group.name = 'trees';
  const n = spots.length;

  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.22, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c33, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);

  const crownGeo = new THREE.ConeGeometry(1, 2.4, 7);
  crownGeo.translate(0, 1.2, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, n);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    const h = 1.6 + s.r * 1.6;                 // trunk height
    const spin = s.r * Math.PI * 4;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin);

    m.compose(new THREE.Vector3(s.x, s.y - 0.15, s.z), q, new THREE.Vector3(1, h, 1));
    trunks.setMatrixAt(i, m);

    const cw = 0.9 + s.r * 0.9;
    m.compose(new THREE.Vector3(s.x, s.y - 0.15 + h * 0.82, s.z), q, new THREE.Vector3(cw, 0.9 + s.r * 1.1, cw));
    crowns.setMatrixAt(i, m);
    col.setHSL(0.29 + 0.07 * s.r, 0.45, 0.3 + 0.14 * s.r);
    crowns.setColorAt(i, col);
  });
  trunks.castShadow = crowns.castShadow = true;
  trunks.receiveShadow = crowns.receiveShadow = true;
  group.add(trunks, crowns);
  return group;
}

export function buildRocks() {
  const spots = scatter(27, 23, (x, z, y, ny, r) => r > 0.62);
  const n = spots.length;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8d8880, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((s, i) => {
    q.setFromEuler(new THREE.Euler(s.r * 2, s.r * 9, s.r * 5));
    const sc = 0.35 + s.r * 1.5;
    m.compose(
      new THREE.Vector3(s.x, s.y + sc * 0.15, s.z), q,
      new THREE.Vector3(sc, sc * (0.55 + s.r * 0.5), sc),
    );
    rocks.setMatrixAt(i, m);
  });
  rocks.castShadow = rocks.receiveShadow = true;
  rocks.name = 'rocks';
  return rocks;
}
