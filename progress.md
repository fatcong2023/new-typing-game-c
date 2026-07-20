Original prompt: OK, 那我们现在按照这个电子表格里面的， 把游戏重新做一遍

## Notes

- True project root is `/Users/frankcj/workplace/new-typing-game-codex`.
- User wants the current game rebuilt according to `outputs/typing_tower_enrichment_plan.xlsx`.
- Use Excel as the source of truth over the older `docs/enrichment-plan.md` when they differ.
- Keep the existing browser/canvas game feel, but implement the new enrichment plan systems.

## TODO

- Inspect the existing single-file game structure and identify safe seams for extracting testable logic.
- Added failing tests for arrows, armor, economy, upgrades, and level/tier progression before production code.
- Implemented initial `src/gameData.mjs` and `src/gameLogic.mjs`; next step is to verify the tests turn green.
- Replaced the old inline `index.html` with a module-based Canvas game in `src/gameApp.mjs`.
- Browser game now has combat/enrichment TAB switching, 1/2/3 arrow selection, armor/burn logic, after-level shop, tower upgrades, longbowman weapon path, and `render_game_to_text` / `advanceTime` hooks.
- Added `work/playtest.mjs` to verify the real browser keyboard flow and screenshots.
- Screenshot review found low-contrast weapon HUD text; fixed by resetting right-panel text fill color.
- Updated README for module serving, new controls, and implemented spreadsheet systems.
- Final verification run:
  - `npm test` passed 6/6 tests.
  - `node --check src/gameApp.mjs src/gameData.mjs src/gameLogic.mjs work/playtest.mjs` passed.
  - `web_game_playwright_client.js` smoke test passed and produced no browser error file.
  - `node work/playtest.mjs` passed the keyboard flow for combat typing, Tab enrichment, shop purchase, and screenshots.

## 2026-07-03 — bug fixes + illuminated-manuscript restyle

- Playtested every flow in the browser (combat, Tab lanes, phrase rewards, shop,
  boss level, victory, restart) and fixed the confirmed bugs without touching
  the mechanics:
  - Repair can no longer be bought while the tower is at full HP (it silently
    burned 60 gold before); the shop says "The walls are already whole".
  - Enrichment input is capped at phrase length + 3, mirroring the combat lane,
    so overtyping no longer requires dozens of blind backspaces.
  - Keydown handler ignores Cmd/Ctrl/Alt chords — browser shortcuts work again
    and no longer leak letters into the input; the shop only preventDefaults
    keys it actually handles.
  - Explosive Arrow now applies its spreadsheet `splashRadius` (70) as real
    area damage instead of behaving like a paid normal arrow.
  - The quiver HUD shows arrows 4/5/6 as their tiers unlock (they were
    selectable but invisible); `render_game_to_text` reports the buffed boss
    name ("Tier N Warlord") instead of the base type name.
  - `startCampaign` resets message/phrase/shake transients.
- Restyled the whole renderer to match `new-typing-game`'s illuminated
  manuscript look: vellum page with foxing, gilt sun and page border with
  corner lozenges, ink-outlined hills, St George's cross tower, stick-figure
  men-at-arms with fleur-de-lis heater shields, parchment cartouches for both
  typing lanes, blackletter overlay/shop titles, and the same WebAudio sfx
  palette (shoot/hit/kill/knock/horn/coin/type). Gameplay geometry (canvas
  1100×660, spawn/stop lines, speeds, timers) is untouched.
- Added regression tests for the repair guard and the enrichment cap
  (npm test: 8/8 green).

## Next Suggestions

- Tune level pacing after a human playthrough; the systems are implemented, but numbers may still need balancing.
- Add richer art/audio effects for Fire, Piercing, and later Fire Musket shots.
- Consider saving campaign progress to localStorage once the core feel is approved.
- Implement modular game logic and wire it into the browser game.
- Run automated tests, browser playtest, screenshot inspection, and final verification.

## 2026-07-18 — illustrated longbowman sprite

