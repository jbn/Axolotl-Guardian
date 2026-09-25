// Axolotl Guardian — procedural WebAudio: layered SFX, generative phrase-based music,
// convolution reverb, ambient beds. No audio files — everything is synthesized.
//
// Graph:  sfx/music/amb buses → master → compressor → lowpass (underwater) → out
//                     └── per-voice sends → reverb (procedural IR) → master
G.audio = (function () {
  let ctx = null, master = null, comp = null, lowpass = null;
  let sfxGain = null, musicGain = null, ambGain = null, reverbIn = null, reverbOut = null;
  let musicOn = true, started = false, underwater = false, ducked = false;
  let noiseBuf = null, schedTimer = null;
  const MUSIC_VOL = 0.34, MUSIC_DUCK = 0.13;

  // ---------------------------------------------------------------- setup
  function makeIR(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // one-pole lowpass on the tail so it darkens as it decays
        const k = 0.35 + 0.6 * (1 - t);
        lp = lp + k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, decay) * (i < 90 ? i / 90 : 1);
      }
    }
    return ir;
  }

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 21000;
    lowpass.connect(ctx.destination);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(lowpass);
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.85; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = MUSIC_VOL; musicGain.connect(master);
    ambGain = ctx.createGain(); ambGain.gain.value = 0.7; ambGain.connect(master);
    // reverb send bus
    reverbIn = ctx.createGain(); reverbIn.gain.value = 1;
    const conv = ctx.createConvolver();
    conv.buffer = makeIR(2.8, 2.6);
    reverbOut = ctx.createGain(); reverbOut.gain.value = 0.4;
    reverbIn.connect(conv); conv.connect(reverbOut); reverbOut.connect(master);
    // 2s of white noise, shared by every noise voice
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buildAmbience();
  }

  const now = () => ctx.currentTime;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function cleanup(nodes) { for (const n of nodes) { try { n.disconnect(); } catch (e) {} } }

  // gain envelope: percussive (exp decay) or held (attack / hold / release)
  function envelope(g, t0, o) {
    const p = g.gain;
    p.setValueAtTime(0.0001, t0);
    if (o.hold) {
      const rel = Math.min(o.release || 0.3, o.dur * 0.6);
      p.linearRampToValueAtTime(o.vol, t0 + o.attack);
      p.setValueAtTime(o.vol, Math.max(t0 + o.attack, t0 + o.dur - rel));
      p.linearRampToValueAtTime(0.0001, t0 + o.dur);
    } else {
      p.exponentialRampToValueAtTime(Math.max(o.vol, 0.0002), t0 + o.attack);
      p.exponentialRampToValueAtTime(0.0001, t0 + o.attack + o.dur);
    }
  }

  // Generic oscillator voice.
  // o: type freq freqEnd t0 dur vol attack hold release dest rev detune vib filter{type,freq,end,q}
  function voice(o) {
    const t0 = o.t0 !== undefined ? o.t0 : now();
    o.attack = o.attack || 0.005;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(o.freqEnd, 1), t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const nodes = [osc];
    let tail = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type || 'lowpass';
      f.frequency.setValueAtTime(o.filter.freq, t0);
      if (o.filter.end) f.frequency.exponentialRampToValueAtTime(o.filter.end, t0 + o.dur);
      if (o.filter.q) f.Q.value = o.filter.q;
      tail.connect(f); tail = f; nodes.push(f);
    }
    const g = ctx.createGain(); nodes.push(g);
    envelope(g, t0, o);
    tail.connect(g); g.connect(o.dest || sfxGain);
    if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(reverbIn); nodes.push(s); }
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.2; lg.gain.value = o.freq * o.vib;
      l.connect(lg); lg.connect(osc.frequency);
      l.start(t0); l.stop(t0 + o.attack + o.dur + 0.2);
      nodes.push(l, lg);
    }
    osc.start(t0);
    osc.stop(t0 + o.attack + o.dur + 0.15);
    osc.onended = () => cleanup(nodes);
  }

  // Filtered-noise voice. o: dur vol freq end q type t0 attack hold dest rev
  function noise(o) {
    const t0 = o.t0 !== undefined ? o.t0 : now();
    o.attack = o.attack || 0.006;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.end) f.frequency.exponentialRampToValueAtTime(Math.max(o.end, 20), t0 + o.dur);
    const g = ctx.createGain();
    envelope(g, t0, o);
    s.connect(f); f.connect(g); g.connect(o.dest || sfxGain);
    const nodes = [s, f, g];
    if (o.rev) { const r = ctx.createGain(); r.gain.value = o.rev; g.connect(r); r.connect(reverbIn); nodes.push(r); }
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + o.attack + o.dur + 0.1);
    s.onended = () => cleanup(nodes);
  }

  // short-hand tone/noise matching the old signatures
  function tone(type, freq, freqEnd, dur, vol, t0, extra) {
    voice(Object.assign({ type, freq, freqEnd, dur, vol, t0 }, extra));
  }

  // ---------------------------------------------------------------- instruments
  function bell(f, t0, vol, dest, len = 2.2, rev = 0.55) {
    voice({ freq: f, t0, dur: len, vol, dest, rev, attack: 0.003 });
    voice({ freq: f * 2.76, t0, dur: len * 0.45, vol: vol * 0.35, dest, rev, attack: 0.002 });
    voice({ freq: f * 5.4, t0, dur: len * 0.22, vol: vol * 0.16, dest, rev, attack: 0.002 });
    voice({ freq: f * 1.003, t0, dur: len * 0.8, vol: vol * 0.4, dest, attack: 0.003 });
  }
  function pluck(f, t0, vol, dest, len = 0.6, rev = 0.25) {
    voice({ type: 'triangle', freq: f, t0, dur: len, vol, dest, rev, filter: { freq: 3200, end: 420 } });
  }
  function marimba(f, t0, vol, dest, rev = 0.2) {
    voice({ freq: f, t0, dur: 0.55, vol, dest, rev, attack: 0.002 });
    voice({ freq: f * 3.98, t0, dur: 0.07, vol: vol * 0.35, dest, attack: 0.001 });
    voice({ freq: f * 10, t0, dur: 0.02, vol: vol * 0.12, dest, attack: 0.001 });
  }
  function pad(freqs, t0, dur, vol, dest, bright = 900, rev = 0.5) {
    for (const f of freqs) {
      for (const dt of [-8, 8]) {
        voice({ type: 'sawtooth', freq: f, detune: dt, t0, dur, vol: vol / freqs.length, dest, rev,
          attack: Math.min(1.2, dur * 0.35), hold: true, release: Math.min(1.6, dur * 0.4),
          filter: { freq: bright, q: 0.5 } });
      }
    }
  }
  function bassNote(f, t0, dur, vol, dest) {
    voice({ type: 'triangle', freq: f, t0, dur, vol, dest, hold: true, attack: 0.01, release: dur * 0.5, filter: { freq: 700 } });
    voice({ freq: f / 2, t0, dur, vol: vol * 0.5, dest, hold: true, attack: 0.01, release: dur * 0.5 });
  }
  function flute(f, t0, dur, vol, dest) {
    voice({ freq: f, t0, dur, vol, dest, rev: 0.45, hold: true, attack: 0.07, release: dur * 0.4, vib: 0.006 });
    voice({ type: 'triangle', freq: f * 2, t0, dur, vol: vol * 0.12, dest, hold: true, attack: 0.08, release: dur * 0.4 });
    noise({ freq: f * 2, q: 6, dur: dur * 0.5, vol: vol * 0.05, t0, dest, hold: true, attack: 0.05 });
  }
  function lead(f, t0, dur, vol, dest) {
    voice({ type: 'sawtooth', freq: f, t0, dur, vol, dest, rev: 0.25, hold: true, attack: 0.015, release: dur * 0.35, vib: 0.004,
      filter: { freq: 2600, end: 900, q: 2 } });
    voice({ type: 'square', freq: f / 2, t0, dur, vol: vol * 0.3, dest, hold: true, attack: 0.02, release: dur * 0.35, filter: { freq: 1200 } });
  }
  function kick(t0, vol, dest) {
    voice({ freq: 155, freqEnd: 42, t0, dur: 0.32, vol, dest, attack: 0.002 });
    noise({ freq: 3000, q: 0.8, dur: 0.02, vol: vol * 0.25, t0, dest });
  }
  function snare(t0, vol, dest) {
    noise({ type: 'highpass', freq: 1400, dur: 0.17, vol, t0, dest, rev: 0.2 });
    voice({ type: 'triangle', freq: 200, freqEnd: 120, t0, dur: 0.1, vol: vol * 0.8, dest });
  }
  function hat(t0, vol, dest, open) {
    noise({ type: 'highpass', freq: 7000, dur: open ? 0.22 : 0.035, vol, t0, dest, attack: 0.001 });
  }
  function click(t0, vol, dest, f = 1600) {
    noise({ freq: f, q: 4, dur: 0.04, vol, t0, dest, attack: 0.001 });
  }
  function taiko(t0, vol, dest) {
    voice({ freq: 95, freqEnd: 38, t0, dur: 0.7, vol, dest, rev: 0.4, attack: 0.003 });
    noise({ type: 'lowpass', freq: 400, dur: 0.15, vol: vol * 0.4, t0, dest });
  }

  // ---------------------------------------------------------------- SFX
  let pv = 1;                          // per-trigger pitch variation
  const P = f => f * pv;
  const sfx = {
    whip() {
      noise({ freq: P(900), end: P(3200), q: 1.6, dur: 0.16, vol: 0.42 });
      tone('sine', P(520), P(240), 0.08, 0.08);
    },
    whipHit() {
      noise({ freq: P(520), end: 200, q: 2, dur: 0.1, vol: 0.5 });
      tone('triangle', P(300), P(140), 0.12, 0.38);
      click(now(), 0.25, sfxGain, 2400);
    },
    combo2() {
      noise({ freq: P(700), end: 240, q: 2, dur: 0.12, vol: 0.5 });
      tone('triangle', P(380), P(170), 0.13, 0.42);
      bell(P(1175), now(), 0.08, sfxGain, 0.35, 0.3);
    },
    combo3() {
      const t = now();
      voice({ freq: P(170), freqEnd: 48, t0: t, dur: 0.3, vol: 0.65 });
      noise({ freq: P(1300), end: 280, q: 1.3, dur: 0.28, vol: 0.5, t0: t });
      bell(P(1568), t + 0.02, 0.1, sfxGain, 0.6, 0.45);
      bell(P(2093), t + 0.07, 0.07, sfxGain, 0.5, 0.45);
    },
    crit() {
      const t = now();
      voice({ freq: 180, freqEnd: 40, t0: t, dur: 0.4, vol: 0.75 });
      noise({ type: 'highpass', freq: 3000, dur: 0.25, vol: 0.35, t0: t, rev: 0.3 });
      for (let i = 0; i < 5; i++) tone('sine', rnd(2200, 5200), null, rnd(0.06, 0.18), 0.07, t + i * 0.018);
      [1046, 1318, 1568].forEach((f, i) => bell(P(f), t + 0.04 + i * 0.03, 0.07, sfxGain, 0.9, 0.5));
    },
    lockOn() {
      const t = now();
      tone('sine', 1200, null, 0.05, 0.14, t);
      tone('sine', 1800, null, 0.08, 0.12, t + 0.05, { rev: 0.2 });
    },
    lowHealth() {
      const t = now();
      voice({ freq: 72, freqEnd: 48, t0: t, dur: 0.14, vol: 0.55, filter: { freq: 300 } });
      voice({ freq: 66, freqEnd: 44, t0: t + 0.19, dur: 0.14, vol: 0.38, filter: { freq: 300 } });
    },
    pickupChain(n = 0) {
      const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
      const f = 880 * Math.pow(2, steps[Math.min(Math.max(0, n | 0), steps.length - 1)] / 12);
      bell(f, now(), 0.13, sfxGain, 0.7, 0.35);
      tone('sine', f * 1.5, null, 0.12, 0.05, now() + 0.04);
    },
    footstep() {
      noise({ freq: P(700), q: 1.5, dur: 0.06, vol: 0.12 });
      tone('sine', P(180), P(120), 0.05, 0.06);
    },
    bubble() {
      tone('sine', P(420), P(1150), 0.07, 0.12, undefined, { rev: 0.3 });
    },
    victory() {
      const t = now();
      [523, 659, 784, 1046].forEach((f, i) => {
        voice({ type: 'triangle', freq: f, t0: t + i * 0.13, dur: 0.3, vol: 0.28, rev: 0.4 });
        voice({ type: 'square', freq: f, t0: t + i * 0.13, dur: 0.2, vol: 0.06, filter: { freq: 2500 } });
      });
      const tc = t + 0.55;
      [523, 659, 784, 1046, 1318].forEach(f => voice({ type: 'triangle', freq: f, t0: tc, dur: 1.4, vol: 0.14, rev: 0.5, hold: true, attack: 0.02, release: 1 }));
      bell(2093, tc, 0.1, sfxGain, 2, 0.6);
      snare(tc, 0.25, sfxGain);
    },
    chargeLoopTick(p = 0) { tone('sine', 300 + 500 * p, null, 0.06, 0.1 + p * 0.1); },
    blast() {
      noise({ freq: P(600), end: P(2400), q: 1.2, dur: 0.3, vol: 0.55, rev: 0.15 });
      tone('sawtooth', P(220), 60, 0.28, 0.26, undefined, { filter: { freq: 1800, end: 300 } });
      tone('sine', P(120), 50, 0.3, 0.4);
    },
    blastHit() {
      noise({ freq: P(420), end: 150, q: 1.5, dur: 0.22, vol: 0.55 });
      tone('square', P(180), 70, 0.18, 0.2, undefined, { filter: { freq: 1400 } });
      noise({ type: 'highpass', freq: 2500, dur: 0.15, vol: 0.18 });
    },
    shield() {
      const t = now();
      tone('sine', 300, 700, 0.35, 0.32, t);
      tone('sine', 450, 900, 0.4, 0.2, t);
      bell(1318, t + 0.1, 0.06, sfxGain, 1, 0.6);
      bell(1760, t + 0.18, 0.05, sfxGain, 1, 0.6);
    },
    shieldPop() {
      noise({ freq: P(1500), end: 700, q: 2, dur: 0.12, vol: 0.45 });
      tone('sine', P(800), 300, 0.12, 0.28);
    },
    whirl() {
      noise({ freq: 300, end: 1800, q: 1, dur: 0.55, vol: 0.5, rev: 0.25 });
      noise({ freq: 1800, end: 400, q: 3, dur: 0.5, vol: 0.2 });
      tone('sawtooth', 90, 260, 0.5, 0.2, undefined, { filter: { freq: 1200 } });
    },
    dash() {
      noise({ freq: P(1200), end: 3000, q: 1.4, dur: 0.2, vol: 0.4 });
      noise({ freq: 3000, end: 700, q: 1.2, dur: 0.12, vol: 0.15 });
    },
    splash() {
      const t = now();
      noise({ type: 'lowpass', freq: P(1400), end: 250, dur: 0.28, vol: 0.4, t0: t });
      noise({ type: 'highpass', freq: 3500, dur: 0.12, vol: 0.12, t0: t });
      for (let i = 0; i < 3; i++) tone('sine', rnd(500, 900), rnd(1100, 1600), 0.05, 0.07, t + 0.06 + i * rnd(0.03, 0.07));
    },
    hop() { tone('sine', P(260), P(420), 0.1, 0.18); },
    pearl() {
      const f = P(1760);
      bell(f, now(), 0.1, sfxGain, 0.8, 0.4);
      voice({ freq: f * 1.5, detune: 6, t0: now() + 0.05, dur: 0.25, vol: 0.06, rev: 0.4 });
    },
    heart() {
      const t = now();
      [523, 659, 784].forEach((f, i) => tone('sine', f, null, 0.18, 0.26, t + i * 0.07, { rev: 0.3 }));
      bell(1568, t + 0.21, 0.07, sfxGain, 0.8);
    },
    hurt() {
      const t = now();
      voice({ freq: 150, freqEnd: 45, t0: t, dur: 0.25, vol: 0.6 });
      noise({ type: 'lowpass', freq: 500, dur: 0.12, vol: 0.4, t0: t });
      voice({ type: 'triangle', freq: P(880), freqEnd: P(1350), t0: t + 0.03, dur: 0.12, vol: 0.14 });
    },
    enemyHurt() {
      tone('square', P(220), P(120), 0.12, 0.2, undefined, { filter: { freq: 1600 } });
      noise({ freq: P(900), q: 2, dur: 0.06, vol: 0.2 });
    },
    enemyDie() {
      const t = now();
      noise({ type: 'highpass', freq: 3000, dur: 0.3, vol: 0.28, t0: t, rev: 0.3 });
      noise({ freq: 600, end: 150, dur: 0.25, vol: 0.35, t0: t });
      for (let i = 0; i < 6; i++) tone('sine', rnd(2000, 5200), null, rnd(0.06, 0.2), 0.06, t + i * rnd(0.012, 0.03));
      [1046, 1318, 1568].forEach((f, i) => bell(P(f), t + 0.12 + i * 0.07, 0.07, sfxGain, 0.9, 0.5));
    },
    crack() {
      noise({ freq: P(2200), end: 900, q: 3, dur: 0.08, vol: 0.55 });
      tone('square', P(700), 300, 0.07, 0.2, undefined, { filter: { freq: 2500 } });
    },
    roar() {
      const t = now();
      tone('sawtooth', 70 * pv, 45, 0.95, 0.5, t, { filter: { freq: 700, end: 250 }, vib: 0.03, rev: 0.4 });
      tone('sawtooth', 110 * pv, 60, 0.9, 0.35, t, { filter: { freq: 900, end: 300 }, vib: 0.04 });
      noise({ freq: 250, end: 90, dur: 0.85, vol: 0.4, t0: t, rev: 0.3 });
    },
    zap() {
      const t = now();
      for (let i = 0; i < 6; i++) tone('square', rnd(800, 1900), rnd(200, 500), 0.05, 0.16, t + i * 0.032, { filter: { freq: 3500 } });
      noise({ type: 'highpass', freq: 4000, dur: 0.2, vol: 0.14, t0: t });
    },
    spore() {
      tone('sine', P(500), 200, 0.25, 0.26);
      noise({ freq: 800, end: 300, q: 4, dur: 0.2, vol: 0.12 });
    },
    goblin() {
      const t = now();
      tone('square', P(500), P(720), 0.08, 0.16, t, { filter: { freq: 2200 } });
      tone('square', P(660), P(450), 0.09, 0.16, t + 0.1, { filter: { freq: 2200 } });
    },
    unlock() {
      const t = now();
      [523, 659, 784, 1046, 1318].forEach((f, i) => {
        voice({ type: 'triangle', freq: f, t0: t + i * 0.1, dur: 0.45, vol: 0.24, rev: 0.45 });
        bell(f * 2, t + i * 0.1, 0.04, sfxGain, 0.6);
      });
      pad([261.6, 329.6, 392, 523.3], t + 0.45, 2.0, 0.22, sfxGain, 2200, 0.6);
    },
    gate() {
      const t = now();
      [98, 147, 196, 247, 294].forEach(f => voice({ type: 'sawtooth', freq: f, t0: t, dur: 2.0, vol: 0.07, rev: 0.6,
        hold: true, attack: 0.9, release: 0.9, filter: { freq: 200, end: 2400, q: 3 } }));
      noise({ freq: 400, end: 1800, dur: 1.4, vol: 0.2, t0: t, hold: true, attack: 0.8, release: 0.5, rev: 0.5 });
      bell(784, t + 1.1, 0.14, sfxGain, 2.5, 0.7);
      bell(1175, t + 1.25, 0.1, sfxGain, 2.5, 0.7);
    },
    chest() {
      const t = now();
      [392, 523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, null, 0.3, 0.24, t + i * 0.08, { rev: 0.35 }));
      for (let i = 0; i < 6; i++) bell(rnd(2000, 3500), t + 0.35 + i * 0.05, 0.03, sfxGain, 0.4);
    },
    baby() {
      const t = now();
      [700, 900, 1100].forEach((f, i) => tone('sine', f * pv, f * 1.25 * pv, 0.14, 0.24, t + i * 0.09, { rev: 0.3, vib: 0.02 }));
    },
    thunder() {
      const t = now();
      noise({ type: 'highpass', freq: 1500, dur: 0.12, vol: 0.2, t0: t });
      noise({ type: 'lowpass', freq: 220, end: 60, dur: 2.2, vol: 0.55, t0: t + 0.05, rev: 0.6 });
      voice({ freq: 45, freqEnd: 30, t0: t, dur: 1.6, vol: 0.35 });
    },
    bossHit() {
      const t = now();
      tone('square', P(140), 70, 0.25, 0.32, t, { filter: { freq: 1500 } });
      noise({ freq: 500, end: 180, q: 1.4, dur: 0.2, vol: 0.45, t0: t });
      voice({ freq: 110, freqEnd: 40, t0: t, dur: 0.25, vol: 0.5 });
    },
    cleanse() {
      const t = now();
      [523, 659, 784, 1046, 1318].forEach((f, i) => bell(f, t + i * 0.22, 0.12, sfxGain, 2.4, 0.7));
      pad([261.6, 392, 523.3, 659.3], t, 3.5, 0.2, sfxGain, 1800, 0.7);
    },
  };

  // ---------------------------------------------------------------- music
  // Scales as semitone offsets; chords as scale-degree roots (triads stacked in-scale).
  const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
  const DORIAN = [0, 2, 3, 5, 7, 9, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10], HARM = [0, 2, 3, 5, 7, 8, 11];
  const MOODS = {
    calm:   { bpm: 84,  root: 53, scale: MAJOR,  prog: [0, 5, 3, 4],       mel: [0, 1, 2, 4, 5, 7, 8, 9, 11], space: 0.4 },
    forest: { bpm: 104, root: 55, scale: MAJOR,  prog: [0, 3, 5, 4],       mel: [0, 1, 2, 4, 5, 7, 8, 9],     space: 0.35 },
    cavern: { bpm: 60,  root: 57, scale: MINOR,  prog: [0, 5, 3, 6],       mel: [0, 2, 3, 4, 7, 9, 10, 11],   space: 0.75 },
    ruins:  { bpm: 76,  root: 50, scale: DORIAN, prog: [0, 3, 0, 6],       mel: [0, 1, 2, 3, 4, 5, 7, 8, 9],  space: 0.5 },
    temple: { bpm: 68,  root: 52, scale: PHRYG,  prog: [0, 1, 0, 6],       mel: [0, 1, 2, 4, 7, 8, 9],        space: 0.75 },
    boss:   { bpm: 140, root: 45, scale: HARM,   prog: [0, 5, 3, 4],       mel: [0, 1, 2, 3, 4, 5, 7, 8, 9],  space: 0.3 },
  };
  let moodName = 'calm', M = MOODS.calm, pendingMood = null;
  let moodBus = null;                  // per-mood gain → musicGain, for crossfades
  let nextTime = 0, step = 0, bar = 0;
  let motifA = null, motifB = null;

  function deg2semi(d) {
    const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
    return o * 12 + M.scale[i];
  }
  function noteF(d, oct = 0) { return mtof(M.root + deg2semi(d) + oct * 12); }
  function chordDegs(ch) { return [ch, ch + 2, ch + 4]; }

  // A motif spans 2 bars (32 sixteenths): onsets with pitch indices into M.mel
  function genMotif() {
    const rhythms = [
      [0, 4, 6, 8, 12, 16, 20, 24],
      [0, 3, 6, 8, 12, 14, 16, 24],
      [0, 2, 4, 8, 10, 12, 16, 22, 24],
      [0, 6, 8, 12, 16, 18, 20, 24],
      [0, 4, 8, 11, 12, 16, 24],
    ];
    const r = rhythms[Math.floor(Math.random() * rhythms.length)];
    const notes = [];
    let idx = Math.floor(M.mel.length / 2);
    for (let k = 0; k < r.length; k++) {
      const next = k + 1 < r.length ? r[k + 1] : 32;
      idx = Math.max(0, Math.min(M.mel.length - 1, idx + Math.round(rnd(-2.2, 2.2))));
      if (Math.random() < 0.12 && k > 0) continue; // occasional rest
      notes.push({ s: r[k], i: idx, d: Math.max(1, next - r[k]) });
    }
    return notes;
  }
  function vary(motif, amount) {
    return motif.map((n, k) => {
      if (Math.random() > amount || k === 0) return n;
      return { s: n.s, d: n.d, i: Math.max(0, Math.min(M.mel.length - 1, n.i + (Math.random() < 0.5 ? -1 : 1))) };
    });
  }
  let phraseMotifs = [];
  function planPhrase() {
    // 8-bar phrase: A A' B A''   (each motif = 2 bars); fresh material every other phrase
    if (!motifA || Math.random() < 0.5) motifA = genMotif();
    motifB = genMotif();
    const end = vary(motifA, 0.3);
    if (end.length) end[end.length - 1] = Object.assign({}, end[end.length - 1], { i: 0 }); // resolve home
    phraseMotifs = [motifA, vary(motifA, 0.35), motifB, end];
  }

  function newMoodBus(fadeIn, t) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(fadeIn ? 0.0001 : 1, t);
    if (fadeIn) g.gain.linearRampToValueAtTime(1, t + 1.5);
    g.connect(musicGain);
    return g;
  }
  function switchMood(name, t) {
    if (moodBus) {
      const old = moodBus;
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value || 1, t);
      old.gain.linearRampToValueAtTime(0.0001, t + 1.6);
      setTimeout(() => cleanup([old]), 4500);
    }
    moodName = name; M = MOODS[name];
    moodBus = newMoodBus(true, t);
    bar = 0; step = 0; motifA = null;
    planPhrase();
    updateSpace();
  }

  function scheduleStep(s, t) {
    const d = moodBus, sx = 60 / M.bpm / 4;          // sixteenth length
    const ch = M.prog[bar % M.prog.length];
    const cd = chordDegs(ch);
    const motif = phraseMotifs[Math.floor((bar % 8) / 2)];
    const ms = (bar % 2) * 16 + s;
    const mnote = motif && motif.find(n => n.s === ms);
    const mf = mnote ? noteF(M.mel[mnote.i], 1) : 0;
    const mdur = mnote ? mnote.d * sx : 0;

    switch (moodName) {
      case 'calm':
        if (s === 0) pad(cd.map(x => noteF(x, 0)), t, sx * 16 + 0.6, 0.11, d, 1000);
        if (s === 0) bassNote(noteF(ch, -1), t, sx * 7, 0.16, d);
        if (s === 8) bassNote(noteF(ch + 4, -1), t, sx * 7, 0.12, d);
        if (s % 4 === 2) pluck(noteF(cd[(s >> 2) % 3], 0), t, 0.05, d, 0.5);
        if (s % 2 === 0 && bar % 4 >= 2) hat(t, 0.012 + (s % 4 === 0 ? 0.008 : 0), d);
        if (mnote) { pluck(mf, t, 0.12, d, Math.min(1.2, mdur + 0.2)); marimba(mf, t, 0.04, d); }
        break;
      case 'forest': {
        if (s === 0) pad(cd.map(x => noteF(x, 0)), t, sx * 16, 0.06, d, 1400);
        const arp = [0, 1, 2, 1, 0, 2, 1, 2];
        if (s % 2 === 0) marimba(noteF(cd[arp[s >> 1]], 0), t, 0.06, d);
        if (s === 0 || s === 6 || s === 8 || s === 14) pluck(noteF(ch, -1), t, 0.13, d, 0.3, 0.05);
        if (s === 4 || s === 12) click(t, 0.1, d, 1500);
        if (s === 10 && Math.random() < 0.5) click(t, 0.06, d, 2200);
        if (mnote) marimba(mf, t, 0.15, d, 0.3);
        break;
      }
      case 'cavern':
        if (s === 0 && bar % 2 === 0) pad(cd.map(x => noteF(x, -1)), t, sx * 32 + 1, 0.08, d, 600, 0.7);
        if (s === 0) bassNote(noteF(ch, -2), t, sx * 15, 0.1, d);
        if (s === 0 || (s === 8 && Math.random() < 0.35)) bell(noteF(cd[Math.floor(Math.random() * 3)], 2), t, 0.035, d, 3.5, 0.9);
        if (mnote && Math.random() < 0.7) bell(mf, t, 0.06, d, 2.8, 0.8);
        break;
      case 'ruins':
        if (s === 0 && bar % 2 === 0) bassNote(noteF(0, -2), t, sx * 32, 0.08, d);
        if (s === 0) pad(cd.map(x => noteF(x, -1)), t, sx * 16 + 0.5, 0.07, d, 800);
        if (s % 4 === 0 || s === 6) pluck(noteF(cd[(s >> 2) % 3], 0), t, 0.06, d, 0.7, 0.35);
        if (s === 0) taiko(t, 0.18, d);
        if (s === 10) taiko(t, 0.1, d);
        if (mnote) flute(mf, t, Math.min(1.6, mdur * 0.95), 0.09, d);
        break;
      case 'temple':
        if (s === 0 && bar % 2 === 0) { bassNote(noteF(0, -2), t, sx * 32, 0.1, d); pad([noteF(0, -1), noteF(4, -1)], t, sx * 32, 0.08, d, 500, 0.7); }
        if (s === 0) taiko(t, 0.3, d);
        if (s === 12 && bar % 2 === 1) taiko(t, 0.18, d);
        if (s === 8 && Math.random() < 0.5) bell(noteF(cd[1], 2), t, 0.03, d, 3, 0.8);
        if (mnote) bell(mf, t, 0.07, d, 2.4, 0.7);
        break;
      case 'boss': {
        if (s === 0 && bar % 2 === 0) pad(cd.map(x => noteF(x, 0)), t, sx * 32, 0.05, d, 1600, 0.3);
        if (s === 0 || s === 8 || (bar % 2 === 1 && s === 10) || (s === 14 && bar % 4 === 3)) kick(t, 0.5, d);
        if (s === 4 || s === 12) snare(t, 0.3, d);
        if (bar % 4 === 3 && s >= 12) snare(t, 0.12 + (s - 12) * 0.04, d);
        if (s % 2 === 0) hat(t, s === 14 ? 0.07 : 0.045, d, s === 14);
        const bassPat = [0, 0, 7, 0, 0, 7, 0, 12];
        if (s % 2 === 0) voice({ type: 'sawtooth', freq: mtof(M.root - 12 + deg2semi(ch) + bassPat[s >> 1]), t0: t, dur: sx * 1.6, vol: 0.12, dest: d,
          filter: { freq: 900, end: 200, q: 4 } });
        if (s === 0 || s === 3 || s === 6) cd.forEach(x => voice({ type: 'sawtooth', freq: noteF(x, 1), t0: t, dur: sx * 1.2, vol: 0.025, dest: d, filter: { freq: 2500, end: 600 } }));
        if (mnote) lead(mf, t, Math.min(0.9, mdur * 0.9), 0.06, d);
        break;
      }
    }
  }

  function scheduler() {
    if (!ctx) return;
    tickAmbience();
    if (!musicOn || !moodBus) return;
    const t = now();
    if (nextTime < t - 0.1) nextTime = t + 0.05;     // backgrounded: skip missed steps, no burst
    while (nextTime < t + 0.14) {
      if (pendingMood && (step === 0 || (pendingMood === 'boss' && step % 4 === 0))) {
        const pm = pendingMood; pendingMood = null;
        switchMood(pm, nextTime);
      }
      try { scheduleStep(step, nextTime); } catch (e) { if (window.__audioDebug) console.error(e); }
      nextTime += 60 / M.bpm / 4;
      step++;
      if (step >= 16) {
        step = 0; bar++;
        if (bar % 8 === 0) planPhrase();
      }
    }
  }

  // ---------------------------------------------------------------- ambience
  const amb = {};                     // name → gain node
  let ambName = 'none', landAmb = 'marsh', ambExplicit = false;
  let nextFrog = 0, nextBird = 0, nextBubble = 0, nextDrip = 0;

  function bedNoise(type, freq, q, dest) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(dest); s.start(0, Math.random());
    return f;
  }
  function lfo(rate, depth, param) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
  }
  function buildAmbience() {
    for (const n of ['marsh', 'underwater', 'cavern']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(ambGain); amb[n] = g;
    }
    // marsh: water lapping + breeze
    const lap = ctx.createGain(); lap.gain.value = 0.05; lap.connect(amb.marsh);
    lfo(0.23, 0.035, lap.gain);
    bedNoise('bandpass', 480, 0.8, lap);
    const wind = ctx.createGain(); wind.gain.value = 0.03; wind.connect(amb.marsh);
    lfo(0.07, 0.022, wind.gain);
    const wf = bedNoise('bandpass', 900, 0.5, wind);
    lfo(0.05, 300, wf.frequency);
    // underwater: muffled rumble + low drone
    const uw = ctx.createGain(); uw.gain.value = 0.16; uw.connect(amb.underwater);
    lfo(0.11, 0.05, uw.gain);
    bedNoise('lowpass', 180, 0.7, uw);
    const drone = ctx.createOscillator(), dg = ctx.createGain();
    drone.frequency.value = 55; dg.gain.value = 0.04;
    drone.connect(dg); dg.connect(amb.underwater); drone.start();
    // cavern: hollow low wind
    const cw = ctx.createGain(); cw.gain.value = 0.06; cw.connect(amb.cavern);
    lfo(0.05, 0.04, cw.gain);
    bedNoise('bandpass', 260, 2.5, cw);
  }

  function applyAmbience(name) {
    if (!ctx) { ambName = name; return; }
    ambName = name;
    const t = now();
    for (const n in amb) {
      amb[n].gain.cancelScheduledValues(t);
      amb[n].gain.setTargetAtTime(n === name ? 1 : 0, t, 0.6);
    }
  }

  function tickAmbience() {
    const t = now();
    if (ambName === 'marsh') {
      if (t > nextFrog) {
        nextFrog = t + rnd(3, 9);
        if (nextFrog - t < 20) {
          const f0 = rnd(140, 240), n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            voice({ type: 'square', freq: f0, freqEnd: f0 * 0.8, t0: t + 0.1 + i * 0.13, dur: 0.07, vol: 0.022, dest: ambGain,
              filter: { type: 'bandpass', freq: f0 * 3, q: 5 }, rev: 0.3 });
          }
        }
      }
      if (t > nextBird && (G.world ? (G.world.daylight || 1) > 0.3 : true)) {
        nextBird = t + rnd(4, 12);
        const base = rnd(2200, 3600), n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const tt = t + 0.1 + i * rnd(0.08, 0.14);
          voice({ freq: base * rnd(0.9, 1.1), freqEnd: base * rnd(1.2, 1.5), t0: tt, dur: 0.06, vol: 0.02, dest: ambGain, rev: 0.4 });
        }
      }
    } else if (ambName === 'underwater') {
      if (t > nextBubble) {
        nextBubble = t + rnd(0.4, 2.2);
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const f = rnd(300, 700);
          voice({ freq: f, freqEnd: f * rnd(1.8, 2.6), t0: t + i * rnd(0.05, 0.12), dur: 0.06, vol: 0.05, dest: ambGain, rev: 0.5 });
        }
      }
    } else if (ambName === 'cavern') {
      if (t > nextDrip) {
        nextDrip = t + rnd(1.2, 4);
        const f = rnd(1400, 2600);
        voice({ freq: f, freqEnd: f * 0.6, t0: t, dur: 0.08, vol: 0.04, dest: ambGain, rev: 0.9 });
      }
    }
  }

  function updateSpace() {
    if (!ctx) return;
    const target = underwater ? 0.95 : (M.space || 0.4);
    reverbOut.gain.setTargetAtTime(target, now(), 0.4);
  }

  // ---------------------------------------------------------------- public API
  const lastPlayed = {};
  return {
    start() {
      init();
      if (ctx.state === 'suspended') ctx.resume();
      if (!started) {
        started = true;
        nextTime = now() + 0.1;
        moodBus = newMoodBus(true, now());
        planPhrase();
        applyAmbience(underwater ? 'underwater' : landAmb);
        schedTimer = setInterval(scheduler, 25);
      }
    },
    play(name, ...args) {
      if (!ctx || !sfx[name]) return;
      const t = now();
      if (lastPlayed[name] !== undefined && t - lastPlayed[name] < 0.025) return;
      lastPlayed[name] = t;
      pv = 1 + (Math.random() - 0.5) * 0.09;
      try { sfx[name](...args); } catch (e) { if (window.__audioDebug) console.error(e); }
    },
    setMood(m) {
      if (!MOODS[m]) m = 'calm';
      if (!ambExplicit) landAmb = (m === 'cavern' || m === 'temple') ? 'cavern' : 'marsh';
      ambExplicit = false;
      if (ctx && !underwater && ambName !== landAmb) applyAmbience(landAmb);
      if (m === moodName && !pendingMood) return;
      if (m === moodName) { pendingMood = null; return; }
      pendingMood = m;
    },
    setAmbience(name) {
      if (!['marsh', 'underwater', 'cavern', 'none'].includes(name)) name = 'marsh';
      if (name !== 'underwater') { landAmb = name; ambExplicit = true; }
      if (!underwater || name === 'underwater') applyAmbience(name);
    },
    toggleMusic() {
      musicOn = !musicOn;
      if (ctx) {
        musicGain.gain.setTargetAtTime(musicOn ? (ducked ? MUSIC_DUCK : MUSIC_VOL) : 0, now(), 0.2);
        if (musicOn) nextTime = now() + 0.05;
      }
      return musicOn;
    },
    duck(v) {
      ducked = !!v;
      if (musicGain && musicOn) musicGain.gain.setTargetAtTime(v ? MUSIC_DUCK : MUSIC_VOL, now(), 0.3);
    },
    setUnderwater(u) {
      if (!ctx || u === underwater) return;
      underwater = u;
      lowpass.frequency.setTargetAtTime(u ? 640 : 21000, now(), 0.12);
      master.gain.setTargetAtTime(u ? 1.0 : 0.9, now(), 0.12);
      applyAmbience(u ? 'underwater' : landAmb);
      updateSpace();
    },
    get mood() { return moodName; },
  };
})();
