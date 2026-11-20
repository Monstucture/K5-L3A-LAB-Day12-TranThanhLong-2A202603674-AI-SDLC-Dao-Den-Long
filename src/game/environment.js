/**
 * Scenery (presentation only). Props are placed with a seeded PRNG and kept
 * clear of gameplay colliders (lanterns, jump pads, towers, bridges, ramps,
 * platforms), so they never change what the Simulation Core decides.
 */
import * as THREE from '/node_modules/three/build/three.module.js';
import { createRng } from '../core/random.js';

const mat = (color, roughness = 0.95, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

const dummy = new THREE.Object3D();
/** One draw call for many identical props. items: [{ x, y, z, ry, s, c }]; c indexes `colors`. */
function instanced(group, geometry, material, items, colors) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    if (it.sx) dummy.scale.set(it.sx, it.sy, it.sz);
    else dummy.scale.setScalar(it.s ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colors) mesh.setColorAt(i, colors[it.c]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // props are small and scattered; skip bounds math
  group.add(mesh);
}

function isFreeSpot(map, x, z, margin) {
  const island = map.islands.find((is) => Math.hypot(x - is.center[0], z - is.center[1]) < is.radius - margin);
  if (!island) return false;
  for (const p of Object.values(map.lanterns)) if (Math.hypot(x - p[0], z - p[2]) < 3.5) return false;
  for (const pad of map.jumpPads) if (Math.hypot(x - pad.pos[0], z - pad.pos[2]) < 3) return false;
  for (const tower of map.towers) if (Math.hypot(x - tower.pos[0], z - tower.pos[2]) < tower.radius + 2) return false;
  for (const b of map.bridges) if (x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2) return false;
  for (const ramp of map.ramps) {
    const d = Math.hypot(x, z);
    const diff = Math.abs(((Math.atan2(z, x) * 180) / Math.PI - ramp.angleDeg + 540) % 360 - 180);
    if (d > ramp.innerRadius - 2 && d < ramp.outerRadius + 2 && diff < 12) return false;
  }
  for (const pl of map.platforms) {
    const d = Math.hypot(x - pl.center[0], z - pl.center[1]);
    if (pl.kind === 'disk' ? d < pl.radius + 1 : d > pl.innerRadius - 1 && d < pl.outerRadius + 1 && z > pl.minZ) return false;
  }
  return true;
}

function randomSpot(map, rng, margin = 1.5) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const island = map.islands[rng.nextInt(map.islands.length)];
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * (island.radius - margin - 1);
    const x = island.center[0] + Math.cos(a) * r;
    const z = island.center[1] + Math.sin(a) * r;
    if (isFreeSpot(map, x, z, margin)) return [x, z];
  }
  return null;
}

function addPalm(group, x, z, scale, rng) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 4.2, 7), mat(0x8a6a4a));
  trunk.position.y = 2.1;
  trunk.rotation.z = (rng.next() - 0.5) * 0.18;
  trunk.castShadow = true;
  palm.add(trunk);
  const frondMat = mat(0x3f7a56, 0.8, { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.1, 4), frondMat);
    frond.rotation.set(Math.PI / 2 + 0.5, (i / 7) * Math.PI * 2, 0);
    frond.position.set(Math.cos((i / 7) * Math.PI * 2) * 0.9, 4.3, Math.sin((i / 7) * Math.PI * 2) * 0.9);
    frond.castShadow = true;
    palm.add(frond);
  }
  palm.position.set(x, 0, z);
  palm.scale.setScalar(scale);
  group.add(palm);
}

function addBamboo(group, x, z, rng) {
  const cluster = new THREE.Group();
  const stalkMat = mat(0x5f8f4e, 0.7);
  const count = 4 + rng.nextInt(3);
  for (let i = 0; i < count; i++) {
    const h = 4 + rng.next() * 3;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), stalkMat);
    stalk.position.set((rng.next() - 0.5) * 0.9, h / 2, (rng.next() - 0.5) * 0.9);
    stalk.castShadow = true;
    cluster.add(stalk);
  }
  cluster.position.set(x, 0, z);
  group.add(cluster);
}