- Replaced the procedural English longbowman drawing with the transparent
  illuminated-manuscript cartoon asset at
  `src/assets/english-longbowman-cartoon.png`.
- Kept the old Canvas figure as a load-failure fallback and aligned the arrow
  launch origin with the illustrated bow's nocked arrow.
- Added a subtle gilt glow when the combat word is complete so the static
  full-draw pose still communicates the ready-to-fire state.
- Browser screenshot review confirmed the sprite is grounded at the English
  line, stays inside the page border, and remains readable beside the
  barricade; the full keyboard playtest completed without console/page errors.

## 2026-07-18 — upward draw-and-release animation

- Added four consistent illustrated poses: raise/nock, half draw, full draw,
  and release/follow-through, generated as one identity-preserving sprite
  sheet and extracted into transparent runtime frames.
- Typing now advances the bowman from raise to half draw to full draw; Space or
  Enter holds the completed draw briefly, shows the release pose, and launches
  the real ballistic arrow upward from the illustrated bow.
- `render_game_to_text` now exposes the archer pose and live arrow coordinates
  so the animation and projectile handoff can be browser-tested.
- Final verification: 8/8 Node tests passed; the browser playtest captured and
  asserted half-draw, full-draw, release, and a live upward projectile with no
  console/page error file; all four runtime frames have valid alpha channels.

## 2026-07-18 — normalized scale and smoother bow motion

- Fixed the apparent size jump at full draw: all animation images now use one
  source-pixel scale instead of forcing differently cropped frames to the same
  destination height.
- Added eased draw progress driven by the proportion of the word typed, plus
  cross-fades between raise, half-draw, full-draw, release, and recovery. The
  projectile now leaves during the blended release instead of on a hard cut.
- Screenshot inspection showed that long cross-fades produced visible double
  images. Replaced them with four purpose-drawn in-between poses and an
  eight-frame sequence, retaining eased timing without ghosted bodies.
- Final verification: frame scale stays constant at `0.21`, all eight runtime
  PNGs have valid alpha, 8/8 Node tests pass, and the full browser playtest
  exercises partial draw, full draw, release, projectile flight, enrichment,
  and shop flows without a console/page error file.

## 2026-07-18 — camp and projectile readability

- Shifted the English St George standard from x=16 to x=48 so its pole and
  flag no longer sit underneath the illuminated page's left border.
- Increased the airborne arrow silhouette from 18 px to 42 px, with a longer
  shaft, larger bodkin-style head, and clearer fletching while leaving its
  ballistic trajectory and collision point unchanged.
- Browser screenshot inspection confirmed the English flag is fully inside
  the page border and the enlarged arrow is clearly readable during its upward
  flight. Final verification passed `node --check`, all 8 Node tests, the full
  keyboard/animation browser playtest, and `git diff --check` with no captured
  console or page errors.

## 2026-07-18 — local-network deployment

- Made `npm start` explicitly bind the static game server to `0.0.0.0:8000`
  so phones and computers on the same LAN can load the game.
- Documented localhost and LAN access in the README.
- Restarted the live server on the explicit IPv4 bind and verified the game
  through this Mac's current LAN URL, `http://192.168.2.202:8000`, including a
  Playwright gameplay screenshot and `render_game_to_text` state. The macOS
  application firewall is currently disabled.

## 2026-07-18 — 30 fps hybrid longbow animation

- Generated seven identity- and costume-matched in-between drawings, removed
  the flat chroma-key background, and normalized them to the source-pixel scale
  of the existing eight transparent frames.
- Expanded the runtime sequence from 8 to 15 authored poses: nine progressive
  draw poses plus six release/follow-through/recovery poses.
- Replaced threshold-based release cuts with a 30 fps animation timeline that
  holds each drawing for two ticks (traditional animation "on twos"), while
  the Canvas game continues rendering at the display refresh rate.
