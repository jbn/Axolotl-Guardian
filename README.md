# 🌸 Axolotl Guardian: Secrets of the Sunken Marsh

A 10–15 minute 3D action-adventure demo. You are the marsh's smallest — and bravest —
guardian: a pink axolotl on a quest to cleanse the wetland of dark crystal corruption.

## How to play

**Just double-click `index.html`** — it runs offline in any modern browser (Chrome,
Edge, Firefox, Safari). No build step, no server needed. Click the canvas to
capture the mouse; press **ESC** to release it / pause.

## Controls

| Input | Action |
|---|---|
| **W A S D** | Swim / move (camera-relative) |
| **Mouse** | Look around |
| **SPACE** | Swim up • leap out of water • hop on land |
| **C** | Dive down |
| **Left click** | 🌊 Tail whip (melee arc) |
| **Right click (hold)** | 💧 Charged water blast — full charge pierces |
| **Q** | 🫧 Bubble shield — blocks hits, *reflects* spores |
| **E** | 🌀 Whirlpool spin — hits groups, flips shelled enemies |
| **SHIFT** | 💨 Dash (brief invincibility — your dodge) |
| **TAB** | 🗺️ World map (a minimap is always in the corner) |
| **H** | Swap cosmetic hats & accessories |
| **J** | 🎨 Swap skin colors (unlocked by finding relics) |
| **P** | 📷 Photo mode — free camera, ENTER saves a PNG |
| **M** | Toggle music |

🎮 **Gamepad supported**: left stick swim, right stick look, A jump, B dash, X whip,
Y whirlpool, LB shield, RT charge blast, RB hat, Select map, Start pause.

Progress **saves automatically** at every milestone — CONTINUE appears on the title
screen. After freeing the Crystal Catfish King, ride his back for a victory lap!
Dive underwater for light shafts and muffled dreamy sound, watch for fish schools,
dragonflies, birds and log-snails, shooting stars at night, and a rainbow when the
crystal-rain clears.

## The journey

**Sunlit Marsh → Giant Lily Forest → Moss Ruins / Crystal Caverns → the Sunken Temple.**
Collect glowing **spirit pearls** from corrupted creatures to break the gates between
regions — each gate unlocks a new water ability and fully heals you. At the temple,
face the **Crystal Catfish King** in a three-phase battle... and free him, don't destroy him.

### Creatures to outsmart
Every enemy telegraphs its attacks — watch, then counter:
- 🦀 **Crystal crabs** — crack the shell first (blasts work fast; whirlpool flips them)
- 🌿 **Thorn vines** — they rattle before striking; water blasts sever them in two hits
- 🐸 **Shadow frogs** — hit them mid-puff to stun; their spores can be reflected with the shield
- ✨ **Insect swarms** — one whirlpool scatters the whole cloud
- 🐢 **Snapping turtles** — armored up front: dodge the charge, strike the tail, or blast the open jaw
- ⚡ **Electric eels** — untouchable while sparking; strike in the calm between charges
- 🍄 **Mud goblins** — they steal pearls and run! Chase them down for interest

### Secrets
- 🐣 **3 lost baby axolotls** (they'll follow you home)
- 🏺 **3 ancient relics**
- 👒 **4 cosmetics** in treasure chests
- ⚔️ A **challenge cave** ambush in the eastern marsh
- Dynamic day/night, drifting crystal-rain storms, and fireflies after dark

## Tech

Plain JavaScript + [Three.js](https://threejs.org) (vendored in `vendor/`), procedural
WebAudio sound & generative music — zero dependencies, no server needed, ~120 FPS.

All 39 models (player, enemies, boss, vegetation, architecture, pickups, hats) are
authored in **Blender** by the scripts in `blender/`, exported as GLB with vertex
colors (with Cycles-baked ambient occlusion multiplied in), and embedded as base64
in `js/assets-data.js` so the game still runs from a double-clicked `index.html` —
no fetches, no CORS. A tiny custom GLB parser (`js/assets.js`) instantiates them as
named node hierarchies that the gameplay code animates directly (gills, claws,
whiskers, jaws...).

Rendering extras: hand-rolled bloom post-processing (`js/post.js`), depth-graded
water with swell, shore foam and shallow caustics, sun/moon discs, drifting clouds,
stars at night, and a procedural canvas detail texture on the terrain.

| File | What it does |
|---|---|
| `js/world.js` | Terrain, water & sky shaders, zones, gates, day/night, weather |
| `js/player.js` | Axolotl model, swim/hop movement, camera, all four abilities |
| `js/enemies.js` | The seven enemy AIs with telegraphs & weaknesses |
| `js/boss.js` | Crystal Catfish King — 3 phases, hazards, cleansing finale |
| `js/pickups.js` | Pearls, hearts, babies, relics, cosmetic chests |
| `js/assets.js` / `js/assets-data.js` | Embedded-GLB parser / generated asset data |
| `js/fx.js` / `js/audio.js` | Particle systems / procedural SFX & music |
| `js/ui.js` / `js/main.js` | HUD & screens / game loop, progression, cinematics |

### Rebuilding the art (optional — needs Blender 4.2+)

```
blender --background --python blender/build.py -- all --pack        # everything
blender --background --python blender/build.py -- axolotl --preview # one asset + render
```

`blender/lib.py` is the toolkit (blob "clay" modeling via voxel remesh, vertex
painting, GLB export, Cycles preview renders); `blender/characters.py` and
`blender/props.py` define each asset. `--pack` regenerates `js/assets-data.js`.
