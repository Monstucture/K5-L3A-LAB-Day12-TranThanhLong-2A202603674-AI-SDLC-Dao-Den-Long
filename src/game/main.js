/**
 * Presentation layer (GUI) — Three.js. Reads state from the SAME Simulation
 * Core the headless CLI uses; this file only renders, it never modifies the
 * simulation. Cosmetic VFX here is never instantiated in headless mode.
 */
import * as THREE from '/node_modules/three/build/three.module.js';
import { Simulation } from '../core/simulation.js';
import { TUNING, ISLAND_RADIUS, NIGHT_MAPS } from '../core/tuning.js';
import { setFowLights } from './fog.js';
import { createParticles, createFireflies } from './vfx.js';
import { decorateMap } from './environment.js';
import { createAudio } from './audio.js';
import { createFx, makePlayerTextures, makeShadeTexture } from './fx.js';

// ------------------------------------------------------------------ DOM
const $ = (s) => document.querySelector(s);
const startBtn = $('#start-btn');
const replayBtn = $('#replay-btn');
const intro = $('#intro');
const result = $('#result');
const pauseOverlay = $('#pause');
const settingsOverlay = $('#settings');
const toastEl = $('#toast');
const hintEl = $('#hint');
const flameRow = $('#flames');
const carriedVal = $('#carried-val');
const lanternVal = $('#lantern-val');
const scoreVal = $('#score-val');
const timeVal = $('#time-val');
const moteBar = $('#mote-bar');
const dashCooldownEl = $('#dash-cd');
const pulseCooldownEl = $('#pulse-cd');
const nightLabel = $('#night-label');
const offscreenArrow = $('#offscreen-arrow');
const windIndicator = $('#wind-indicator');
const lanternFuel = (lantern) => lantern.fuelTicks / 60;

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1430);
scene.fog = new THREE.Fog(0x1b2350, 30, 80);
const nightOneMap = new THREE.Group();
scene.add(nightOneMap);
let generatedMap = null;
let mapDecor = null;
const particles = createParticles(scene);
let fireflies = null;

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);

const post = createFx(renderer, scene, camera);

// ------------------------------------------------------------------ lights
scene.add(new THREE.AmbientLight(0x66739a, 1.5));
const hemi = new THREE.HemisphereLight(0x7584b2, 0x22283a, 1.15);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xa6b8eb, 0.8);
moon.position.set(40, 70, 30);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -38;
moon.shadow.camera.right = 38;
moon.shadow.camera.top = 38;
moon.shadow.camera.bottom = -38;
moon.shadow.camera.far = 140;
moon.shadow.bias = -0.0001;
moon.shadow.normalBias = 0.025;
scene.add(moon);

// ------------------------------------------------------------------ night sky & stars
(function stars() {
  const g = new THREE.BufferGeometry();
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 400;
    pos[i * 3 + 1] = 40 + Math.random() * 120;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xdfe7ff, size: 0.6, transparent: true, opacity: 0.9, fog: false });
  scene.add(new THREE.Points(g, m));
})();

// ------------------------------------------------------------------ island
const islandTop = new THREE.Mesh(
  new THREE.CircleGeometry(ISLAND_RADIUS, 56),
  new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.95 })
);
islandTop.rotation.x = -Math.PI / 2;
islandTop.receiveShadow = true;
nightOneMap.add(islandTop);

const rim = new THREE.Mesh(
  new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 2, 6, 56, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x26324a, roughness: 1, side: THREE.DoubleSide })
);
rim.position.y = -3;
nightOneMap.add(rim);

// Sea of clouds below / around the island.
const sea = new THREE.Mesh(
  new THREE.RingGeometry(ISLAND_RADIUS + 2, ISLAND_RADIUS + 30, 64),
  new THREE.MeshStandardMaterial({ color: 0x8a94c8, transparent: true, opacity: 0.35, roughness: 1 })
);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -1.2;
nightOneMap.add(sea);

// Low, non-colliding scenery gives the island a softer silhouette.
const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x53617a, roughness: 1 });
for (const [x, z, sx, sy, sz] of [
  [-8, 5, 3.6, 0.85, 2.8],
  [8, 1, 3.2, 0.7, 2.4],
  [-2, -12, 4.2, 0.65, 2.6],
  [12, -9, 2.8, 0.55, 2.1],
]) {
  const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), hillMaterial);
  hill.position.set(x, sy * 0.45, z);
  hill.scale.set(sx, sy, sz);
  hill.receiveShadow = true;
  hill.castShadow = true;
  nightOneMap.add(hill);
}

const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x795b43, roughness: 1 });
const leafMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x4c7465, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0x64856a, roughness: 1 }),
];
function addTree(x, z, scale, variant) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.35, 8), trunkMaterial);
  trunk.position.y = 0.68;
  trunk.castShadow = true;
  tree.add(trunk);
  for (let layer = 0; layer < 3; layer++) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.85 - layer * 0.15, 1.35 - layer * 0.12, 9),
      leafMaterials[(variant + layer) % leafMaterials.length]
    );
    crown.position.y = 1.45 + layer * 0.62;
    crown.castShadow = true;
    tree.add(crown);
  }
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  nightOneMap.add(tree);
}
for (const [x, z, scale, variant] of [
  [-13, 2, 0.82, 0], [-10, 12, 0.72, 1], [-7, -8, 0.9, 0],
  [8, 11, 0.78, 1], [13, -3, 0.84, 0], [6, -13, 0.72, 1],
  [-14, -8, 0.72, 1], [2, 15, 0.68, 0], [16, 11, 0.65, 1],
]) addTree(x, z, scale, variant);

const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x788398, roughness: 0.95 });
for (const [x, z, scale, rotation] of [
  [-16, 1, 0.8, 0.4], [-5, 14, 0.7, 1.1], [4, 8, 0.6, 0.7],
  [15, 2, 0.9, 0.2], [10, -14, 0.75, 0.9], [-10, -14, 0.8, 0.5],
  [-17, -10, 0.65, 1.4], [15, 15, 0.55, 0.3], [1, -7, 0.6, 1.2],
]) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), rockMaterial);
  rock.position.set(x, 0.45 * scale, z);
  rock.scale.set(scale * 1.2, scale * 0.75, scale);
  rock.rotation.set(rotation * 0.4, rotation, rotation * 0.25);
  rock.castShadow = true;
  rock.receiveShadow = true;
  nightOneMap.add(rock);
}