- Added a deterministic browser animation playtest that renders and asserts all
  15 authored poses. Screenshot review found the three older release frames
  were smaller than their new neighbors, so per-frame scale normalization was
  added to remove that alternating size pulse.
- Final verification passed: all 15 pose assets have transparent corners and
  non-empty alpha; the dedicated 15-frame browser test, full typing/shooting/
  shop browser flow, 8/8 Node tests, syntax checks, localhost HTTP check, and
  `git diff --check` all completed without captured console or page errors.

## 2026-07-18 — replaced frame animation with a skeletal rig

- User review correctly identified that matching only the outer frame/feet did
  not stabilize independently redrawn characters. Browser-image diagnostics
  measured roughly 34 px horizontal and 16 px vertical helmet drift across a
  figure only about 100 px tall.
- Retired the 15-pose sequence from runtime. The archer now uses one immutable
  armless body layer plus a bow arm, draw upper arm, and draw forearm attached
  to fixed root, head, and shoulder coordinates.
- Added continuous eased hand paths, two-bone inverse kinematics for the draw
  elbow, a procedural bow/string that follows the rig, and an upward nocked
  arrow that hands off to the existing ballistic projectile.
- Added test-first coverage proving the root, torso, head, and shoulders remain
  identical throughout draw/release, both arm-bone lengths stay fixed, hand
  motion is continuous, recovery returns to the same nocking pose, and the
  full-draw arrow points upward.
- Final verification: 13/13 Node tests passed; the deterministic skeletal-pose
  browser capture and complete typing/shooting/shop browser flow passed; all
  four rig assets have non-empty alpha with transparent corners; localhost
  returned HTTP 200; no console/page error file was captured.

## 2026-07-18 — corrected shoulder attachment height

- Screenshot inspection traced the low-looking arms to both fixed shoulder
  joints being 12 px below the illustrated body's round shoulder sockets.
- Raised both shoulders, both complete hand-motion paths, and every release
  follow-through control point by the same 12 px, leaving the body, head, and
  feet fixed so the character cannot bounce or change size.
- Raised the ballistic projectile origin by the same amount so the airborne
  arrow still hands off exactly from the full-draw bow grip.
- Added an exact shoulder/socket regression test. All 14 Node tests, the
  deterministic 22-pose browser capture, and the complete gameplay browser
  playtest pass without console or page errors; visual inspection confirms the
  bow arm now leaves the upper shoulder and is level at full draw.

## 2026-07-18 — corrected draw elbow and restored longbow proportions

- User review exposed that raising only the hand path left the full-draw elbow
  folded 28 px below its shoulder, visually placing the joint on the waist.
- Corrected the rig at its source: the draw upper arm is now 26 px and the
  forearm-plus-hand 36 px, matching the deliberately longer forearm asset. At
  full draw the elbow sits behind and within 1 px of shoulder height.
- Routed the release hand around the shoulder's reachable arc so neither bone
  stretches, collapses, or jumps during follow-through.
- Replaced the 84 px generic bow with a 144 px stave, approximately the
  150 px archer's full height, and moved its geometry into the testable rig
  module.
- Added test-first regressions for full-draw elbow placement, both bone lengths
  over the entire animation, and a minimum 140 px English-longbow stave.

## 2026-07-18 — restored the original outward longbow curve

- User review identified a cusp at the grip: the procedural stave was made from
  two quadratic segments sharing one control point, so their opposite tangents
  produced an inward dent in the middle.
- Replaced the two-segment cusp with one continuous quadratic stave. Its tips
  sit 16 px behind the hand and its center passes exactly through the grip,
  reproducing the original character art's outward arch while retaining the
  corrected 144 px English-longbow length.
- Added a regression test proving the continuous curve crosses the grip and
  keeps both tips behind the outward-bulging center.

## 2026-07-18 — removed the release-arm 360-degree flip

- Numerical replay confirmed the user's report: at 45% of release the IK
  solver switched between its two valid elbow branches, teleporting the elbow
  29.47 px in one frame. Across recovery, the upper arm accumulated 8.50
  radians of rotation—more than a complete turn.
