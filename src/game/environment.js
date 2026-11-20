/**
 * Scenery (presentation only). Props are placed with a seeded PRNG and kept
 * clear of gameplay colliders (lanterns, jump pads, towers, bridges, ramps,
 * platforms), so they never change what the Simulation Core decides.
 */
import * as THREE from '/node_modules/three/build/three.module.js';
import { createRng } from '../core/random.js';

const mat = (color, roughness = 0.95, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

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
  const flowerMats = flowerColors.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  place(map.islands.length * 36, 1.2, (x, z) => {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), grassMat);
    tuft.position.set(x, 0.22, z);
    tuft.rotation.y = rng.next() * Math.PI;
    group.add(tuft);
  });
  place(map.islands.length * 22, 1.0, (x, z) => {
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), flowerMats[rng.nextInt(flowerMats.length)]);
    flower.position.set(x, 0.12, z);
    group.add(flower);
  });

  if (night === 2) {
    place(map.islands.length * 5, 2.5, (x, z) => addPalm(group, x, z, 0.9 + rng.next() * 0.4, rng));
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

  return {
    update(dt) {
      cloudGroup.rotation.y += dt * 0.012;
    },
  };
}
