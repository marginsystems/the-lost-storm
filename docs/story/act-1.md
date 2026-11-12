# Act I

> **SPOILER WARNING.** This file gives away the whole plot of the first act, including every twist and the ending. If you mean to play the game first, stop reading here.

Target length: 30 to 45 minutes for a new player, with no grinding.

## Shape

```
                 Dusk's End  (North Lamp; side path: the Empty Frame)
                     |
                  Duskway
                     |
 The Still  ===  Stillhold  ---  The Spill  ---  The Coursework  (East Lamp; side path: the Unfinished Colossus's yard)
 (gate)              |
              The Drowned Bastion  (optional, endless surges)
```

The Gate to the Still stays shut until both lamps are lit.

## Zones

| Id | Name | Kind | Mood | What is there |
|---|---|---|---|---|
| `stillhold` | Stillhold | town | Warm lamplight in the dark, banners, barrels. Safe. | The stone where things fall in, Maren, Hale, the waypoint, the Gate, the stair down to the Bastion. |
| `duskway` | Duskway | wild | Blue dusk that never ends, a long straight road. It is the road from the hero's memory. | Roadbound and Lamenters. One checkpoint halfway. |
| `dusks_end` | Dusk's End | wild | The same dusk, colder. The road stops. | Main path: the North Lamp and a waypoint. Side path: the Empty Frame, a lone doorway with no house behind it, where the Stormcaller Rival keeps watch. |
| `the_spill` | The Spill | wild | Rust and dust. Half-things everywhere: stairs to nowhere, a wall with no room. | Pell's camp near the entrance. Misbuilt and Hodmen. One checkpoint. |
| `the_coursework` | The Coursework | wild | Neat, endless, pointless walls in warm stone. | Main path: the East Lamp and a waypoint. Side path: the yard where the Unfinished Colossus builds. |
| `the_still` | The Still | wild | Pale, silent, almost no colour. | A waypoint at the Gate, where the voice is first heard. Rows of the Still, a Timekeeper watch, a checkpoint at the threshold of the hall, and the lit door at its far end, where the Timekeeper Gatekeeper waits. After the fight the door is a way out onto the Fallstone. |
| `drowned_bastion` | The Drowned Bastion | wild, surges | As it is today. | The endless arena. Never required. |

## Monsters

The peoples, their regards and their gear are in `data/factions.json`.

| Id | Name | Where | Behaviour |
|---|---|---|---|
| `mended`, `mender` | Mended, Mender | The Drowned Bastion, the Spill, Dusk's End | The Mended fight in a fixed rhythm. The Mender stays back and raises a fallen Mended once. |
| `unfinished_brute`, `unfinished_taker`, `unfinished_thrower` | Unfinished Brute, Taker, Thrower | Duskway, Dusk's End, the Spill, the Coursework | A heavy haymaker; a leap that grabs and drags; a thrown stone. |
| `unfinished_borrower` | Unfinished Borrower | Dusk's End, the Coursework | Elite. Speaks other people's sentences. |
| `warden_patrol` | Warden Patrol | Duskway checkpoint | Neutral to the hero. Fights the Unfinished. |
| `still_standing`, `still_waking` | The Still | The Still | Rows that do not move. Some wake when a fight is loud nearby. |
| `timekeeper_adept`, `timekeeper_binder`, `timekeeper_duelist` | Timekeepers | The Still | A slowing field, a hold that freezes, a blow replayed where it first fell. |

## Bosses

| Id | Name | Where | Pattern | Drop |
|---|---|---|---|---|
| `stormcaller_rival` | Stormcaller Rival | Dusk's End | Fights like the hero: a sweep, a spread of bolts, and below half life a slow ring the player must step out of. | The north wick (quest), a guaranteed item. |
| `unfinished_colossus` | Unfinished Colossus | The Coursework | Slow heavy overhead blow in front, thrown stone at range, and below half life a wide ground slam. Never speaks. | The east wick (quest), a guaranteed item. |
| `timekeeper_gatekeeper` | Timekeeper Gatekeeper | The Still | Two phases: a blow that replays where it fell and a hold that freezes; below half life a slowing field and a wide ring that replays too. Never speaks. | Two guaranteed rare items. |

## Beats

