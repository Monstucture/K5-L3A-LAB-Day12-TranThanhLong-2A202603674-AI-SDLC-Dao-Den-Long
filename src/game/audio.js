/**
 * Procedural audio (presentation only; never loaded by the headless CLI).
 * - BGM: a soft music-box melody over a warm pad and a breathing wind bed,
 *   generated from a pentatonic scale so it loops without repeating exactly.
 * - SFX: short enveloped tones and noise bursts, one recipe per game event.
 */
export function createAudio(getVolume) {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let timer = null;
  let nextNoteTime = 0;
  let step = 0;
  let night = 1;
  let noiseBuffer = null;

  // Pentatonic scales (semitones above the root) per night mood.
  const MOODS = {
    1: { root: 220, scale: [0, 2, 4, 7, 9], tempo: 0.62 },
    2: { root: 196, scale: [0, 3, 5, 7, 10], tempo: 0.55 },
    3: { root: 174.6, scale: [0, 2, 3, 7, 8], tempo: 0.5 },
  };
  const hz = (root, semis) => root * 2 ** (semis / 12);

  function env(gainNode, t, peak, attack, release) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }
  function tone(freq, t, { type = 'sine', peak = 0.2, attack = 0.01, release = 0.3, bus = master, slideTo = null, detune = 0 } = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + attack + release);
    osc.detune.value = detune;
    env(g, t, peak, attack, release);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + attack + release + 0.05);
  }
  function noise(t, { peak = 0.15, attack = 0.005, release = 0.2, freq = 1200, q = 0.8, type = 'bandpass', bus = master, slideTo = null } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t + attack + release);
    filter.Q.value = q;
    const g = ctx.createGain();
    env(g, t, peak, attack, release);
    src.connect(filter).connect(g).connect(bus);
    src.start(t);
    src.stop(t + attack + release + 0.05);
  }

  const sfx = {
    mote: (t) => { tone(1318, t, { peak: 0.16, release: 0.18 }); tone(1760, t + 0.06, { peak: 0.12, release: 0.22 }); },
    lantern: (t) => { [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.09, { type: 'triangle', peak: 0.2, release: 0.55 })); },
    pulse: (t) => { tone(300, t, { type: 'sine', peak: 0.3, release: 0.5, slideTo: 900 }); noise(t, { peak: 0.1, release: 0.4, freq: 600, slideTo: 3000 }); },
    hit: (t) => { tone(180, t, { type: 'sawtooth', peak: 0.28, release: 0.35, slideTo: 60 }); noise(t, { peak: 0.2, release: 0.25, freq: 500 }); },
    hole: (t) => { tone(420, t, { type: 'sine', peak: 0.3, release: 0.7, slideTo: 70 }); noise(t, { peak: 0.1, release: 0.5, freq: 900, slideTo: 150 }); },
    jump: (t) => { tone(330, t, { type: 'square', peak: 0.08, release: 0.16, slideTo: 620 }); },
    dash: (t) => { noise(t, { peak: 0.22, attack: 0.01, release: 0.2, freq: 1800, slideTo: 5200, q: 1.2 }); },
    win: (t) => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.14, { type: 'triangle', peak: 0.22, release: 0.8 })); },
    lose: (t) => { [392, 330, 262, 196].forEach((f, i) => tone(f, t + i * 0.22, { type: 'sawtooth', peak: 0.14, release: 0.6 })); },
    shade: (t) => { tone(110, t, { type: 'sawtooth', peak: 0.12, release: 0.9, slideTo: 82 }); tone(116, t, { type: 'sine', peak: 0.12, release: 0.9 }); },
    lunge: (t) => { noise(t, { peak: 0.16, release: 0.22, freq: 400, slideTo: 1600, q: 1.5 }); tone(150, t, { type: 'sawtooth', peak: 0.1, release: 0.2, slideTo: 260 }); },
    countdown: (t) => { tone(880, t, { type: 'square', peak: 0.1, release: 0.12 }); },
    charm: (t) => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.05, { type: 'triangle', peak: 0.16, release: 0.4 })); },
    refuel: (t) => { tone(600, t, { peak: 0.15, release: 0.2 }); tone(800, t + 0.07, { peak: 0.15, release: 0.25 }); },
    out: (t) => { tone(330, t, { type: 'triangle', peak: 0.14, release: 0.7, slideTo: 140 }); },
    trail: (t) => { tone(2200, t, { peak: 0.04, release: 0.1 }); },
  };

  function scheduleMusic() {
    const mood = MOODS[night] ?? MOODS[1];
    while (nextNoteTime < ctx.currentTime + 0.4) {
      const t = nextNoteTime;
      const beat = step % 16;
      // Pad chord at the start of every bar of 8 steps.
      if (step % 8 === 0) {
        const degree = [0, 2, 3, 1][Math.floor(step / 8) % 4];
        const base = mood.scale[degree % mood.scale.length];
        [0, 7, 12].forEach((s, i) => tone(hz(mood.root / 2, base + s), t, { type: 'sine', peak: 0.05 - i * 0.01, attack: 1.2, release: 3.2, bus: musicBus, detune: i * 4 }));
      }
      // Music-box melody: sparse random walk on the scale.
      if (Math.random() < (beat % 2 === 0 ? 0.7 : 0.35)) {
        const idx = Math.floor(Math.random() * mood.scale.length);
        const octave = Math.random() < 0.3 ? 24 : 12;
        tone(hz(mood.root, mood.scale[idx] + octave), t, { type: 'triangle', peak: 0.06, attack: 0.005, release: 1.1, bus: musicBus });
      }
      // Soft heartbeat-like low pulse every 4 steps.
      if (beat % 4 === 0) tone(hz(mood.root / 4, 0), t, { type: 'sine', peak: 0.07, attack: 0.02, release: 0.5, bus: musicBus });
      nextNoteTime += mood.tempo / 2;
      step += 1;
    }
  }

  function startWind() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(filter.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(filter).connect(g).connect(musicBus);
    src.start();
    lfo.start();
  }

  return {
    start() {
      if (!ctx) {
        ctx = new window.AudioContext();
        master = ctx.createGain();
        master.gain.value = getVolume();
        master.connect(ctx.destination);
        musicBus = ctx.createGain();
        musicBus.gain.value = 0.5;
        musicBus.connect(master);
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        startWind();
        nextNoteTime = ctx.currentTime + 0.1;
        timer = setInterval(scheduleMusic, 120);
      }
      if (ctx.state === 'suspended') ctx.resume();
    },
    setVolume(v) { if (master) master.gain.value = v; },
    setNight(n) { night = n; },
    play(name) {
      if (!ctx || getVolume() <= 0 || !sfx[name]) return;
      sfx[name](ctx.currentTime);
    },
    stop() { if (timer) clearInterval(timer); },
  };
}
