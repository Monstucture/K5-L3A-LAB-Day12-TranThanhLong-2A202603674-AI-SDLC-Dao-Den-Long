/**
 * Presentation layer (GUI) — Three.js. Reads state from the SAME Simulation
 * Core the headless CLI uses; this file only renders, it never modifies the
 * simulation. Cosmetic VFX here is never instantiated in headless mode.
 */
import * as THREE from '/node_modules/three/build/three.module.js';
import { Simulation } from '../core/simulation.js';
import { TUNING, LANTERN_POSITIONS, ISLAND_RADIUS, SHADE_SCHEDULE, DT } from '../core/tuning.js';

// ------------------------------------------------------------------ DOM
const $ = (s) => document.querySelector(s);
const startBtn = $('#start-btn');
const replayBtn = $('#replay-btn');
const intro = $('#intro');
const result = $('#result');
const toastEl = $('#toast');
const hintEl = $('#hint');
const flameRow = $('#flames');
const carriedVal = $('#carried-val');
const lanternVal = $('#lantern-val');
const scoreVal = $('#score-val');
const timeVal = $('#time-val');

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1024);
scene.fog = new THREE.Fog(0x0b1024, 40, 95);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);

// ------------------------------------------------------------------ lights
scene.add(new THREE.AmbientLight(0x2a3170, 0.9));
const hemi = new THREE.HemisphereLight(0x35417a, 0x0a0f1e, 0.9);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x8292d8, 0.5);
moon.position.set(40, 70, 30);
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
  const m = new THREE.PointsMaterial({ color: 0xdfe7ff, size: 0.6, transparent: true, opacity: 0.9 });
  scene.add(new THREE.Points(g, m));
})();

// ------------------------------------------------------------------ island
const islandTop = new THREE.Mesh(
  new THREE.CircleGeometry(ISLAND_RADIUS, 56),
  new THREE.MeshStandardMaterial({ color: 0x243049, roughness: 0.95 })
);
islandTop.rotation.x = -Math.PI / 2;
islandTop.receiveShadow = true;
scene.add(islandTop);

const rim = new THREE.Mesh(
  new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 2, 6, 56, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x1a2338, roughness: 1, side: THREE.DoubleSide })
);
rim.position.y = -3;
scene.add(rim);

// Sea of clouds below / around the island.
const sea = new THREE.Mesh(
  new THREE.RingGeometry(ISLAND_RADIUS + 2, ISLAND_RADIUS + 30, 64),
  new THREE.MeshStandardMaterial({ color: 0x8a94c8, transparent: true, opacity: 0.35, roughness: 1 })
);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -1.2;
scene.add(sea);

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
    new THREE.MeshStandardMaterial({ color: 0x7a6bb0, roughness: 0.9 })
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
  playerGroup.add(body, robe, hat, hatTop, lamp, lampString);
}
scene.add(playerGroup);

const playerLight = new THREE.PointLight(0xffcf6b, 1.4, 14, 2);
scene.add(playerLight);

// ------------------------------------------------------------------ lanterns
const lanternData = [];
const LANTERN_IDS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const celebration = []; // {group, timer}
for (const id of LANTERN_IDS) {
  const pos = LANTERN_POSITIONS[id];
  const g = new THREE.Group();
  g.position.set(pos[0], 0, pos[2]);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 4.4, 10), new THREE.MeshStandardMaterial({ color: 0x4a3d2a, roughness: 0.9 }));
  pole.position.y = 2.2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x5a4a30 }));
  base.position.y = 0.15;
  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0x6a5a40, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.5 }));
  lantern.position.y = 3.6;
  const coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffcf6b, transparent: true, opacity: 0 }));
  coreGlow.position.y = 3.6;
  const light = new THREE.PointLight(0xffb35a, 0, 30, 2);
  light.position.y = 3.6;
  // safe-zone ring (visible when lit)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(TUNING.safe_radius - 0.15, TUNING.safe_radius, 64),
    new THREE.MeshBasicMaterial({ color: 0xffe4a0, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(pole, base, lantern, coreGlow, light, ring);
  scene.add(g);
  lanternData.push({ id, group: g, lanternMesh: lantern, coreGlow, light, ring, celebrationTimer: 0, celebrateNodes: [] });
}

// ------------------------------------------------------------------ motes pool
const MOTES = [];
const moteMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 });
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
    mesh.position.set(m.pos[0], 0.7 + Math.sin(Date.now() / 300 + i) * 0.2, m.pos[2]);
  }
  for (let i = active.length; i < MOTES.length; i++) MOTES[i].visible = false;
}

