# The Lost Storm

A single-player isometric action RPG that runs in the browser. Three.js, TypeScript and Vite, with no game engine on top. This is the first playable slice: one hero, one arena (the Drowned Bastion), two monster types, loot, levelling and a small skill tree.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5193.

| Input | Action |
|---|---|
| Left mouse | Move, attack the monster under the cursor, pick up loot. Hold to keep going. |
| Shift + left mouse | Attack in place |
| Q | Thunderclap (area hit around you) |
| W or right mouse | Storm Bolt (projectile) |
| I / T | Inventory / skill tree |
| Mouse wheel | Zoom |
| Escape | Close panels |

Progress saves to `localStorage` on its own. "Start over" on the title screen clears it.

## Checks

There is no CI yet. Run this before every pull request; it must pass with zero errors:

```bash
npm run check
```

It runs `npm run typecheck` (strict TypeScript), `npm run lint` (oxlint with type information, rules in `.oxlintrc.json`) and `npm test` (Node's test runner; takes about a second). `npm run build` makes the production bundle in `dist/`.

## Layout

| Path | What it holds |
|---|---|
| `data/` | All content as JSON: skills, monsters, items, the skill tree, rigs, props, the arena and the player |
| `sim/` | The game itself in plain TypeScript: stats, combat, skills, monster behaviour, pathfinding, loot, progression, saving. No Three.js and no DOM, so it runs and is tested in Node |
| `sim/content/` | The content schema (`types.ts`) and the readers that check every JSON file at start-up |
| `sim/world/` | World state, the commands the player can send and the events each step returns (`types.ts`), and `stepWorld` (`step.ts`) |
| `src/render/` | Three.js: stage and lighting, the isometric camera, character loading, the arena, effects, weather, world-anchored overlays |
| `src/hud/` | DOM HUD: globes, skill bar, inventory, skill tree, tooltips |
| `src/input.ts` | Mouse and keyboard to commands |
| `src/main.ts` | Loads everything and runs the frame loop |
| `public/models/` | GLB models. Every file is listed in [ASSETS.md](ASSETS.md) |
| `blender/` | Blender scripts that build models (weapons) |
| `tools/` | Node tools: `inspect-glb.ts` prints a GLB's meshes and clips, `build-characters.ts` trims a body and extracts the shared animation file |
| `test/rules.test.ts` | Repository rules: no comments, no type escape hatches, `sim/` stays free of rendering code, every model is credited |

The renderer reads the world and the events `stepWorld` returns, and sends commands back. It never changes world state.

## Adding content

Content is data. None of these need a code change:

- **A skill**: add an entry to `data/skills.json`. `delivery` picks how it hits: `arc` (melee sweep), `nova` (ring around the user) or `projectile`. `windup`, `recovery`, `cooldown` and `manaCost` set its timing and cost; `knockback`, `stagger`, `shake`, `hitStop` and `vfx` set how it feels. Put it on the bar in `data/player.json` (`skillBar`, with key bindings) or give it to a monster.
- **A monster**: add an entry to `data/monsters.json` with its `rig`, stats, `behaviour` (`chaser` or `ranged`), `skill` and `loot`, then add it to a pack in `data/arena.json`.
- **An item**: add a base, an affix or a rarity to `data/items.json`. A weapon base's `visual` names the rig attachment to show in the hero's hand.
- **A skill-tree node**: add an entry to `data/skill-tree.json` with its grid position, what it `requires`, and its `statMods` and `skillMods`.
- **The arena**: `data/arena.json` holds the tile map (4-unit cells), wall and floor models, prop placements, the player start and the monster packs.

If something cannot be expressed in the data, extend the schema in `sim/content/` in a general way first. See [AGENTS.md](AGENTS.md).

## Characters and gear

Every humanoid shares one rig (the Quaternius Universal Animation Library rig), so a body, a clip and a piece of held gear each exist once and work on every character.

A character is a rig entry in `data/rigs.json`. The loader (`src/render/character-loader.ts`) needs nothing else.

```json
{
  "id": "skeleton_hero",
  "url": "models/characters/skeleton.glb",
  "animationUrls": ["models/animations/humanoid.glb"],
  "scale": 1.2,
  "yawOffsetDegrees": 0,
  "height": 1.85,
  "rootMotionBone": null,
  "clips": {
    "idle": { "clip": "Sword_Idle", "impactFraction": 0 },
    "run": { "clip": "Jog_Fwd_Loop", "impactFraction": 0 },
    "attack": { "clip": "Sword_Attack", "impactFraction": 0.3 },
    "slam": { "clip": "Sword_Attack", "impactFraction": 0.3 },
    "cast": { "clip": "Spell_Simple_Shoot", "impactFraction": 0.35 },
    "hit": { "clip": "Hit_Chest", "impactFraction": 0 },
    "death": { "clip": "Death01", "impactFraction": 0 }
  },
  "sockets": {
    "hand_r": { "bone": "DEF-hand.R", "position": [-0.03, 0.085, 0], "rotationDegrees": [90, 90, 0], "scale": 1 }
  },
  "hiddenNodes": []
}
```

- `url` is the body. `animationUrls` lists GLB files whose clips are merged in, so one animation file serves every body on the same rig.
- `clips` maps each animation the game needs to a clip name in those files. `impactFraction` is the point in the clip where the blow lands; the game speeds the clip up or down so that point meets the skill's `windup`. If a name is wrong, the error lists the clips the files do contain.
- `rootMotionBone` pins that bone's horizontal movement so a clip with root motion plays in place.
- `sockets` are named mounting points: a bone plus an offset, rotation and scale.
- `hiddenNodes` are nodes in the body file that are never shown.

Held gear is an entry in `data/attachments.json`: an id, a model file and the socket it mounts on. An item base's `visual`, the player's `gear` and a monster's `gear` name attachment ids, so a new weapon model is one GLB and one line of data. Weapon models are authored with the grip at the origin and the blade along +Y. `tint` on the player and on each monster recolours the body, so one body file makes several characters. `color` tints that character's effects and its body's emissive map (glowing eyes, runes) when the body has one; a body without an emissive map does not glow.

To use a different rig, add its rig entry with its own bone names in `sockets`, and point `data/player.json` (`rig`) or a monster at it. Mixamo characters work this way (export FBX, convert to GLB, set `scale` to 0.01 and `rootMotionBone` to `mixamorigHips`), but Mixamo files may not be redistributed, so they go in `public/models/local/`, which is git-ignored, and never in this repository.

## Assets and licence

The code, and the models made for this project, are under the MIT licence: see [LICENSE](LICENSE). Third-party assets keep their own licences; every shipped asset is listed with its source and licence in [ASSETS.md](ASSETS.md), and the licence texts are in `licenses/`.

Sounds are not in this repository, because their licence does not allow redistributing the files. The game runs silent from a clone.

The name "The Lost Storm" and its logo are not covered by the licence.
