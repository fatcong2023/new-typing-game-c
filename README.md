# Longbow — a Typing Defense Game

An **English longbowman** holds a tower against the advancing **French host**.
Type the word shown at the top of the screen, then press **SPACE** to loose an
arrow at the closest enemy. If the tower's HP reaches zero, the archer falls
with it.

The heraldry tells the story: the longbowman wears a white surcoat with St
George's cross and the tower flies the English standard, while every French
man-at-arms carries an azure heater shield charged with a gold fleur-de-lis,
mustering under a fleur-de-lis banner at the field's edge.

## Run it

Open `index.html` in any modern browser — no build step, no dependencies.
(Or serve the folder: `python3 -m http.server` and visit `http://localhost:8000`.)

## How to play

| Key | Action |
| --- | --- |
| letters | type the displayed word |
| Backspace | fix a mistake |
| Space | fire — **only works when your input matches the word exactly** |
| Enter | start / restart |

## Rules & mechanics

- **Words** are picked from an embedded Webster-style common-English word list
  using a seeded RNG. The **seed is the current timestamp** (shown in the
  corner; you can replay a run with `index.html?seed=<number>`).
- The archer **always targets the closest man-at-arms**, and his **shooting
  angle auto-adjusts** — arrows fly on a ballistic arc with gravity, and the
  aim solver leads moving targets so the arrow lands on the enemy.
- French men-at-arms spawn at the right edge of the screen. The spawn interval
  shrinks as the **level** rises (level goes up every 8 kills).
- Enemies that reach the tower start **knocking** it. The tower has 100 HP;
  heavier knights hit harder. At 0 HP the game is over.
- **Armor tiers** appear as levels progress, each taking more arrows to kill:

  | Armor | Arrows to kill | Speed | Knock damage |
  | --- | --- | --- | --- |
  | Cotton | 1 | fast | 3 |
  | Leather | 2 | brisk | 4 |
  | Chain mail | 3 | slow | 5 |
  | Plate | 4 | slowest | 6 |

- Longer, harder words appear at higher levels; word length scales from 3–5
  letters at level 1 up to 6–12 letters in the late game.

## Design notes

- Single self-contained `index.html` — vanilla JavaScript + Canvas, ~60 fps
  `requestAnimationFrame` loop, tiny WebAudio synth for sound effects.
- Gameplay randomness (word choice, spawn timing, armor mix) flows through a
  seeded `mulberry32` generator for reproducible runs; cosmetic effects
  (particles, screen shake) use `Math.random`.
- When your input fully matches the word, the archer draws his bow and a faint
  dotted trajectory preview shows where the arrow will land.
