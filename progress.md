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

## Next Suggestions

- Tune level pacing after a human playthrough; the systems are implemented, but numbers may still need balancing.
- Add richer art/audio effects for Fire, Piercing, and later Fire Musket shots.
- Consider saving campaign progress to localStorage once the core feel is approved.
- Implement modular game logic and wire it into the browser game.
- Run automated tests, browser playtest, screenshot inspection, and final verification.
