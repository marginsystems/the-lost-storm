# The balance simulator

The simulator answers tuning questions without playing the game: how long a level takes, how often an item drops, whether one Storm Chart path is weaker than another, whether a fight is too easy. It runs seeded bot players through the real game logic in `sim/`, many times faster than real time, in parallel worker threads. It has no rendering and no browser.

## Running it

Run it through the machine's test lane so it shares the cores fairly:

```bash
~/Dev/ops/lanes/lane test -- npm run simulate -- farm --minutes 30
```

Plain `npm run simulate -- <scenario> [options]` works too. It uses half the cores by default.

### Scenarios

| Scenario | What one run does |
|---|---|
| `slice` | A new character, from waking in the In-Between to the end card |
| `farm` | The slice, then `--minutes` (default 30) clearing moments in the Hall. The clock starts after the slice |
| `fight <moment>` | The slice, then the named moment struck beside the hero and fought `--repeats` times (default 10) |
| `level <n>` | From waking until level `n`, farming the Hall after the slice. `--minutes` caps it (default 120) |
| `replay <file.jsonl>…` | Reads recorded measurement streams into the same report. Takes no new runs |

### Options

| Option | Default | Meaning |
|---|---|---|
| `--runs N` | 12 | Runs for each policy |
| `--skill a,b` or `all` | `careful,average,poor` | Player skill policies |
| `--build a,b` or `all` | `mixed` | Storm Chart builds |
| `--seed N` | 1 | First seed. Run `i` uses seed `N + i`, so every policy plays the same seeds |
| `--workers N` | half the cores | Worker threads |
| `--out FILE` | `simulate-out/<scenario>-<time>.json` | Where to write the JSON report (`simulate-out/` is git-ignored) |
| `--record DIR` | off | Also write every run's measurement stream as JSON lines |

The same seed and policy always give the same run. The cost is a few seconds for 36 slices and about 15 s for 36 thirty-minute farms on 8 threads.

## Policies

Policies are data in `tools/simulate-policies.json`. The bot plays only through the commands a player has: moves, skills on the bar (with their cooldowns and mana), flasks, rolls, dialogue, reading, picking up, equipping and spending chart points. It sees what the player sees: telegraphs, marks on the ground and nearby enemies.

**Skill** policies say how well the player plays:

| Policy | Dodges | Drinks at | Rolls | Reading |
|---|---|---|---|---|
| `careful` | at once (`reaction` 0.1 s) | 50% life, 20% mana | yes | 2.5 s a line, 4 s a page |
| `average` | 0.4 s into the windup | 30% life | no | 3 s a line, 5 s a page |
| `poor` | never, it stands and trades | 15% life | no | 3.5 s a line, 6 s a page |

**Build** policies say how points and skills are chosen:

- `storm`, `blade` (the Edge), `wind`, `stone` and `echo` spend every chart point on their own path, nearest the root first, notables before minor places.
- `mixed` takes turns between all five paths.
- When a skill is offered, every build takes the one highest on its `skills` list.

Every policy picks up items and equips one when it raises damage × toughness. It drops the worst item when the bag is full.

The bot walks the shortest path and never hesitates, so its times are a lower bound for a human.

## Reading the report

Each policy gets one block. A value written as `1:35 (p10 1:30, p90 1:39, mean 1:35)` is the median, then the 10th and 90th percentile and the mean over the runs. Times are minutes:seconds from the start of the run. In `farm` and `fight` the clock starts after the slice.

| Line | What it measures |
|---|---|
| milestones | The first time each milestone in `data/alpha.json` is reached, plus `found_blade` and `end_card`. "reached by 58%" means the rest of the runs never got there |
| levels | The first time each level is reached |
| deaths | Deaths per run, and the most common zone / enemy / skill that killed |
| flasks | Flasks drunk per run |
| xp / min, gold / min | Experience gained and gold picked up per minute |
| cleared / min | Moments resolved per minute. "missed" counts moments that expired or faded |
| moments | For each moment that turned into a fight: how many fights, how many were cleared, how many had a death, and the length of a cleared fight in seconds. Also the damage taken and dealt per fight, and the flasks drunk |
| drops / hour | Items dropped per hour by rarity and by slot (whether or not the bot picked them up) |
| rare or better by, top rarity by | The share of runs that saw at least one such drop within 10, 30 and 60 minutes. Only runs at least that long count, so `n/a` means none were |
| damage taken from, taken by skill, dealt by skill | Shares of all damage across the runs |
| power over time | Medians every 5 minutes: basic-attack dps, toughness (life adjusted for armour), the sum of equipped item levels, and chart places taken |
| first chart places | The median time each place was taken |
| flags | Outliers: runs that did not finish, a moment a policy never clears, a policy that never dies, a rarity that never drops |