- Replaced independent per-frame release IK with an authored anatomical elbow
  follow-through: a short backward recoil at shoulder height, followed by one
  continuous lowering arc to the nocking pose. The hand now recoils beside the
  face and relaxes directly instead of circling the shoulder.
- Added a test-first rotation budget and per-frame angle limit for both upper
  arm and forearm. Upper-arm release rotation is now 1.72 radians total with a
  0.032-radian largest step; forearm rotation is 0.60 radians total with a
  0.006-radian largest step.

## 2026-07-19 — balanced English and French character scale

- Screenshot review confirmed the English archer rendered about 150 px tall,
  while a regular French soldier's illustrated body is roughly 71 px tall.
- Added one 0.6 world-scale transform around the archer's fixed foot/root so
  the body, arms, joints, string, arrow, and longbow all shrink together. The
  English figure is now about 90 px tall—roughly 26% taller than a regular
  French soldier instead of more than twice as tall.
- Applied the same transform to text-state joint coordinates and derived the
  projectile launch point from the scaled full-draw bow hand, preventing a
  detached arrow or animation drift.
- Added a regression test that constrains the English figure to 115–130% of
  the regular French figure height.

## 2026-07-19 — redrew the longbow string hand from the dorsal view

- Replaced the palm-facing draw-hand art with a new modular forearm sprite that
  shows the complete back of the right hand toward the player.
- The hand silhouette now has two explicit hooked drawing fingers—index above,
  middle below—while the ring and little fingers fold into the fist and the
  thumb rests across them. The string remains procedural, so the new hand stays
  aligned throughout draw and release.
- Preserved the original 624 x 180 attachment canvas, quilted sleeve, chainmail
  cuff, transparent padding, and rig endpoints so the redraw does not change
  arm length, scale, or animation timing.
- Generated the raster edit with the built-in image tool on chroma green,
  removed the key locally with a soft matte/despill, and saved the final alpha
  asset as `src/assets/english-longbowman-rig/draw-forearm-two-finger.png`.

## 2026-07-18 — documented the character-art pipeline and designed enemies 1–2

- Added `Longbow Training Character Art Bible.md` to the user's AgentsShare
  Obsidian vault and linked it from the vault index. It records the shared
  historical/style rules and, most importantly, the production failures to
  avoid: per-frame anchor drift, bbox-based scale pulsing, disconnected limb
  motion, IK branch flips, changing bone lengths, detached weapons/projectiles,
  and unverified chroma-key transparency.
- Two independent design agents produced the first review-only enemy baselines:
  `src/assets/enemies/grunt/grunt-concept-v1.png` and
  `src/assets/enemies/runner/runner-concept-v1.png`.
- Both are 1024 x 1536 RGBA cutouts facing left and match the approved warm
  illuminated-manuscript cartoon style. The Grunt reads through kettle hat,
  sword, and small blue shield; the Runner reads through a lean forward pitch,
  long stride, no shield, and low-held light sword.
- Fresh validation confirmed transparent corners, non-empty alpha bounds, zero
  detected chroma-green fringe, and distinct silhouettes at the intended 71 px
  in-game height. These are concept baselines only; neither is wired into the
  renderer or split into animation parts yet.

## 2026-07-19 — enlarged the Grunt shield and added skeletal enemy animation

- Replaced the review Grunt with `grunt-concept-v2-large-shield.png`; measured
  blue shield area is 31.7% larger than V1 while the body, pose, scale, facing,
  and foot baseline remain unchanged.
- Split Grunt and Runner into reusable transparent cutout rigs with explicit
  proximal/distal anchors. Both runtime definitions expose a shared 17-joint
  skeleton: root, pelvis, chest, neck, head, paired shoulders/elbows/wrists,
  and paired hips/knees/ankles.
