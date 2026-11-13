# Assets

Every file under `public/models` and `public/textures` is listed here with its source and licence. `test/rules.test.ts` fails when a model is added without a row.

Shipped models are CC0 (public domain), CC BY 4.0 with the credit below, or made for this project. The two fonts are SIL Open Font License 1.1. Nothing here is Mixamo, Splice, or any other licence that forbids redistributing the file.

## Sources

| Source | Author | Link | Licence | Licence text |
|---|---|---|---|---|
| Free Pack - Human Skeleton | PolyOne Studio | https://sketchfab.com/3d-models/free-pack-human-skeleton-950d0a46531f492ab8715777e312a5bf | CC BY 4.0 | [licenses/CC-BY-4.0.txt](licenses/CC-BY-4.0.txt) |
| Universal Animation Library (Standard) | Quaternius (quaternius.com) | https://quaternius.com/packs/universalanimationlibrary.html | CC0 1.0 | [licenses/Quaternius-Universal-Animation-Library.txt](licenses/Quaternius-Universal-Animation-Library.txt) |
| Universal Animation Library 2 (Standard) | Quaternius (quaternius.com) | https://quaternius.com/packs/universalanimationlibrary2.html | CC0 1.0 | [licenses/Quaternius-Universal-Animation-Library-2.txt](licenses/Quaternius-Universal-Animation-Library-2.txt) |
| MakeHuman community garments (suits02, gloves01, shirts01, pants01, shoes01) | Donitz, Rehman Polanski, MRT, culturalibre (makehumancommunity.org) | http://www.makehumancommunity.org/clothes.html | CC0 1.0 | [licenses/MakeHuman-community-assets.txt](licenses/MakeHuman-community-assets.txt) |
| MakeHuman base mesh, shape targets, skins and eyes | The MakeHuman project: Data Collection AB, Joel Palmius, Jonas Hauquier (makehumancommunity.org) | https://github.com/makehumancommunity/makehuman | CC0 1.0 | [licenses/MakeHuman-community-assets.txt](licenses/MakeHuman-community-assets.txt) |
| Poly Haven models and textures | The authors named in the tables below (polyhaven.com) | https://polyhaven.com | CC0 1.0 | [licenses/Poly-Haven-CC0.txt](licenses/Poly-Haven-CC0.txt) |

## Landing page images

`src/landing/images/`, `public/og.jpg` and `public/apple-touch-icon.png` are screenshots of this game, captured from it for this project, and `public/favicon.svg` was drawn for it. They fall under the repository's MIT licence. What appears in them (models, textures) is credited in the rows below.

## Interface icons

