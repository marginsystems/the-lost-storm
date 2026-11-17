# Smoothness and size: handoff brief (2026-11-18)

This branch is never merged. It only carries the probe scripts and this brief from one machine to another. Read `AGENTS.md` first; every rule there applies.

## Goal

The owner wants the game smooth above all: every stutter is a bug. Second, the smallest possible download and GPU load with no visible loss at the play camera.

## What already landed (do not redo)

- Zone props batched per 20 m grid cell, so off-screen props are culled. At rest: hall 1.39M to 0.88M triangles, `under_hall` 3.31M to 0.77M, `lava_depths` 5.63M to 1.03M.
- A monster off view rests: its bones are skipped by the scene's matrix update (`src/render/resting-group.ts`).
- A character in play casts one shadow draw (`src/render/shadow-caster.ts`).
- PR 2069: each skeleton is posed once a frame (`poseOncePerTick` in `src/render/skeletons.ts`), character shadow casters carry their own depth material, and the two HUD box scans read at the top of the frame.
- Models: 25.1 MB to 21.0 MB, 427k to 313k triangles. Twelve world props through meshopt, nine models from 1024 to 512 textures.
- The swarm review's hot-loop findings (126 confirmed) are nearly all landed. Do not work from that list; profile instead.

## In flight on the first machine

- PR 2078 (issue 2066): effect shaders stop recompiling per cast. Cause: three.js keys every program by the scene's light counts but only re-derives a material's program on a light change when the material is lit. Unlit effect keepers kept one variant forever. Fix: `src/render/light-census.ts` plus `rekey` and `showKeepers` in `src/render/effect-shapes.ts`. Links later than 18 s into the benchmark fight: 85 to 7. It is watched to landing on the first machine; leave it alone.
- A Texture diet session (1024 maps to 512 where the camera never shows the difference) is still measuring. Its branch is local to the first machine. Do not start texture work.

## How to measure

- `node tools/fight-bench.ts` is the fight benchmark (`hall-brawl-v1`, about 95 monsters at the peak; flags `--out --compare --to --short --uncapped --port`). Frame times only mean something on a quiet machine (1-minute load under 12).
- `handoff/fps-probes/fight-profile.mjs <repo> <outDir> <chromeProfileDir> <port> full` runs the same fight in headless Chrome with a CPU profile and writes `fight.cpuprofile` and `summary.txt`. CPU shares hold up under load far better than frame times.
- The same script with `gl` in place of `full` injects `gl-inject.js`: it logs every `linkProgram` and counts draws, `useProgram`, uniform calls and texture binds per frame (`gl.json`), and samples three.js's program keys and the light count every 50 ms (`keys.json`).
- `handoff/fps-probes/profile-dig.mjs <cpuprofile> "tree=<fn prefix>=<depth>" "flat=<fn prefix>=<n>" "callers=<fn prefix>=<depth>" "when=<fn prefix>"` breaks a profile down.
- The dev server serves the working tree, so an edit mid-run reloads the page and kills the run. Measure from a second worktree.
- Run browsers headless and muted. If `~/Dev/ops/lanes/lane` exists on the machine, every heavy command, dev server and Chrome run goes through it.

## What the last profile shows (after PR 2069, about 95 monsters)

About 77% of frame CPU is inside three.js's render. Per frame at the fight's peak: about 900 draw calls, 430 program switches, 3,600 uniform calls, 1,700 texture binds.

## Open work, biggest first

1. **Program switches in the main pass.** Every switch re-sends camera, fog and all light uniforms (`setProgram` to `upload`, about 5.7 s of a 38 s frame total before PR 2069). three.js sorts opaque draws by material id, not by program, and every character piece has its own cloned material. Ideas: a custom opaque sort that groups by program, sharing materials between pieces that differ only in uniforms, fewer distinct programs per character.
2. **`projectObject` and `updateMatrixWorld`**: about 3.7 s and 1.8 s of 31.8 s. The scene has thousands of objects (bones are objects). Flattening static groups or setting `matrixAutoUpdate` off on static props would cut both.
3. **Animation mixer**: `actor-view.ts` sync is about 2.9 s, most of it `AnimationMixer.update`. Monsters far from the hero could animate at half rate.
4. **Frame-time before and after never measured fairly.** Run commit `1097dfb1` and current `main` back to back, capped and uncapped, on a quiet machine.
5. **Unexplained long frames.** The baseline had 125 of 2,275 frames over 33 ms. With effect recompiles gone, find what causes the rest (GC, texture uploads at `texSubImage2D`, spawns).
6. **First load.** The title screen pulls 19.75 MB in 367 requests (`whenIdle(() => flow.warm())` and `preloadZones` in `src/main.ts`). The play script is one 3.5 MB chunk: zone JSON 1.05 MB, other data 0.45 MB, three.js 0.53 MB, game code about 1.4 MB.
7. **Graphics never step down.** `src/mobile/quality.ts` picks desktop or mobile once. One production player on a Mali-G52 got 7 fps and left in under a minute.
8. **Smaller render items**: the desktop canvas is 4x MSAA though it only receives full-screen quads (`src/render/stage.ts`); contact shadows are one draw call per actor; the ward dome shader is built per ward.
9. **Server side** (server repo, not this one): gzip where brotli would save a third on the script; versioned model URLs cached one day only.

## Rules that bit this work

- Run `npm run typecheck`, `npm run lint` and `npm run test:affected` before every submit. A test file over 700 lines fails `test/rules.test.ts`.
- three.js underscore APIs (`_onChange`) fail lint.
- Land through Mergestorm: issue, `mergestorm stack create <name>`, commit, `mergestorm stack submit --auto-land on`, then `mergestorm stack watch <stack-id>` in a background loop until `MS-WATCH LANDED`. Never push to `main`. Do not change `tools/guide/measured.json`.
- Never run `rm -rf` or `rm -r`, and never `rm` or `find -delete` on a path built from a shell variable. Write temporary files into a fresh uniquely named folder and leave them.
- Say nothing about deploys. End every turn with `STATUS: <state> — <one line>`.