- Added continuous procedural locomotion. Grunt uses a short, low-lift walk;
  Runner uses a longer-stride, higher-lift, forward-leaning run. Limb lengths
  remain constant and every pose is solved around one fixed foot/root scale.
- Added a 1.25 s fatal-hit sequence: knees buckle, the sword hand reaches the
  chest by 28% progress, the sword releases to its own trajectory, and the
  body falls while the head lags and the free arm reacts. No whole-frame image
  swaps or per-frame bounding-box scaling are used.
- Added focused Node regressions for rig structure, asset manifests, constant
  bone lengths, gait differences, death staging, monotonic fall rotation, and
  rotation continuity. Added a deterministic browser playtest exposing all
  world-space joints through `render_game_to_text`.
- Browser inspection covered eight locomotion samples and nine death samples
  for both enemies, plus a live campaign capture using the standard web-game
  client. Assets loaded successfully and no console/page errors were emitted.
- Updated the Obsidian Character Art Bible with the 17-joint schema and the new
  lessons about leg-chain lengths, staged death acting, weapon-parent release,
  and why Runner motion must be authored rather than merely sped up.

## 2026-07-19 — corrected sword carriage, Runner shield, and knee articulation

- User review correctly identified that the Grunt sword inherited its forearm's
  downward angle. The blade now follows its own continuous 5–39 degree upward
  elevation cycle, always staying between level and 45 degrees above ground.
- Confirmed that the Runner rig had no shield: the apparent tiny blue shield was
  the waist cloth. Added a dedicated medium French-blue heater shield with a
  gold fleur-de-lis and bound it to the non-sword wrist.
- Screenshot inspection found that simply increasing foot lift did not solve the
  dwarf-like gait. Both rigs used equal thigh/shin targets even though their
  approved source anchors have a roughly 1.5:1 ratio, shrinking the thighs and
  enlarging the boot sections.
- Replaced equal leg segments with source-proportional thigh and shin lengths,
  lengthened the full lower body beyond 1.52x the neck-to-hip chain, changed the
  recovery-foot trajectory to a symmetric raised arc, and kept the same fixed
  root. Both near and far knees now flex by more than 38 degrees, reach a
  natural extension, and alternate without bone stretching.
- Added failing-first regressions for sword elevation, both-knee movement,
  human thigh/shin proportions, and the real Runner shield asset. Visual browser
  captures were regenerated after the tests passed.

## 2026-07-19 — fixed Grunt boot grounding at the source anchor

- User review showed the gait was still visually wrong even though the knee
  coordinates and bone-length tests passed. A source-to-world anchor trace found
  the real cause: the renderer mapped each combined shin/boot image's internal
  ankle anchor to the ground target, leaving the actual sole 4–6 world units
  below ground. Even the lifted boot could still intersect the terrain.
- Added `rigGeometry.mjs` so source and target anchors use one testable transform.
  Combined shin/boot parts now map their explicit `foot_contact` source anchor
  to the planted or lifted foot target. The same correction applies to Grunt and
  Runner without changing the fixed character root or knee motion.
- Added a failing-first geometry regression across eight gait phases. It verifies
  exact sole placement, prevents toe penetration, limits unnatural toe lift, and
  proves the swing foot actually clears the ground.
- Regenerated and inspected all eight locomotion frames plus a standard live-game
  Playwright screenshot. The boots now alternate between a planted sole and a
  visibly lifted recovery step instead of bunching beneath the pelvis.

## 2026-07-19 — replaced the rigid lower leg with an articulated ankle and corrected gait direction

- A second user review exposed two remaining architectural faults. Mapping the
  combined shin/boot part to one sole point still rotated the entire foot with
  the shin, so the heel could touch while the rest of the sole floated. The
  horizontal gait phase was also reversed for a character travelling left,
  making the feet cycle as if the soldier were walking backward.
- Split both approved Grunt shin/boot images non-destructively into overlapping
  `near/far-shin.png` and `near/far-boot.png` parts. Added explicit near/far foot
  joints, raising the shared skeleton from 17 to 19 joints and the leg chain to
  hip → knee → ankle → foot contact.