1. **Waking.** The hero wakes on the Fallstone at the edge of Stillhold. Maren the Tallier is already writing them down. She asks what they remember, reads it back (a road at dusk, a lit door, a voice calling them in) and says only "I have it down." She sends them to Hale.
2. **The errand.** Hale believes whoever made the world sits in the Still and will know where the door is. The Gate opens when the North Lamp and the East Lamp burn. Something took the wicks. *Goal the player holds for the whole act: light two lamps, pass the Gate, ask the way home.*
3. **North: the memory is not yours alone.** Duskway is the road from the memory. At its end, off a side path, a lone doorframe stands with nothing behind it. The Stormcaller Rival guards it and is certain the hero has come to take *their* door. Halfway through the fight: "What name did it call you? Say it. You can't hear it either." Dying: "Then who was it calling?" The hero lights the North Lamp. Back in town, Maren opens the ledger: she has written that same memory nine times. The hero is the tenth. She told the first one; he sat down on the Fallstone and came apart by evening. So she stopped telling.
4. **East: nobody has a past.** In the Spill, Pell picks through the lovely wrong things. She mentions, as gossip, that she watched Stillhold land: the same night the hero did, whole, lamps lit, Hale already grumbling about the oil he has "kept for forty years". She told them once. "They were so kind about it." Then the joke that stops short: maybe she only fell in this morning, remembering all that. In the Coursework the Unfinished Colossus builds walls around nothing and never asks why. It does not speak. The hero lights the East Lamp.
5. **The Gate.** Hale sees both lamps catch. He asks one thing: "Ask if I've kept them well." Maren comes down to the Gate to see the hero off: she would like, for once, to finish an entry.
6. **The Still.** Past the Gate it is quiet. At the centre is the door from the memory, real, lit, with the voice inside. It is the Timekeeper Gatekeeper: the Storm's own pull, the thing every memory of home has been. "That was never a house. That was us, calling." It notices the player, too: "And the one behind you, the one who moves you. It may come too. It is ours as well, though it thinks not." The hero refuses. The Timekeeper Gatekeeper tries to carry them in. In its last phase: "We never said a name. There are no names in here."
7. **After.** The door stays open and silent. Hale has followed. He looks around the Still: no one, not even a chair. "Nobody set the table, then. Hm. Well. Lamps want lighting all the same. More than before, I'd say." He goes home to light them.
8. **The last entry.** The open door leads out onto the Fallstone, where the hero woke. Maren: "You came back. Nobody comes back." She writes it differently: not *fell in*, but *went, chose, came back*. "First thing in this book that was done on purpose."
9. **It goes on.** The Bastion still surges. The roads still fill. Maren: "It doesn't stop because you understood it. Go and be useful."

## Twists and what each one teaches

| Beat | The surprise | What it leaves |
|---|---|---|
| 3 | The most private thing the hero has is the commonest thing in the ledger. | A memory can be false and common and still be yours. Living only for it hollows you out. |
| 4 | The people who treat the hero as the lost newcomer are exactly as new. | Nobody is behind. Also: being right is not a reason to break someone's story. |
| 4 | The Unfinished Colossus. | Order with no reason behind it is one more kind of noise. |
| 6 | The door is real, and home is coming apart. The hero is a lost piece of the Storm. | What you long for and what is good for you are different things. Staying someone is a choice. |
| 7 | The Still is empty. | Purpose is not found at the centre. It is what you keep doing after you find the centre empty. |
| 8 | The door opens onto where the hero started. | It was here all along, and it goes on. |

## Quests

Objectives run in order. A quest starts when the quests it requires are complete.

| Id | Name | Requires | Objectives |
|---|---|---|---|
| `fallen_in` | Fallen In | none | Talk to the Tallier. Talk to the Lampwright. |
| `north_lamp` | The North Lamp | `fallen_in` | Defeat the Stormcaller Rival. Light the North Lamp. Talk to the Tallier. |
| `east_lamp` | The East Lamp | `fallen_in` | Talk to Pell in the Spill. Defeat the Unfinished Colossus. Light the East Lamp. |
| `the_gate` | The Gate | `north_lamp`, `east_lamp` | Talk to the Lampwright. Reach the door in the Still. Defeat the Timekeeper Gatekeeper. Talk to the Lampwright in the Still. Talk to the Tallier. |

Quest names and objective texts shown in the tracker must not give a later beat away: an objective says what to do next, never what will be found there.

## Pacing

The scripted bot in `sim/bot.ts` plays the act from a fresh save in seven to eight minutes of game time, ends at level 7 and does not die. It walks straight to each goal, never reads and never looks around, so a new player takes roughly four times as long. `sim/bot.test.ts` fails if the bot's time, level or deaths leave that range, or if it ever needs the Drowned Bastion.

No pack stands where it can see the hero arrive, respawn or step off a waypoint; `sim/content/content.test.ts` checks that for every zone, with each boss present.

## Things that must hold whatever changes

- Nobody mentions the hero's body.
- Nobody explains the theme. Hale lights lamps; Maren writes an entry. That is the explanation.
- The act's bosses never speak.
- No narrator. Everything the player learns comes from a character or from what a place looks like.
