# Lost Storm RL

Trains our own model to play The Lost Storm through the headless simulation. The game stays in TypeScript (`sim/`); this folder is the Python trainer (PyTorch) that drives it.

## How it fits together

```
Python (rl/)                         Node (tools/rl/serve.ts, one process per worker)
  PPO / imitation  <-- binary frames over stdin/stdout -->  pool of arenas (sim/rl/pool.ts)
  Policy network                                             observe -> numbers (sim/rl/observe.ts)
                                                             action  -> commands (sim/rl/act.ts)
                                                             stepWorld, reward (sim/rl/reward.ts)
```

- **Arena** (`sim/rl/arena.ts`): the Hall of Time with its own monsters cleared, a bench hero with a random level (1-12), weapon and skill bar (or a fixed build, see Builds), and five waves of random packs. Every episode jitters skill damage, cooldowns, mana costs and monster life, damage and speed by up to 20%, so the model learns to read numbers instead of memorising them.
- **Decisions**: the model acts every 4 sim ticks (7.5 times a second). Each action is four choices: move (stay or one of 8 directions), skill (none or one of 6 slots), target (one of the 8 nearest foes), use (none, one of 2 flasks, or pick up the nearest thing on the ground the pickup rule wants and the bag can hold).
- **Pickup rule**: each arena rolls a lowest rarity worth taking (from "take everything" up to "take nothing but gold"). The hero sees the rule and its free bag space, and every loot token carries its rarity, its gold amount, whether the rule wants it and whether it fits. After each wave a few items of random rarity fall near the hero, so the model learns to take what the rule asks for and walk past the rest. A player's own loot filter will feed the same input.
- **Statuses and foes** (`sim/rl/status.ts`): the hero reads its own burn still to come, brand, slow and weakening, and how many foes are coming for it. Each foe token adds the same statuses, whether it is coming for the hero (not held on another foe), its root, and what makes it dangerous by numbers: pack leader, how many mods, a burst on death, summons, regeneration, a guard, and its recovery window and strain after heavy hits.
- **Reward**: damage dealt as a share of the foe's life, +0.5 a kill, +2 a wave, +3 for clearing all waves, +0.1 for picking up gold with no foe within 6 m, and +0.1 x (1 + its rarity share) for an item the rule wants; damage taken as a share of the hero's life x2, -3 for dying, and a small cost per decision. After the last wave the arena stays open up to 5 s, or until nothing the rule wants is left, so there is time to loot.
- **Dodging**: the hero reads, for standing still and each of the 8 move directions, whether a blow winding up, a delayed strike, a hazard or burning ground will catch it there (`sim/rl/danger.ts`, the same check the scripted bot dodges by). It also reads its own last two decisions (each head as a one-hot), the damage it took and dealt in the last second, how long since it was last hit and whether that hit came from something out of view, and up to four foes it saw in the last 5 s that dropped out of its view, at their last seen spot (`sim/rl/recall.ts`). Entity slots are sorted by distance, so raw past snapshots would not line up; these features are worked out in the sim instead.

## The contract, and why game updates do not throw training away

`sim/rl/contract.ts` is the versioned contract between the game and the model: every input the model sees and every action it can take. Its fingerprint is pinned in `sim/rl/contract.test.ts`.

- Skills, monsters, projectiles and areas are described by their numbers (reach, area, damage, cooldown, delivery type, behaviour), never by their id. A buff or a nerf changes the numbers the model already reads. A new skill looks like a skill with numbers it has not tried yet. Keep training from the last checkpoint.
- The model reads the hero, each skill slot and each nearby thing as separate tokens through a small transformer. It picks a skill by scoring the slot's own token and a target by scoring the foe's token, so nothing is tied to a slot position or a monster name.
- The situation (`arena`, `duel`, `quest`, `roam`) and an objective direction are inputs from the start, so one model can learn every mode. `rival` (another player) and `objective` are already entity kinds.
- Each block has spare columns. A new feature can take a spare column without changing the shape.
- Changing the layout (a new delivery type, more slots) changes the fingerprint and fails the test. Raise `RL.version`, update the pinned fingerprint, and widen saved policies so their weights carry over.

## Setup

```bash
cd rl
uv sync
```

## Train

```bash
uv run python -m lost_storm_rl.train imitate --run arena-v1
uv run python -m lost_storm_rl.train ppo --run arena-v1 --start runs/arena-v1/imitate.pt --updates 300
uv run python -m lost_storm_rl.train eval --run arena-v1 --policy runs/arena-v1/latest.pt --episodes 32
```

