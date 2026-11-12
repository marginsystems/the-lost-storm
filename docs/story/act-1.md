# Act I: The Road East

> **SPOILER WARNING.** This file gives away the shape of the first act. If you mean to play the game first, stop reading here.

The act opens in the In-Between and the Hall of Time; the road beyond is still being built. Names marked *working* are placeholders until the owner names them.

## Shape

```
The In-Between --> The Hall of Time (fire at its edge) --> later zones, after launch
```

## Zones

| Zone | Id | Level | What it is | Rule it teaches |
|---|---|---|---|---|
| The In-Between | `between` | 1 | White mist that thins onto a black shore under the night storm. No combat. | Look, then step into the light. |
| The Hall of Time | `hall_of_time` | 1 | A vast open floor of black stone between crags, at night under a storm: rain, lightning, wet ground, a mist wall behind. No roaming enemies. A small fire at its edge with the Warden's stall, the stash and a waypoint. | Rest, trade, travel; the weather is zone data (`weather`). |
| The Drowned Road | `drowned_road` | 3 | Causeway and broken bridge, reeds, sunken carts, Wardens' markers. A side path to a flooded chapel. | Deep water slows walking and dodging (surface `pace`). |
| The Standing Field | `standing_field` | 5 | Rows of the Still, standing, in low mist. Almost silent. | Noise wakes them. |
| The Unfinished camp | `unfinished_camp` | 7 | A village of people with no pasts. | Two ways through: fight to the far gate, or bring their leader what they want (`either` objectives). |
| The Hall of Hours gate | `hall_gate` | 9 | A long stair, standing clocks that disagree, brass and worn stone, the great doors. | The guardian at the doors; the act ends when they open (act `end`). |

## Quests

Objective text is plain and carries no names or lore.

1. `out_of_the_mist`: Leave the In-Between.
2. `to_the_waystation`: Reach the fire.
3. Cross the Drowned Road.
4. Cross the Standing Field.
5. Get through the camp (either path).
6. Open the Hall's doors.

## Old saves

The zones of the earlier first act are listed in `world.retired`. A save standing in one of them, the Shallows and the waystation included, loads in the Hall of Time at its arrival point with the character intact, and its story is marked `road: rerouted` so the first quest completes on reaching the fire.