function rebuildMapVisuals(map, night) {
  nightOneMap.visible = night === 1;
  mapDecor = night === 1 ? nightOneDecor : null;
  if (generatedMap) {
    scene.remove(generatedMap);
    generatedMap.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
        else node.material.dispose();
      }
    });
  }
  generatedMap = new THREE.Group();
  scene.add(generatedMap);
  if (night === 1) return;

  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.96 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x12384a, roughness: 1 });
  for (const island of map.islands) {
    const top = new THREE.Mesh(new THREE.CircleGeometry(island.radius, 64), groundMaterial);
    top.rotation.x = -Math.PI / 2;
    top.position.set(island.center[0], island.height, island.center[1]);
    top.receiveShadow = true;
    generatedMap.add(top);
    const side = new THREE.Mesh(
      new THREE.CylinderGeometry(island.radius, island.radius + 1.5, 5, 48, 1, true),
      rimMaterial
    );
    side.position.set(island.center[0], island.height - 2.5, island.center[1]);
    generatedMap.add(side);
    const cloud = new THREE.Mesh(
      new THREE.RingGeometry(island.radius + 1.5, island.radius + 22, 64),
      new THREE.MeshStandardMaterial({ color: 0x12384a, transparent: true, opacity: 0.55 })
    );
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.set(island.center[0], island.height - 1.1, island.center[1]);
    generatedMap.add(cloud);
  }
  for (const bridge of map.bridges) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(bridge.maxX - bridge.minX, 0.3, bridge.maxZ - bridge.minZ),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
    );
    plank.position.set((bridge.minX + bridge.maxX) / 2, bridge.height, (bridge.minZ + bridge.maxZ) / 2);
    plank.receiveShadow = true;
    plank.castShadow = true;
    generatedMap.add(plank);
  }
  for (const platform of map.platforms) {
    const geometry = platform.kind === 'disk'
      ? new THREE.CircleGeometry(platform.radius, 48)
      : new THREE.RingGeometry(platform.innerRadius, platform.outerRadius, 64, 1, 0, Math.PI);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(platform.center[0], platform.y, platform.center[1]);
    generatedMap.add(mesh);
  }
  for (const ramp of map.ramps) {
    const length = ramp.outerRadius - ramp.innerRadius;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(ramp.width, 0.25, length),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
    );
    const radians = (ramp.angleDeg * Math.PI) / 180;
    const radius = (ramp.innerRadius + ramp.outerRadius) / 2;
    mesh.position.set(Math.cos(radians) * radius, (ramp.highY + ramp.lowY) / 2, Math.sin(radians) * radius);
    mesh.rotation.y = Math.PI / 2 - radians;
    generatedMap.add(mesh);
  }
  for (const tower of map.towers) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(tower.radius, tower.radius * 1.15, tower.height, 20),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.86 })
    );
    mesh.position.set(tower.pos[0], tower.pos[1] + tower.height / 2, tower.pos[2]);
    mesh.castShadow = true;
    generatedMap.add(mesh);
  }
  for (const pad of map.jumpPads) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(pad.radius, pad.radius, 0.25, 16),
      new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0x7a3c20, emissiveIntensity: 0.5 })
    );
    mesh.position.set(pad.pos[0], pad.pos[1] + 0.15, pad.pos[2]);
    generatedMap.add(mesh);
  }
  mapDecor = decorateMap(generatedMap, map, night);
}

// Sinkholes come from the Simulation Core (arcade rules); rebuilt for every new game.
const holeGroup = new THREE.Group();
scene.add(holeGroup);
const holeDepth = new THREE.MeshBasicMaterial({ color: 0x02030a });
const holeGlow = new THREE.MeshBasicMaterial({ color: 0x6a4bff, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
const holeRim = new THREE.MeshStandardMaterial({ color: 0x6a6070, roughness: 1 });
function rebuildHoles(holes) {
  for (const child of [...holeGroup.children]) holeGroup.remove(child);
  for (const h of holes) {
    const pit = new THREE.Mesh(new THREE.CircleGeometry(h.radius, 24), holeDepth);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(h.pos[0], 0.06, h.pos[2]);
    const glow = new THREE.Mesh(new THREE.RingGeometry(h.radius * 0.55, h.radius * 0.95, 24), holeGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(h.pos[0], 0.07, h.pos[2]);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(h.radius + 0.1, 0.2, 6, 24), holeRim);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(h.pos[0], 0.12, h.pos[2]);
    holeGroup.add(pit, glow, rim);
  }
}

// Night 1 scenery is static: build it once here.
const nightOneDecor = decorateMap(nightOneMap, NIGHT_MAPS[1], 1);

// Ambient fireflies drift over the islands of the current map (rebuilt per night).
function rebuildFireflies(map) {
  if (fireflies) scene.remove(fireflies.points);
  const island = map.islands[0];
  fireflies = createFireflies(scene, 90, (i) => {
    const a = i * 2.39996;
    const isle = map.islands[i % map.islands.length];
    const r = Math.sqrt((i + 0.5) / 90) * (island.radius - 2);
    return [isle.center[0] + Math.cos(a) * Math.min(r, isle.radius - 2), 1 + (i % 5) * 0.5, isle.center[1] + Math.sin(a) * Math.min(r, isle.radius - 2)];
  });
}

// ------------------------------------------------------------------ Mây (player)
const playerGroup = new THREE.Group();
{
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.7, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xf2ccb0, roughness: 0.7 })
  );
  body.position.y = 0.9;
  const robe = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.9, 16),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9 })
  );
  robe.position.y = 0.45;
  // conical hat (nón lá)
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 0.42, 20),
    new THREE.MeshStandardMaterial({ color: 0xd8b06a, roughness: 0.8, side: THREE.DoubleSide })
  );
  hat.position.y = 1.72;
  hat.rotation.x = 0;
  const hatTop = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 16), new THREE.MeshBasicMaterial({ color: 0x8a6a3a }));
  hatTop.position.y = 1.95;
  // small hanging lantern on the hat brim
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcf6b })
  );
  lamp.position.set(0.42, 1.42, 0);
  const lampString = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6),
    new THREE.MeshBasicMaterial({ color: 0x8a6a3a })
  );
  lampString.position.set(0.42, 1.52, 0);
  // red scarf (#C8102E) around the neck
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.08, 8, 16), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.8 }));
  scarf.position.y = 1.35;
  scarf.rotation.x = Math.PI / 2;
  playerGroup.add(body, robe, hat, hatTop, lamp, lampString, scarf);
}
scene.add(playerGroup);
// HD-2D: Mây is a pixel-art billboard standing in the 3D diorama (the 3D model stays hidden as a fallback).
for (const child of playerGroup.children) child.visible = false;
const playerFrames = makePlayerTextures();
const playerSprite = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 2.4),
  new THREE.MeshBasicMaterial({ map: playerFrames[0], transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })
);
scene.add(playerSprite);
const playerShadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
playerShadow.rotation.x = -Math.PI / 2;
scene.add(playerShadow);
let spriteFlip = 1;
const camRight = new THREE.Vector3();

const playerLight = new THREE.PointLight(0xffcf6b, 4.5, 22, 1.6);
scene.add(playerLight);

// ------------------------------------------------------------------ lanterns
const lanternData = [];
function rebuildLanterns(lanterns) {
  for (const old of lanternData) {
    scene.remove(old.group);
    old.group.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
        else node.material.dispose();
      }
    });
    for (const node of old.celebrateNodes) {
      scene.remove(node);
      node.geometry.dispose();
      node.material.dispose();
    }
  }
  lanternData.length = 0;
  for (const { id, pos } of lanterns) {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 4.4, 10), new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }));
    pole.position.y = 2.2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x6b4a2f }));
    base.position.y = 0.15;
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0x5b5f6e, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.5 }));
    lantern.position.y = 3.6;
    const coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0 }));
    coreGlow.position.y = 3.6;
    const light = new THREE.PointLight(0xffb347, 0, 30, 2);
    light.position.y = 3.6;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(TUNING.safe_radius - 0.15, TUNING.safe_radius, 64),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    const tearMark = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.07, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x241c3a })
    );
    tearMark.position.set(0.2, 3.55, 0.67);
    const fuelBar = new THREE.Group();
    fuelBar.position.set(0, 4.65, 0);
    const fuelBack = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.14, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x101226 })
    );
    const fuelFill = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.08, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffcf6b })
    );
    fuelFill.position.z = 0.05;
    fuelBar.add(fuelBack, fuelFill);
    group.add(pole, base, lantern, coreGlow, light, ring, tearMark, fuelBar);
    scene.add(group);
    lanternData.push({ id, group, lanternMesh: lantern, coreGlow, light, ring, tearMark, fuelBar, fuelFill, celebrateNodes: [] });
  }
}

