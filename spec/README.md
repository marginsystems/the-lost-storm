# Overlay state machine

`Overlays.tla` models every panel, screen and card that can cover the game as one state machine. `src/hud/overlay-core.ts` is the same machine in TypeScript, and `src/hud/overlay-table.ts` holds its one table of layers, pairs and z ranks.

## The model

Each overlay is `closed`, `opening`, `open` or `closing`. A request for an overlay sends every overlay it does not pair with to `closing`. The requested overlay waits in `pending` and enters only when the last exit finishes, so one panel never swaps for another in a single frame.

| Layer | Overlays | Rule |
|---|---|---|
| side | character, inventory, trade | inventory pairs with character or trade; trade needs inventory; on a narrow (phone) layout only inventory and trade pair |
| full | chart, map, ladder | hides the minimap, quest tracker, hints, banners and name tags while not `closed` |
| card | end-of-alpha card | queued; it enters only when nothing else is up |
| modal | reader, pause, death | block other requests while up; death closes everything first |

A layout change to narrow closes the character sheet when it shares the screen with the inventory. Escape closes the topmost overlay by rank. Only when nothing is up does Escape open pause.

Checked properties:

- **Invariants:** one exclusive overlay at a time (`OneExclusive`), exits before entries (`ExitBeforeEntry`), full screens hide the HUD chrome (`FullHidesChrome`), no gap with nothing on screen (`NoIdleGap`), nothing left under death (`DeathAlone`), no play panel up or waiting while the hero is dead (`DeadHoldsNothing`), and the sim's overlay flag equals "any overlay not closed" (`FlagMatches`).
- **Action properties:** `EscapeTopFirst` and `EscapeClosesOnlyTop`.
- **World interrupts:** `Interrupt` is one action for every reset of the world under the player: a zone change, returning to the lobby, the wake, the end card and a dialogue starting (`WORLD_INTERRUPTS` in `src/hud/overlay-core.ts`). The end card's arrival interrupts too. After any of them no play panel is open or waiting (`NoPanelAfterInterrupt`); death closes every play panel (`NoPanelAfterDeath`), and a respawn starts with nothing open (`RespawnStartsClear`). `OverlaysCurrentDeath.cfg` checks `NoPanelAfterDeath` with `CURRENT = TRUE`, and TLC finds the playtest bug in three states: open the inventory, die, and it stays open beside the death card.
- **Earned panels:** the inventory, character sheet, Storm Chart and map open only once the hero has earned them (`earned`, fed from `hudView(world).parts`). A request for one he has not earned is refused (`UnearnedStaysShut`). Nothing unearned waits to enter, except the bag the shop brings in (`PendingEarned`): losing a part drops its waiting request, and closing the shop before it enters drops the bag it carried. Losing a part never closes a panel that is already open, and the shop can still bring the bag in beside it.
- **Death:** a pending death is never dropped (`DeathNeverDropped`), and its card always enters (`DeathShows`).
- **Liveness:** every request is eventually shown or superseded (`NothingLost`).

`CURRENT = TRUE` models the code before the manager. `OverlaysCurrent.cfg` makes TLC find the owner's bug: the inventory and the chart open together.

## Running TLC

Download `tla2tools.jar` from the [TLA+ releases](https://github.com/tlaplus/tlaplus/releases) to `~/.cache/tla2tools/tla2tools.jar`, or point `TLA2TOOLS` at your copy. You need Java 11 or later.

```
spec/run-tlc.sh
spec/run-tlc.sh OverlaysCurrent.cfg
spec/run-tlc.sh OverlaysCurrentDeath.cfg
```

The first command passes: it finds 8,160 distinct states, depth 12. The other two print the counterexamples. `src/hud/overlay-core.test.ts` walks every state the TypeScript core can reach and checks that there are exactly 8,160. It also reads this spec's tables and fails if they differ from `overlay-table.ts`, so a change to one without the other fails `npm test`.
