# Longbow Training — Typing Defense

A keyboard-only typing defense game built around the enrichment plan in
`outputs/typing_tower_enrichment_plan.xlsx`, drawn as an illuminated
manuscript: vellum, ink, gold leaf, and heraldic pigments, with blackletter
titles set in UnifrakturMaguntia and body text in EB Garamond.

You hold a line with a longbowman posted behind a cheval de frise while enemies
advance from the right. Type combat words to fire arrows, then risk switching to
enrichment phrases for Training Points before the enemy overruns the barricade.

## Run it

This version uses JavaScript modules, so serve the folder instead of opening the
HTML file directly:

```bash
npm start
```

Open `http://localhost:8000` on the host. The server binds to `0.0.0.0`, so
other devices on the same local network can use
`http://<the-host-LAN-IP>:8000`.

## Controls

| Key | Action |
| --- | --- |
| Enter | start / restart / leave the shop · fire in combat mode |
| letters | type in the active lane |
| Space | fire in combat mode (or Enter), type a space in enrichment mode |
| Backspace | delete the last typed character |
| Tab | switch between combat word and enrichment phrase |
| 1 | Normal Arrow |
| 2 | Fire Arrow, once unlocked (Tier 2) |
| 3 | Piercing Arrow, once unlocked (Tier 3) |
| 4 | Ice Arrow, once unlocked (Tier 4) |
| 5 | Armor Breaker, once unlocked (Tier 5) |
| 6 | Explosive Arrow, once unlocked (Tier 6) |
| F2 | mute / restore the background music |
| 1–4 in the shop | buy the numbered ware |

Shortcuts held with Cmd/Ctrl/Alt are left to the browser.

## Implemented systems

- 100-level campaign tiering with word-length bands increasing every 10 levels.
- Combat/enrichment lane switching with phrase progress preserved after Tab.
- Gold, Training Points, and Arrow Charge as separate resources.
- Chainmail-style armor points: normal arrows chip armor before damaging HP.
- Fire arrows bypass armor and apply burn damage.
- Piercing arrows hit several front-line enemies.
- Ice arrows slow, Armor Breakers crack plate, Explosive arrows splash within
  their blast radius — each surfaces in the quiver HUD as its tier unlocks.
- After-level shop for tower upgrades, longbowman weapon progression, repairs
  (refused while the walls are whole), and special arrow refills.
- Barricade path from Sharpened Stakes to Dragonsteel Abatis.
- Longbowman path from Longbow through Silver/Golden Bow to Fire Musket.
- Spine 4.3 longbowman animation with the repaired adult proportions, shoulder
  joints, full draw, flexible bow, release, and distance-driven waist pitch.
- WebGL mesh rendering keeps the archer's artwork continuous. The game canvas
  follows its displayed size and screen pixel density, including window resizing.
- French light infantry uses the approved Spine soldier: an overhead-shield walk
  and a raised-arm downward sword strike. Each 1.2-second attack damages the
  barricade at 0.64 seconds, during the cut. Defeated soldiers keep their current
  artwork while falling and fading.
- Illuminated-manuscript presentation: vellum page, gilt borders and corner
  lozenges, St George's cross on the line's standard, fleur-de-lis heater shields,
  a small WebAudio synth for arrows, coins, horns, and typing, and a looping
  84 BPM medieval ensemble score rendered from VCSL's real Baroque Alto
  Recorder, Folk Harp, and Bowed Psaltery samples.
- Browser playtest hooks: `window.render_game_to_text()` and
  `window.advanceTime(ms)`.

## Verification

```bash
npm test
node work/playtest.mjs   # requires playwright and a server on :8000
node work/spine-rendering-playtest.mjs # draw/hold/release, frame timing and HiDPI resizing
node work/french-soldier-playtest.mjs # walk, sword strike, impact timing, death and multiple enemies
```

The Spine playtest accepts `PLAYTEST_URL`, `PLAYTEST_OUTPUT_DIR`, and
`PLAYWRIGHT_MODULE` (a module specifier or file URL when Playwright is installed
elsewhere). Set `PLAYTEST_SOFTWARE_GL=1` to check the software WebGL fallback;
frame timing from that run is not representative of GPU rendering.

The French soldier's editable source is `spine/french-soldier/french-soldier-combat.spine`.
Its Spine 4.3 JSON, atlas and texture ship together under `src/assets/spine/` as
`french-soldier-combat.*`. To update the game after editing the source, export
JSON plus a packed texture atlas to that directory, preserving the two animation
names `walk_shield_overhead` and `attack_shield_overhead`. Runtime sampling and
impact timing are in `src/soldierAnimation.mjs`; drawing is in `src/spineSoldier.mjs`.
