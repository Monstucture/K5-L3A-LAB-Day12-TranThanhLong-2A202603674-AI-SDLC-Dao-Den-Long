/**
 * HD-2D look (presentation only): soft bloom, tilt-shift depth of field and a
 * gentle colour grade over the 3D diorama, with pixel-art billboards on top.
 */
import * as THREE from '/node_modules/three/build/three.module.js';
import { EffectComposer } from '/node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '/node_modules/three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '/node_modules/three/examples/jsm/postprocessing/OutputPass.js';

const TiltShift = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uFocus: { value: 0.52 }, // vertical screen position that stays sharp
    uBand: { value: 0.16 }, // half-height of the sharp band
    uBlur: { value: 2.6 }, // max blur radius in pixels
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uFocus, uBand, uBlur;
    varying vec2 vUv;
    void main(){
      float away = max(0.0, abs(vUv.y - uFocus) - uBand);
      float radius = uBlur * smoothstep(0.0, 0.35, away);
      vec3 sum = texture2D(tDiffuse, vUv).rgb; float w = 1.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5236 * 2.0 + 0.3;
        float rr = radius * (0.35 + 0.65 * fract(float(i) * 0.618));
        vec2 off = vec2(cos(a), sin(a)) * rr / uResolution;
        sum += texture2D(tDiffuse, vUv + off).rgb; w += 1.0;
      }
      vec3 col = sum / w;
      // warm, slightly lifted grade + vignette
      col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.12);
      col *= vec3(1.03, 1.0, 0.96);
      float v = smoothstep(1.05, 0.35, length((vUv - 0.5) * vec2(1.15, 1.0)));
      col *= mix(0.62, 1.0, v);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createFx(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.6, 0.78);
  composer.addPass(bloom);
  const tilt = new ShaderPass(TiltShift);
  composer.addPass(tilt);
  composer.addPass(new OutputPass());

  const fx = {
    enabled: true,
    render() {
      if (fx.enabled) composer.render();
      else renderer.render(scene, camera);
    },
    resize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w / 2, h / 2);
      tilt.uniforms.uResolution.value.set(w, h);
    },
  };
  fx.resize(size.x, size.y);
  return fx;
}

/** Build a crisp pixel-art texture from string rows. palette maps a char to a CSS colour; '.' is clear. */
export function pixelTexture(rows, palette, scale = 1) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = palette[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { w, h };
  return tex;
}

const center = (str, width) => {
  const pad = Math.max(0, width - str.length);
  return '.'.repeat(Math.floor(pad / 2)) + str + '.'.repeat(Math.ceil(pad / 2));
};

/** Mây: conical hat, red scarf, cream robe, tiny lantern. Two walk frames. */
export function makePlayerTextures() {
  const W = 16;
  const top = ['HH', 'hhhh', 'hhhhhh', 'hhhhhhhh', 'hhhhhhhhhh', 'HHHHHHHHHHHH', 'ssssss', 'sesses', 'ssssss', 'rrrrrrrr', 'rrrrrrrrrr']
    .map((r) => center(r, W));
  const robe = ['wwwwwwwwww', 'wwwwwwwwwwww', 'wwWwwwwwwWww', 'wwwwwwwwwwww', 'WwwwwwwwwwwW', 'WWWWWWWWWWWW'].map((r) => center(r, W));
  const palette = { H: '#8a6a3a', h: '#d8b06a', s: '#f2ccb0', e: '#2a1f2a', r: '#c8102e', w: '#e8e2d0', W: '#b9b29c', k: '#3b2a22', l: '#ffcf6b', L: '#ffe9b0' };
  const frame = (feet) => {
    const rows = [...top, ...robe, center(feet, W)];
    // hanging lantern at the right hip
    const put = (y, x, ch) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
    put(12, 14, 'l'); put(13, 14, 'L'); put(11, 14, 'k');
    return pixelTexture(rows, palette);
  };
  return [frame('kkk..kkk'), frame('.kk..kk.')];
}

/** Bóng Mực: round ink blob with a drip on top; accent is the outline/eye colour. */
export function makeShadeTexture(accent, body) {
  const N = 16;
  const rows = [];
  for (let y = 0; y < N; y++) {
    let row = '';
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5;
      const dy = (y - 9) * 1.1;
      const d = Math.hypot(dx, dy);
      let ch = '.';
      if (d <= 6.2) ch = 'b';
      if (d > 5.0 && d <= 6.2) ch = 'p';
      if (y >= 1 && y <= 3 && Math.abs(dx) < (y === 1 ? 0.6 : 1.4) + (y - 1) * 0.3) ch = 'p'; // drip
      row += ch;
    }
    rows.push(row);
  }
  const put = (y, x) => { rows[y] = rows[y].slice(0, x) + 'p' + rows[y].slice(x + 1); };
  put(8, 5); put(9, 5); put(8, 10); put(9, 10); // eyes
  rows[12] = rows[12].slice(0, 6) + 'pppp' + rows[12].slice(10); // little mouth
  return pixelTexture(rows, { b: body, p: accent });
}
