# Longbow Training — Typing Defense

A keyboard-only typing defense game built around the enrichment plan in
`outputs/typing_tower_enrichment_plan.xlsx`.

You defend a tower with a longbowman while enemies advance from the right. Type
combat words to fire arrows, then risk switching to enrichment phrases for
Training Points before the enemy reaches the wall.

## Run it

This version uses JavaScript modules, so serve the folder instead of opening the
HTML file directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Controls

| Key | Action |
| --- | --- |
| Enter | start / restart / leave the shop |
| letters | type in the active lane |
| Space | fire in combat mode, type a space in enrichment mode |
| Backspace | delete the last typed character |
| Tab | switch between combat word and enrichment phrase |
| 1 | Normal Arrow |
| 2 | Fire Arrow, once unlocked |
| 3 | Piercing Arrow, once unlocked |

## Implemented systems

- 100-level campaign tiering with word-length bands increasing every 10 levels.
- Combat/enrichment lane switching with phrase progress preserved after Tab.
- Gold, Training Points, and Arrow Charge as separate resources.
- Chainmail-style armor points: normal arrows chip armor before damaging HP.
- Fire arrows bypass armor and apply burn damage.
- Piercing arrows hit several front-line enemies.
- After-level shop for tower upgrades, longbowman weapon progression, repairs,
  and special arrow refills.
- Tower path from Wooden Watchtower to Dragonstone Keep.
- Longbowman path from Longbow through Silver/Golden Bow to Fire Musket.
- Browser playtest hooks: `window.render_game_to_text()` and
  `window.advanceTime(ms)`.

## Verification

```bash
npm test
node work/playtest.mjs
```
