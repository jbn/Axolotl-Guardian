// Axolotl Guardian — progress saving (localStorage, guarded for file:// quirks).
// Saves progression essentials on every milestone; CONTINUE on the title screen
// restores gates, abilities, collectibles and cosmetics. Enemies respawn — the
// marsh always needs a little re-guarding.
G.save = (function () {
  const KEY = 'axolotl-guardian-save';
  let data = null;
  const collectedSet = new Set();
  try {
    data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (data && data.collected) data.collected.forEach(k => collectedSet.add(k));
  } catch (e) { data = null; }

  return {
    exists() { return !!data; },
    data() { return data; },
    collected(k) { return collectedSet.has(k); },
    markCollected(k) { collectedSet.add(k); },

    write() {
      if (!G.state || !G.world || !G.player) return;
      const s = G.state;
      const payload = {
        pearls: s.pearls, abilities: s.abilities, relics: s.relics,
        cosmetics: s.cosmetics, skin: s.skin || 0, kills: s.kills,
        frogsKilled: s.frogsKilled || 0, caveTriggered: !!s.caveTriggered,
        postgame: !!s.postgame, playTime: s.playTime || 0,
        babyNames: s.babies.map(b => b.name),
        gates: G.world.gates.filter(g => g.open).map(g => g.name),
        collected: [...collectedSet],
        checkpoint: [G.checkpoint.x, G.checkpoint.y, G.checkpoint.z],
      };
      try { localStorage.setItem(KEY, JSON.stringify(payload)); } catch (e) {}
      data = payload;
    },

    clear() {
      try { localStorage.removeItem(KEY); } catch (e) {}
      data = null;
      collectedSet.clear();
    },

    // restore world-side state (gates, collected pickups, rescued babies)
    applyWorld(d) {
      for (const g of G.world.gates) {
        if (!(d.gates || []).includes(g.name)) continue;
        g.open = true;
        g.openT = 1;
        g.barrierMat.uniforms.uOpen.value = 1;
        const bi = G.world.colliders.indexOf(g.blocker);
        if (bi >= 0) G.world.colliders.splice(bi, 1);
        g.orbs.forEach(o => o.scale.setScalar(1.6));
      }
      for (let i = G.pickups.length - 1; i >= 0; i--) {
        const it = G.pickups[i];
        if (it.kind === 'relic' && this.collected('relic:' + it.name)) {
          G.scene.remove(it.mesh);
          G.pickups.splice(i, 1);
        } else if (it.kind === 'chest' && this.collected('chest:' + it.cosmetic)) {
          it.opened = true;
          it.lid.rotation.x = -1.2;
        } else if (it.kind === 'baby' && (d.babyNames || []).includes(it.name)) {
          it.rescued = true;
          G.state.babies.push(it);
          it.followIdx = G.state.babies.length;
        }
      }
    },
  };
})();
