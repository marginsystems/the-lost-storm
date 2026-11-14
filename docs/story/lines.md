# Spoken lines

> **SPOILER WARNING.** This file contains every spoken line in the first act. If you mean to play the game first, stop reading here.

Each line has a stable id. The id is the key in `data/lines.json`, the argument to `playVoice(lineId)`, and the file name of the recording (`voice/<speaker>/<line-id>.mp3` in the private assets repository). Do not rename an id once it is recorded; add a new one instead.

A **conversation** opens the dialogue box and advances on a click. A **bark** is a subtitle that shows while a boss fights and does not stop the game.

## Warden Guide (`warden_guide`)

| Id | Line | When |
|---|---|---|
| `warden_guide_lesson` | You carry the storm and swing it like a stick. Hold it so, and throw. There. It goes where you look. | Conversation, once, while The Warden's Lesson asks you to talk to the Guide; teaches Storm Bolt. |
| `warden_guide_road` | Stay close. | Conversation, any talk. |

## Warden Trader (`warden_trader`)

The trader keeps the stall by the fire at the edge of the Hall of Time.

| Id | Line | When |
|---|---|---|
| `warden_trader_goods` | Not much today. | Conversation, any talk. |

## Warden Lookout (`warden_lookout`)

| Id | Line | When |
|---|---|---|
| `warden_lookout_ahead` | Keep your eyes open. | Conversation, any talk. |

## Warden Auctioneer (`warden_auctioneer`)

The auctioneer keeps the auction house in the Hideout, where players list items for each other.

| Id | Line | When |
|---|---|---|
| `warden_auctioneer_trade` | Others left these. Name your price, or pay theirs. | Bark on opening the auction house. |

## Unfinished Borrower (`unfinished_borrower`)

Placeholder sentences borrowed from other people's lives; the owner decides the final words.

| Id | Line | When |
|---|---|---|
| `unfinished_borrower_said_1` | Mind the step. It was always loose. | Bark, one of these at random when it first notices a foe. |
| `unfinished_borrower_said_2` | I left the bread on the sill. Someone should take it in. | Bark, one of these at random when it first notices a foe. |
| `unfinished_borrower_said_3` | Tell her I will be home before dark. | Bark, one of these at random when it first notices a foe. |
| `unfinished_borrower_said_4` | That is my coat. I know that coat. | Bark, one of these at random when it first notices a foe. |
| `unfinished_borrower_said_5` | Who let the dog out? | Bark, one of these at random when it first notices a foe. |

## Timekeeper Gatekeeper (`timekeeper_gatekeeper`)

The boss of the Keeper's Gate, north of the Hall of Time. Working lines; the owner decides the final words. Not voiced yet.

| Id | Line | When |
|---|---|---|
| `timekeeper_gatekeeper_early` | You are early. Everyone is early. | Bark when it first notices the hero. |
| `timekeeper_gatekeeper_slower` | Again. Slower this time. | Bark entering its second phase, below two thirds of its life. |
| `timekeeper_gatekeeper_count` | Hold still. Let me count you. | Bark entering its third phase, below one third of its life. |
| `timekeeper_gatekeeper_yours` | Then the hour is yours. | Bark as it dies. |

## Voice direction

- **Wardens**: plain and steady; people who walk the same road every day and expect to walk it tomorrow.
- **The Unfinished Borrower**: says each borrowed sentence as if it were its own, warmly, and does not notice it is wrong.
- **The Timekeeper Gatekeeper**: unhurried and exact, an official reading out a time that has already passed; American accent.