// The light shrine is a real interaction point; the Simulation moves it after each deposit.
const depositShrineGroup = new THREE.Group();
const shrineBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.95, 1.2, 0.35, 8),
  new THREE.MeshStandardMaterial({ color: 0x554634, roughness: 0.8 })
);
shrineBase.position.y = 0.18;
shrineBase.castShadow = true;
const shrineCrystal = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.72, 0),
  new THREE.MeshStandardMaterial({ color: 0x9fe5d6, emissive: 0x2a8c83, emissiveIntensity: 0.8, roughness: 0.28 })
);
shrineCrystal.position.y = 1.15;
const shrineRing = new THREE.Mesh(
  new THREE.RingGeometry(1.35, 1.55, 40),
  new THREE.MeshBasicMaterial({ color: 0xa2f4dc, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
);
shrineRing.rotation.x = -Math.PI / 2;
shrineRing.position.y = 0.06;
const shrineLight = new THREE.PointLight(0x86eed5, 1.8, 13, 2);
shrineLight.position.y = 1.5;
depositShrineGroup.add(shrineBase, shrineCrystal, shrineRing, shrineLight);
scene.add(depositShrineGroup);

// ------------------------------------------------------------------ motes pool
const MOTES = [];
const moteMat = new THREE.MeshBasicMaterial({ color: 0xfff6c2, transparent: true, opacity: 0.95 });
function syncMotes(active) {
  for (let i = 0; i < active.length; i++) {
    const m = active[i];
    let mesh = MOTES[i];
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), moteMat.clone());
      scene.add(mesh);
      MOTES[i] = mesh;
    }
    mesh.visible = true;
    mesh.material.color.set(m.kind === 'dropped' ? 0xffb347 : 0xfff6c2);
    mesh.position.set(m.pos[0], m.pos[1] + 0.5 + Math.sin(Date.now() / 300 + i) * 0.2, m.pos[2]);
  }
  for (let i = active.length; i < MOTES.length; i++) MOTES[i].visible = false;
}

const charmPool = [];
function syncCharms(charms) {
  const available = charms.filter((charm) => charm.available);
  while (charmPool.length < available.length) {
    const charm = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshStandardMaterial({ color: 0xc8102e, emissive: 0x7a1020, emissiveIntensity: 0.45 })
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.045, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x8a6b22, emissiveIntensity: 0.25 })
    );
    charm.add(rim);
    scene.add(charm);
    charmPool.push(charm);
  }
  for (let i = 0; i < charmPool.length; i++) {
    const mesh = charmPool[i];
    const charm = available[i];
    mesh.visible = Boolean(charm);
    if (charm) {
      mesh.position.set(charm.pos[0], charm.pos[1] + 0.7, charm.pos[2]);
      mesh.rotation.y += 0.025;
    }
  }
}

// ------------------------------------------------------------------ shades pool
const shadePool = [];
const shadeTextures = {
  normal: makeShadeTexture('#7a3cff', '#120a1a'),
  blind: makeShadeTexture('#00b3ff', '#120a1a'),
  stunned: makeShadeTexture('#7a3cff', '#3a3450'),
  stunnedBlind: makeShadeTexture('#00b3ff', '#3a3450'),
};
const shadeArrivalTimes = new Map();
const shadeFogEffects = [];
const shadeFogGeometry = new THREE.SphereGeometry(1, 10, 8);
function makeShadeMesh() {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 18, 18), new THREE.MeshStandardMaterial({ color: 0x120a1a, roughness: 0.6, emissive: 0x0a0018, emissiveIntensity: 0, transparent: true }));
  body.scale.set(1, 0.8, 1);
  body.position.y = 0.9;
  const outline = new THREE.Mesh(
    new THREE.SphereGeometry(0.76, 18, 18),
    new THREE.MeshBasicMaterial({ color: 0x7a3cff, side: THREE.BackSide, transparent: true, opacity: 0.55 })
  );
  outline.name = 'shade-outline';
  outline.scale.set(1, 0.8, 1);
  outline.position.y = 0.9;
  const drop = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 12), new THREE.MeshBasicMaterial({ color: 0x7a3cff, transparent: true }));
  drop.name = 'shade-drop';
  drop.position.y = 1.9;
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0x7a3cff, transparent: true }));
  eye1.name = 'shade-eye';
  eye1.position.set(0.2, 1.15, 0.55);
  const eye2 = eye1.clone();
  eye2.name = 'shade-eye';
  eye2.position.set(-0.2, 1.15, 0.55);
  grp.add(body, outline, drop, eye1, eye2);
  for (const part of grp.children) part.visible = false; // pixel sprite replaces the 3D blob
  const sprite = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: shadeTextures.normal, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
  sprite.position.y = 1.0;
  sprite.name = 'shade-sprite';
  grp.add(sprite);
  grp.visible = false;
  scene.add(grp);
  return grp;
}
// Cosmetic lunge: a chasing shade crouches (telegraph), leaps toward Mây, then recovers.
// Only the drawn mesh moves; the Core's shade position and hit rules are untouched.
const shadeLunges = new Map();
const LUNGE = { range: 5, wind: 0.35, leap: 0.3, rest: 2.2, reach: 1.4 };
function lungeOffset(s, dt) {
  let st = shadeLunges.get(s.id);
  if (!st) shadeLunges.set(s.id, (st = { phase: 'rest', t: Math.random() * 1.5 }));
  const px = sim.player.pos[0] - s.pos[0];
  const pz = sim.player.pos[2] - s.pos[2];
  const dist = Math.hypot(px, pz);
  st.t += dt;
  if (s.state !== 'chase') { st.phase = 'rest'; st.t = 0; return null; }
  if (st.phase === 'rest' && st.t > LUNGE.rest && dist < LUNGE.range) { st.phase = 'wind'; st.t = 0; }
  else if (st.phase === 'wind' && st.t > LUNGE.wind) { st.phase = 'leap'; st.t = 0; playSound('lunge'); }
  else if (st.phase === 'leap' && st.t > LUNGE.leap) { st.phase = 'rest'; st.t = 0; }
  const dirX = dist > 1e-6 ? px / dist : 0;
  const dirZ = dist > 1e-6 ? pz / dist : 0;
  if (st.phase === 'wind') return { dx: -dirX * 0.4 * (st.t / LUNGE.wind), dz: -dirZ * 0.4 * (st.t / LUNGE.wind), dy: 0, squash: 1 - 0.35 * (st.t / LUNGE.wind) };
  if (st.phase === 'leap') {
    const k = st.t / LUNGE.leap;
    const reach = Math.min(LUNGE.reach, Math.max(0, dist - 0.8));
    return { dx: dirX * reach * Math.sin(k * Math.PI * 0.5 + 0.0), dz: dirZ * reach * Math.sin(k * Math.PI * 0.5), dy: Math.sin(k * Math.PI) * 1.1, squash: 1.25 };
  }
  return null;
}
let lastShadeSync = performance.now();
function syncShades(shades) {
  const nowMs = performance.now();
  const lungeDt = Math.min(0.1, (nowMs - lastShadeSync) / 1000);
  lastShadeSync = nowMs;
  for (let i = 0; i < shades.length; i++) {
    let m = shadePool[i];
    if (!m) m = shadePool[i] = makeShadeMesh();
    const s = shades[i];
    m.visible = true;
    const lg = lungeOffset(s, lungeDt);
    m.position.set(s.pos[0] + (lg?.dx ?? 0), s.pos[1] + (lg?.dy ?? 0), s.pos[2] + (lg?.dz ?? 0));
    m.scale.setScalar(s.state === 'stunned' ? 0.8 : s.state === 'drain' ? 1 + Math.sin(performance.now() * 0.012) * 0.04 : 1);
    if (lg) m.scale.set(1 + (1 - lg.squash) * 0.5, lg.squash, 1 + (1 - lg.squash) * 0.5);
    m.children[0].material.emissiveIntensity = s.state === 'stunned' ? 0.6 : 0;
    m.children[0].material.color.setHex(s.state === 'stunned' ? 0x3a3450 : 0x120a1a);
    const accent = settings.colorblind ? 0x00b3ff : 0x7a3cff;
    for (const child of m.children) {
      if (child.name === 'shade-outline' || child.name === 'shade-drop' || child.name === 'shade-eye') child.material.color.setHex(accent);
    }
    const sprite = m.children.find((c) => c.name === 'shade-sprite');
    sprite.material.map = s.state === 'stunned'
      ? (settings.colorblind ? shadeTextures.stunnedBlind : shadeTextures.stunned)
      : (settings.colorblind ? shadeTextures.blind : shadeTextures.normal);
    sprite.quaternion.copy(camera.quaternion);
    const arrival = shadeArrivalTimes.get(s.id);
    const opacity = arrival === undefined ? 1 : Math.min(1, (performance.now() / 1000 - arrival) / 1.6);
    for (const child of m.children) child.material.opacity = opacity;
    sprite.material.opacity = opacity;
    if (opacity >= 1) shadeArrivalTimes.delete(s.id);
  }
  for (let i = shades.length; i < shadePool.length; i++) shadePool[i].visible = false;
}

