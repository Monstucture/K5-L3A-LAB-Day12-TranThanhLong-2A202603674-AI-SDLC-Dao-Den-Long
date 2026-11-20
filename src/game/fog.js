/**
 * Fog of war (presentation only). Every fogged material is darkened unless it
 * lies within the radius of a light source (Mây's lantern, lit Đèn Lồng, the
 * Đài Ánh Sáng, drifting motes). Only light shines through the mist.
 *
 * Implemented by overriding three.js fog shader chunks, so all built-in
 * materials pick it up without per-material edits. Light data is shared
 * through uniform objects, so updating them each frame costs nothing extra.
 */
import * as THREE from '/node_modules/three/build/three.module.js';

export const FOW_MAX = 16;

export const fowUniforms = {
  uFowLight: { value: Array.from({ length: FOW_MAX }, () => new THREE.Vector4()) },
  uFowCount: { value: 0 },
  uFowColor: { value: new THREE.Color(0x070b1c) },
  uFowTime: { value: 0 },
};

// Feed the shared uniforms into every material that is compiled.
THREE.Material.prototype.onBeforeCompile = function onBeforeCompile(shader) {
  Object.assign(shader.uniforms, fowUniforms);
};

const C = THREE.ShaderChunk;
C.fog_pars_vertex = `#ifdef USE_FOG
varying float vFogDepth;
varying vec3 vFowWorld;
#endif`;
C.fog_vertex = `#ifdef USE_FOG
vFogDepth = - mvPosition.z;
vec4 fowP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
fowP = instanceMatrix * fowP;
#endif
vFowWorld = (modelMatrix * fowP).xyz;
#endif`;
C.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor;
varying float vFogDepth;
varying vec3 vFowWorld;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear;
uniform float fogFar;
#endif
uniform vec4 uFowLight[${FOW_MAX}];
uniform int uFowCount;
uniform vec3 uFowColor;
uniform float uFowTime;
float fowVisibility(vec3 p) {
  float v = 0.0;
  for (int i = 0; i < ${FOW_MAX}; i++) {
    if (i >= uFowCount) break;
    vec4 L = uFowLight[i];
    float d = length((p - L.xyz) * vec3(1.0, 0.6, 1.0));
    v = max(v, 1.0 - smoothstep(L.w * 0.5, L.w, d));
  }
  return v;
}
#endif`;
C.fog_fragment = `#ifdef USE_FOG
#ifdef FOG_EXP2
float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
#else
float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
#endif
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
float fowMist = 0.92 + 0.08 * sin(vFowWorld.x * 0.8 + uFowTime) * sin(vFowWorld.z * 0.7 - uFowTime * 0.6);
gl_FragColor.rgb = mix(uFowColor * fowMist, gl_FragColor.rgb, fowVisibility(vFowWorld));
#endif`;

/** lights: array of [x, y, z, radius]. Extra entries beyond FOW_MAX are ignored. */
export function setFowLights(lights, time) {
  const n = Math.min(lights.length, FOW_MAX);
  for (let i = 0; i < n; i++) fowUniforms.uFowLight.value[i].set(...lights[i]);
  fowUniforms.uFowCount.value = n;
  fowUniforms.uFowTime.value = time;
}
