// Axolotl Guardian — procedural WebAudio: SFX + generative marsh music
G.audio = (function () {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let musicOn = true, started = false;
  let noiseBuf = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.85; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.38; musicGain.connect(master);
    // pre-render 1s of noise
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function now() { return ctx.currentTime; }

  function env(g, t0, a, peak, d, sustain = 0.0001) {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(sustain, t0 + a + d);
  }

  function tone(type, freq, freqEnd, dur, vol, dest, t0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; t0 = t0 || now();
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
    env(g, t0, 0.005, vol, dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  function noise(dur, vol, filterFreq, filterEnd, q = 1, t0) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    t0 = t0 || now();
    f.frequency.setValueAtTime(filterFreq, t0);
    if (filterEnd) f.frequency.exponentialRampToValueAtTime(Math.max(filterEnd, 20), t0 + dur);
    const g = ctx.createGain();
    env(g, t0, 0.008, vol, dur);
    s.connect(f); f.connect(g); g.connect(sfxGain);
    s.start(t0); s.stop(t0 + dur + 0.1);
  }

  const sfx = {
    whip() { noise(0.16, 0.5, 900, 3200, 1.6); },
    whipHit() { noise(0.1, 0.55, 500, 200, 2); tone('triangle', 300, 140, 0.12, 0.4); },
    chargeLoopTick(p) { tone('sine', 300 + 500 * p, null, 0.06, 0.12 + p * 0.12); },
    blast() { noise(0.3, 0.7, 600, 2400, 1.2); tone('sawtooth', 220, 60, 0.28, 0.35); },
    blastHit() { noise(0.22, 0.6, 400, 150, 1.5); tone('square', 180, 70, 0.18, 0.3); },
    shield() { tone('sine', 300, 700, 0.35, 0.4); tone('sine', 450, 900, 0.4, 0.25); },
    shieldPop() { noise(0.12, 0.5, 1500, 700, 2); tone('sine', 800, 300, 0.12, 0.35); },
    whirl() { noise(0.55, 0.6, 300, 1800, 1); tone('sawtooth', 90, 260, 0.5, 0.28); },
    dash() { noise(0.2, 0.45, 1200, 3000, 1.4); },
    splash() { noise(0.25, 0.4, 800, 250, 1); },
    hop() { tone('sine', 260, 420, 0.1, 0.2); },
    pearl() { const t = now(); tone('sine', 880, null, 0.1, 0.3, sfxGain, t); tone('sine', 1320, null, 0.14, 0.25, sfxGain, t + 0.07); },
    heart() { const t = now(); [523, 659, 784].forEach((f, i) => tone('sine', f, null, 0.16, 0.3, sfxGain, t + i * 0.07)); },
    hurt() { tone('square', 160, 80, 0.2, 0.4); noise(0.15, 0.4, 300, 120, 1); },
    enemyHurt() { tone('square', 220, 120, 0.12, 0.28); },
    enemyDie() { const t = now(); noise(0.3, 0.5, 600, 150, 1, t); tone('sine', 500, 900, 0.3, 0.28, sfxGain, t + 0.05); },
    crack() { noise(0.08, 0.6, 2200, 900, 3); tone('square', 700, 300, 0.07, 0.3); },
    roar() { const t = now(); tone('sawtooth', 70, 45, 0.9, 0.55, sfxGain, t); tone('sawtooth', 110, 60, 0.9, 0.4, sfxGain, t); noise(0.8, 0.4, 250, 90, 1, t); },
    zap() { const t = now(); for (let i = 0; i < 5; i++) tone('square', U.rand(800, 1800), U.rand(200, 500), 0.05, 0.22, sfxGain, t + i * 0.035); },
    spore() { tone('sine', 500, 200, 0.25, 0.3); },
    goblin() { const t = now(); tone('square', 500, 700, 0.08, 0.22, sfxGain, t); tone('square', 650, 450, 0.09, 0.22, sfxGain, t + 0.1); },
    unlock() { const t = now(); [523, 659, 784, 1046].forEach((f, i) => tone('sine', f, null, 0.35, 0.35, sfxGain, t + i * 0.11)); },
    gate() { const t = now(); tone('sine', 200, 500, 1.2, 0.4, sfxGain, t); noise(1.0, 0.3, 400, 1600, 1, t); },
    chest() { const t = now(); [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, null, 0.3, 0.3, sfxGain, t + i * 0.09)); },
    baby() { const t = now(); [700, 900, 1100].forEach((f, i) => tone('sine', f, f * 1.2, 0.15, 0.3, sfxGain, t + i * 0.09)); },
    thunder() { noise(1.6, 0.5, 120, 60, 0.8); },
    bossHit() { tone('square', 140, 70, 0.25, 0.45); noise(0.2, 0.5, 500, 180, 1.4); },
    cleanse() { const t = now(); [523, 659, 784, 1046, 1318].forEach((f, i) => tone('sine', f, null, 1.2, 0.3, sfxGain, t + i * 0.22)); },
  };

  // ---------- Generative music ----------
  // Gentle pentatonic marsh theme: pad drone + plucked melody + soft pulse.
  const SCALES = {
    calm: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25],           // C maj pentatonic
    cavern: [220.0, 261.63, 293.66, 329.63, 392.0, 440.0],          // darker A min-ish
    boss: [220.0, 246.94, 261.63, 329.63, 349.23, 440.0],           // tense
  };
  let mood = 'calm', beatTimer = null, step = 0;

  function pluck(freq, vol, t0, dur = 0.5) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.setValueAtTime(2500, t0); f.frequency.exponentialRampToValueAtTime(500, t0 + dur);
    env(g, t0, 0.01, vol, dur);
    o.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  function padChord(t0) {
    const scale = SCALES[mood];
    const root = scale[0] / 2;
    [root, root * 1.5, scale[2] / 2 * 2].forEach(f => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * (mood === 'boss' ? 0.5 : 1);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 1.5);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 7.5);
      o.connect(g); g.connect(musicGain);
      o.start(t0); o.stop(t0 + 8);
    });
  }

  function musicTick() {
    if (!musicOn || !ctx) return;
    const t = now() + 0.05;
    const scale = SCALES[mood];
    const beat = mood === 'boss' ? 0.28 : 0.42;
    if (step % 16 === 0) padChord(t);
    // bass pulse
    if (mood === 'boss' && step % 2 === 0) pluck(scale[0] / 4, 0.16, t, 0.25);
    else if (step % 4 === 0) pluck(scale[0] / 4, 0.1, t, 0.5);
    // melody: sparse random walk on pentatonic
    if (Math.random() < (mood === 'boss' ? 0.55 : 0.4)) {
      const idx = U.clamp(Math.floor(U.rand(0, scale.length)), 0, scale.length - 1);
      pluck(scale[idx] * (Math.random() < 0.2 ? 2 : 1), 0.11, t, 0.7);
    }
    step++;
    beatTimer = setTimeout(musicTick, beat * 1000);
  }

  return {
    start() {
      init();
      if (ctx.state === 'suspended') ctx.resume();
      if (!started) { started = true; musicTick(); }
    },
    play(name, ...args) { if (ctx && sfx[name]) { try { sfx[name](...args); } catch (e) {} } },
    setMood(m) { mood = m; },
    toggleMusic() {
      musicOn = !musicOn;
      if (musicOn) musicTick(); else if (beatTimer) clearTimeout(beatTimer);
      return musicOn;
    },
    duck(v) { if (musicGain) musicGain.gain.value = v ? 0.16 : 0.38; },
  };
})();