// ------------------------------------------------------------------ shades pool
const shadePool = [];
function makeShadeMesh() {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 18, 18), new THREE.MeshStandardMaterial({ color: 0x1a1230, roughness: 0.6, emissive: 0x0a0018, emissiveIntensity: 0 }));
  body.scale.set(1, 0.8, 1);
  body.position.y = 0.9;
  const drop = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 12), new THREE.MeshBasicMaterial({ color: 0x241848 }));
  drop.position.y = 1.9;
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd8f6ff }));
  eye1.position.set(0.2, 1.15, 0.55);
  const eye2 = eye1.clone();
  eye2.position.set(-0.2, 1.15, 0.55);
  grp.add(body, drop, eye1, eye2);
  grp.visible = false;
  scene.add(grp);
  return grp;
}
function syncShades(shades) {
  for (let i = 0; i < shades.length; i++) {
    let m = shadePool[i];
    if (!m) m = shadePool[i] = makeShadeMesh();
    const s = shades[i];
    m.visible = true;
    m.position.set(s.pos[0], s.pos[1], s.pos[2]);
    m.scale.setScalar(s.state === 'stunned' ? 0.8 : 1);
    m.children[0].material.emissiveIntensity = s.state === 'stunned' ? 0.6 : 0;
  }
  for (let i = shades.length; i < shadePool.length; i++) shadePool[i].visible = false;
}

// ------------------------------------------------------------------ simulation
let sim = null;
let cameraYaw = 0; // radians; mirrored into sim as degrees
let gameStarted = false;

function newGame() {
  const seed = Math.floor(Math.random() * 1e9); // GUI-only; headless stays seeded
  sim = new Simulation(TUNING, seed, {});
  cameraYaw = 0;
  sim.input.camYawDeg = 0;
  result.classList.add('hidden');
  $('#hint').style.opacity = 0;
  toastEl.style.opacity = 0;
  // Clear leftover cosmetic celebration particles from the previous run.
  for (const l of lanternData) {
    for (const nd of l.celebrateNodes) scene.remove(nd);
    l.celebrateNodes.length = 0;
  }
}

newGame();

// ------------------------------------------------------------------ input
const keys = {};
function setMove() {
  const x = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const z = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  sim.input.move = [x, z];
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !keys['KeyE']) sim.input.interact = true;
  if (e.code === 'KeyF' && !keys['KeyF']) sim.input.pulse = true;
  if (e.code === 'Space') { e.preventDefault(); if (!keys['Space']) sim.input.jump = true; }
  if (e.code === 'KeyR') { e.preventDefault(); newGame(); gameStarted = true; intro.classList.add('hidden'); }
  if (e.repeat) return;
  keys[e.code] = true;
  setMove();
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') sim.input.interact = false;
  if (e.code === 'KeyF') sim.input.pulse = false;
  if (e.code === 'Space') sim.input.jump = false;
  keys[e.code] = false;
  setMove();
});

// mouse camera
let dragging = false;
let lastX = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => {
  if (dragging) {
    cameraYaw -= (e.clientX - lastX) * 0.005;
    lastX = e.clientX;
    sim.input.camYawDeg = (cameraYaw * 180) / Math.PI;
  }
});