The JSON file has the same report plus every run's summary, for your own charts.

## The measurement stream

The simulator does not read the game's log output. `sim/measure.ts` turns each step's world events and the world state into one stable stream of measurements. The stream is JSON lines, and each line has a `kind` and a time `t` in seconds. The first line is the session header. A reader refuses a stream of another `version`, so a change to a measurement's fields means a new version.

| kind | Fields | When |
|---|---|---|
| `session` | `version`, `source` (`sim` or `game`), `scenario`, `policy`, `seed` | First line |
| `milestone` | `name` | A milestone's flag or zone holds for the first time |
| `zone` | `zone` | The hero enters a zone |
| `level` | `level` | The hero's level changes |
| `xp` | `amount` | Experience is gained |
| `gold` | `amount` | Gold is picked up |
| `drop` | `base`, `slot`, `rarity`, `level` | An item drops (story finds are left out) |
| `hit` | `taken`, `amount`, `foe`, `skill`, `zone` | Damage to the hero (`taken`) or by the hero |
| `kill` | `foe` | The hero kills an enemy |
| `death` | `zone`, `foe`, `skill` | The hero dies |
| `flask` | `flask` | A flask is drunk |
| `fight` | `id`, `moment`, `level`, `foes` | A moment wakes and some of its echoes turn |
| `moment` | `id`, `moment`, `outcome` | A moment ends: `resolved`, `expired`, `played` or `faded` |
| `skill` | `skill` | A skill is learned |
| `chart` | `place`, `path`, `points` | A Storm Chart place is taken |
| `power` | `dps`, `toughness`, `itemLevels` | The hero's power changes |
| `end` | `reason` | Last line: `done`, or why the run stopped |

Pass `--record DIR` to keep the streams. `npm run simulate -- replay DIR/*.jsonl` turns them back into a report. A stream recorded from a real session in a dev build, with `source: "game"`, reads the same way, so a human's numbers can sit beside the bots'.

## Guard rails

`tools/simulate-run.test.ts` runs a few seeds and fails when a tuning change moves the game outside wide bounds. A failure there means the change was large enough to decide on deliberately: widen the bound in the same pull request and say why.

- An average player reaches the end card in 1 to 6 minutes, through every milestone.
- The first fight lasts 10 to 30 s.
- A hero who stands still in the first fight survives at least 20 s.
- In a 30-minute careful farm, most runs find a rare or better and end between level 6 and 12.

## Worked questions

### How long does it take to reach level 5?

```bash
~/Dev/ops/lanes/lane test -- npm run simulate -- level 5
```

Read the `level 5` line under `levels`. On the baseline it took 6:04 for careful, 7:08 for average and 6:45 for poor (medians from waking). The p10 to p90 range was about 4:30 to 8:50. Per-level times in the same block show where the time goes: about 1:35 for the slice, then a level every 1 to 2 minutes.

### How often does a top-rarity item drop?

```bash
~/Dev/ops/lanes/lane test -- npm run simulate -- farm --minutes 60 --runs 16 --skill average
```

Read `drops / hour` for the top rarity (stormtouched today). `top rarity by` then gives the share of runs that saw one within 10, 30 and 60 minutes. On the baseline, an average player saw 2.4 stormtouched drops an hour. One came within 10 minutes in 25% of runs, within 30 in 75% and within 60 in 94%. A rare or better came within 10 minutes in 69% of runs.

### Is the Echo path weaker than the Edge?

```bash
~/Dev/ops/lanes/lane test -- npm run simulate -- farm --minutes 20 --skill average --build echo,blade
```

Compare the `echo` and `blade` blocks:

- the `power over time` medians (dps and toughness at the same minute)
- `moments` (fight length and damage taken per fight)
- `deaths`
- `cleared / min`

The two builds play the same seeds, so a gap that holds from p10 to p90 is a real gap and not luck.

The `dps` in `power over time` is the basic attack's dps, so it shows what a path does for the weapon, not for skills. On the baseline the Edge reached 110 dps at 20 minutes and the Echo 64. That gap is the Edge's weapon places; it does not mean the Echo is weaker. The fights tell the real story:

- The Echo cleared campfire in 1.6 s and charge in 3.9 s. The Edge took 1.7 s and 4.3 s.
- The Echo took less damage per fight.
- Static Brand's burst dealt 37% of the Echo's damage.
- Both builds reached level 8 and cleared about 2.3 moments a minute.

So the Echo is not weaker in the Hall today. Neither build is tested either, because nothing there can kill a level-5 hero.
