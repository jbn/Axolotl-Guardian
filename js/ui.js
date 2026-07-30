// Axolotl Guardian — HUD, toasts, banners, screens
G.ui = (function () {
  const $ = id => document.getElementById(id);
  let toastTimer = null, unlockTimer = null;

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
          h.textContent = '💗';
          h.style.fontSize = '22px';
          hb.appendChild(h);
        }
      }
      [...hb.children].forEach((h, i) => {
        h.classList.toggle('lost', i >= s.hearts);
      });
      $('pearl-count').textContent = s.pearls;
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
        const frac = p.cd[key] / p.CD[key];
        $(id).querySelector('.cd').style.height = (frac * 100) + '%';
      };
      set('ab-whip', 'whip'); set('ab-blast', 'blast');
      set('ab-shield', 'shield'); set('ab-whirl', 'whirl'); set('ab-dash', 'dash');
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
      if (frac !== undefined) $('boss-bar').style.width = Math.max(0, frac * 100) + '%';
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
