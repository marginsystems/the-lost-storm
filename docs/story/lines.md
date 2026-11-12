# Spoken lines

> **SPOILER WARNING.** This file contains every spoken line in the first act. If you mean to play the game first, stop reading here.

Each line has a stable id. The id is the key in `data/lines.json`, the argument to `playVoice(lineId)`, and the file name of the recording (`voice/<speaker>/<line-id>.mp3` in the private assets repository). Do not rename an id once it is recorded; add a new one instead.

A **conversation** opens the dialogue box and advances on a click. A **bark** is a subtitle that shows while a boss fights and does not stop the game.

## The Warden of the waystation (`road_warden`)

The name is a working name until the owner names the waystation and its keeper.

| Id | Line | When |
|---|---|---|
| `road_warden_first_1` | You walked out of the mist. Most don't. | Conversation, first talk, at the waystation stall. |
| `road_warden_first_2` | The road goes east. I trade for what you find on it. | Same conversation. |
| `road_warden_shop_1` | Show me what you carry. | Conversation, any later talk; the stall opens with it. |
| `road_warden_shop_2` | The fire stays lit. Rest when you need to. | Same conversation. |

## Voice direction

- **The Warden**: plain, tired, kind without saying so. Short sentences. Never explains the world.