- Reversed the foot trajectory for leftward travel: the swing foot now moves
  from the right rear to the left front, lands, and then passes toward the rear
  during stance. The ankle stays above the sole, allowing the boot to remain
  level without forcing a reverse-bending shin.
- Added failing-first tests for the two foot joints, fixed ankle/foot lengths,
  correct leftward gait direction, all four split assets, and sole/toe mapping.
  Regenerated all eight locomotion frames and inspected the live game afterward.

## 2026-07-19 — rebuilt the Grunt lower body around an authored human step cycle

- Replaced the remaining sinusoidal foot shuffle with explicit heel-strike,
  planted-support, toe-off, and recovery-swing phases. The planted foot now
  moves from the left/front of the soldier toward the right/rear while the
  opposite knee bends and carries its boot forward for the next landing.
- Kept thigh, shin, and boot as three independent rigid pieces connected at the
  hip, knee, and ankle. The boot now has its own pitch at heel strike and
  toe-off instead of inheriting the shin rotation.
- Restored one common source-art scale across the approved thigh, shin, and
  boot cutouts. This fixes the undersized, hovering feet caused by shrinking
  the boot separately from the rest of the leg.
- Added regressions for the four human gait phases, knee-led recovery, fixed
  segment lengths, independent ankle pitch, common cutout scale, planted soles,
  and toe clearance. All 35 tests and the deterministic eight-phase browser
  animation playtest pass.

## 2026-07-19 — corrected Grunt handedness, depth order, and far boot profile

- Traced the visible sword arm to an inverted near/far hand assignment: the
  renderer put the right sword arm in the foreground and attached the left
  shield to the hidden arm. The Grunt now binds the left/near wrist to the
  shield and the right/far wrist to the sword; the walking sword arm is omitted
  behind the torso while its weapon remains between the body and shield.
- The former foreground forearm cutout also contained a painted sword hilt.
  The visible shield arm now uses the dedicated bar-grip hand artwork, with the
  shield drawn over it, so no second sword hand leaks out beside the torso.
- Traced the apparently twisted right boot to the original `far-boot.png`,
  which is a frontal three-quarter boot being rotated as if it were a side-view
  cutout. The far leg now reuses the approved left-facing side-profile boot
  geometry, behind the near leg, so both feet preserve the same silhouette.
- Kept the death reaction coherent with the corrected handedness: the hidden
  sword hand releases its weapon and crosses the chest, while the shield arm
  flails outward. Added a render-plan regression for handedness, occlusion,
  weapon depth, and boot visual selection.
- Re-ran the deterministic eight-phase locomotion/death capture and the shared
  web-game Playwright client. Both live screenshots were inspected and no
  browser errors were recorded.

## 2026-07-19 — real medieval recorder background music

- Composed a 32-bar A Dorian training loop at 84 BPM and rendered all 120 notes
  from VCSL's real Baroque Alto Recorder sustain samples rather than a synth.
- Added the seamless 91.4-second stereo Opus asset at
  `src/assets/music/medieval-recorder-loop.ogg`; playback begins from the first
  keyboard gesture so browser autoplay rules are respected and loops quietly
  underneath the existing WebAudio effects.
- Added an F2 music mute/restore control and exposed the current music state in
  `render_game_to_text` for browser verification.

## 2026-07-19 — expanded the score into a three-instrument ensemble

- Kept the 84 BPM A Dorian recorder melody and added 256 Folk Harp notes as a
  quiet modal broken-chord accompaniment plus 32 sustained Bowed Psaltery notes
  as the string bed.
- Rendered every part from the locally installed VCSL WAV samples, balanced the
  harp slightly left and the psaltery slightly right, folded the reverb tail
  across the 32-bar boundary, and preserved the recorder-only file as an
  alternate.
- Switched the game to `medieval-ensemble-loop.ogg` and exposed the three-part
  arrangement in `render_game_to_text`.