- `imitate` records the scripted bot (`sim/bot.ts`) playing arenas and trains the policy to copy it, so PPO starts from something that already fights.
- `ppo` improves it by playing. Each update prints the win rate, deaths, mean return and waves cleared, and appends a row to `runs/<run>/log.csv`. Checkpoints go to `runs/<run>/policy-uNNNNN.pt` and `runs/<run>/latest.pt`.
- `ppo` keeps learning from the scripted bot while it plays. Every `--bot-every` updates (20) the workers play `--bot-episodes` arenas (16) with the bot and keep the last `--bot-keep` runs (4). Each minibatch adds the loss of copying the bot's choices there, weighted `--bot-coef` (0.5) and fading over `--bot-decay` updates (3000) to `--bot-floor` (0.05). PPO alone drifted below its teacher: on the same 64 arenas the bot won 91% and the model 45%. The anchor keeps it near the bot while PPO improves on it.
- `--curriculum` (0.5) draws each arena's hero level by how often the model still loses there: that share of the draw follows each level's running loss rate, and the rest is even across levels 1-12. Each level's running win rate is in `log.csv` as `win_high` for levels 9-12, and `bot_loss` and `bot_weight` show the anchor. `--curriculum 0` and `--bot-coef 0` turn them off.
- A flask cannot be chosen when drinking it would be refused (a full pool, no charges, cooling down), so the model no longer spends choices on it.
- `ppo --duels N` gives N duels to each worker. Each duel takes two of that worker's `--envs`, one seat per hero, and the same policy plays both sides (self-play). The two heroes get random builds at the same level, start apart in an empty arena, and are in rival parties. The duel ends when one falls, which earns the winner `REWARD.win`, or when `DUEL.timeLimit` runs out. Win rate, deaths, return and waves count arena episodes only. Duels are logged on their own, per seat, so one finished duel counts twice: how many seats finished, the share decided before time ran out, and their mean return (`duel_episodes`, `duel_decided`, `duel_return` in `log.csv`). A run whose `log.csv` has an older header moves it aside as `log-N.csv` and starts a new one.
- `eval` plays greedy episodes with a checkpoint and keeps every one as a replay, then lets the bot play the same arenas and prints both side by side (`against_bot`: won overall and by level band, and how many the bot won that the model lost). `--sample` plays as training does, with sampled choices. `eval --duels` plays `--episodes` duels instead, the checkpoint on both sides, and prints how each seat ended and the share decided before time ran out.
- `match --first a.pt --second b.pt` puts two different checkpoints in a duel. Each of `--duels` arenas (128) is played twice with the seats swapped, so neither model gains from a side, and it prints how many each won, how many timed out, and the split by seat. Its seeds start at 3002000000 (held out, so neither model trained on them), and its replays go to `runs/<run>/match/`.
- `match --first a.pt --first-build a.json --second b.pt --second-build b.json` gives each checkpoint its own build (see Builds). Each model keeps its build when the seats swap, and the result names `first_build` and `second_build`. Leave the build flags out and both seats get random bench heroes, as before.
- Every `--best-every` updates (200; 0 turns it off) training plays `--best-episodes` greedy arenas (64) against the bot the same way and saves the model as `best.pt` when it wins a larger share of them than the model already in `best.pt`, whose score is stored inside it, so a rerun into the same folder has to beat it too. `best.pt` is replaced in one step, and each check is then logged as a row in `runs/<run>/best.csv`. Checkpoints swing by twenty points or more between updates, so `best.pt`, not `latest.pt`, is the model to show.
- Training gives each new arena the next seed from `--seed`, so a long run plays every low seed. The game reads a seed as 32 bits, so a seed of 2^32 or more builds the same arena as a low one. Seeds from 3000000000 up are held out: `ppo` refuses a `--seed` and `--updates` whose arenas, or the bot's, would reach them, the best check picks from 3001000000 (`--best-seed`), and a model is reported with `eval --seed 3000000000`, a range the pick never saw.
- Replays are JSON files in `runs/<run>/replays/` and `runs/<run>/eval/`: the arena seed plus the action list, or for a duel the duel seed plus each seat's action list. The sim is deterministic, so a replay plays the same fight again (`replayArena` in `sim/rl/replay.ts`, `replayDuel` in `sim/rl/duel-replay.ts`). Training keeps a duel on the `--keep-every` schedule.
- Watch a replay in the real game: run `npm run dev` and open `http://localhost:5193/play/?replay=/rl/runs/<run>/eval/<file>.json`. Add `&speed=2` (0.25 to 8) to play it faster. The watch mode exists only in the dev server; it saves nothing and takes no input, and a caption in the top-left corner names the replay, the wave and the outcome. A duel replay draws both heroes, follows the first seat and counts down the time left.

## Builds

A build is a named hero at the fixed duel level, so a duel is a contest of build and brain. It is a JSON file:

```json
{ "name": "Maelstrom", "weapon": "warden_broadsword", "skills": ["downdraught", "millrace"], "route": ["blade_thunderhead", "heavy_hands", "..."], "hero": "woman" }
```

- `name` is what the result prints. `hero` is optional (one of the heroes in `data/player.json`); it changes only the look.
- `weapon` is one of the standard weapons in `data/duel-kit.json`: one plain base for each weapon group (blade, heavy, crossbow, staff), chosen for a similar plain hit rate. Every hero also wears the same plain armour set listed there. All gear is common, has no affixes and is item level 12.
- `route` is the skill-tree places in the order they are taken. Every hero is level 12 (`BUILD.level` in `sim/rl/build.ts`) and has 22 points, so the route takes at most 22 places. The first must be a starting place and each next one must join the places already taken, within the specialty limit, the same rules as allocating in the game.
- `skills` are up to four skills for slots 1-4. The basic attack is always slot 0 and the roll slot 5. Each skill must be in the skill book or unlocked by a place on the route.
- Nothing is random once a build is given: the same build always gives the same hero.
- `train check --build x.json` says whether a build is legal and, if not, everything that is wrong with it. `ppo`, `eval` and `match` refuse an illegal build the same way before they start.
- `ppo --build x.json` plays that build in every arena (at level 12, so `--curriculum` does not move the level) and in the first seat of every duel. The bot anchor and the best check play the same build. The other duel seat takes the example builds in `rl/builds/` in turn (any that is no longer legal is skipped; with none left it is a random bench hero).
- `eval --build x.json` plays its arenas with the build; `eval --duels --build x.json` puts it in the first seat against the example builds.
- Replays keep the builds, so a replay plays the same heroes again.
- `rl/builds/` holds five example builds, derived from the routes in `tools/simulate-policies.json`: Maelstrom and Duelist (blade), Bulwark (heavy), Windrunner (crossbow) and Caster (staff). `sim/rl/build.examples.test.ts` checks that each one is legal.

Everything under `runs/` is ignored by git.
