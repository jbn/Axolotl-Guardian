// Axolotl Guardian — bootstrap, input, progression, cinematics, main loop
(function () {
  const canvas = document.getElementById('game-canvas');
  let mode = 'title';            // title | play | cine | dead | win | paused | photo
  let cine = null;
  const checkpoint = G.checkpoint = new THREE.Vector3(0, -0.5, 192);
  let whirlShrineReady = false, bossStarted = false;
  let tutorialStep = 0, tutorialT = 0;
  let riding = false;
  let photo = null, snapPending = false;

  // ---------------- Renderer / scene ----------------
  function initRenderer() {
    G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    G.renderer.shadowMap.enabled = true;
    G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    G.renderer.shadowMap.autoUpdate = false;     // post.js refreshes shadows once per frame
    G.renderer.outputColorSpace = THREE.SRGBColorSpace;
    G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    G.renderer.toneMappingExposure = 1.05;
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    G.camera.position.set(0, 6, 210);
    G.camera.layers.enable(1);                    // water surface layer (see post.js)
    G.camera.layers.enable(2);                    // not-refracted layer (grass)
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
      babies: [], relics: 0, cosmetics: [], skin: 0,
      kills: 0, playTime: 0,
      frogsKilled: 0, caveTriggered: false, postgame: false,
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
  // touch devices have no pointer lock (iOS lacks the API entirely) — on-screen controls drive the camera instead
  function lockPointer() {
    if (G.touch || document.pointerLockElement === canvas) return;
    try { canvas.requestPointerLock(); } catch (e) {}
  }
  function unlockPointer() {
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  }

  function initInput() {
    document.addEventListener('keydown', e => {
      G.keys[e.code] = true;
      if (mode === 'play') {
        if (riding) {
          if (e.code === 'Space') { e.preventDefault(); dismount(); }
        } else {
          if (e.code === 'KeyQ') G.player.shield();
          if (e.code === 'KeyE') G.player.whirl();
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') G.player.dash();
        }
        if (e.code === 'KeyH') G.player.cycleCosmetic();
        if (e.code === 'KeyJ') G.player.cycleSkin();
        if (e.code === 'KeyM') G.ui.toast(G.audio.toggleMusic() ? '🎵 Music on' : '🔇 Music off', 1500);
        if (e.code === 'Tab') { e.preventDefault(); G.map.toggle(); }
        if (e.code === 'KeyP') enterPhoto();
        if (e.code === 'Space') e.preventDefault();
      } else if (mode === 'photo') {
        if (e.code === 'KeyP') exitPhoto();
        if (e.code === 'Enter') snapPending = true;
        if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      }
    });
    document.addEventListener('keyup', e => { G.keys[e.code] = false; });
    canvas.addEventListener('mousedown', e => {
      if (mode !== 'play' || G.touch) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      if (e.button === 0) G.player.whip();
      if (e.button === 2) G.player.startCharge();
    });
    document.addEventListener('mouseup', e => {
      if (mode === 'play' && e.button === 2) G.player.releaseCharge();
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      if (mode === 'play') {
        G.player.camYaw -= e.movementX * 0.0026;
        G.player.camPitch = U.clamp(G.player.camPitch + e.movementY * 0.0022, -0.6, 1.1);
      } else if (mode === 'photo' && photo) {
        photo.yaw -= e.movementX * 0.0026;
        photo.pitch = U.clamp(photo.pitch - e.movementY * 0.0022, -1.4, 1.4);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (G.touch) return;
      if (document.pointerLockElement !== canvas && mode === 'play') pauseGame();
      if (document.pointerLockElement !== canvas && mode === 'photo') exitPhoto(true);
    });
    // mobile: switching apps / locking the phone pauses (the pointer-lock-loss equivalent)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (mode === 'photo') exitPhoto(true);
      pauseGame();
    });

    document.getElementById('play-btn').addEventListener('click', () => { G.save.clear(); startGame(); });
    document.getElementById('continue-btn').addEventListener('click', continueGame);
    document.getElementById('resume-btn').addEventListener('click', resumeGame);
    document.getElementById('respawn-btn').addEventListener('click', respawn);
    document.getElementById('again-btn').addEventListener('click', () => { G.save.clear(); location.reload(); });
    document.getElementById('ride-btn').addEventListener('click', startRide);
  }

  // ---------------- Photo mode ----------------
  function enterPhoto() {
    mode = 'photo';
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    photo = {
      pos: G.camera.position.clone(),
      yaw: Math.atan2(dir.x, dir.z),
      pitch: Math.asin(U.clamp(dir.y, -1, 1)),
    };
    document.getElementById('hud').style.display = 'none';
    G.map.close();
    G.ui.subtitle(G.hint('📷 WASD fly · SPACE/C rise/sink · ENTER snap photo · P back', '📷 Stick to fly · drag to aim · tap 📸 to snap'));
  }

  function exitPhoto(skipLock) {
    if (mode !== 'photo') return;
    mode = 'play';
    photo = null;
    document.getElementById('hud').style.display = 'block';
    G.ui.subtitle(null);
    if (!skipLock) lockPointer();
  }

  function updatePhoto(dt) {
    const p = photo;
    const speed = (G.keys['ShiftLeft'] || G.keys['ShiftRight'] ? 30 : 11) * dt;
    const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = Math.cos(p.yaw) * Math.cos(p.pitch);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const mv = G.moveInput(U.v2), fwd = -mv.z * speed, side = mv.x * speed;
    p.pos.x += fx * fwd + rx * side; p.pos.y += fy * fwd; p.pos.z += fz * fwd + rz * side;
    if (G.key('Space')) p.pos.y += speed;
    if (G.key('KeyC')) p.pos.y -= speed;
    G.camera.position.copy(p.pos);
    U.v1.set(p.pos.x + fx, p.pos.y + fy, p.pos.z + fz);
    G.camera.lookAt(U.v1);
  }

  function snapPhoto() {
    snapPending = false;
    try {
      canvas.toBlob(b => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'axolotl-guardian.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      });
      G.ui.toast('📸 Photo saved!', 2000);
      G.audio.play('pearl');
    } catch (e) {}
  }

  // ---------------- Victory lap: ride the King ----------------
  function startRide() {
    G.ui.hide('win-screen');
    document.getElementById('hud').style.display = 'block';
    mode = 'play';
    riding = true;
    G.player.riding = true;
    G.player.dead = false;
    G.state.hearts = G.state.maxHearts;
    G.boss.startRide();
    G.state.postgame = true;
    G.save.write();
    lockPointer();
    G.ui.hud();
    G.ui.objective('Victory lap on the King\'s back! 🌊');
    G.ui.toast(G.hint('🐟 Enjoy the ride — SPACE to hop off, P for photos', '🐟 Enjoy the ride — ⬆ to hop off, 📷 for photos'), 6000);
    G.audio.setMood('calm');
  }

  function dismount() {
    riding = false;
    G.player.riding = false;
    G.player.vel.set(0, 5, 0);
    G.ui.objective('The marsh is saved. Explore as long as you like!');
    G.ui.toast('The King bows his whiskered head and swims on 💙', 4000);
  }

  // ---------------- Gamepad ----------------
  const padPrev = {};
  function pollPad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (let i = 0; i < gps.length; i++) if (gps[i] && gps[i].connected) { gp = gps[i]; break; }
    if (!gp) return;
    const dz = v => (Math.abs(v) > 0.32 ? v : 0);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    G.pad['KeyD'] = lx > 0; G.pad['KeyA'] = lx < 0;
    G.pad['KeyS'] = ly > 0; G.pad['KeyW'] = ly < 0;
    const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = i => { const v = btn(i), was = padPrev[i]; padPrev[i] = v; return v && !was; };
    G.pad['Space'] = btn(0);
    G.pad['KeyC'] = btn(6);
    if (mode === 'title' && edge(0)) { G.save.exists() ? continueGame() : (G.save.clear(), startGame()); return; }
    if (mode === 'paused' && edge(9)) { resumeGame(); return; }
    if (mode !== 'play') { for (let i = 1; i < 12; i++) edge(i); return; }
    const cam = (mode === 'photo') ? photo : G.player;
    if (mode === 'play') {
      G.player.camYaw -= rx * 2.7 * 0.016;
      G.player.camPitch = U.clamp(G.player.camPitch + ry * 2.2 * 0.016, -0.6, 1.1);
    }
    if (riding) { if (edge(0)) dismount(); return; }
    if (edge(2)) G.player.whip();
    if (edge(1)) G.player.dash();
    if (edge(3)) G.player.whirl();
    if (edge(4)) G.player.shield();
    if (edge(5)) G.player.cycleCosmetic();
    if (edge(8)) G.map.toggle();
    if (edge(11) && G.player.toggleLock) G.player.toggleLock();
    if (edge(9)) pauseGame();
    const rt = btn(7);
    if (rt && !padPrev.rt) G.player.startCharge();
    if (!rt && padPrev.rt) G.player.releaseCharge();
    padPrev.rt = rt;
  }

  // ---------------- Continue from save ----------------
  function continueGame() {
    const d = G.save.data();
    if (!d) { startGame(); return; }
    const s = G.state;
    s.pearls = d.pearls || 0;
    s.abilities = d.abilities || s.abilities;
    s.relics = d.relics || 0;
    s.cosmetics = d.cosmetics || [];
    s.skin = d.skin || 0;
    s.kills = d.kills || 0;
    s.playTime = d.playTime || 0;
    s.frogsKilled = d.frogsKilled || 0;
    s.caveTriggered = !!d.caveTriggered;
    s.postgame = !!d.postgame;
    G.save.applyWorld(d);
    if (d.checkpoint) checkpoint.set(d.checkpoint[0], d.checkpoint[1], d.checkpoint[2]);
    G.player.pos.copy(checkpoint);
    G.player.applySkin(s.skin);
    startGame();
    G.ui.toast('💾 Welcome back, little guardian!', 3600);
  }

  function pauseGame() {
    if (mode !== 'play') return;
    mode = 'paused';
    G.map.close();
    G.save.write();
    G.ui.show('pause-screen');
  }
  function resumeGame() {
    G.ui.hide('pause-screen');
    mode = 'play';
    lockPointer();
  }

  // ---------------- Start / death / respawn ----------------
  function startGame() {
    G.audio.start();
    G.player.grp.rotation.set(0, G.player.yaw - Math.PI / 2, 0);
    G.ui.hide('title-screen');
    document.getElementById('hud').style.display = 'block';
    mode = 'play';
    lockPointer();
    if (G.touchUI) G.touchUI.onStart();
    G.ui.hud();
    G.ui.objective('Follow the pearl trail north through the Sunlit Marsh');
    G.ui.toast(G.hint('🌊 WASD to swim, SPACE to rise or leap, C to dive!', '🌊 Left thumb to swim, drag right side to look · ⬆ rise/leap, ⬇ dive'), 5200);
  }

  G.onPlayerDeath = function () {
    mode = 'dead';
    G.map.close();
    unlockPointer();
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
    lockPointer();
  }

  // ---------------- Cinematics ----------------
  function startCine(steps, onDone) {
    mode = 'cine';
    unlockPointer();
    G.ui.cineBars(true);
    G.audio.duck(true);
    document.getElementById('hud').style.display = 'none';
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
        document.getElementById('hud').style.display = 'block';
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
      lockPointer();
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
          // celebration fireworks over the temple
          if (Math.random() < dt * 4) {
            const fc = U.pick([0xff5fbe, 0xffe98a, 0x7fe8ff, 0xa06fff, 0x7dffb0]);
            G.fx.burst(U.v1.set(G.boss.ARENA.x + U.rand(-28, 28), U.rand(10, 22), G.boss.ARENA.z + U.rand(-18, 26)), fc, 34, 9, 0.9, 1.3, -2);
            G.audio.play('pearl');
          }
        },
        on: () => {
          G.audio.play('baby');
          G.fx.ring(G.boss.pos, 0xffe98a, 20, 1.6);
          G.pickupSys.spawnPearl(G.boss.pos, 12);
        },
      },
    ], () => {
      mode = 'win';
      G.state.postgame = true;
      G.save.write();
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
      G.ui.toast(G.hint('🌀 LMB: tail whip!  SHIFT: dash (dodges attacks)', '🌀 Tap 🌊 to tail whip!  💨 dash dodges attacks'), 5000);
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
      G.save.write();
    }

    // shadow frog event → whirlpool shrine
    if (!s.abilities.whirl) {
      if (s.frogsKilled >= 3 && !whirlShrineReady) {
        whirlShrineReady = true;
        G.ui.toast('✨ A golden shrine awakens in the lily forest!', 4500);
        G.ui.objective('Touch the golden shrine to absorb its power');
      }
      if (whirlShrineReady && U.dist2d(p.pos.x, p.pos.z, 14, -6) < 4) {
        s.abilities.whirl = true;
        G.ui.unlock('WHIRLPOOL SPIN', G.hint('Press E', 'Tap 🌀') + ' to unleash a spinning whirlpool — great against groups!');
        G.ui.flashAbility('ab-whirl');
        G.audio.play('unlock');
        G.fx.burst(new THREE.Vector3(14, 1, -6), 0xffd85f, 40, 8);
        G.ui.objective('Gather 16 pearls and pass the Mossgate south of the forest');
        G.ui.hud();
        G.save.write();
      }
    }

    // challenge cave ambush
    if (!s.caveTriggered && U.dist2d(p.pos.x, p.pos.z, 88, 172) < 11) {
      s.caveTriggered = true;
      G.ui.toast('⚠️ CHALLENGE CAVE — survive the ambush to claim the relic!', 4500);
      G.audio.play('roar');
      G.spawnEnemy('crab', 94, 178);
      G.spawnEnemy('frog', 82, 178);
      G.spawnEnemy('frog', 94, 166);
      G.spawnEnemy('swarm', 88, 164);
    }

    // boss trigger (not in the postgame — the King is free now)
    const templeGate = G.world.gates[2];
    if (templeGate.open && !bossStarted && !s.postgame && p.pos.z < -168) {
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
        const moods = { marsh: 'calm', forest: 'forest', ruins: 'ruins', cavern: 'cavern', temple: 'temple' };
        if (moods[zone]) G.audio.setMood(moods[zone]);
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
  let sweepT = 0;
  let frogsAliveLast = -1;

  function frame() {
    requestAnimationFrame(frame);
    const nowT = performance.now();
    const dtReal = Math.min((nowT - lastT) / 1000, 0.05);
    lastT = nowT;
    let dt = dtReal * G.fx.timeScale(dtReal);   // hit-stop slow-motion
    pollPad();
    if (G.touchUI) G.touchUI.sync(mode);

    if (mode === 'title' || mode === 'paused' || mode === 'dead' || mode === 'win') {
      // gentle idle: world still breathes on title screen
      if (mode === 'title') {
        G.time += dt;
        G.world.update(dt * 0.25);
        G.ambient.update(dt);
        // slow low crane around the hero at sunrise, framed right of the title text
        const pp = G.player.pos, a = 2.2 + G.time * 0.045;
        const r = 7.2 + Math.sin(G.time * 0.13) * 1.2;
        G.camera.position.set(pp.x + Math.cos(a) * r, 1.15 + Math.sin(G.time * 0.21) * 0.35, pp.z + Math.sin(a) * r);
        U.v1.set(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2));     // shift look-at so the axolotl sits right of centre
        G.camera.lookAt(pp.x + U.v1.x * 2.6, 0.2, pp.z + U.v1.z * 2.6);
        G.player.grp.position.y = -0.28 + Math.sin(G.time * 1.3) * 0.05;
        G.player.grp.rotation.y = Math.sin(G.time * 0.2) * 0.4 - Math.PI / 2 + Math.PI;
        if (Math.random() < dt * 1.2) G.fx.ring(U.v2.set(pp.x, 0.04, pp.z), 0xd8f6ff, U.rand(1.4, 2.2), 1.4);
        G.fx.update(dt);
        G.post.render(dtReal);
      } else {
        G.post.render(dtReal);
      }
      return;
    }

    if (mode === 'photo') {
      // frozen action, living world — free camera for the perfect shot
      G.time += dtReal;
      G.world.update(dtReal);
      G.ambient.update(dtReal);
      G.fx.update(dtReal);
      updatePhoto(dtReal);
      G.post.render(dtReal);
      if (snapPending) snapPhoto();
      return;
    }

    G.time += dt;
    if (mode === 'play') G.state.playTime += dt;

    G.world.update(dt);
    if (mode === 'play') {
      if (riding) {
        G.boss.rideUpdate(dt);
        G.player.pos.copy(G.boss.mountPos());
        G.player.yaw = G.boss.headingYaw;
      }
      G.player.update(dt);
      if (!riding) updateProgression(dt);
    } else if (mode === 'cine') {
      updateCine(dt);
    }
    G.updateEnemies(dt);
    if (G.boss) G.boss.update(dt);
    G.pickupSys.update(dt);
    G.ambient.update(dt);
    G.fx.update(dt);
    G.map.update();
    G.ui.cooldowns();
    // catch materials created at runtime (spawns, fx) for caustics/rim lighting
    sweepT -= dtReal;
    if (sweepT <= 0) { sweepT = 1.5; G.gfx.sweep(); }

    // frog kill tracking (for whirl shrine)
    const frogsAlive = G.enemies.filter(e => e.alive && e.type === 'frog' && e.pos.z > -60).length;
    if (frogsAliveLast === -1) frogsAliveLast = frogsAlive;
    if (frogsAlive < frogsAliveLast) G.state.frogsKilled += frogsAliveLast - frogsAlive;
    frogsAliveLast = frogsAlive;

    G.fx.applyShake(G.camera, dtReal);
    G.post.render(dtReal);
  }

  // hooks for the on-screen touch controls (touch.js)
  G.game = {
    mode: () => mode,
    riding: () => riding,
    pause: pauseGame, dismount,
    photo: () => (mode === 'photo' ? exitPhoto() : mode === 'play' && enterPhoto()),
    snap: () => { snapPending = true; },
    photoLook(dYaw, dPitch) {
      if (!photo) return;
      photo.yaw -= dYaw;
      photo.pitch = U.clamp(photo.pitch - dPitch, -1.4, 1.4);
    },
  };

  // ---------------- Boot ----------------
  function boot() {
    initRenderer();
    G.post.init();
    G.state = freshState();
    G.fx.init();
    G.world.build();
    G.pickupSys.init();
    G.map.init();
    G.ambient.init();
    G.player = G.makePlayer();
    // characters get a fresnel rim light so they read clearly against the scenery
    const spawn = G.spawnEnemy;
    G.spawnEnemy = function (...args) {
      const e = spawn.apply(this, args);
      if (e && e.grp) G.gfx.setRim(e.grp, 0.45);
      if (e && e.segs) e.segs.forEach(sg => sg.isObject3D && G.gfx.setRim(sg, 0.45));
      return e;
    };
    spawnWorldEnemies();
    G.boss = G.makeBoss();
    G.gfx.setRim(G.player.grp, 0.3);
    G.gfx.setRim(G.boss.grp, 0.4);
    for (const it of G.pickups) if (it.kind === 'baby') G.gfx.setRim(it.mesh, 0.5);
    G.gfx.sweep();
    initInput();
    wrapFrogDeaths();
    if (G.save.exists()) document.getElementById('continue-btn').style.display = 'inline-block';
    G.ui.hud();
    frame();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
