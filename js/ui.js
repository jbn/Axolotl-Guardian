// Axolotl Guardian — HUD, toasts, banners, screens
G.ui = (function () {
  const $ = id => document.getElementById(id);
  let toastTimer = null, unlockTimer = null;
  let prevHearts = -1, prevPearls = -1, beatT = 0, comboTimer = null;
  const prevCd = {};
  const HEART_SVG = '<svg viewBox="0 0 32 30"><path class="hf" d="M16 28.5C16 28.5 2.2 19.6 2.2 10.2A7 7 0 0 1 16 6.2A7 7 0 0 1 29.8 10.2C29.8 19.6 16 28.5 16 28.5Z"/>' +
    '<ellipse class="hl" cx="9.5" cy="10.5" rx="3.2" ry="2.1" transform="rotate(-35 9.5 10.5)"/></svg>';
  function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  const UI = {
    show(id) { $(id).style.display = 'flex'; },
    hide(id) { $(id).style.display = 'none'; },

    hud() {
      const s = G.state;
      // hearts
      const hb = $('hearts');
      if (hb.childElementCount !== s.maxHearts) {
        hb.innerHTML = '';
        for (let i = 0; i < s.maxHearts; i++) {
          const h = document.createElement('div');
          h.className = 'heart';
          h.innerHTML = HEART_SVG;
          hb.appendChild(h);
        }
      }
      [...hb.children].forEach((h, i) => {
        const was = i < prevHearts, now = i < s.hearts;
        h.classList.toggle('lost', !now);
        if (prevHearts >= 0 && was && !now) retrigger(h, 'break');
        if (prevHearts >= 0 && !was && now) retrigger(h, 'pop');
      });
      if (prevHearts >= 0 && s.hearts < prevHearts) retrigger(hb, 'shake');
      prevHearts = s.hearts;
      hb.classList.toggle('low', s.hearts > 0 && s.hearts <= 2);
      $('pearl-count').textContent = s.pearls;
      if (prevPearls >= 0 && s.pearls > prevPearls) retrigger($('pearl-box'), 'pop');
      prevPearls = s.pearls;
      $('collect-box').innerHTML =
        `🐣 ${s.babies.length}/3 &nbsp; 🏺 ${s.relics}/3`;
      // ability lock states
      $('ab-blast').classList.toggle('locked', !s.abilities.blast);
      $('ab-shield').classList.toggle('locked', !s.abilities.shield);
      $('ab-whirl').classList.toggle('locked', !s.abilities.whirl);
    },

    cooldowns() {
      const p = G.player;
      if (!p) return;
      const set = (id, key) => {
        const frac = U.clamp(p.cd[key] / p.CD[key], 0, 1);
        const q = Math.round(frac * 180) / 180;
        if (prevCd[id] === q) return;
        const el = $(id);
        el.querySelector('.cd').style.background = q > 0
          ? `conic-gradient(rgba(3, 14, 24, .74) ${q * 360}deg, rgba(3, 14, 24, 0) 0)` : 'none';
        if (prevCd[id] > 0 && q === 0 && key !== 'whip') retrigger(el, 'ready');
        prevCd[id] = q;
      };
      set('ab-whip', 'whip'); set('ab-blast', 'blast');
      set('ab-shield', 'shield'); set('ab-whirl', 'whirl'); set('ab-dash', 'dash');
      // low-health heartbeat
      const s = G.state;
      if (s.hearts > 0 && s.hearts <= 2 && !p.dead) {
        beatT -= G.fx.realDt();
        if (beatT <= 0) { beatT = s.hearts === 1 ? 0.9 : 1.2; G.audio.play('lowHealth'); retrigger($('low-vignette'), 'beat'); }
      } else beatT = 0;
    },

    // "x5 COMBO" counter — n < 2 hides it
    combo(n, crit) {
      const el = $('combo');
      if (!el) return;
      if (n < 2) { el.classList.remove('show'); return; }
      el.querySelector('.cn').textContent = n;
      el.classList.add('show');
      el.classList.toggle('hot', n >= 6);
      retrigger(el, crit ? 'critpop' : 'bump');
      if (comboTimer) clearTimeout(comboTimer);
      comboTimer = setTimeout(() => el.classList.remove('show'), 2400);
    },

    perfect() {
      retrigger($('perfect-flash'), 'on');
      const d = $('ab-dash');
      retrigger(d, 'ready');
    },

    bossPhase(p) {
      const n = $('boss-name');
      n.textContent = 'CRYSTAL CATFISH KING' + (p === 2 ? ' · ENRAGED' : p === 3 ? ' · FINAL FORM' : '');
      retrigger($('boss-bar-wrap'), 'phase');
      document.querySelectorAll('#boss-pips i').forEach((pip, i) => pip.classList.toggle('on', i < p));
    },

    objective(text) {
      const el = $('objective');
      if (el.textContent !== text) {
        el.textContent = text;
        el.style.transition = 'none';
        el.style.background = 'rgba(90, 160, 60, .75)';
        setTimeout(() => { el.style.transition = 'background 1.2s'; el.style.background = 'rgba(10, 30, 40, .55)'; }, 700);
      }
    },

    toast(text, dur = 3200) {
      const el = $('toast');
      el.textContent = text;
      el.style.opacity = 1;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el.style.opacity = 0; }, dur);
    },

    unlock(title, desc) {
      const b = $('unlock-banner');
      b.querySelector('.ub-title').textContent = title;
      b.querySelector('.ub-desc').textContent = desc;
      b.classList.add('show');
      G.audio.play('unlock');
      if (unlockTimer) clearTimeout(unlockTimer);
      unlockTimer = setTimeout(() => b.classList.remove('show'), 3800);
    },

    flashAbility(id) {
      const el = $(id);
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 2600);
    },

    charge(p) {
      const el = $('charge-ring');
      if (p <= 0) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.borderColor = p >= 1 ? 'rgba(255, 233, 138, .95)' : `rgba(140, 230, 255, ${0.3 + p * 0.6})`;
      el.style.transform = `scale(${1 + p * 0.5})`;
      el.style.boxShadow = p >= 1 ? '0 0 18px rgba(255,233,138,.7)' : 'none';
    },

    bossBar(frac, show) {
      const w = $('boss-bar-wrap');
      if (show !== undefined) w.style.display = show ? 'block' : 'none';
      if (show) this.bossPhase(1);
      if (frac !== undefined) {
        const pct = Math.max(0, frac * 100) + '%';
        $('boss-bar').style.width = pct;
        $('boss-bar-chip').style.width = pct;
        if (show === undefined) retrigger($('boss-bar-bg'), 'hit');
      }
      if (frac !== undefined && frac <= 0) w.style.display = 'none';
    },

    hurtFlash() {
      const v = $('vignette');
      v.style.opacity = 1;
      setTimeout(() => { v.style.opacity = 0; }, 350);
    },

    subtitle(text) {
      const el = $('subtitle');
      if (!text) { el.style.opacity = 0; return; }
      el.textContent = text;
      el.style.opacity = 1;
    },

    cineBars(on) { document.body.classList.toggle('cine', on); },

    fade(on, cb) {
      const f = $('fader');
      f.style.opacity = on ? 1 : 0;
      if (cb) setTimeout(cb, 1250);
    },

    winStats() {
      const s = G.state;
      const mins = Math.floor(s.playTime / 60), secs = Math.floor(s.playTime % 60);
      $('win-stats').innerHTML =
        `The Crystal Catfish King is <b>cleansed</b> and the wetland breathes again.<br>` +
        `⏱️ Time: <b>${mins}m ${String(secs).padStart(2, '0')}s</b> &nbsp; ⚔️ Corrupted creatures freed: <b>${s.kills}</b><br>` +
        `🫧 Spirit pearls: <b>${s.pearls}</b> &nbsp; 🐣 Babies rescued: <b>${s.babies.length}/3</b> &nbsp; 🏺 Relics: <b>${s.relics}/3</b><br>` +
        (s.babies.length === 3 && s.relics === 3 ? `🌟 <b>PERFECT GUARDIAN!</b> You found everything!` : `Secrets remain hidden in the marsh...`);
    },
  };
  return UI;
})();
