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

- **Invariants:** one exclusive overlay at a time (`OneExclusive`), exits before entries (`ExitBeforeEntry`), full screens hide the HUD chrome (`FullHidesChrome`), no gap with nothing on screen (`NoIdleGap`), nothing left under death (`DeathAlone`), and the sim's overlay flag equals "any overlay not closed" (`FlagMatches`).
- **Action properties:** `EscapeTopFirst`, `EscapeClosesOnlyTop` and `ZoneLeavesNoOrphan`.
- **Death:** a pending death is never dropped (`DeathNeverDropped`), and its card always enters (`DeathShows`).
- **Liveness:** every request is eventually shown or superseded (`NothingLost`).

`CURRENT = TRUE` models the code before the manager. `OverlaysCurrent.cfg` makes TLC find the owner's bug: the inventory and the chart open together.

## Running TLC

Download `tla2tools.jar` from the [TLA+ releases](https://github.com/tlaplus/tlaplus/releases) to `~/.cache/tla2tools/tla2tools.jar`, or point `TLA2TOOLS` at your copy. You need Java 11 or later.

```
spec/run-tlc.sh
spec/run-tlc.sh OverlaysCurrent.cfg
```

The first command passes: it finds 608 distinct states, depth 7. The second prints the counterexample. `src/hud/overlay-core.test.ts` walks every state the TypeScript core can reach and checks that there are exactly 608. It also reads this spec's tables and fails if they differ from `overlay-table.ts`, so a change to one without the other fails `npm test`.
