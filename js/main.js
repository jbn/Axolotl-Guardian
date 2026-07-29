// Axolotl Guardian — bootstrap, input, progression, cinematics, main loop
(function () {
  const canvas = document.getElementById('game-canvas');
  let mode = 'title';            // title | play | cine | dead | win | paused
  let cine = null;
  let checkpoint = new THREE.Vector3(0, -0.5, 192);
  let frogsKilled = 0, whirlShrineReady = false, caveTriggered = false, bossStarted = false;
  let tutorialStep = 0, tutorialT = 0;

  // ---------------- Renderer / scene ----------------
  function initRenderer() {
    G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    G.renderer.shadowMap.enabled = true;
    G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    G.renderer.outputColorSpace = THREE.SRGBColorSpace;
    G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    G.renderer.toneMappingExposure = 1.05;
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    G.camera.position.set(0, 6, 210);
    window.addEventListener('resize', () => {
      G.camera.aspect = window.innerWidth / window.innerHeight;
      G.camera.updateProjectionMatrix();
      G.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ---------------- Game state ----------------
  function freshState() {
    return {
      pearls: 0, hearts: 6, maxHearts: 6,
      abilities: { blast: false, shield: false, whirl: false },
      babies: [], relics: 0, cosmetics: [],
      kills: 0, playTime: 0,
    };
  }

  // ---------------- Enemy layout ----------------
  function spawnWorldEnemies() {
    // Sunlit Marsh — gentle intro
    G.spawnEnemy('crab', -12, 152);
    G.spawnEnemy('crab', 16, 138);
    G.spawnEnemy('crab', -8, 118);
    G.spawnEnemy('vine', 10, 160);
    G.spawnEnemy('vine', -14, 130);
    G.spawnEnemy('vine', 6, 98);
    G.spawnEnemy('goblin', 40, 150);
    // Challenge cave guards (ambush spawns extra on trigger)
    G.spawnEnemy('crab', 84, 168);

    // Giant Lily Forest
    G.spawnEnemy('frog', -18, 56);
    G.spawnEnemy('frog', 12, 40);
    G.spawnEnemy('frog', -32, 18);
    G.spawnEnemy('frog', 20, 2);
    G.spawnEnemy('swarm', -8, 30);
    G.spawnEnemy('swarm', 26, 18);
    G.spawnEnemy('swarm', -40, -2);
    G.spawnEnemy('vine', -24, 46);
    G.spawnEnemy('goblin', 34, 44);

    // Moss Ruins (east) — turtles + eels
    G.spawnEnemy('turtle', 48, -78);
    G.spawnEnemy('turtle', 70, -104);
    G.spawnEnemy('turtle', 56, -122);
    G.spawnEnemy('eel', 62, -95, [[46, -80], [78, -84], [82, -112], [52, -118]]);
    G.spawnEnemy('goblin', 66, -86);

    // Crystal Cavern (west)
    G.spawnEnemy('swarm', -52, -84);
    G.spawnEnemy('swarm', -70, -102);
    G.spawnEnemy('crab', -58, -110);
    G.spawnEnemy('crab', -76, -90);
    G.spawnEnemy('vine', -48, -100);
    G.spawnEnemy('eel', -62, -118, [[-48, -112], [-72, -118], [-66, -132], [-50, -126]]);

    // path guards before temple
    G.spawnEnemy('turtle', -10, -140);
    G.spawnEnemy('frog', 12, -146);
  }

  // ---------------- Input ----------------
  function initInput() {
    document.addEventListener('keydown', e => {
      G.keys[e.code] = true;
      if (mode === 'play') {
        if (e.code === 'KeyQ') G.player.shield();
        if (e.code === 'KeyE') G.player.whirl();
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') G.player.dash();
        if (e.code === 'KeyH') G.player.cycleCosmetic();
        if (e.code === 'KeyM') G.ui.toast(G.audio.toggleMusic() ? '🎵 Music on' : '🔇 Music off', 1500);
        if (e.code === 'Space') e.preventDefault();
      }
    });
    document.addEventListener('keyup', e => { G.keys[e.code] = false; });
    canvas.addEventListener('mousedown', e => {
      if (mode !== 'play') return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      if (e.button === 0) G.player.whip();
      if (e.button === 2) G.player.startCharge();
    });
    document.addEventListener('mouseup', e => {
      if (mode === 'play' && e.button === 2) G.player.releaseCharge();
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('mousemove', e => {
      if (mode !== 'play' || document.pointerLockElement !== canvas) return;
      G.player.camYaw -= e.movementX * 0.0026;
      G.player.camPitch = U.clamp(G.player.camPitch + e.movementY * 0.0022, -0.6, 1.1);
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && mode === 'play') pauseGame();
    });

    document.getElementById('play-btn').addEventListener('click', startGame);
    document.getElementById('resume-btn').addEventListener('click', resumeGame);
    document.getElementById('respawn-btn').addEventListener('click', respawn);
    document.getElementById('again-btn').addEventListener('click', () => location.reload());
  }

  function pauseGame() {
    if (mode !== 'play') return;
    mode = 'paused';
    G.ui.show('pause-screen');
  }
  function resumeGame() {
    G.ui.hide('pause-screen');
    mode = 'play';
    canvas.requestPointerLock();
  }

  // ---------------- Start / death / respawn ----------------
  function startGame() {
    G.audio.start();
    G.ui.hide('title-screen');
    document.getElementById('hud').style.display = 'block';
    mode = 'play';
    canvas.requestPointerLock();
    G.ui.hud();
    G.ui.objective('Follow the pearl trail north through the Sunlit Marsh');
    G.ui.toast('🌊 WASD to swim, SPACE to rise or leap, C to dive!', 5200);
  }

  G.onPlayerDeath = function () {
    mode = 'dead';
    document.exitPointerLock();
    G.ui.fade(true, () => {
      G.ui.show('death-screen');
      G.ui.fade(false);
    });
  };

  function respawn() {
    G.ui.hide('death-screen');
    G.state.hearts = G.state.maxHearts;
    G.player.dead = false;
    G.player.pos.copy(checkpoint);
    G.player.vel.set(0, 0, 0);
    G.player.invuln = 2;
    // if died mid-boss: reset the fight
    if (bossStarted && G.boss && !G.boss.defeated) {
      G.boss.hp = G.boss.maxHp;
      G.boss.alive = false;
      G.boss.grp.visible = false;
      G.boss.cleanupHazards();
      G.ui.bossBar(1, false);
      bossStarted = false;
      G.audio.setMood('calm');
      // clear boss-summoned minions near arena
      for (const e of G.enemies) {
        if (e.alive && U.dist2d(e.pos.x, e.pos.z, 0, -200) < 50) { e.alive = false; G.scene.remove(e.grp); }
      }
    }
    G.ui.hud();
    mode = 'play';
    canvas.requestPointerLock();
  }

  // ---------------- Cinematics ----------------
  function startCine(steps, onDone) {
    mode = 'cine';
    document.exitPointerLock();
    G.ui.cineBars(true);
    G.audio.duck(true);
    cine = { steps, idx: 0, t: 0, onDone };
    const s = steps[0];
    if (s.on) s.on();
    if (s.sub) G.ui.subtitle(s.sub);
  }

  function updateCine(dt) {
    if (!cine) return;
    const s = cine.steps[cine.idx];
    cine.t += dt;
    if (s.cam) s.cam(cine.t / s.dur);
    if (s.tick) s.tick(cine.t / s.dur, dt);
    if (cine.t >= s.dur) {
      cine.idx++;
      cine.t = 0;
      G.ui.subtitle(null);
      if (cine.idx >= cine.steps.length) {
        const done = cine.onDone;
        cine = null;
        G.ui.cineBars(false);
        G.audio.duck(false);
        if (done) done();
        return;
      }
      const n = cine.steps[cine.idx];
      if (n.on) n.on();
      if (n.sub) G.ui.subtitle(n.sub);
    }
  }

  function orbitCam(cx, cz, cy, r, a0, a1, ly) {
    return t => {
      const a = U.lerp(a0, a1, U.smoothstep(t));
      G.camera.position.set(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
      G.camera.lookAt(cx, ly ?? 0, cz);
    };
  }

  // ---------------- Boss intro / outro ----------------
  function startBossIntro() {
    bossStarted = true;
    checkpoint.set(0, -0.5, -166);
    // seal the arena behind the player
    G.world.colliders.push({ x: 0, z: -160, r: 6.5 });
    const A = G.boss.ARENA;
    G.boss.grp.visible = true;
    G.boss.pos.set(A.x, -6, A.z);
    startCine([
      {
        dur: 3.2, sub: 'The ancient temple trembles...',
        cam: orbitCam(A.x, A.z, 8, 38, Math.PI * 0.5, Math.PI * 0.75, 2),
        on: () => { G.audio.play('thunder'); },
      },
      {
        dur: 3.4, sub: 'Something vast stirs beneath the dark water.',
        cam: t => {
          G.camera.position.set(A.x + 24, 4 - t * 2, A.z + 10);
          G.camera.lookAt(A.x, -2, A.z);
        },
        tick: (t) => { G.boss.pos.y = U.lerp(-6, -1.5, U.smoothstep(t)); if (Math.random() < 0.3) G.fx.splash(G.boss.pos, 6); },
        on: () => G.audio.play('roar'),
      },
      {
        dur: 3.6, sub: 'THE CRYSTAL CATFISH KING — guardian of the temple, drowned in crystal corruption!',
        cam: orbitCam(A.x, A.z, 3, 16, -Math.PI * 0.25, Math.PI * 0.2, 1),
        on: () => { G.audio.play('roar'); G.fx.burst(G.boss.pos, 0xb03fe8, 40, 10); },
      },
      {
        dur: 2.4, sub: 'Cleanse him, little guardian. Set him free!',
        cam: t => {
          U.v1.copy(G.player.pos);
          G.camera.position.set(U.v1.x + 6, U.v1.y + 3, U.v1.z + 8);
          G.camera.lookAt(U.v1.x, U.v1.y + 1, U.v1.z);
        },
      },
    ], () => {
      mode = 'play';
      canvas.requestPointerLock();
      G.boss.startFight();
      G.ui.objective('Free the Crystal Catfish King from the corruption!');
      G.ui.toast('⚔️ Watch his telegraphs — dodge, then strike!', 4200);
    });
  }

  G.onBossDefeated = function () {
    G.boss.cleanupHazards();
    G.ui.bossBar(0, false);
    G.audio.setMood('calm');
    G.audio.play('cleanse');
    // free remaining minions
    for (const e of G.enemies) {
      if (e.alive) { G.fx.burst(e.pos, 0xffe98a, 16, 5); e.alive = false; G.scene.remove(e.grp); }
    }
    const A = G.boss.ARENA;
    startCine([
      {
        dur: 3.0, sub: 'The dark crystals crack... light pours through!',
        cam: orbitCam(A.x, A.z, 6, 20, 0, Math.PI * 0.4, 1),
        tick: (t) => {
          G.boss.cleanse(t * 0.5);
          if (Math.random() < 0.4) {
            G.audio.play('crack');
            G.fx.burst(U.v1.copy(G.boss.pos).add(U.v2.set(U.rand(-3, 3), U.rand(0, 2), U.rand(-3, 3))), 0xb03fe8, 14, 7);
          }
          U.v1.copy(G.boss.bowPos());
          G.boss.pos.lerp(U.v1, 0.02);
        },
      },
      {
        dur: 4.0, sub: 'The corruption melts away like morning mist...',
        cam: orbitCam(A.x, A.z, 4, 14, Math.PI * 0.4, Math.PI * 0.9, 1),
        tick: (t, dt) => {
          G.boss.cleanse(0.5 + t * 0.5);
          if (Math.random() < dt * 20) G.fx.sparkle(G.boss.pos, 0xffe98a, 6, 1);
          // cleanse the temple crystals too
          if (G.world.templeCrystals) {
            for (const c of G.world.templeCrystals) {
              if (!c.userData.cleansed && Math.random() < dt * 1.2) {
                c.userData.cleansed = true;
                c.material = U.emissiveMat(0x7fe8d0, 0x4fd8b0, 0.8, { transparent: true, opacity: 0.95 });
                G.fx.burst(c.position, 0x7fe8d0, 18, 6);
                G.audio.play('pearl');
              }
            }
          }
        },
        on: () => G.audio.play('cleanse'),
      },
      {
        dur: 4.2, sub: 'The King bows his great whiskered head. The temple — and the marsh — are free.',
        cam: t => {
          G.camera.position.set(A.x + 10, 2.5, A.z + 16);
          G.camera.lookAt(G.boss.pos.x, G.boss.pos.y + 1, G.boss.pos.z);
        },
        tick: (t, dt) => {
          G.boss.cleanse(1);
          G.boss.grp.rotation.x = U.damp(G.boss.grp.rotation.x, 0.3, 1.5, dt);
          if (Math.random() < dt * 12) G.fx.sparkle(G.boss.pos, 0x9fefff, 4, 0.8);
        },
        on: () => {
          G.audio.play('baby');
          G.fx.ring(G.boss.pos, 0xffe98a, 20, 1.6);
          G.pickupSys.spawnPearl(G.boss.pos, 12);
        },
      },
    ], () => {
      mode = 'win';
      G.state.playTime = G.time;
      G.ui.winStats();
      G.ui.fade(true, () => {
        G.ui.show('win-screen');
        document.getElementById('hud').style.display = 'none';
        G.ui.fade(false);
      });
    });
  };

  // ---------------- Progression ----------------
  function updateProgression(dt) {
    const s = G.state, p = G.player;

    // tutorial beats
    tutorialT += dt;
    if (tutorialStep === 0 && tutorialT > 6) {
      tutorialStep = 1;
      G.ui.toast('🌀 LMB: tail whip!  SHIFT: dash (dodges attacks)', 5000);
    } else if (tutorialStep === 1 && tutorialT > 13) {
      tutorialStep = 2;
      G.ui.toast('💠 Defeat corrupted creatures to collect spirit pearls', 4500);
    }

    // gates
    const opened = G.world.tryGates();
    if (opened) {
      G.audio.play('gate');
      G.fx.burst(new THREE.Vector3(opened.x, 3, opened.z), 0x9fefff, 40, 9);
      s.hearts = s.maxHearts; // gates fully heal
      G.ui.hud();
      if (opened.ability) {
        s.abilities[opened.ability] = true;
        G.ui.unlock(opened.ability === 'blast' ? 'WATER BLAST' : 'BUBBLE SHIELD', opened.desc);
        G.ui.flashAbility(opened.ability === 'blast' ? 'ab-blast' : 'ab-shield');
      } else {
        G.ui.unlock('TEMPLE SEAL BROKEN', 'The Sunken Temple lies open... something waits below.');
      }
      if (opened.name === 'Lily Gate') {
        checkpoint.set(0, -0.5, 74);
        G.ui.objective('Explore the Giant Lily Forest — defeat 3 shadow frogs');
      } else if (opened.name === 'Mossgate') {
        checkpoint.set(0, -0.5, -54);
        G.ui.objective('Cross the Moss Ruins or Crystal Cavern to the Temple Seal');
      } else {
        G.ui.objective('Enter the Sunken Temple...');
      }
    }

    // shadow frog event → whirlpool shrine
    if (!s.abilities.whirl) {
      if (frogsKilled >= 3 && !whirlShrineReady) {
        whirlShrineReady = true;
        G.ui.toast('✨ A golden shrine awakens in the lily forest!', 4500);
        G.ui.objective('Touch the golden shrine to absorb its power');
      }
      if (whirlShrineReady && U.dist2d(p.pos.x, p.pos.z, 14, -6) < 4) {
        s.abilities.whirl = true;
        G.ui.unlock('WHIRLPOOL SPIN', 'Press E to unleash a spinning whirlpool — great against groups!');
        G.ui.flashAbility('ab-whirl');
        G.audio.play('unlock');
        G.fx.burst(new THREE.Vector3(14, 1, -6), 0xffd85f, 40, 8);
        G.ui.objective('Gather 16 pearls and pass the Mossgate south of the forest');
        G.ui.hud();
      }
    }

    // challenge cave ambush
    if (!caveTriggered && U.dist2d(p.pos.x, p.pos.z, 88, 172) < 11) {
      caveTriggered = true;
      G.ui.toast('⚠️ CHALLENGE CAVE — survive the ambush to claim the relic!', 4500);
      G.audio.play('roar');
      G.spawnEnemy('crab', 94, 178);
      G.spawnEnemy('frog', 82, 178);
      G.spawnEnemy('frog', 94, 166);
      G.spawnEnemy('swarm', 88, 164);
    }

    // boss trigger
    const templeGate = G.world.gates[2];
    if (templeGate.open && !bossStarted && p.pos.z < -168) {
      startBossIntro();
    }

    // ambient zone flavor + music mood
    if (!bossStarted) {
      const zone = G.world.zoneAt(p.pos.x, p.pos.z);
      if (zone !== G._lastZone) {
        G._lastZone = zone;
        const names = {
          marsh: '🌾 The Sunlit Marsh', forest: '🪷 The Giant Lily Forest',
          ruins: '🏛️ The Moss-Covered Ruins', cavern: '💎 The Crystal Caverns',
          temple: '⛩️ The Sunken Temple',
        };
        if (names[zone]) G.ui.toast(names[zone], 2600);
        G.audio.setMood(zone === 'cavern' || zone === 'temple' ? 'cavern' : 'calm');
      }
    }
  }

  // Track frog kills for the shrine event (wrap the kill counter)
  const _origSpawn = G.spawnEnemy;
  let spawnWrapped = false;
  function wrapFrogDeaths() {
    if (spawnWrapped) return;
    spawnWrapped = true;
    // count frog kills via polling in the main loop instead of wrapping die()
  }

  // ---------------- Main loop ----------------
  let lastT = performance.now();
  let frogsAliveLast = -1;

  function frame() {
    requestAnimationFrame(frame);
    const nowT = performance.now();
    let dt = Math.min((nowT - lastT) / 1000, 0.05);
    lastT = nowT;

    if (mode === 'title' || mode === 'paused' || mode === 'dead' || mode === 'win') {
      // gentle idle: world still breathes on title screen
      if (mode === 'title') {
        G.time += dt * 0.3;
        G.world.update(dt * 0.3);
        const a = G.time * 0.06;
        G.camera.position.set(Math.cos(a) * 30, 9, 175 + Math.sin(a) * 24);
        G.camera.lookAt(0, 0, 150);
        G.fx.update(dt);
        G.post.render();
      } else {
        G.post.render();
      }
      return;
    }

    G.time += dt;
    if (mode === 'play') G.state.playTime = G.time;

    G.world.update(dt);
    if (mode === 'play') {
      G.player.update(dt);
      updateProgression(dt);
    } else if (mode === 'cine') {
      updateCine(dt);
    }
    G.updateEnemies(dt);
    if (G.boss) G.boss.update(dt);
    G.pickupSys.update(dt);
    G.fx.update(dt);
    G.ui.cooldowns();

    // frog kill tracking (for whirl shrine)
    const frogsAlive = G.enemies.filter(e => e.alive && e.type === 'frog' && e.pos.z > -60).length;
    if (frogsAliveLast === -1) frogsAliveLast = frogsAlive;
    if (frogsAlive < frogsAliveLast) frogsKilled += frogsAliveLast - frogsAlive;
    frogsAliveLast = frogsAlive;

    G.post.render();
  }

  // ---------------- Boot ----------------
  function boot() {
    initRenderer();
    G.post.init();
    G.state = freshState();
    G.fx.init();
    G.world.build();
    G.pickupSys.init();
    G.player = G.makePlayer();
    spawnWorldEnemies();
    G.boss = G.makeBoss();
    initInput();
    wrapFrogDeaths();
    G.ui.hud();
    frame();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
