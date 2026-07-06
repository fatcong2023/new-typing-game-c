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
| 2 | Fire Arrow, once unlocked (Tier 2) |
| 3 | Piercing Arrow, once unlocked (Tier 3) |
| 4 | Ice Arrow, once unlocked (Tier 4) |
| 5 | Armor Breaker, once unlocked (Tier 5) |
| 6 | Explosive Arrow, once unlocked (Tier 6) |
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
- Illuminated-manuscript presentation: vellum page, gilt borders and corner
  lozenges, St George's cross on the line's standard, fleur-de-lis heater shields,
  and a small WebAudio synth for arrows, coins, horns, and typing.
- Browser playtest hooks: `window.render_game_to_text()` and
  `window.advanceTime(ms)`.

## Verification

```bash
npm test
node work/playtest.mjs   # requires playwright and a server on :8000
```