/**
 * Adds scenery for one map into `group`. Returns { update(dt) } for animated
 * props (drifting cloud sea). Call update every frame.
 */
export function decorateMap(group, map, night) {
  const rng = createRng(night * 7919 + 101);
  const place = (count, margin, build) => {
    for (let i = 0; i < count; i++) {
      const spot = randomSpot(map, rng, margin);
      if (spot) build(spot[0], spot[1]);
    }
  };

  // Grass tufts and wildflowers on every island (all nights).
  const grassMat = mat(0x3e7a5a, 1);
  const flowerColors = [0xffd1e0, 0xfff1a8, 0xffffff, 0xc7b8ff];
  const tufts = [];
  place(map.islands.length * 60, 1.2, (x, z) => tufts.push({ x, y: 0.22, z, ry: rng.next() * Math.PI, s: 0.8 + rng.next() * 0.8 }));
  instanced(group, new THREE.ConeGeometry(0.14, 0.5, 4), grassMat, tufts);
  const flowers = [];
  place(map.islands.length * 40, 1.0, (x, z) => flowers.push({ x, y: 0.12, z, c: rng.nextInt(flowerColors.length) }));
  instanced(group, new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), flowers, flowerColors.map((c) => new THREE.Color(c)));

  // Terrain relief: low mounds half-sunk into the island top break up the flat ground.
  const moundMats = [mat(0x3b6e58, 1), mat(0x4f7d5e, 1)];
  place(map.islands.length * 6, 3, (x, z) => {
    const s = 1.4 + rng.next() * 1.8;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), moundMats[rng.nextInt(2)]);
    mound.scale.set(s * 1.4, s * 0.45, s * 1.2);
    mound.position.set(x, 0, z);
    mound.rotation.y = rng.next() * Math.PI;
    mound.receiveShadow = true;
    group.add(mound);
  });
  // Bushes, mushrooms and fallen logs give the ground texture and shadow.
  const bushMat = mat(0x2f6b4d, 0.9);
  place(map.islands.length * 10, 2, (x, z) => {
    const bush = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.4 + rng.next() * 0.25, 8, 6), bushMat);
      leaf.position.set((rng.next() - 0.5) * 0.6, 0.3, (rng.next() - 0.5) * 0.6);
      leaf.castShadow = true;
      bush.add(leaf);
    }
    bush.position.set(x, 0, z);
    group.add(bush);
  });
  const stems = [];
  const caps = [];
  place(map.islands.length * 24, 1.5, (x, z) => {
    const c = rng.nextInt(2);
    stems.push({ x, y: 0.12, z });
    caps.push({ x, y: 0.25, z, c });
  });
  instanced(group, new THREE.CylinderGeometry(0.05, 0.07, 0.25, 6), mat(0xeee2c8, 0.8), stems);
  instanced(group, new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff, 0.7), caps, [new THREE.Color(0xc8584a), new THREE.Color(0xe9d6a8)]);
  const logMat = mat(0x6b4a2f, 1);
  place(map.islands.length * 3, 3, (x, z) => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.4 + rng.next() * 1.4, 8), logMat);
    log.rotation.set(0, rng.next() * Math.PI, Math.PI / 2);
    log.position.set(x, 0.24, z);
    log.castShadow = true;
    group.add(log);
  });

  // More foliage: ferns, tall reeds and small round trees (all instanced).
  const fernMat = mat(0x2e8a5a, 0.9, { side: THREE.DoubleSide });
  const ferns = [];
  place(map.islands.length * 22, 1.5, (x, z) => {
    const s = 0.7 + rng.next() * 0.9;
    for (let k = 0; k < 4; k++) ferns.push({ x, y: 0.3 * s, z, rx: -0.9, ry: (k / 4) * Math.PI * 2 + rng.next() * 0.4, s });
  });
  instanced(group, new THREE.PlaneGeometry(0.28, 1.1), fernMat, ferns);
  const reeds = [];
  place(map.islands.length * 28, 1.2, (x, z) => reeds.push({ x, y: 0.6, z, ry: rng.next() * Math.PI, sx: 0.8, sy: 1 + rng.next() * 1.4, sz: 0.8, rz: (rng.next() - 0.5) * 0.3 }));
  instanced(group, new THREE.ConeGeometry(0.07, 1.2, 4), mat(0x6fa05a, 0.8), reeds);
  const treeTrunks = [];
  const treeCrowns = [];
  const crownColors = [new THREE.Color(0x2f7a4f), new THREE.Color(0x3d8a58), new THREE.Color(0x5a8f4a)];
  place(map.islands.length * 5, 2.5, (x, z) => {
    const s = 0.9 + rng.next() * 0.9;
    treeTrunks.push({ x, y: 1.1 * s, z, s });
    treeCrowns.push({ x, y: 2.9 * s, z, sx: 1.7 * s, sy: 1.3 * s, sz: 1.7 * s, c: rng.nextInt(crownColors.length) });
  });
  instanced(group, new THREE.CylinderGeometry(0.14, 0.22, 2.2, 7), mat(0x6b4a2f, 1), treeTrunks);
  instanced(group, new THREE.IcosahedronGeometry(1, 1), mat(0xffffff, 0.85), treeCrowns, crownColors);

  // Winding dirt paths between lanterns on the same island (flat stepping patches along a wobbly curve).
  const pathPatches = [];
  const lanternList = Object.values(map.lanterns);
  const sameIsland = (a, b) => map.islands.some((is) => Math.hypot(a[0] - is.center[0], a[2] - is.center[1]) < is.radius &&
    Math.hypot(b[0] - is.center[0], b[2] - is.center[1]) < is.radius);
  for (let i = 0; i < lanternList.length; i++) {
    for (let j = i + 1; j < lanternList.length; j++) {
      const a = lanternList[i]; const b = lanternList[j];
      if (!sameIsland(a, b) || Math.hypot(a[0] - b[0], a[2] - b[2]) > 22) continue;
      const mid = [(a[0] + b[0]) / 2 + (rng.next() - 0.5) * 6, 0, (a[2] + b[2]) / 2 + (rng.next() - 0.5) * 6];
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a[0], 0, a[2]), new THREE.Vector3(...mid), new THREE.Vector3(b[0], 0, b[2]));
      for (const pt of curve.getPoints(Math.ceil(Math.hypot(a[0] - b[0], a[2] - b[2]) * 1.2))) {
        if (map.islands.some((is) => Math.hypot(pt.x - is.center[0], pt.z - is.center[1]) < is.radius - 1)) {
          pathPatches.push({ x: pt.x + (rng.next() - 0.5) * 0.5, y: 0.04, z: pt.z + (rng.next() - 0.5) * 0.5, s: 0.9 + rng.next() * 0.6 });
        }
      }
    }
  }
  const patchGeo = new THREE.CircleGeometry(0.75, 9);
  patchGeo.rotateX(-Math.PI / 2);
  instanced(group, patchGeo, mat(0x9a7b55, 1), pathPatches);

  // Sinkholes: dark pits with a rocky rim (purely visual; the Core decides where Mây can fall).
  const pitGeo = new THREE.CircleGeometry(1, 20);
  pitGeo.rotateX(-Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(1, 0.16, 6, 20);
  rimGeo.rotateX(Math.PI / 2);
  const pits = [];
  const rims = [];
  place(map.islands.length * 2, 3.5, (x, z) => {
    const s = 1.1 + rng.next() * 1.0;
    pits.push({ x, y: 0.05, z, s });
    rims.push({ x, y: 0.1, z, s });
  });
  instanced(group, pitGeo, new THREE.MeshBasicMaterial({ color: 0x03040a }), pits);
  instanced(group, rimGeo, mat(0x6a6070, 1), rims);

  // Cliffs: jagged rock stacks hugging each island rim, with a rock skirt hanging below the edge.
  const cliffs = [];
  const cliffTones = [new THREE.Color(0x6c6a7c), new THREE.Color(0x585a70), new THREE.Color(0x7a7486)];
  for (const is of map.islands) {
    const n = Math.round(is.radius * 1.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.next() * 0.2;
      const x = is.center[0] + Math.cos(a) * (is.radius - 0.2);
      const z = is.center[1] + Math.sin(a) * (is.radius - 0.2);
      if (!isFreeSpot(map, x, z, 0)) continue;
      if (rng.next() < 0.35) continue; // leave gaps so the rim is not a wall
      const h = 0.8 + rng.next() * 2.2;
      cliffs.push({ x, y: h * 0.35, z, rx: rng.next(), ry: rng.next() * 6, rz: rng.next(), sx: 0.7 + rng.next() * 0.6, sy: h * 0.6, sz: 0.7 + rng.next() * 0.6, c: rng.nextInt(3) });
    }
  }
  instanced(group, new THREE.DodecahedronGeometry(1, 0), mat(0xffffff, 0.95), cliffs, cliffTones);

  if (night === 2) {
    // Stone ruins on each island, and paper-lantern strings between tree-tops.
    const ruinMat = mat(0x8c8270, 0.95);
    place(map.islands.length * 2, 3, (x, z) => {
      const height = 1.2 + rng.next() * 1.8;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, height, 0.7), ruinMat);
      pillar.position.set(x, height / 2, z);
      pillar.castShadow = true;
      group.add(pillar);
    });
    const stringMat = new THREE.LineBasicMaterial({ color: 0x3a2a1a });
    const paperMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    for (let i = 0; i < map.islands.length * 3; i++) {
      const a = randomSpot(map, rng, 4);
      const b = randomSpot(map, rng, 4);
      if (!a || !b) continue;
      const y = 4.6;
      const mid = [(a[0] + b[0]) / 2, y - 0.6, (a[1] + b[1]) / 2];
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(...mid), new THREE.Vector3(b[0], y, b[1])
      );
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(16)), stringMat));
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const p = curve.getPoint(t);
        const paper = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), paperMat);
        paper.scale.set(1, 1.25, 1);
        paper.position.set(p.x, p.y - 0.3, p.z);
        group.add(paper);
      }
    }
    place(6, 2.5, (x, z) => addBamboo(group, x, z, rng));
  }
  if (night === 3) {
    const stoneMat = mat(0x788398, 0.95);
    place(10, 2, (x, z) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rng.next() * 0.4, 0), stoneMat);
      rock.position.set(x, 0.3, z);
      rock.rotation.set(rng.next(), rng.next(), rng.next());
      rock.castShadow = true;
      group.add(rock);
    });
    place(4, 2.5, (x, z) => addBamboo(group, x, z, rng));
  }

  // Drifting sea of clouds around the map (animated).
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0x2b3f78, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
  const maxR = Math.max(...map.islands.map((is) => Math.hypot(is.center[0], is.center[1]) + is.radius));
  for (let i = 0; i < 30; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = maxR + 6 + rng.next() * 34;
    const puffs = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3 + rng.next() * 2.5, 12, 8), cloudMat);
      puff.position.set((rng.next() - 0.5) * 6, (rng.next() - 0.5) * 0.8, (rng.next() - 0.5) * 4);
      puff.scale.set(1.6, 0.5, 1.1);
      puffs.add(puff);
    }
    puffs.position.set(Math.cos(a) * r, -2 - rng.next() * 3, Math.sin(a) * r);
    cloudGroup.add(puffs);
  }
  group.add(cloudGroup);

  // Small floating islets drifting in the sea of clouds (far, fogged, slow rotation).
  const islets = new THREE.Group();
  const isletTop = mat(0x3f6f57, 1);
  const isletRock = mat(0x5b5a6b, 1);
  for (let i = 0; i < 8; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = maxR + 28 + rng.next() * 40;
    const s = 2 + rng.next() * 3;
    const islet = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), isletTop);
    top.scale.set(s * 1.6, s * 0.35, s * 1.6);
    const underside = new THREE.Mesh(new THREE.ConeGeometry(s * 1.1, s * 2.2, 7), isletRock);
    underside.rotation.x = Math.PI;
    underside.position.y = -s * 1.1;
    islet.add(top, underside);
    islet.position.set(Math.cos(a) * r, 6 + rng.next() * 10, Math.sin(a) * r);
    islets.add(islet);
  }
  group.add(islets);

  return {
    update(dt) {
      cloudGroup.rotation.y += dt * 0.012;
      islets.rotation.y += dt * 0.006;
    },
  };
}