The Discord, GitHub and X marks in the footers of the title screen (`play/index.html`) and the landing page (`index.html`) are the SVG paths from [Simple Icons](https://simpleicons.org) 13.21.0, CC0 1.0, licence text in [licenses/Simple-Icons-CC0.txt](licenses/Simple-Icons-CC0.txt). The marks are the trademarks of their owners and are used only to link to this game's pages on those services. The feedback speech bubble was drawn for this project.

## Credit required by CC BY 4.0

"Free Pack - Human Skeleton" by PolyOne Studio, https://sketchfab.com/3d-models/free-pack-human-skeleton-950d0a46531f492ab8715777e312a5bf, licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: posed onto the Quaternius rig, decimated and repainted; lower-detail copies removed. The same credit is shown on the game's title screen.

## Characters and animations

Every humanoid uses one rig, the Universal Animation Library rig (53 `DEF-*` joints), so bodies, clips and held gear are interchangeable.

| File | What it is | Source | Licence |
|---|---|---|---|
| `public/models/characters/skeleton.glb` | The skeleton body used by the hero, the townsfolk and every monster | "Free Pack - Human Skeleton" by PolyOne Studio, fitted to the rig, decimated and repainted for Movement Lab (`blender/variant_skeleton.py` in that repository); lower-detail copies stripped here by `tools/build-characters.ts` | CC BY 4.0 |
| `public/models/characters/human_man.glb`, `public/models/characters/human_woman.glb`, `public/models/characters/human_elder.glb` | The townsfolk: a broad middle-aged man, a middle-aged woman and a gaunt old man, each a skinned body with eyes on the shared rig | MakeHuman base mesh (`base.obj`, the `body` group) shaped with the MakeHuman `caucasian-*` and `universal-*` macro targets, with the MakeHuman skins `middleage_caucasian_male`, `middleage_caucasian_female` and `old_caucasian_male` and the low-poly eyes with the brown iris, from `makehuman_system_assets_cc0.zip`; skinned through the MakeHuman default rig, refitted to this rig and decimated to 50% by `blender/build_wearables.py` (parts with `"body": true` in `blender/wearables.json`) | CC0 1.0 |
| `public/models/characters/human_man.glb` hands (`human_man_hands`) | The man's two hands, with five shaped fingers each | The `M_Char_Glove` hands of the Movement Lab wanderer (`assets/character.glb` at commit 18bf38c7 of Movement Lab, by the same author), cut there from the realistic male body of Blender Studio's "Human Base Meshes" bundle v1.4.1 and weighted to the same rig; grafted by `blender/wearable_hands.py` (the `hands` field in `blender/wearables.json`): welded, subdivided once, each finger turned onto its bone chain, the wrist welded to the arm with blended weights, and the skin baked from the body's skin | CC0 1.0 |
| `public/models/animations/humanoid.glb` | The rig and 15 clips (idle, walk, jog, sprint, sword attack, punches, spell, hits, death, roll, landing) | Universal Animation Library (Standard) by Quaternius, Godot Asset Store build; the clips are picked out by `tools/build-characters.ts` | CC0 1.0 |
| `public/models/animations/combat.glb` | 22 combat clips on the same rig: a three-swing sword chain, heavy slams, a sweep, a lunge, a dash, blocks, a shield bash, a claw lunge, a throw, a chop, a leap, a zombie idle, walk and scratch, and two more deaths | Universal Animation Library 2 (Standard) by Quaternius, `Unreal-Godot/UAL2_Standard.glb`, moved onto this rig by `tools/retarget-clips.ts` | CC0 1.0 |

Rebuild the first two with:

```bash
node tools/build-characters.ts <skeleton.glb> <character-with-clips.glb> public/models/characters/skeleton.glb public/models/animations/humanoid.glb
```

Universal Animation Library 2 ships on a rig with Unreal joint names (`pelvis`, `spine_01`, `hand_r`) and slightly different finger rest poses, so its clips cannot be loaded as they are. `tools/retarget-clips.ts` reads each joint's world rotation frame by frame, carries it onto the matching `DEF-*` joint with a correction for the two rest poses, scales the hip travel by the hip heights, and writes the result at 30 frames a second. `tools/combat-clips.json` lists the joint pairs and the clips: a clip is one or more parts of a source clip, each with an optional start, end, hold, playback rate or reversal, which is how a strike and its recovery become one clip, how a raised blade is held for a telegraph, and how standing up from the ground becomes a collapse. Rebuild with:

```bash
node tools/retarget-clips.ts public/models/animations/humanoid.glb <UAL2_Standard.glb> tools/combat-clips.json public/models/animations/combat.glb
```

After either rebuild, drop the keyframes that a straight line between their neighbours already gives (within 0.0001), which more than halves both files without changing a pose:

```bash
node tools/resample-clips.ts public/models/animations/humanoid.glb public/models/animations/combat.glb
```

The game loads one file per clip, so a character fetches only the clips its rig plays, and the hero's clips arrive without the combat clips of every monster. The two files above are the sources; the split files are what ships:

| File | What it is | Source | Licence |
|---|---|---|---|
| `public/models/animations/clips/Death01.glb`, `public/models/animations/clips/Hit_Chest.glb`, `public/models/animations/clips/Hit_Head.glb`, `public/models/animations/clips/Idle_Loop.glb`, `public/models/animations/clips/Idle_Torch_Loop.glb`, `public/models/animations/clips/Jog_Fwd_Loop.glb`, `public/models/animations/clips/Jump_Land.glb`, `public/models/animations/clips/Punch_Cross.glb`, `public/models/animations/clips/Punch_Jab.glb`, `public/models/animations/clips/Roll.glb`, `public/models/animations/clips/Spell_Simple_Shoot.glb`, `public/models/animations/clips/Sprint_Loop.glb`, `public/models/animations/clips/Sword_Attack.glb`, `public/models/animations/clips/Sword_Idle.glb`, `public/models/animations/clips/Walk_Loop.glb` | The 15 clips of `humanoid.glb`, one clip per file | Split from `public/models/animations/humanoid.glb` by `tools/split-clips.ts` | CC0 1.0 |
| `public/models/animations/clips/Sword_Combo_A.glb`, `public/models/animations/clips/Sword_Combo_B.glb`, `public/models/animations/clips/Sword_Combo_C.glb`, `public/models/animations/clips/Sword_Slam.glb`, `public/models/animations/clips/Sword_Slam_Charged.glb`, `public/models/animations/clips/Sword_Lunge.glb`, `public/models/animations/clips/Sword_Sweep.glb`, `public/models/animations/clips/Sword_Dash.glb`, `public/models/animations/clips/Sword_Block.glb`, `public/models/animations/clips/Shield_Idle_Loop.glb`, `public/models/animations/clips/Shield_Bash.glb`, `public/models/animations/clips/Shield_Block.glb`, `public/models/animations/clips/Shield_Break.glb`, `public/models/animations/clips/Claw_Lunge.glb`, `public/models/animations/clips/Throw.glb`, `public/models/animations/clips/Chop.glb`, `public/models/animations/clips/Leap.glb`, `public/models/animations/clips/Zombie_Idle_Loop.glb`, `public/models/animations/clips/Zombie_Walk_Loop.glb`, `public/models/animations/clips/Zombie_Scratch.glb`, `public/models/animations/clips/Death_Knockback.glb`, `public/models/animations/clips/Death_Collapse.glb` | The 22 clips of `combat.glb`, one clip per file | Split from `public/models/animations/combat.glb` by `tools/split-clips.ts` | CC0 1.0 |

Split them after any rebuild, drop the tracks that never leave a joint's rest pose, and compress the result:

```bash
node tools/split-clips.ts public/models/animations/humanoid.glb public/models/animations/combat.glb public/models/animations/clips
node tools/compress-models.ts public/models/animations/clips/*.glb
```

Every model under `public/models` is compressed by `tools/compress-models.ts`: textures become WebP, vertices are reordered for the meshopt codec, normals, tangents, skin weights and colours are quantised (positions and texture coordinates are not, so wearables still bind to any body and dressed materials keep their UVs), and the buffers are written with `EXT_meshopt_compression`. Run it on any new or rebuilt model before it ships:

```bash
node tools/compress-models.ts public/models/props/new_prop.glb
```

## Weapons

| File | Source | Author | Licence |
|---|---|---|---|
| `public/models/weapons/bone_javelin.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/broadsword.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/greatsword.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/hex_staff.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/rusted_blade.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/sword_1h.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/tower_shield.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/war_maul.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |

Rebuild with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_weapons.py -- "$PWD/public/models/weapons"
```

## Clothing and armour

Skinned pieces made once and worn by every character on the shared rig. `data/wearables.json` turns each file into one or more wearables with a tint and the body parts it hides.

MakeHuman community garments come as a mesh fitted to the MakeHuman base body, with no skin of their own. `blender/wearable_makehuman.py` places each vertex from the garment's bindings to that body, takes its skin weights from the MakeHuman default rig through the same bindings, and maps MakeHuman's 163 bones onto our 53 `DEF-*` joints. `blender/build_wearables.py` then moves each vertex from MakeHuman's rest pose to ours joint by joint and repacks the UV islands the part uses into its own 256 to 1024 pixel WebP textures; a part can ask for its colour map to be desaturated and brought to a set brightness, so one garment takes several tints. `blender/wearables.json` lists the parts; the refit is in `blender/wearable_fit.py` and the texture repack in `blender/wearable_textures.py`. Only garments whose own `.mhclo` header says CC0 are used; the header lines are quoted in the licence text.

| File | What it is | Original | Licence |
|---|---|---|---|
| `public/models/wear/monk_robe.glb` | Hooded robe with rope belt | "Monks Robe" by Donitz, `suits02_cc0.zip`, decimated to 50% | CC0 1.0 |
| `public/models/wear/monk_hood.glb` | Hood for the robe | "Monks Hood" by Donitz, `suits02_cc0.zip`, decimated to 50%, widened to fit the skull | CC0 1.0 |
| `public/models/wear/mail_tunic.glb` | Ring mail over a padded tunic | "TunicViking" by Rehman Polanski, `suits02_cc0.zip`, decimated to 60% | CC0 1.0 |
| `public/models/wear/leather_jerkin.glb` | Studded jerkin over a padded tunic | "TunicViking" by Rehman Polanski, `suits02_cc0.zip`, decimated to 60%, colour desaturated for leather tints | CC0 1.0 |
| `public/models/wear/viking_breeches.glb` | Breeches | "PantsViking" by Rehman Polanski, `suits02_cc0.zip` | CC0 1.0 |
| `public/models/wear/hide_boots.glb` | Hide boots tied with cord | "BootsViking" by Rehman Polanski, `suits02_cc0.zip` | CC0 1.0 |
| `public/models/wear/leather_gloves.glb` | Gloves | "Gloves_Medium" by MRT, `gloves01_cc0.zip`, decimated to 50% | CC0 1.0 |
| `public/models/wear/hair_short.glb` | Short practical hair, the default man | MakeHuman hair `short02` from `makehuman_system_assets_cc0.zip`, fitted to the shared rig with the alpha-cut cards kept by `blender/build_wearables.py` (`"cutout": true`) | CC0 1.0 |
| `public/models/wear/hair_cropped.glb` | Close-cropped hair | MakeHuman hair `short01` from `makehuman_system_assets_cc0.zip`, fitted to the shared rig with the alpha-cut cards kept by `blender/build_wearables.py` (`"cutout": true`) | CC0 1.0 |
| `public/models/wear/hair_swept.glb` | Short swept hair | MakeHuman hair `short04` from `makehuman_system_assets_cc0.zip`, fitted to the shared rig with the alpha-cut cards kept by `blender/build_wearables.py` (`"cutout": true`) | CC0 1.0 |
| `public/models/wear/hair_ponytail.glb` | Long hair tied in a ponytail | MakeHuman hair `ponytail01` from `makehuman_system_assets_cc0.zip`, fitted to the shared rig with the alpha-cut cards kept by `blender/build_wearables.py` (`"cutout": true`) | CC0 1.0 |
| `public/models/wear/hair_braid.glb` | A long braid | MakeHuman hair `braid01` from `makehuman_system_assets_cc0.zip`, fitted to the shared rig with the alpha-cut cards kept by `blender/build_wearables.py` (`"cutout": true`) | CC0 1.0 |
| `public/models/wear/hair_bob.glb` | A short bob | MakeHuman hair `bob02` from `makehuman_system_assets_cc0.zip`, fitted to the shared rig with the alpha-cut cards kept by `blender/build_wearables.py` (`"cutout": true`) | CC0 1.0 |
| `public/models/wear/long_gloves.glb` | Long gloves worn as bracers | "Gloves_Long" by MRT, `gloves01_cc0.zip`, decimated to 50%, colour desaturated | CC0 1.0 |
| `public/models/wear/wool_tunic.glb` | Knitted wool tunic | "Sweater_Fisherman" by MRT, `shirts01_cc0.zip`, colour desaturated | CC0 1.0 |
| `public/models/wear/wool_trousers.glb` | Wool trousers | "Pants_Wool" by MRT, `pants01_cc0.zip`, colour partly desaturated | CC0 1.0 |
| `public/models/wear/undertunic.glb` | Plain short-sleeved undertunic, the base layer of the man and the elder | "T-shirt_basic_tucked" by MRT, `shirts01_cc0.zip`, colour desaturated | CC0 1.0 |
| `public/models/wear/undertunic_woman.glb` | Plain short-sleeved undertunic, the base layer of the woman | "CrudeFemaleTshirt" by Joel Palmius, `shirts01_cc0.zip`, colour desaturated | CC0 1.0 |
| `public/models/wear/braies.glb` | Knee-length linen braies, the base layer of every body | "Pants_Wool" by MRT, `pants01_cc0.zip`, cut above the knee (`keepAbove`), colour desaturated | CC0 1.0 |
| `public/models/wear/tall_boots.glb` | Tall leather boots with folded cuffs | "male_boots" by culturalibre after Roachburn, `shoes01_cc0.zip`, decimated to 20% | CC0 1.0 |

Rebuild with the packs unpacked somewhere outside this repository:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_wearables.py -- blender/wearables.json public/models/characters/skeleton.glb public/models/wear <scratch-dir> makehuman_suits02=<path to suits02_cc0> makehuman_gloves01=<path to gloves01_cc0> makehuman_shirts01=<path to shirts01_cc0> makehuman_pants01=<path to pants01_cc0> makehuman_shoes01=<path to shoes01_cc0> makehuman_rig=<folder with base.obj, default.mhskel, default_weights.mhw and targets/>
```

That command builds the garments. The three townsfolk bodies are parts of the `makehuman_system` pack and are written to a different folder, so they have their own command:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_wearables.py -- blender/wearables.json public/models/characters/skeleton.glb public/models/characters <scratch-dir> makehuman_system=<path to makehuman_system_assets_cc0> makehuman_rig=<folder with base.obj, default.mhskel, default_weights.mhw and targets/> movement_lab_hands=<folder with the Movement Lab character.glb from commit 18bf38c7> only=human_man,human_woman,human_elder
```

Blender cannot read the meshopt-compressed `skeleton.glb`: give it a copy with the compression removed. Then run `node tools/compress-models.ts` on each body and re-bake its covers with `node tools/bake-cover.ts`, since a body with new hands has a different triangle count.

The garments are fitted to the unshaped MakeHuman base body and the townsfolk bodies carry shape targets, so a body does not match its clothes exactly. The pieces that cover the torso, arms, legs, hands and feet name those body parts in `hides`, so the body under them is not drawn and cannot poke through. The hoods hide nothing: they are widened to clear the head (`girth` in `blender/wearables.json`).

The arguments are the manifest, the body whose rig the parts are fitted to, the output folder, a scratch folder for the repacked PNG textures, and one `<pack>=<folder>` per source pack. Parts of a pack with no folder are left as they are. Add `only=<id>,<id>` to rebuild some parts. The build stops with an error when it would build nothing.

## World

The walls, pillars, stairs, lamps, furniture, graves, dead trees, houses and stalls are built from boxes, cylinders and noise by `blender/build_environment.py` (helpers in `blender/environment_kit.py`). They carry no textures of their own: each material in a file has a plain name (`stone`, `wood`, `iron`, `cloth`, `bark`), and `data/props.json` dresses that name in a surface from `data/surfaces.json`, so one wall model serves the town in one stone and the bastion in another.

| File | What it is | Source | Licence |
|---|---|---|---|
| `public/models/world/banner.glb` | Hanging banner | Built by `blender/build_environment.py` | MIT |
| `public/models/world/banner_wide.glb` | Wide hanging banner with a boss | Built by `blender/build_environment.py` | MIT |
| `public/models/world/bench.glb` | Bench | Built by `blender/build_environment.py` | MIT |
| `public/models/world/brazier.glb` | Iron brazier | Built by `blender/build_environment.py` | MIT |
| `public/models/world/bridge_broken.glb` | Broken timber bridge | Built by `blender/build_road.py` | MIT |
| `public/models/world/cairn.glb` | Stacked stone post | Built by `blender/build_environment.py` | MIT |
| `public/models/world/candles.glb` | Three candles | Built by `blender/build_environment.py` | MIT |
| `public/models/world/coins.glb` | Pile of coins (gold drops) | Built by `blender/build_environment.py` | MIT |
| `public/models/world/column.glb` | Round column | Built by `blender/build_environment.py` | MIT |
| `public/models/world/column_broken.glb` | Broken column | Built by `blender/build_environment.py` | MIT |
| `public/models/world/dead_tree_large.glb` | Large dead tree | Built by `blender/build_environment.py` | MIT |
| `public/models/world/dead_tree_medium.glb` | Dead tree | Built by `blender/build_environment.py` | MIT |
| `public/models/world/dead_tree_small.glb` | Small dead tree | Built by `blender/build_environment.py` | MIT |
| `public/models/world/doorway.glb` | Doorway with a shut door | Built by `blender/build_environment.py` | MIT |
| `public/models/world/drystone_a.glb` | Dry-stone wall | Built by `blender/build_environment.py` | MIT |
| `public/models/world/drystone_b.glb` | Dry-stone wall | Built by `blender/build_environment.py` | MIT |
| `public/models/world/drystone_gap.glb` | Collapsed dry-stone wall | Built by `blender/build_environment.py` | MIT |
| `public/models/world/drystone_low.glb` | Low dry-stone wall | Built by `blender/build_environment.py` | MIT |
| `public/models/world/grate.glb` | Iron floor grate | Built by `blender/build_environment.py` | MIT |
| `public/models/world/grave_cross.glb` | Stone cross | Built by `blender/build_environment.py` | MIT |
| `public/models/world/grave_slab.glb` | Grave slab | Built by `blender/build_environment.py` | MIT |
| `public/models/world/gravestone.glb` | Headstone | Built by `blender/build_environment.py` | MIT |
| `public/models/world/great_doors.glb` | Great stone doors with a carved disc | Built by `blender/build_road.py` | MIT |
| `public/models/world/great_lamp.glb` | Great lamp, dark | Built by `blender/build_environment.py` | MIT |
| `public/models/world/great_lamp_lit.glb` | Great lamp, lit | Built by `blender/build_environment.py` | MIT |
| `public/models/world/house_a.glb` | Timber-framed house | Built by `blender/build_environment.py` | MIT |
| `public/models/world/house_b.glb` | Tall timber-framed house | Built by `blender/build_environment.py` | MIT |
| `public/models/world/hut_patched.glb` | Patched hut with mismatched walls | Built by `blender/build_road.py` | MIT |
| `public/models/world/loose_blocks.glb` | Loose stone blocks | Built by `blender/build_environment.py` | MIT |
| `public/models/world/pier.glb` | Corner pier | Built by `blender/build_environment.py` | MIT |
| `public/models/world/pillar.glb` | Square pillar | Built by `blender/build_environment.py` | MIT |
| `public/models/world/plinth.glb` | Stepped plinth | Built by `blender/build_environment.py` | MIT |
| `public/models/world/post.glb` | Wooden post with an arm | Built by `blender/build_environment.py` | MIT |
| `public/models/world/post_lantern.glb` | Post with an unlit lantern | Built by `blender/build_environment.py` | MIT |
| `public/models/world/post_lantern_lit.glb` | Post with a lit lantern | Built by `blender/build_environment.py` | MIT |
| `public/models/world/reeds.glb` | Clump of reeds | Built by `blender/build_road.py` | MIT |
| `public/models/world/rubble_large.glb` | Large rubble heap | Built by `blender/build_environment.py` | MIT |
| `public/models/world/rubble_small.glb` | Small rubble heap | Built by `blender/build_environment.py` | MIT |
| `public/models/world/shelter.glb` | Lean-to of mismatched pieces | Built by `blender/build_road.py` | MIT |
| `public/models/world/shrine.glb` | Stone shrine with candles | Built by `blender/build_environment.py` | MIT |
| `public/models/world/stairs.glb` | Ruined stair | Built by `blender/build_environment.py` | MIT |
| `public/models/world/stall.glb` | Market stall | Built by `blender/build_environment.py` | MIT |
| `public/models/world/standing_clock.glb` | Standing case clock | Built by `blender/build_road.py` | MIT |
| `public/models/world/standing_clock_tilted.glb` | Leaning standing clock with a cracked face | Built by `blender/build_road.py` | MIT |
| `public/models/world/statue_base.glb` | Statue base | Built by `blender/build_environment.py` | MIT |
| `public/models/world/still_figure.glb` | Still figure standing, in a hooded robe | Built by `blender/build_road.py` from the MakeHuman body in `human_man.glb` and the "Monks Robe" and "Monks Hood" wearables (Donitz, `suits02_cc0.zip`), posed on the shared rig, joined and decimated to about 1400 triangles with the textures dropped | CC0 1.0 |
| `public/models/world/still_figure_bowed.glb` | Still figure with bowed head, in a hooded robe | Built like `still_figure.glb` with the neck, head and spine turned forward | CC0 1.0 |
| `public/models/world/sunken_cart.glb` | Cart sunk to its axle | Built by `blender/build_road.py` | MIT |
| `public/models/world/table_broken.glb` | Broken trestle table | Built by `blender/build_environment.py` | MIT |
| `public/models/world/torch.glb` | Wall torch | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_a.glb` | Wall section | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_b.glb` | Wall section with a buttress | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_low.glb` | Low wall | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_low_piers.glb` | Low wall with piers | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_ruin.glb` | Broken wall section | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_scaffold.glb` | Wall section with scaffolding | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_window.glb` | Wall section with a barred window | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_works.glb` | Unfinished wall with a timber frame | Built by `blender/build_environment.py` | MIT |
| `public/models/world/warden_stone.glb` | Road marker stone with a lantern hook | Built by `blender/build_road.py` | MIT |
| `public/models/world/wide_stair.glb` | Broad flight of worn steps | Built by `blender/build_road.py` | MIT |

Rebuild with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_environment.py -- "$PWD/public/models/world"
```

Add `only=<id>,<id>` to rebuild some of them.

## Props from Poly Haven

Scanned models from polyhaven.com, all CC0. `blender/import_polyhaven.py` keeps the objects named in `blender/polyhaven.json`, reduces each to the triangle count given there, moves its origin to the middle of its base, shrinks its textures to 256 or 512 pixels and writes one `.glb` with WebP textures. Scale is unchanged; `data/props.json` sets the size in the game.

| File | Poly Haven asset | Authors | Licence |
|---|---|---|---|
| `public/models/props/barrel.glb` | "Wooden Barrels 01" (`wooden_barrels_01`) | James Ray Cock | CC0 1.0 |
| `public/models/props/crate_a.glb` | "Wooden Crate 01" (`wooden_crate_01`) | James Ray Cock | CC0 1.0 |
| `public/models/props/crate_b.glb` | "Wooden Crate 02" (`wooden_crate_02`) | James Ray Cock, Jurita Burger | CC0 1.0 |
| `public/models/props/bucket.glb` | "Wooden Bucket 01" (`wooden_bucket_01`) | James Ray Cock | CC0 1.0 |
| `public/models/props/stool.glb` | "Wooden Stool 01" (`wooden_stool_01`) | Kuutti Siitonen | CC0 1.0 |
| `public/models/props/chest.glb` | "Treasure Chest" (`treasure_chest`) | Rico Cilliers | CC0 1.0 |
| `public/models/props/fire_pit.glb` | "Stone Fire Pit" (`stone_fire_pit`) | Sebastian Platen | CC0 1.0 |
| `public/models/props/rock_set_1.glb` | "Rock Moss Set 01" (`rock_moss_set_01`) | Kless Gyzen | CC0 1.0 |
| `public/models/props/rock_set_2.glb` | "Rock Moss Set 01" (`rock_moss_set_01`) | Kless Gyzen | CC0 1.0 |
| `public/models/props/rock_set_3.glb` | "Rock Moss Set 01" (`rock_moss_set_01`) | Kless Gyzen | CC0 1.0 |
| `public/models/props/rock_set_4.glb` | "Rock Moss Set 01" (`rock_moss_set_01`) | Kless Gyzen | CC0 1.0 |
| `public/models/props/rock_set_5.glb` | "Rock Moss Set 01" (`rock_moss_set_01`) | Kless Gyzen | CC0 1.0 |
| `public/models/props/dead_tree_a.glb` | "Dead Tree Trunk 02" (`dead_tree_trunk_02`) | Jenelle van Heerden, Rico Cilliers | CC0 1.0 |
| `public/models/props/stump.glb` | "Tree Stump 01" (`tree_stump_01`) | Rob Tuytel | CC0 1.0 |
| `public/models/props/dead_log.glb` | "Dead Tree Trunk" (`dead_tree_trunk`) | Rob Tuytel | CC0 1.0 |
| `public/models/props/branches.glb` | "Dry Branches Medium 01" (`dry_branches_medium_01`) | Rico Cilliers | CC0 1.0 |
| `public/models/props/statue.glb` | "Gothic Statue" (`gothic_statue`) | Benny Weimer | CC0 1.0 |
| `public/models/props/table.glb` | "Wooden Table 01" (`WoodenTable_01`) | Ethan Place | CC0 1.0 |
| `public/models/props/basket.glb` | "Wicker Basket 01" (`wicker_basket_01`) | Kuutti Siitonen | CC0 1.0 |
| `public/models/props/jug.glb` | "Jug 01" (`jug_01`) | Kuutti Siitonen | CC0 1.0 |
| `public/models/props/pot.glb` | "Ceramic Pot" (`ceramic_pot`) | Aron Łyczek | CC0 1.0 |
| `public/models/props/bowl.glb` | "Wooden Bowl 01" (`wooden_bowl_01`) | Oliver Harries | CC0 1.0 |
| `public/models/props/brass_pot.glb` | "Brass Pot 01" (`brass_pot_01`) | Rico Cilliers | CC0 1.0 |
| `public/models/props/axe.glb` | "Wooden Axe" (`wooden_axe`) | Ulan Cabanilla | CC0 1.0 |
| `public/models/props/hammer.glb` | "Cross Pein Hammer" (`cross_pein_hammer`) | Tics | CC0 1.0 |
| `public/models/props/broom.glb` | "Wooden Broom" (`wooden_broom`) | Balen | CC0 1.0 |
| `public/models/props/lantern.glb` | "Wooden Lantern 01" (`wooden_lantern_01`) | James Ray Cock | CC0 1.0 |
| `public/models/props/candlestick.glb` | "Wooden Candlestick" (`wooden_candlestick`) | Josh Dean | CC0 1.0 |
| `public/models/props/cask.glb` | "Wine Barrel 01" (`wine_barrel_01`) | James Ray Cock | CC0 1.0 |
| `public/models/props/pail.glb` | "Wooden Bucket 02" (`wooden_bucket_02`) | James Ray Cock | CC0 1.0 |
| `public/models/props/chair.glb` | "Painted Wooden Chair 01" (`painted_wooden_chair_01`) | Kuutti Siitonen | CC0 1.0 |

Rebuild with each asset's 1k glTF download (`https://api.polyhaven.com/files/<asset>` lists the files) unpacked into `<downloads>/<asset>/`:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/import_polyhaven.py -- blender/polyhaven.json <downloads> public/models/props
```

## Surface textures

Ground, wall, wood, metal and cloth textures from polyhaven.com, all CC0. Each is the 1k JPEG download resized with `cwebp`: colour and normal map at 1024 pixels for ground and walls and 512 for the rest, and the occlusion, roughness and metalness map at 512. `data/surfaces.json` turns them into surfaces with a tile size and a tint.

The copies in `public/textures/half/` are the same textures at half the size, for the mobile quality tier. `tools/half-textures.sh` makes them with `sips` and `cwebp`:

```bash
sh tools/half-textures.sh
```

| Files | Poly Haven asset | Authors | Licence |
|---|---|---|---|
| `public/textures/cobble_color.webp`, `public/textures/cobble_normal.webp`, `public/textures/cobble_orm.webp`, `public/textures/half/cobble_color.webp`, `public/textures/half/cobble_normal.webp`, `public/textures/half/cobble_orm.webp` | "Cobblestone Floor 08" (`cobblestone_floor_08`) | Rob Tuytel | CC0 1.0 |
| `public/textures/flagstone_color.webp`, `public/textures/flagstone_normal.webp`, `public/textures/flagstone_orm.webp`, `public/textures/half/flagstone_color.webp`, `public/textures/half/flagstone_normal.webp`, `public/textures/half/flagstone_orm.webp` | "Monastery Stone Floor" (`monastery_stone_floor`) | Amal Kumar | CC0 1.0 |
| `public/textures/ashlar_color.webp`, `public/textures/ashlar_normal.webp`, `public/textures/ashlar_orm.webp`, `public/textures/half/ashlar_color.webp`, `public/textures/half/ashlar_normal.webp`, `public/textures/half/ashlar_orm.webp` | "Rock Tile Floor" (`rock_tile_floor`) | Charlotte Baglioni | CC0 1.0 |
| `public/textures/mud_color.webp`, `public/textures/mud_normal.webp`, `public/textures/mud_orm.webp`, `public/textures/half/mud_color.webp`, `public/textures/half/mud_normal.webp`, `public/textures/half/mud_orm.webp` | "Brown Mud 03" (`brown_mud_03`) | Rob Tuytel | CC0 1.0 |
| `public/textures/dirt_color.webp`, `public/textures/dirt_normal.webp`, `public/textures/dirt_orm.webp`, `public/textures/half/dirt_color.webp`, `public/textures/half/dirt_normal.webp`, `public/textures/half/dirt_orm.webp` | "Brown Mud Rocks 01" (`brown_mud_rocks_01`) | Rob Tuytel | CC0 1.0 |
| `public/textures/forest_color.webp`, `public/textures/forest_normal.webp`, `public/textures/forest_orm.webp`, `public/textures/half/forest_color.webp`, `public/textures/half/forest_normal.webp`, `public/textures/half/forest_orm.webp` | "Forest Ground 04" (`forest_ground_04`) | Rob Tuytel, Rico Cilliers | CC0 1.0 |
| `public/textures/trail_color.webp`, `public/textures/trail_normal.webp`, `public/textures/trail_orm.webp`, `public/textures/half/trail_color.webp`, `public/textures/half/trail_normal.webp`, `public/textures/half/trail_orm.webp` | "Rocky Trail 02" (`rocky_trail_02`) | Amal Kumar | CC0 1.0 |
| `public/textures/castle_wall_color.webp`, `public/textures/castle_wall_normal.webp`, `public/textures/castle_wall_orm.webp`, `public/textures/half/castle_wall_color.webp`, `public/textures/half/castle_wall_normal.webp`, `public/textures/half/castle_wall_orm.webp` | "Castle Wall Slates" (`castle_wall_slates`) | Rob Tuytel | CC0 1.0 |
| `public/textures/mossy_wall_color.webp`, `public/textures/mossy_wall_normal.webp`, `public/textures/mossy_wall_orm.webp`, `public/textures/half/mossy_wall_color.webp`, `public/textures/half/mossy_wall_normal.webp`, `public/textures/half/mossy_wall_orm.webp` | "Mossy Stone Wall" (`mossy_stone_wall`) | Amal Kumar | CC0 1.0 |
| `public/textures/drystone_color.webp`, `public/textures/drystone_normal.webp`, `public/textures/drystone_orm.webp`, `public/textures/half/drystone_color.webp`, `public/textures/half/drystone_normal.webp`, `public/textures/half/drystone_orm.webp` | "Stacked Stone Wall" (`stacked_stone_wall`) | Dimitrios Savva | CC0 1.0 |
| `public/textures/planks_color.webp`, `public/textures/planks_normal.webp`, `public/textures/planks_orm.webp`, `public/textures/half/planks_color.webp`, `public/textures/half/planks_normal.webp`, `public/textures/half/planks_orm.webp` | "Old Planks 02" (`old_planks_02`) | Rob Tuytel | CC0 1.0 |
| `public/textures/iron_color.webp`, `public/textures/iron_normal.webp`, `public/textures/iron_orm.webp`, `public/textures/half/iron_color.webp`, `public/textures/half/iron_normal.webp`, `public/textures/half/iron_orm.webp` | "Rusty Metal 02" (`rusty_metal_02`) | Rob Tuytel | CC0 1.0 |
| `public/textures/burlap_color.webp`, `public/textures/burlap_normal.webp`, `public/textures/burlap_orm.webp`, `public/textures/half/burlap_color.webp`, `public/textures/half/burlap_normal.webp`, `public/textures/half/burlap_orm.webp` | "Hessian 230" (`hessian_230`) | colormass, Rico Cilliers | CC0 1.0 |
| `public/textures/plaster_color.webp`, `public/textures/plaster_normal.webp`, `public/textures/plaster_orm.webp`, `public/textures/half/plaster_color.webp`, `public/textures/half/plaster_normal.webp`, `public/textures/half/plaster_orm.webp` | "Worn Plaster Wall" (`worn_plaster_wall`) | Dimitrios Savva | CC0 1.0 |
| `public/textures/slates_color.webp`, `public/textures/slates_normal.webp`, `public/textures/slates_orm.webp`, `public/textures/half/slates_color.webp`, `public/textures/half/slates_normal.webp`, `public/textures/half/slates_orm.webp` | "Roof Slates 02" (`roof_slates_02`) | Rob Tuytel | CC0 1.0 |
| `public/textures/bark_color.webp`, `public/textures/bark_normal.webp`, `public/textures/bark_orm.webp`, `public/textures/half/bark_color.webp`, `public/textures/half/bark_normal.webp`, `public/textures/half/bark_orm.webp` | "Bark Brown 02" (`bark_brown_02`) | Rob Tuytel | CC0 1.0 |
| `public/textures/leather_color.webp`, `public/textures/leather_normal.webp`, `public/textures/leather_orm.webp`, `public/textures/half/leather_color.webp`, `public/textures/half/leather_normal.webp`, `public/textures/half/leather_orm.webp` | "Brown Leather" (`brown_leather`) | Rob Tuytel | CC0 1.0 |
| `public/textures/silt_color.webp`, `public/textures/silt_normal.webp`, `public/textures/silt_orm.webp`, `public/textures/half/silt_color.webp`, `public/textures/half/silt_normal.webp`, `public/textures/half/silt_orm.webp` | "Aerial Beach 01" (`aerial_beach_01`) | Rob Tuytel | CC0 1.0 |
| `public/textures/meadow_color.webp`, `public/textures/meadow_normal.webp`, `public/textures/meadow_orm.webp`, `public/textures/half/meadow_color.webp`, `public/textures/half/meadow_normal.webp`, `public/textures/half/meadow_orm.webp` | "Withered Grass" (`withered_grass`) | Charlotte Baglioni | CC0 1.0 |
| `public/textures/worn_marble_color.webp`, `public/textures/worn_marble_normal.webp`, `public/textures/worn_marble_orm.webp`, `public/textures/half/worn_marble_color.webp`, `public/textures/half/worn_marble_normal.webp`, `public/textures/half/worn_marble_orm.webp` | "Marble 01" (`marble_01`) | Rob Tuytel | CC0 1.0 |
| `public/textures/dark_stone_color.webp`, `public/textures/dark_stone_normal.webp`, `public/textures/dark_stone_orm.webp`, `public/textures/half/dark_stone_color.webp`, `public/textures/half/dark_stone_normal.webp`, `public/textures/half/dark_stone_orm.webp` | "Dark Rock 02" (`dark_rock_02`) | Amal Kumar | CC0 1.0 |
| `public/textures/lichen_rock_color.webp`, `public/textures/lichen_rock_normal.webp`, `public/textures/lichen_rock_orm.webp`, `public/textures/half/lichen_rock_color.webp`, `public/textures/half/lichen_rock_normal.webp`, `public/textures/half/lichen_rock_orm.webp` | "Lichen Rock" (`lichen_rock`) | Rico Cilliers | CC0 1.0 |

## Fonts

The font files are not committed. They come from npm packages that Vite bundles into the build, so the page makes no request to a font host.

| Font | Used for | Package | Source | Licence | Licence text |
|---|---|---|---|---|---|
| Cinzel | Labels, buttons, headings, banners, damage numbers, loot labels | `@fontsource/cinzel` | https://fonts.google.com/specimen/Cinzel (Natanael Gama) | SIL OFL 1.1 | [licenses/Cinzel-OFL-1.1.txt](licenses/Cinzel-OFL-1.1.txt) |
| Alegreya Sans | Body text, tooltips, numbers | `@fontsource/alegreya-sans` | https://fonts.google.com/specimen/Alegreya+Sans (Juan Pablo del Peral, Huerta Tipográfica) | SIL OFL 1.1 | [licenses/Alegreya-Sans-OFL-1.1.txt](licenses/Alegreya-Sans-OFL-1.1.txt) |

## Everything else

Effects (slashes, bolts, shockwaves, lightning, particles), the HUD and its icons are drawn in code or CSS in this repository and are covered by the MIT licence in [LICENSE](LICENSE). The game ships no audio.

## Assets that must not be committed

Some licences allow use in a game but not handing the files to others, so those files never go in this repository:

- Mixamo characters and animations (Adobe): free to use in a game, not to be redistributed as files.
- Splice samples: Splice's terms allow use inside a game, including as sound effects, but forbid distributing the samples to third parties except as part of the finished work.

Put such files in `public/models/local/` or `public/audio/local/`, which are git-ignored.

Before adding any asset: confirm the licence on the author's own page, download it from the author's own distribution, add its row here and keep its licence text in `licenses/`. A CC BY asset needs the author, title, source link, licence and a note of changes, here and on the title screen.

## Audit before publishing

Checked on 2026-11-11, across the tracked files and the full git history: the only binary assets are the models listed above, plus three KayKit character models (CC0) that an early commit carried. There are no Mixamo or Splice files, no secrets and no personal data. `skeleton.glb` and `humanoid.glb` came through the private Movement Lab repository's processed copies; their inputs are CC BY 4.0 and CC0, so they may be redistributed with the credit above.
