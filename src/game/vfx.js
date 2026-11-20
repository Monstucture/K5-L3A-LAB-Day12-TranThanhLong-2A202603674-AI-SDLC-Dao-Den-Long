/**
 * Cosmetic effects (presentation only). Nothing here is read by the Simulation
 * Core, and none of it is created in headless mode (the CLI never imports this file).
 */
import * as THREE from '/node_modules/three/build/three.module.js';

/** Pooled additive particles. Fading is done by dimming vertex colors (additive black = invisible). */
export function createParticles(scene, max = 700) {
  const position = new Float32Array(max * 3);
  const color = new Float32Array(max * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.PointsMaterial({
    size: 0.3,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  const parts = Array.from({ length: max }, () => ({
    life: 0, maxLife: 1, p: [0, 0, 0], v: [0, 0, 0], c: [0, 0, 0], gravity: 0, drag: 0,
  }));
  let cursor = 0;

  function emit(x, y, z, vx, vy, vz, life, rgb, { gravity = 0, drag = 0 } = {}) {
    let index = cursor;
    for (let k = 0; k < max; k++) {
      const i = (cursor + k) % max;
      if (parts[i].life <= 0) { index = i; break; }
    }
    cursor = (index + 1) % max;
    const q = parts[index];
    q.life = life;
    q.maxLife = life;
    q.p[0] = x; q.p[1] = y; q.p[2] = z;
    q.v[0] = vx; q.v[1] = vy; q.v[2] = vz;
    q.c[0] = rgb[0]; q.c[1] = rgb[1]; q.c[2] = rgb[2];
    q.gravity = gravity;
    q.drag = drag;
  }

  function update(dt) {
    for (let i = 0; i < max; i++) {
      const q = parts[i];
      if (q.life <= 0) {
        position[i * 3 + 1] = -999;
        color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = 0;
        continue;
      }
      q.life -= dt;
      const damp = Math.exp(-q.drag * dt);
      q.v[0] *= damp; q.v[1] = q.v[1] * damp - q.gravity * dt; q.v[2] *= damp;
      q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
      const fade = Math.max(0, q.life / q.maxLife);
      position[i * 3] = q.p[0]; position[i * 3 + 1] = q.p[1]; position[i * 3 + 2] = q.p[2];
      color[i * 3] = q.c[0] * fade; color[i * 3 + 1] = q.c[1] * fade; color[i * 3 + 2] = q.c[2] * fade;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  return { emit, update };
}

/** Ambient fireflies that drift over the map; only visible inside light (fog of war applies). */
export function createFireflies(scene, count, sampleSpot) {
  const base = [];
  for (let i = 0; i < count; i++) base.push(sampleSpot(i));
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  function update(time) {
    for (let i = 0; i < count; i++) {
      const [x, y, z] = base[i];
      const phase = i * 1.7;
      position[i * 3] = x + Math.sin(time * 0.4 + phase) * 1.2;
      position[i * 3 + 1] = y + Math.sin(time * 0.7 + phase * 0.5) * 0.6;
      position[i * 3 + 2] = z + Math.cos(time * 0.35 + phase) * 1.2;
      const blink = 0.45 + 0.55 * Math.max(0, Math.sin(time * 2.1 + phase * 3));
      color[i * 3] = 1.0 * blink;
      color[i * 3 + 1] = 0.95 * blink;
      color[i * 3 + 2] = 0.55 * blink;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  return { update, points };
}