function revealShadeInFog(shade) {
  const start = performance.now() / 1000;
  shadeArrivalTimes.set(shade.id, start);
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x151226, transparent: true, opacity: 0.48, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(shadeFogGeometry, material);
    const angle = (i / 6) * Math.PI * 2;
    puff.position.set(Math.cos(angle) * 0.8, 0.45 + (i % 3) * 0.24, Math.sin(angle) * 0.8);
    puff.scale.set(1.05, 0.48, 0.9);
    group.add(puff);
  }
  group.position.set(shade.pos[0], shade.pos[1], shade.pos[2]);
  scene.add(group);
  shadeFogEffects.push({ group, material, start, baseY: shade.pos[1] });
}

const drifterPool = [];
function syncDrifters(drifters) {
  const active = drifters.filter((drifter) => drifter.state !== 'removed');
  while (drifterPool.length < active.length) {
    const mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.42, 0.12, 48, 8),
      new THREE.MeshStandardMaterial({ color: 0x8fa3b8, emissive: 0x3c5269, emissiveIntensity: 0.4, transparent: true, opacity: 0.8 })
    );
    mesh.castShadow = true;
    scene.add(mesh);
    drifterPool.push(mesh);
  }
  for (let i = 0; i < drifterPool.length; i++) {
    const mesh = drifterPool[i];
    const drifter = active[i];
    mesh.visible = Boolean(drifter);
    if (drifter) {
      mesh.position.set(drifter.pos[0], drifter.pos[1] + 1, drifter.pos[2]);
      mesh.rotation.x += 0.03;
      mesh.rotation.y += 0.04;
    }
  }
}

function updateShadeFog(now) {
  for (let i = shadeFogEffects.length - 1; i >= 0; i--) {
    const effect = shadeFogEffects[i];
    const progress = (now - effect.start) / 1.8;
    if (progress >= 1) {
      scene.remove(effect.group);
      effect.material.dispose();
      shadeFogEffects.splice(i, 1);
      continue;
    }
    effect.group.scale.setScalar(1 + progress * 0.9);
    effect.group.position.y = effect.baseY + progress * 0.6;
    effect.material.opacity = 0.48 * (1 - progress);
  }
}

// ------------------------------------------------------------------ simulation
let sim = null;
let cameraYaw = 0; // radians; mirrored into sim as degrees
let gameStarted = false;
let currentNight = 1;
let completedScore = 0;
// High third-person follow camera (reference: Mây seen from above and behind).
const CAMERA = { distance: 11, height: 12, lookAhead: 0.5, minDistance: 8, maxDistance: 20 };
const cameraPos = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
let cameraInitialized = false;
let cameraShake = 0;
// Render-only smoothing: the sim advances in fixed ticks, so we interpolate between ticks.
const renderPos = [0, 0, 0];
const prevPos = [0, 0, 0];
let renderYaw = 0;
let renderYawTarget = 0;
const lightTrail = []; // recent positions that glow and clear the fog
const TRAIL_MAX = 7;
const TRAIL_LIFE = 1.4;
let trailClock = 0;
let idleTime = 0; // seconds since movement keys were last held
let lastCountdownSecond = Infinity;
let last = performance.now();
let acc = 0;
const TICK = 1 / 60;
const SETTINGS_KEY = 'may-dem-dao-ben-settings-v1';
let settings = { volume: 0.35, sensitivity: 0.005, fx: true };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
  if (saved && Number.isFinite(saved.volume) && Number.isFinite(saved.sensitivity)) {
    settings = {
      volume: Math.max(0, Math.min(1, saved.volume)),
      sensitivity: Math.max(0.001, Math.min(0.012, saved.sensitivity)),
      colorblind: saved.colorblind === true,
      fx: saved.fx !== false,
    };
  }
} catch (error) {
  console.error('Unable to load saved game settings:', error);
}
const audio = createAudio(() => settings.volume);
const startAudio = () => audio.start();
const playSound = (name) => audio.play(name);
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Unable to save game settings:', error);
  }
}
const volumeSetting = $('#volume-setting');
const sensitivitySetting = $('#sensitivity-setting');
const colorblindSetting = $('#colorblind-setting');
volumeSetting.value = settings.volume;
sensitivitySetting.value = settings.sensitivity;
colorblindSetting.checked = settings.colorblind === true;
document.body.classList.toggle('colorblind-mode', colorblindSetting.checked);
volumeSetting.addEventListener('input', () => {
  settings.volume = Number(volumeSetting.value);
  audio.setVolume(settings.volume);
  saveSettings();
});
sensitivitySetting.addEventListener('input', () => {
  settings.sensitivity = Number(sensitivitySetting.value);
  saveSettings();
});
const fxSetting = $('#fx-setting');
fxSetting.checked = settings.fx !== false;
post.enabled = fxSetting.checked;
fxSetting.addEventListener('change', () => { settings.fx = fxSetting.checked; post.enabled = settings.fx; saveSettings(); });
colorblindSetting.addEventListener('change', () => {
  settings.colorblind = colorblindSetting.checked;
  document.body.classList.toggle('colorblind-mode', settings.colorblind);
  saveSettings();
});

function newGame(night = currentNight) {
  currentNight = night;
  const seed = Math.floor(Math.random() * 1e9); // GUI-only; headless stays seeded
  sim = new Simulation(TUNING, seed, {}, { night: currentNight, arcade: true });
  audio.setNight(currentNight);
  rebuildMapVisuals(sim.map, currentNight);
  rebuildHoles(sim.holes);
  rebuildLanterns(sim.lanterns);
  rebuildFireflies(sim.map);
  cameraYaw = 0;
  renderYaw = renderYawTarget = 0;
  sim.input.camYawDeg = 0;
  cameraInitialized = false;
  renderPos.splice(0, 3, ...sim.player.pos);
  prevPos.splice(0, 3, ...sim.player.pos);
  acc = 0;
  lastCountdownSecond = Infinity;
  result.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
  $('#hint').style.opacity = 0;
  toastEl.style.opacity = 0;
  $('#intro-title').textContent = `🌙 Đêm ${currentNight} — ${sim.map.name}`;
  $('#intro-copy').textContent = [
    'Ông Đăng dặn: Đêm đầu tiên, hãy thu thập đom đóm, thắp sáng các đèn và tránh Bóng Mực.',
    'Ông Đăng kể: Hai hòn đảo nối bằng cầu tre. Hãy dùng bục nhảy để vượt biển mây.',
    'Ông Đăng nhắc: Leo tháp chuông qua các dốc và bục nhảy; nhớ để ý gió mạnh.',
  ][currentNight - 1];
  $('#start-btn').textContent = `Bắt đầu Đêm ${currentNight}`;
  $('#next-btn').classList.remove('hidden');
  document.title = `Mây và Đêm Đảo Bến — Đêm ${currentNight}: ${sim.map.name}`;
  // Clear leftover cosmetic celebration particles from the previous run.
  for (const l of lanternData) {
    for (const nd of l.celebrateNodes) scene.remove(nd);
    l.celebrateNodes.length = 0;
  }
  shadeArrivalTimes.clear();
  for (const effect of shadeFogEffects) {
    scene.remove(effect.group);
    effect.material.dispose();
  }
  shadeFogEffects.length = 0;
  if (generatedMap) generatedMap.visible = currentNight !== 1;
}

