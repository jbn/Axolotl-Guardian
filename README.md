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
| **Left click** | 🌊 Tail whip — chain up to a 3-hit combo ending in a spinning slam (whip mid-leap for an air spin) |
| **Right click (hold)** | 💧 Charged water blast — full charge pierces |
| **Q** | 🫧 Bubble shield — blocks hits, *reflects* spores |
| **E** | 🌀 Whirlpool spin — hits groups, flips shelled enemies |
| **SHIFT** | 💨 Dash (brief invincibility) — dash *through* an attack for a slow-mo **Perfect Dodge** and a guaranteed crit |
| **F** / **Middle click** | 🎯 Lock on to the nearest enemy (blasts home in, camera tracks it) |
| **TAB** | 🗺️ World map (a minimap is always in the corner) |
| **H** | Swap cosmetic hats & accessories |
| **J** | 🎨 Swap skin colors (unlocked by finding relics) |
| **P** | 📷 Photo mode — free camera, ENTER saves a PNG |
| **M** | Toggle music |

🎮 **Gamepad supported**: left stick swim, right stick look, A jump, B dash, X whip,
Y whirlpool, LB shield, RT charge blast, RB hat, R3 lock-on, Select map, Start pause.

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
Every enemy flashes a red **!** the instant it commits to an attack — watch, then counter.
Exploiting a weakness lands a golden **crit**; damage numbers and health bars show what's working:
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
WebAudio sound & music — zero dependencies, no build step, no server needed.

**Rendering** (`js/post.js`, `js/gfx.js`, `js/world.js`, `js/grass.js`)
- HDR pipeline: MSAA half-float scene target → dual-kawase bloom → ACES filmic tone
  mapping, color grade, vignette, dithering; underwater wobble, hurt aberration, slow-mo grade.
- Water: a depth/refraction prepass feeds a shader with true thickness-based absorption,
  refraction, fresnel sky reflection, HDR sun glints, contact + shoreline foam, rain
  ripples, a wake around the axolotl, and Snell's window when you look up from below.
- A global material patch adds animated caustics to everything underwater and a fresnel
  rim light to characters; terrain gets slope rock, wet shorelines and rippled sand.
- ~60k GPU grass blades + wildflowers in a camera-following field (heights baked into a
  half-float texture), with wind gusts and grass that parts around you.
- Analytic sky with a blooming sun disc, layered distant hills, a forested rim, soft
  light beams, and per-zone atmosphere (dim glowing Crystal Caverns, a brooding temple
  that brightens once cleansed).

**Audio** (`js/audio.js`): lookahead-scheduled generative music with per-zone chord
progressions and phrase-based motifs, synthesized percussion for the boss, convolution
reverb, a master compressor, and marsh / underwater / cavern ambience beds.

**Models**: all 39 models (player, enemies, boss, vegetation, architecture, pickups, hats)
are authored in **Blender** by the scripts in `blender/`, exported as GLB with vertex
colors (with Cycles-baked ambient occlusion multiplied in), and embedded as base64
in `js/assets-data.js` so the game still runs from a double-clicked `index.html` —
no fetches, no CORS. A tiny custom GLB parser (`js/assets.js`) instantiates them as
named node hierarchies that the gameplay code animates directly (gills, claws,
whiskers, jaws...).