startBtn.addEventListener('click', () => { gameStarted = true; intro.classList.add('hidden'); });
replayBtn.addEventListener('click', () => { newGame(); gameStarted = true; });

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
  carriedVal.textContent = `${p.carried}/${TUNING.carry_capacity}`;
  const lit = sim.lanterns.filter((l) => l.lit).length;
  lanternVal.textContent = `${lit}/5`;
  scoreVal.textContent = sim.scoreValue;
  const t = Math.max(0, sim.timeLeft());
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  timeVal.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let acc = 0;
const TICK = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = (now - last) / 1000;
  last = now;
  if (gameStarted && !sim.isOver()) {
    acc += Math.min(dt, 0.1);
    while (acc >= TICK && !sim.isOver()) {
      sim.step();
      acc -= TICK;
      // toast on notable events
      for (const ev of sim.events) {
        if (ev.name === 'mote_picked') toast(`✨ Nhặt đom đóm (+${TUNING.score.per_mote})`);
        else if (ev.name === 'lantern_lit') { toast('🕯️ Đèn Lồng sáng lên!'); const l = lanternData.find((x) => x.id === ev.data.lantern_id); if (l) spawnCelebration(l); }
        else if (ev.name === 'deposit') toast(`⚡ Nạp ${ev.data.amount} ánh sáng`);
        else if (ev.name === 'pulse') toast('💫 Tỏa sáng!');
        else if (ev.name === 'player_hit') toast(`💔 Mất 1 sức khỏe (${sim.player.flames})`);
        else if (ev.name === 'shade_spawned') toast('🌒 Có Bóng Mực xuất hiện!');
      }
    }
  }

  // ---- render sync
  const p = sim.player;
  playerGroup.position.set(p.pos[0], p.pos[1] - 0.00001, p.pos[2]);
  playerGroup.rotation.y = cameraYaw;
  playerLight.position.set(p.pos[0], 1.4, p.pos[2]);

  // lanterns
  for (const l of lanternData) {
    const lan = sim.lanterns.find((x) => x.id === l.id);
    const litOn = lan.lit;
    l.light.intensity = litOn ? 2.4 : 0;
    l.lanternMesh.material.emissiveIntensity = litOn ? 1 : 0;
    l.coreGlow.material.opacity = litOn ? 0.95 : 0;
    l.ring.material.opacity = litOn ? 0.22 : 0;
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

  // camera
  const ch = 3.4;
  camera.position.set(p.pos[0] - Math.sin(cameraYaw) * 12, p.pos[1] + ch, p.pos[2] - Math.cos(cameraYaw) * 12);
  camera.lookAt(p.pos[0], p.pos[1] + 1.2, p.pos[2]);
  camera.rotation.z = 0;

  sea.rotation.z += 0.0004;

  // hints
  const near = sim.lanterns.find((l) => !l.lit && Math.hypot(p.pos[0] - l.pos[0], p.pos[2] - l.pos[2]) <= TUNING.interact_radius);
  if (near) {
    const remaining = TUNING.lantern_cost - near.deposited;
    const progress = `${near.deposited}/${TUNING.lantern_cost}`;
    const depositHint = p.carried >= remaining
      ? `E — Thắp đèn (${progress})`
      : p.carried > 0
        ? `E — Nạp đèn (${progress}; đang mang ${p.carried})`
        : `E — Nạp đèn (${progress}; cần thêm ${remaining})`;
    const pulseHint = p.carried >= TUNING.pulse_cost ? '\nF — Tỏa sáng' : '';
    hintEl.textContent = depositHint + pulseHint;
    hintEl.style.opacity = 1;
  } else if (p.carried >= TUNING.pulse_cost) {
    hintEl.textContent = 'F — Tỏa sáng';
    hintEl.style.opacity = 1;
  } else {
    hintEl.style.opacity = 0;
  }

  updateHud();

  // game over
  if (sim.isOver()) {
    const won = sim.gameState === 'won';
    $('#result-title').textContent = won ? 'Hòn đảo đã sáng trở lại!' : 'Mây cần nghỉ ngơi một chút…';
    $('#result-msg').textContent = won
      ? 'Cả 5 Đèn Lồng Lớn đều rực sáng. Đảo Bến lại ấm áp và an toàn.'
      : sim.gameOverReason === 'dawn'
        ? 'Trời đã sáng. Hãy thử lại một đêm nữa nhé!'
        : 'Bóng Mực đã thắng đêm nay. Cố lên, Mây!';
    $('#result-score').textContent = sim.scoreValue;
    result.classList.remove('hidden');
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