// `?night=2` opens a specific night directly (handy for testing Night 2/3 visuals).
const requestedNight = Number(new URLSearchParams(location.search).get('night'));
newGame([1, 2, 3].includes(requestedNight) ? requestedNight : 1);

// ------------------------------------------------------------------ input
const keys = {};
const pendingEdges = { interact: false, pulse: false, jump: false, dash: false, pause: false };
function queueInputEdge(action) {
  pendingEdges[action] = true;
  sim.input[action] = true;
}
function applyPendingEdges() {
  for (const [action, pending] of Object.entries(pendingEdges)) {
    if (pending) sim.input[action] = true;
  }
}
function clearPendingEdges() {
  for (const action of Object.keys(pendingEdges)) {
    if (!pendingEdges[action]) continue;
    pendingEdges[action] = false;
    const heldKey = {
      interact: keys.KeyE,
      pulse: keys.KeyF,
      jump: keys.Space,
      dash: keys.ShiftLeft || keys.ShiftRight,
      pause: keys.Escape || keys.KeyP,
    }[action];
    if (!heldKey) sim.input[action] = false;
  }
}
function setMove() {
  // The Simulation's move basis (PRD §8.4) is mirrored relative to a three.js camera,
  // so the GUI negates x: D is screen-right and A is screen-left at any camera yaw.
  const x = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
  const z = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  sim.input.move = [x, z];
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !keys.KeyE) queueInputEdge('interact');
  if (e.code === 'KeyF' && !keys.KeyF) queueInputEdge('pulse');
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !keys[e.code]) queueInputEdge('dash');
  if (e.code === 'Space') { e.preventDefault(); if (!keys.Space) queueInputEdge('jump'); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !keys[e.code]) queueInputEdge('pause');
  if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); newGame(currentNight); gameStarted = true; startAudio(); intro.classList.add('hidden'); }
  if (e.repeat) return;
  keys[e.code] = true;
  setMove();
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') sim.input.interact = false;
  if (e.code === 'KeyF') sim.input.pulse = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sim.input.dash = false;
  if (e.code === 'Escape' || e.code === 'KeyP') sim.input.pause = false;
  if (e.code === 'Space') sim.input.jump = false;
  keys[e.code] = false;
  setMove();
});

// Losing focus (alt-tab) must not leave movement keys stuck down.
addEventListener('blur', () => {
  for (const code of Object.keys(keys)) keys[code] = false;
  setMove();
  dragging = false;
});

// mouse camera: click to capture the mouse (pointer lock) and look around; wheel to zoom.
// Without pointer lock (e.g. embedded browsers) dragging still orbits.
let dragging = false;
let lastX = 0;
const mouseLocked = () => document.pointerLockElement === renderer.domElement;
function captureMouse() {
  if (mouseLocked()) return;
  try { renderer.domElement.requestPointerLock()?.catch?.(() => {}); } catch { /* unsupported: drag fallback */ }
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX;
  if (gameStarted && !sim.isOver()) captureMouse();
});
document.addEventListener('pointerlockchange', () => {
  // Esc releases the mouse; treat that as a pause request while playing.
  if (!mouseLocked() && gameStarted && !sim.isOver() && sim.gameState === 'playing') queueInputEdge('pause');
});
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => {
  if (mouseLocked()) {
    cameraYaw -= e.movementX * settings.sensitivity;
    CAMERA.height = Math.max(6, Math.min(20, CAMERA.height + e.movementY * 0.03));
    sim.input.camYawDeg = (cameraYaw * 180) / Math.PI;
    idleTime = 0;
  } else if (dragging) {
    cameraYaw -= (e.clientX - lastX) * settings.sensitivity;
    lastX = e.clientX;
    sim.input.camYawDeg = (cameraYaw * 180) / Math.PI;
  }
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  CAMERA.distance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, CAMERA.distance + e.deltaY * 0.01));
}, { passive: false });

startBtn.addEventListener('click', () => { startAudio(); gameStarted = true; intro.classList.add('hidden'); captureMouse(); });
replayBtn.addEventListener('click', () => { newGame(currentNight); gameStarted = true; startAudio(); });
$('#resume-btn').addEventListener('click', () => {
  sim.prevInput.pause = false;
  queueInputEdge('pause');
  startAudio();
});
$('#restart-night-btn').addEventListener('click', () => {
  newGame(currentNight);
  gameStarted = true;
  startAudio();
});
$('#settings-btn').addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  settingsOverlay.classList.remove('hidden');
});
$('#settings-back-btn').addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
  pauseOverlay.classList.remove('hidden');
});
function returnToMenu() {
  gameStarted = false;
  completedScore = 0;
  intro.classList.remove('hidden');
  pauseOverlay.classList.add('hidden');
  result.classList.add('hidden');
  newGame(1);
}
$('#pause-menu-btn').addEventListener('click', returnToMenu);
$('#menu-btn').addEventListener('click', returnToMenu);
$('#next-btn').addEventListener('click', () => {
  completedScore += sim.scoreValue;
  if (currentNight < 3) {
    newGame(currentNight + 1);
    gameStarted = false;
    intro.classList.remove('hidden');
  } else {
    $('#result-title').textContent = 'Bình Minh!';
    $('#result-msg').textContent = `Ba hòn đảo đã sáng trở lại. Tổng điểm: ${completedScore}.`;
    $('#result-score').textContent = completedScore;
    $('#next-btn').classList.add('hidden');
  }
});

// ------------------------------------------------------------------ toast helper
let toastT = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => (toastEl.style.opacity = 0), 1600);
}

// ------------------------------------------------------------------ celebration (cosmetic only)
function spawnCelebration(l) {
  for (let i = 0; i < 18; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true }));
    l.celebrateNodes.push(p);
    scene.add(p);
    const a = Math.random() * Math.PI * 2;
    const r = 1.2;
    p.userData = { start: performance.now() / 1000, a, r };
  }
  l.celebrationTimer = performance.now() / 1000;
}

// Cosmetic bursts. Positions come from the Simulation Core; nothing here feeds back into it.
function spawnRing(x, y, z, count, color, speed) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    particles.emit(x, y, z, Math.cos(a) * speed, 0.2, Math.sin(a) * speed, 0.6, [c.r, c.g, c.b], { drag: 3 });
  }
}
function spawnBurst(x, y, z, count, color, speed, life) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const up = 0.5 + Math.random() * speed * 0.6;
    const s = speed * (0.4 + Math.random() * 0.6);
    particles.emit(x, y, z, Math.cos(a) * s, up, Math.sin(a) * s, life * (0.6 + Math.random() * 0.4), [c.r, c.g, c.b], { gravity: 1.5, drag: 1.5 });
  }
}

