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
