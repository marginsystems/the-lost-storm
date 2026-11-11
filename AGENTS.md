# The Lost Storm

A single-player isometric action RPG on Three.js, in TypeScript, built with Vite. It runs in the browser with no server; an optional cloud save backend is described in the Persistence section below. See [README.md](README.md) for how to run it and how the code is laid out.

## Code comments

Do not write comments in code. No block comments, no line comments, no JSDoc, no docstrings used as comments, no TODO notes. Do not replace a comment with a shorter one.

Agents read this source. Names, types, and tests carry the meaning. A comment that explains a change, a workaround, a tuning value, or a ticket belongs in the commit, the issue, or the PR.

Leave type directives, shebangs, generated-file banners, and legal notices. Lint suppression comments are banned too: fix the code instead.

This applies to TypeScript, GLSL, CSS, and shell. It does not apply to Markdown, JSON data descriptions, or user-facing copy. `test/rules.test.ts` enforces it.

## Types

All code is TypeScript with `strict` on and every extra strictness flag in `tsconfig.json`. Do not add `.js` files.

- Give every function an explicit return type and every parameter a type. Give every exported value and every state object a named `interface` or type.
- Do not use `any`, `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`. Do not use the non-null `!`; check the value instead.
- Do not cast to get past the checker. Data that comes from outside the type system (JSON files, `localStorage`, a loaded GLB) is `unknown` until a reader function has checked it. `sim/content/read.ts` has the readers.
- Prefer a discriminated union over a string field plus optional fields. Handle every member of a union in a `switch`; the lint rule `switch-exhaustiveness-check` fails on a missing case.
- Mark fields `readonly` unless the code mutates them.

## Lint

`npm run lint` runs oxlint with type information (`.oxlintrc.json`). It must report zero errors and zero warnings. Do not add a suppression comment and do not turn a rule off to get a change through.

Before every PR run all three and get zero errors:

```
npm run typecheck
npm run lint
npm test
```

## Logic and rendering are separate layers

- `sim/` is the game: stats, combat, skills, monster behaviour, pathfinding, loot, inventory, progression, saving. It is plain TypeScript. It never imports Three.js or anything from `src/`, and never touches `window`, `document` or `localStorage`. It runs in Node, which is how it is tested.
- `src/` draws the game and reads input. It reads the world state and the events `stepWorld` returns, and sends commands back. It never changes world state directly.

A change to how damage is rolled, how a skill hits, how a monster decides, what drops or how a level is gained goes in `sim/` with a test, never in `src/`.

## Persistence and the optional backend

`src/backend/` is the only code that loads or saves progress. `main.ts` talks to a `Backend` (`load`, `save`, `reset`, `flush`). The local implementation is the `localStorage` behaviour the game always had. The remote one exists only when `VITE_SERVER_URL` is set.

- With the variable unset the game makes no network request. A plain clone must keep working offline.
- A backend never fails the game. Network errors, timeouts and bad answers are absorbed and retried, and the game keeps saving locally. Only `load` (started first, so it overlaps the character load) and `reset` (before the page reloads) wait for the network, three seconds at most each. `reset` must keep waiting: a reload that outruns it would load the old cloud copy back.
- Nothing from the network is trusted unchecked: a response is read with `readSave` before it is used, and a token is only ever sent to the server address that issued it.
- Console output goes through `src/backend/console-log.ts`, the one file in `src/` exempt from `no-console` (as `tools/` is).
- Nothing about a particular server belongs in this repository beyond the protocol types in `src/backend/api.ts` and the `VITE_SERVER_URL` entry in the README.
- The decisions (which copy wins on load and on a conflict) are pure functions in `src/backend/merge.ts`. Test them there, and test the sync behaviour in `src/backend/remote.test.ts` with the fake server in `test/backend-support.ts`.

## Content is data

Monsters, skills, items, rarities, affixes, skill-tree nodes, rigs, attachments, props, the world and its zones (`data/zones/`) are JSON files in `data/`. Adding a monster, a skill, an item or a tree node is a data change only.

If new content cannot be expressed in the data, extend the schema in `sim/content/` and its handling in the engine in a general way (a new delivery type, a new modifier target), then write the content as data. Do not special-case an id in engine or render code. `sim/content/content.test.ts` checks every cross-reference between the data files.

## Tests

Name a test file exactly after the file it tests, in the same directory: `foo.ts` is tested by `foo.test.ts`. Run `npm test`; it takes a few seconds.

## Tuning values

Game balance lives in `data/`. Every other tuning number (camera, effects, timings, HUD) lives in a named constant object at the top of its file. Do not put a bare number in the middle of a function.

## Assets and licences

This repository is meant to become public, so every file in it must be redistributable.

- Every humanoid shares one rig, so bodies, clips and gear are interchangeable. Do not add a character on a different skeleton without retargeting it to that rig, and never bake a weapon into a character file: held gear is an attachment in `data/attachments.json`.
- Clothing and armour are wearables: skinned pieces in `public/models/wear/`, listed in `data/wearables.json` and bound to the wearer's skeleton by joint name, so one piece fits every character. Never model clothes into a character file. Convert a new piece to the rig with `blender/build_wearables.py` and look at it on the skeleton in the browser, in every animation, before it ships.
- Ship only CC0 assets, or CC BY with full attribution. Every file under `public/models` has a row in [ASSETS.md](ASSETS.md) with its source and licence, and the pack's licence text is in `licenses/`. `test/rules.test.ts` fails on a model with no row.
- Never commit Mixamo files, Splice samples, Sketchfab downloads without a redistributable licence, or anything ripped from another game. Local-only assets go in `public/models/local/` and `public/audio/local/`, which are git-ignored.
- Do not copy another game's name, characters, art, music, levels or interface. The Lost Storm is its own world.

## Game feel

Input must answer on the same frame. A hit that lands shows it: flash, knockback, a damage number, particles, and for heavy hits a short hit-stop and screen shake. When you add an attack, a skill or a monster, give it all of these through the skill's data (`knockback`, `stagger`, `shake`, `hitStop`, `vfx`).

## HUD motion and style

Every user-visible change in the HUD animates with spring motion: panels opening, text that changes, bars, buttons. Nothing may jump from one frame to the next. Use the `--spring-*` easings and durations in `src/hud/hud.css`; do not write ad-hoc timings or cubic-bezier curves. The one exception is a continuous ambient loop that is not a state change, such as the liquid drifting in the globes: it uses the `--drift-ease` and `--drift-ms` tokens defined beside the springs, never a bare timing.

No thick or bright borders, outlines or focus rings, no pill-shaped radii, and small corner radii. Panels are clean, dark and translucent.

## No sound during development

The game has no audio yet. When it gets audio, never play it from an agent session: run browsers muted.

## Git

Never push to `main`. Every change goes on a branch and lands through a pull request.
