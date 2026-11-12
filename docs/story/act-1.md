# Act I: The Road East

> **SPOILER WARNING.** This file gives away the shape of the first act. If you mean to play the game first, stop reading here.

The act is a journey east, from the In-Between to the gate of the Hall of Hours. Names marked *working* are placeholders until the owner names them.

## Shape

```
The In-Between --> The Shallows --> The Waystation (hub) --> The Drowned Road --> The Standing Field --> The Unfinished camp --> The Hall of Hours gate
                                                                 |                       |                       |
                                                          flooded chapel           edge of the field      quiet way round
```

## Zones

| Zone | Id | Level | What it is | Rule it teaches |
|---|---|---|---|---|
| The Shallows | `shallows` | 1 | Pale, half-formed land. Ground fades to mist at its edges; wall fragments belong nowhere; shallow standing water. First fights, in small groups. A Warden's lantern marks the way east. | Patches of ground drift in and out (`drifts`). |
| The Waystation (*working*) | `waystation` | 2 | A fortified crossing on the old road: fire, shelters, the Warden's stall, the stash, a waypoint. Safe. Room for the people the hero helps to turn up later (`when` on npcs and props). | Rest, trade, travel. |
| The Drowned Road | `drowned_road` | 3 | Causeway and broken bridge, reeds, sunken carts, Wardens' markers. A side path to a flooded chapel. | Deep water slows walking and dodging (surface `pace`). |
| The Standing Field | `standing_field` | 5 | Rows of the Still, standing, in low mist. Almost silent. | Noise wakes them. |
| The Unfinished camp | `unfinished_camp` | 7 | A village of people with no pasts. | Two ways through: fight to the far gate, or bring their leader what they want (`either` objectives). |
| The Hall of Hours gate | `hall_gate` | 9 | A long stair, standing clocks that disagree, brass and worn stone, the great doors. | The guardian at the doors; the act ends when they open (act `end`). |

## Quests

Objective text is plain and carries no names or lore.

1. `out_of_the_mist`: Leave the In-Between.
2. `to_the_waystation`: Reach the waystation.
3. Cross the Drowned Road.
4. Cross the Standing Field.
5. Get through the camp (either path).
6. Open the Hall's doors.

## Old saves

The zones of the earlier first act are listed in `world.retired`. A save standing in one of them loads at the waystation with the character intact, and its story is marked `road: rerouted` so the first quest completes there.
