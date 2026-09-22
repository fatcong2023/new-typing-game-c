# French infantry — editable Spine source

Open `french-soldier-combat.spine` in Spine Professional 4.3.26. Keep
`images-natural/` beside the project; these textures are needed for editing.

- `walk_shield_overhead`: 1.2-second overhead-shield walking loop.
- `attack_shield_overhead`: 1.2-second raised-arm downward sword strike.
- `reference/attack-pose-user-approved.png`: the approved pose reference.

The game uses the packed JSON, atlas and PNG in `../../src/assets/spine/`.
From this directory, export the edited project with the installed Spine CLI:

```powershell
& 'C:\Program Files\Spine\Spine.com' -u 4.3.26 -i french-soldier-combat.spine -o ../../src/assets/spine -e json+pack
```

`build-overhead-attack.mjs` recreates the combat import JSON from the included
walking rig, walking samples and part metadata. Run it only when intentionally
rebuilding the scripted animation; it does not preserve manual Spine edits.
The `.spine` file is the editable master, while `french-soldier-combat.json` is
the last scripted import data.

Run `npm test` from the repository root to check the exported animation bounds,
joint connections and impact timing. `work/french-soldier-playtest.mjs` checks
the game integration against a running local server.