// ------------------------------------------------------------------ HUD
function updateHud() {
  const p = sim.player;
  flameRow.innerHTML = '';
  for (let i = 0; i < TUNING.flames; i++) {
    const span = document.createElement('span');
    span.className = 'flame' + (i < p.flames ? '' : ' off');
    span.textContent = '🔥';
    flameRow.appendChild(span);
  }
  const lit = sim.lanterns.filter((l) => l.lit).length;
  lanternVal.textContent = `${lit}/${sim.lanterns.length}`;
  scoreVal.textContent = completedScore + sim.scoreValue;
  nightLabel.textContent = `Đêm ${currentNight} · ${sim.map.name}`;
  carriedVal.textContent = `${p.carried} / ${p.capacity}`;
  moteBar.replaceChildren();
  for (let i = 0; i < p.capacity; i++) {
    const cell = document.createElement('span');
    cell.className = `mote-cell${i < p.carried ? ' filled' : ''}`;
    moteBar.appendChild(cell);
  }
  dashCooldownEl.textContent = p.dashCooldown > 0 ? `Lướt: ${p.dashCooldown / 60}s` : 'Lướt: sẵn sàng';
  pulseCooldownEl.textContent = p.pulseCooldown > 0 ? `Tỏa sáng: ${p.pulseCooldown / 60}s` : 'Tỏa sáng: sẵn sàng';
  windIndicator.textContent = sim.wind.active
    ? `🌬️ Gió mạnh · ${Math.ceil(sim.wind.ticksLeft / 60)}s`
    : sim.wind.warningTicks > 0
      ? `🍃 Gió mạnh sau ${Math.ceil(sim.wind.warningTicks / 60)}s`
      : '';
  const t = Math.max(0, sim.timeLeft());
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  timeVal.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  $('#time').classList.toggle('danger', t <= 30);
  const target = sim.lanterns
    .filter((lantern) => !lantern.lit || lanternFuel(lantern) < TUNING.fuel_max)
    .sort((a, b) =>
      Math.hypot(p.pos[0] - a.pos[0], p.pos[2] - a.pos[2]) -
        Math.hypot(p.pos[0] - b.pos[0], p.pos[2] - b.pos[2]) || a.id.localeCompare(b.id))[0];
  if (target) {
    const world = new THREE.Vector3(target.pos[0], target.pos[1] + 2, target.pos[2]);
    // Points behind the camera project mirrored; flip them and pin to the bottom edge.
    const behind = world.clone().applyMatrix4(camera.matrixWorldInverse).z > 0;
    const projected = world.project(camera);
    if (behind) {
      projected.x = -projected.x;
      projected.y = Math.hypot(projected.x, projected.y) < 0.3 ? -1 : -projected.y;
    }
    if (behind || Math.abs(projected.x) > 0.9 || Math.abs(projected.y) > 0.9) {
      const angle = Math.atan2(-projected.y, projected.x);
      const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
      offscreenArrow.textContent = arrows[Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
      offscreenArrow.style.left = `${50 + Math.max(-38, Math.min(38, projected.x * 42))}%`;
      offscreenArrow.style.top = `${50 - Math.max(-38, Math.min(38, projected.y * 42))}%`;
      offscreenArrow.classList.remove('hidden');
    } else {
      offscreenArrow.classList.add('hidden');
    }
  } else {
    offscreenArrow.classList.add('hidden');
  }
}

// ------------------------------------------------------------------ main loop
function frame(now) {
  requestAnimationFrame(frame);
  const dt = (now - last) / 1000;
  last = now;
  if (gameStarted && !sim.isOver()) {
    acc += Math.min(dt, 0.1);
    while (acc >= TICK && !sim.isOver()) {
      const wasGrounded = sim.player.grounded;
      prevPos.splice(0, 3, ...sim.player.pos);
      applyPendingEdges();
      sim.step();
      clearPendingEdges();
      acc -= TICK;
      const pp = sim.player.pos;
      if (wasGrounded && !sim.player.grounded) {
        playSound('jump');
        spawnRing(pp[0], pp[1] + 0.1, pp[2], 10, 0xc9b48a, 2.5);
      }
      if (!wasGrounded && sim.player.grounded && sim.player.recoveryTicks === 0) {
        spawnRing(pp[0], pp[1] + 0.1, pp[2], 14, 0xe6dcc0, 3.5);
        cameraShake = Math.max(cameraShake, 0.12);
      }
      if (sim.player.dashTicks > 0) {
        // Trail of light and dust behind the dash.
        const d = sim.player.dashVector;
        for (let i = 0; i < 3; i++) {
          particles.emit(pp[0] + (Math.random() - 0.5) * 0.6, pp[1] + 0.4 + Math.random() * 0.8, pp[2] + (Math.random() - 0.5) * 0.6,
            -d[0] * 2 + (Math.random() - 0.5), 0.5 + Math.random(), -d[1] * 2 + (Math.random() - 0.5),
            0.45, [0.7, 0.9, 1.0], { drag: 2 });
        }
      }
      for (const ev of sim.events) {
        if (ev.name === 'mote_picked') {
          playSound('mote');
          toast('✨ Nhặt đom đóm');
          spawnBurst(pp[0], pp[1] + 1.2, pp[2], 10, 0xfff6c2, 2, 0.7);
        }
        else if (ev.name === 'charm_picked') {
          playSound('charm');
          toast('🍃 Bùa Gió tăng tốc!');
          spawnBurst(pp[0], pp[1] + 1, pp[2], 24, 0xf2c14e, 3, 0.9);
        }
        else if (ev.name === 'lantern_lit') {
          playSound('lantern');
          toast(ev.data.relight ? '🕯️ Đèn Lồng được thắp lại!' : '🕯️ Đèn Lồng sáng lên!');
          const lantern = lanternData.find((entry) => entry.id === ev.data.lantern_id);
          if (lantern) spawnCelebration(lantern);
          const lp = sim.lanterns.find((entry) => entry.id === ev.data.lantern_id)?.pos ?? [0, 0, 0];
          spawnBurst(lp[0], lp[1] + 3.6, lp[2], 60, 0xffb347, 4, 1.8);
        }
        else if (ev.name === 'deposit') {
          toast(`⚡ Nạp ${ev.data.amount} ánh sáng · đài đã chuyển chỗ`);
          spawnBurst(pp[0], pp[1] + 1.4, pp[2], 14, 0xffe9b0, 2.5, 0.8);
        }
        else if (ev.name === 'refuel') { playSound('refuel'); toast(`🛢️ Châm ${ev.data.amount} đom đóm · dầu ${ev.data.fuel.toFixed(1)}`); }
        else if (ev.name === 'lantern_out') { playSound('out'); toast('🕯️ Một Đèn Lồng đã cạn dầu!'); }
        else if (ev.name === 'pulse') {
          playSound('pulse');
          toast('💫 Tỏa sáng!');
          spawnRing(pp[0], pp[1] + 1, pp[2], 40, 0xb49bff, 7);
          cameraShake = Math.max(cameraShake, 0.2);
        }
        else if (ev.name === 'dash') playSound('dash');
        else if (ev.name === 'player_hit' && ev.data.by === 'hole') {
          playSound('hole');
          toast(ev.data.lost > 0 ? `🕳️ Rơi xuống hố! Đánh rơi ${ev.data.lost} đom đóm` : '🕳️ Rơi xuống hố!');
          spawnBurst(pp[0], pp[1] + 0.5, pp[2], 18, 0x9a8aff, 2.5, 0.9);
          cameraShake = Math.max(cameraShake, 0.25);
        }
        else if (ev.name === 'player_hit') {
          playSound('hit');
          toast(`💔 Mất 1 sức khỏe (${sim.player.flames})`);
          spawnBurst(pp[0], pp[1] + 1, pp[2], 22, 0xffd27a, 3.5, 1.0);
          cameraShake = 0.35;
        }
        else if (ev.name === 'paused') pauseOverlay.classList.remove('hidden');
        else if (ev.name === 'resumed') {
          sim.input.pause = false;
          pauseOverlay.classList.add('hidden');
          settingsOverlay.classList.add('hidden');
        }
        else if (ev.name === 'shade_spawned') {
          playSound('shade');
          const shade = sim.shades.find((entry) => entry.id === ev.data.id);
          if (shade) revealShadeInFog(shade);
          toast('🌒 Có gì đó lay động trong màn sương…');
        } else if (ev.name === 'game_over') playSound(ev.data.result === 'won' ? 'win' : 'lose');
      }
      if (sim.wind.warningTicks === 120) toast('🌬️ Gió mạnh sắp tới!');
      const countdownSecond = Math.ceil(sim.timeLeft());
      if (countdownSecond <= 10 && countdownSecond > 0 && countdownSecond < lastCountdownSecond) playSound('countdown');
      lastCountdownSecond = countdownSecond;
    }
  }

  // ---- render sync
  const p = sim.player;
  // Interpolate between the last two simulation ticks so motion looks continuous at any frame rate.
  const alpha = Math.min(1, acc / TICK);
  for (let i = 0; i < 3; i++) renderPos[i] = prevPos[i] + (p.pos[i] - prevPos[i]) * alpha;
  // Shortest-path yaw easing: turning eases instead of snapping.
  renderYawTarget = (p.facingYawDeg * Math.PI) / 180;
  const yawDelta = Math.atan2(Math.sin(renderYawTarget - renderYaw), Math.cos(renderYawTarget - renderYaw));
  renderYaw += yawDelta * (1 - Math.exp(-14 * Math.min(dt, 0.1)));
  playerGroup.position.set(renderPos[0], renderPos[1], renderPos[2]);
  playerGroup.rotation.y = renderYaw;
  playerGroup.visible = !(p.invulnTicks > 0 && Math.floor(now / 90) % 2 === 0); // blink while invulnerable
  playerLight.position.set(renderPos[0], renderPos[1] + 1.4, renderPos[2]);
  {
    const moving = Math.hypot(p.vel[0], p.vel[2]) > 0.8 && p.grounded;
    const bob = moving ? Math.abs(Math.sin(now * 0.014)) * 0.12 : Math.sin(now * 0.003) * 0.03;
    playerSprite.position.set(renderPos[0], renderPos[1] + 1.2 + bob, renderPos[2]);
    playerSprite.quaternion.copy(camera.quaternion);
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const side = p.vel[0] * camRight.x + p.vel[2] * camRight.z;
    if (Math.abs(side) > 0.5) spriteFlip = side > 0 ? 1 : -1;
    playerSprite.scale.set(spriteFlip, moving ? 1 + Math.abs(Math.sin(now * 0.014)) * 0.04 : 1, 1);
    playerSprite.material.map = playerFrames[moving && Math.floor(now / 140) % 2 ? 1 : 0];
    playerSprite.visible = playerGroup.visible;
    playerShadow.position.set(renderPos[0], renderPos[1] + 0.04, renderPos[2]);
    playerShadow.visible = playerGroup.visible;
  }
  if (gameStarted && !sim.isOver()) {
    const speed = Math.hypot(p.vel[0], p.vel[2]);
    if (p.grounded && speed > 4 && Math.random() < 0.25) {
      particles.emit(renderPos[0], renderPos[1] + 0.05, renderPos[2], (Math.random() - 0.5) * 0.8, 0.3, (Math.random() - 0.5) * 0.8, 0.5, [0.8, 0.75, 0.6], { drag: 2 });
    }
    // Glowing light trail: warm sparks along the path, plus fading fog-clearing glow points.
    if (speed > 1) {
      for (let k = 0; k < 2; k++) {
        particles.emit(renderPos[0] + (Math.random() - 0.5) * 0.3, renderPos[1] + 0.5 + Math.random() * 0.3, renderPos[2] + (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3, 1.3, [1, 0.78, 0.35], { drag: 1.2 });
      }
      trailClock += dt;
      if (trailClock > 0.18) {
        trailClock = 0;
        lightTrail.unshift({ x: renderPos[0], y: renderPos[1] + 0.8, z: renderPos[2], age: 0 });
        if (lightTrail.length > TRAIL_MAX) lightTrail.pop();
      }
    }
  }
  for (let i = lightTrail.length - 1; i >= 0; i--) {
    lightTrail[i].age += dt;
    if (lightTrail[i].age > TRAIL_LIFE) lightTrail.splice(i, 1);
  }
  // Wind leaves blow across the map while a gust is active or warned.
  if (gameStarted && (sim.wind.active || sim.wind.warningTicks > 0)) {
    const dir = (sim.wind.dirDeg * Math.PI) / 180;
    for (let i = 0; i < 2; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 4 + Math.random() * 12;
      particles.emit(renderPos[0] + Math.cos(ang) * rad, 2 + Math.random() * 6, renderPos[2] + Math.sin(ang) * rad,
        Math.cos(dir) * 6, -0.5, Math.sin(dir) * 6, 1.6, [0.6, 0.85, 0.5], { drag: 0.6 });
    }
  }
  particles.update(dt);
  fireflies?.update(now / 1000);
  if (mapDecor) mapDecor.update(dt);

  // The movable shrine is rendered at the Simulation's authoritative position.
  const shrinePos = sim.depositShrine.pos;
  depositShrineGroup.position.set(shrinePos[0], shrinePos[1], shrinePos[2]);
  shrineCrystal.rotation.y += dt * 0.7;
  shrineCrystal.position.y = 1.15 + Math.sin(now * 0.002) * 0.08;
  shrineRing.rotation.z += dt * 0.18;

  // lanterns
  for (const l of lanternData) {
    const lan = sim.lanterns.find((x) => x.id === l.id);
    const litOn = lan.lit;
    const fuel = lanternFuel(lan);
    const lowFuel = litOn && fuel < TUNING.low_fuel_threshold;
    const blinkOn = !lowFuel || Math.floor(now / 500) % 2 === 0;
    const visibleLight = litOn && blinkOn;
    const fuelRatio = fuel / TUNING.fuel_max;
    l.light.intensity = visibleLight ? 2.4 * fuelRatio : 0;
    l.lanternMesh.material.emissiveIntensity = visibleLight ? fuelRatio : 0;
    l.lanternMesh.scale.y = litOn ? 1 : 0.8;
    l.tearMark.visible = !litOn;
    l.fuelBar.visible = visibleLight;
    l.fuelFill.scale.x = Math.max(0.001, fuelRatio);
    l.fuelFill.position.x = -0.775 * (1 - fuelRatio);
    l.fuelFill.material.color.setHex(lowFuel ? (settings.colorblind ? 0xffffff : 0xff5a5f) : 0xffcf6b);
    l.coreGlow.material.opacity = visibleLight ? 0.95 * fuelRatio : 0;
    l.ring.material.opacity = visibleLight ? 0.22 : 0;
    // celebration particles drift upward & fade over ~2s
    for (let i = l.celebrateNodes.length - 1; i >= 0; i--) {
      const nd = l.celebrateNodes[i];
      const t = performance.now() / 1000 - nd.userData.start;
      if (t > 2) {
        scene.remove(nd);
        l.celebrateNodes.splice(i, 1);
        continue;
      }
      nd.position.set(
        lan.pos[0] + Math.cos(nd.userData.a + t * 2) * nd.userData.r,
        3.4 + t,
        lan.pos[2] + Math.sin(nd.userData.a + t * 2) * nd.userData.r
      );
      nd.material.opacity = Math.max(0, 1 - t / 2);
    }
  }

  syncMotes(sim.activeMotes());
  syncShades(sim.snapshotShades());
  syncDrifters(sim.drifters);
  syncCharms(sim.charms);
  updateShadeFog(now / 1000);

  // Follow: once movement keys are released, the camera eases behind Mây's heading.
  // While keys are held the yaw stays fixed, so camera-relative input cannot feed back into itself.
  const moving = sim.input.move[0] !== 0 || sim.input.move[1] !== 0;
  idleTime = moving ? 0 : idleTime + dt;
  if (idleTime > 0.3 && !dragging && gameStarted && !sim.isOver()) {
    const target = (p.facingYawDeg * Math.PI) / 180;
    const delta = Math.atan2(Math.sin(target - cameraYaw), Math.cos(target - cameraYaw));
    cameraYaw += delta * (1 - Math.exp(-3 * Math.min(dt, 0.1)));
    sim.input.camYawDeg = (cameraYaw * 180) / Math.PI;
  }

  // High third-person follow camera, behind Mây along the camera yaw (reference: steep view from above-behind).
  const fx = Math.sin(cameraYaw);
  const fz = Math.cos(cameraYaw);
  cameraTarget.set(renderPos[0] + fx * CAMERA.lookAhead, renderPos[1] + 1.2, renderPos[2] + fz * CAMERA.lookAhead);
  const ideal = new THREE.Vector3(
    renderPos[0] - fx * CAMERA.distance,
    renderPos[1] + CAMERA.height,
    renderPos[2] - fz * CAMERA.distance
  );
  if (!cameraInitialized) {
    cameraPos.copy(ideal);
    cameraInitialized = true;
  } else {
    cameraPos.lerp(ideal, 1 - Math.exp(-10 * Math.min(dt, 0.1)));
  }
  cameraShake *= Math.exp(-9 * Math.min(dt, 0.1));
  camera.position.set(
    cameraPos.x + (Math.random() - 0.5) * cameraShake,
    cameraPos.y + (Math.random() - 0.5) * cameraShake,
    cameraPos.z
  );
  camera.lookAt(cameraTarget); // lookAt keeps +Y up; never overwrite rotation.z afterwards (it flips the view at some yaws)

  // Fog of war: only light sources clear the mist (Mây's lantern, lit lanterns, the shrine, nearby motes).
  const lightList = [[renderPos[0], renderPos[1] + 1.4, renderPos[2], 16]];
  const shrineLight = sim.depositShrine.pos;
  lightList.push([shrineLight[0], shrineLight[1] + 1.5, shrineLight[2], 9]);
  for (const lan of sim.lanterns) {
    lightList.push([lan.pos[0], lan.pos[1] + 3.6, lan.pos[2], lan.lit ? 22 * lanternFuel(lan) / TUNING.fuel_max : 4]);
  }
  const nearestMotes = sim.activeMotes()
    .map((m) => ({ m, d: Math.hypot(m.pos[0] - renderPos[0], m.pos[2] - renderPos[2]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  for (const { m } of nearestMotes) lightList.push([m.pos[0], m.pos[1] + 0.5, m.pos[2], 2.5]);
  for (const t of lightTrail) lightList.push([t.x, t.y, t.z, 6 * (1 - t.age / TRAIL_LIFE)]);
  setFowLights(lightList, now / 1000);

  if (currentNight === 1) sea.rotation.z += 0.0004;

  // hints
  const near = sim.lanterns
    .filter((lantern) => !lantern.lit || lanternFuel(lantern) < TUNING.fuel_max)
    .filter((lantern) => Math.hypot(p.pos[0] - lantern.pos[0], p.pos[2] - lantern.pos[2]) <= TUNING.interact_radius)
    .sort((a, b) =>
      Math.hypot(p.pos[0] - a.pos[0], p.pos[2] - a.pos[2]) -
        Math.hypot(p.pos[0] - b.pos[0], p.pos[2] - b.pos[2]) || a.id.localeCompare(b.id))[0];
  const nearShrine = Math.hypot(p.pos[0] - shrinePos[0], p.pos[2] - shrinePos[2]) <= TUNING.interact_radius;
  if (near) {
    const cost = near.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
    const remaining = near.lit
      ? Math.ceil((TUNING.fuel_max - lanternFuel(near)) / TUNING.fuel_per_mote)
      : cost - near.deposited;
    const progress = near.lit ? `dầu ${lanternFuel(near).toFixed(1)}/100` : `${near.deposited}/${cost}`;
    const action = near.lit ? 'Châm dầu' : near.everLit ? 'Thắp lại' : 'Thắp đèn';
    const depositHint = p.carried >= remaining
      ? `E — ${action} (${progress})`
      : p.carried > 0
        ? `E — ${action} (${progress}; đang mang ${p.carried})`
        : `E — ${action} (${progress}; cần thêm ${remaining})`;
    const pulseHint = p.carried >= TUNING.pulse_cost ? '\nF — Tỏa sáng' : '';
    hintEl.textContent = depositHint + pulseHint;
    hintEl.style.opacity = 1;
  } else if (nearShrine) {
    const target = sim.depositShrineTarget();
    if (target) {
      const cost = target.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
      const remaining = cost - target.deposited;
      const progress = `${target.id} ${target.deposited}/${cost}`;
      hintEl.textContent = p.carried > 0
        ? `E — Nạp tại Đài Ánh Sáng (${progress})`
        : `E — Đài Ánh Sáng (${progress}; cần thêm ${remaining})`;
      if (p.carried >= TUNING.pulse_cost) hintEl.textContent += '\nF — Tỏa sáng';
      hintEl.style.opacity = 1;
    } else {
      hintEl.style.opacity = 0;
    }
  } else if (p.carried >= TUNING.pulse_cost) {
    hintEl.textContent = 'F — Tỏa sáng';
    hintEl.style.opacity = 1;
  } else {
    hintEl.style.opacity = 0;
  }

  updateHud();
  const litCount = sim.lanterns.filter((lantern) => lantern.lit).length;
  moon.intensity = 0.15 + 0.55 * (litCount / sim.lanterns.length);
  hemi.intensity = 0.35 + 0.4 * (litCount / sim.lanterns.length);
  pauseOverlay.classList.toggle('hidden', sim.gameState !== 'paused' || !settingsOverlay.classList.contains('hidden'));

  // game over
  if (sim.isOver()) {
    const won = sim.gameState === 'won';
    $('#result-title').textContent = won
      ? (currentNight === 3 ? 'Đêm cuối đã khép lại!' : 'Hòn đảo đã sáng trở lại!')
      : 'Mây cần nghỉ ngơi một chút…';
    $('#result-msg').textContent = won
      ? `Mây trụ đến bình minh với ${litCount}/${sim.lanterns.length} đèn sáng. ${sim.map.name} được cứu!`
      : sim.gameOverReason === 'dawn'
        ? `Trời đã sáng nhưng chỉ còn ${litCount}/${sim.lanterns.length} đèn; hãy giữ ít nhất ${Math.ceil(TUNING.win_ratio * sim.lanterns.length)} đèn sáng.`
        : 'Bóng Mực đã thắng đêm nay. Cố lên, Mây!';
    $('#result-score').textContent = completedScore + sim.scoreValue;
    $('#next-btn').classList.toggle('hidden', !won);
    result.classList.remove('hidden');
  }

  post.render();
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.resize(window.innerWidth, window.innerHeight);
});
