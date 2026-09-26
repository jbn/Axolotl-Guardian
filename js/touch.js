// Axolotl Guardian — on-screen touch controls: floating move stick (left), drag-to-look (right), action buttons
G.touchUI = (function () {
  const $ = id => document.getElementById(id);
  const canvas = document.getElementById('game-canvas');
  const STICK_R = 56;                 // px the knob can travel from the base centre
  const DEAD = 0.14;
  const LOOK_YAW = 0.0058, LOOK_PITCH = 0.0046;   // rad per px

  let move = null;                    // { id, x0, y0 }
  let look = null;                    // { id, x, y }
  let lastMode = '', lastRiding = null;

  function enable() {
    if (document.body.classList.contains('touch')) return;
    G.touch = true;
    document.body.classList.add('touch');
  }

  // ---------------- move stick + look drag (touches that land on the canvas) ----------------
  function setStick(dx, dy) {
    const len = Math.hypot(dx, dy), k = len > STICK_R ? STICK_R / len : 1;
    const kx = dx * k, ky = dy * k;
    $('joy-knob').style.transform = `translate(${kx}px, ${ky}px)`;
    const m = Math.min(len / STICK_R, 1);
    const mag = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
    G.stick.x = len ? (dx / len) * mag : 0;
    G.stick.z = len ? (dy / len) * mag : 0;
  }
  function releaseStick() {
    move = null;
    G.stick.x = G.stick.z = 0;
    $('joy').classList.remove('active');
    $('joy').style.left = $('joy').style.top = '';
    $('joy-knob').style.transform = '';
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    enable();
    e.preventDefault();
    const mode = G.game.mode();
    if (mode !== 'play' && mode !== 'photo') return;
    if (e.clientX < window.innerWidth * 0.45) {
      if (move) return;
      move = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      const j = $('joy');
      j.classList.add('active');
      j.style.left = e.clientX + 'px';
      j.style.top = e.clientY + 'px';
      setStick(0, 0);
    } else if (!look) {
      look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    canvas.setPointerCapture(e.pointerId);
  }, { passive: false });

  canvas.addEventListener('pointermove', e => {
    if (move && e.pointerId === move.id) { setStick(e.clientX - move.x0, e.clientY - move.y0); return; }
    if (!look || e.pointerId !== look.id) return;
    const dx = e.clientX - look.x, dy = e.clientY - look.y;
    look.x = e.clientX; look.y = e.clientY;
    const mode = G.game.mode();
    if (mode === 'play') {
      G.player.camYaw -= dx * LOOK_YAW;
      G.player.camPitch = U.clamp(G.player.camPitch + dy * LOOK_PITCH, -0.6, 1.1);
    } else if (mode === 'photo') {
      G.game.photoLook(dx * LOOK_YAW, dy * LOOK_PITCH);
    }
  });

  function endPointer(e) {
    if (move && e.pointerId === move.id) releaseStick();
    if (look && e.pointerId === look.id) look = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // ---------------- buttons ----------------
  // tap: fires once on press. hold: onDown/onUp bracket the press.
  function bind(id, onDown, onUp) {
    const el = $(id);
    if (!el) return;
    let pid = null;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      enable();
      if (pid !== null) return;
      pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch (err) {}
      el.classList.add('pressed');
      onDown();
    });
    const up = e => {
      if (e.pointerId !== pid) return;
      pid = null;
      el.classList.remove('pressed');
      if (onUp) onUp();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  const inPlay = () => G.game.mode() === 'play';
  const canAct = () => inPlay() && !G.game.riding() && !G.player.dead;
  const holdKey = code => [() => { G.tkeys[code] = true; }, () => { G.tkeys[code] = false; }];

  bind('ab-whip', () => { if (inPlay()) G.player.whip(); });
  bind('ab-blast', () => { if (inPlay()) G.player.startCharge(); }, () => G.player.releaseCharge());
  bind('ab-dash', () => { if (canAct()) G.player.dash(); });
  bind('ab-shield', () => { if (canAct()) G.player.shield(); });
  bind('ab-whirl', () => { if (canAct()) G.player.whirl(); });
  bind('ab-lock', () => { if (canAct()) G.player.toggleLock(); });
  const [jumpDown, jumpUp] = holdKey('Space');
  bind('ab-jump', () => { if (G.game.riding() && inPlay()) G.game.dismount(); else jumpDown(); }, jumpUp);
  bind('ab-dive', ...holdKey('KeyC'));
  bind('tb-pause', () => G.game.pause());
  bind('tb-map', () => { if (inPlay()) G.map.toggle(); });
  bind('minimap', () => { if (inPlay()) G.map.toggle(); });
  bind('tb-photo', () => G.game.photo());
  bind('tb-hat', () => { if (inPlay()) G.player.cycleCosmetic(); });
  bind('tb-skin', () => { if (inPlay()) G.player.cycleSkin(); });
  bind('tb-music', () => G.ui.toast(G.audio.toggleMusic() ? '🎵 Music on' : '🔇 Music off', 1500));
  bind('ph-snap', () => G.game.snap());
  bind('ph-rise', ...holdKey('Space'));
  bind('ph-sink', ...holdKey('KeyC'));
  bind('ph-back', () => G.game.photo());

  // any stray touch (title screen, menus) flips the page into touch layout
  window.addEventListener('touchstart', enable, { passive: true });
  if (G.touch) document.body.classList.add('touch');

  function clearHeld() {
    releaseStick();
    look = null;
    G.tkeys = {};
  }

  return {
    // called every frame from main.js with the current game mode
    sync(mode) {
      const riding = G.game.riding();
      if (mode === lastMode && riding === lastRiding) return;
      if (lastMode === 'play' && mode !== 'play' && mode !== 'photo') clearHeld();
      if (mode === 'photo' || lastMode === 'photo') { releaseStick(); G.tkeys = {}; }
      lastMode = mode; lastRiding = riding;
      document.body.dataset.mode = mode;
      document.body.classList.toggle('riding', riding);
    },
    // first tap on PLAY: go fullscreen + landscape where the browser allows it (Android; iOS ignores)
    onStart() {
      if (!G.touch) return;
      const d = document.documentElement;
      const fs = d.requestFullscreen || d.webkitRequestFullscreen;
      if (fs && !document.fullscreenElement) {
        try {
          const p = fs.call(d, { navigationUI: 'hide' });
          if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
        } catch (e) {}
      }
    },
  };
})();
