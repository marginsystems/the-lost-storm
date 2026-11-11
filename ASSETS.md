# Assets

Every file under `public/models` is listed here with its source and licence. `test/rules.test.ts` fails when a model is added without a row.

Shipped models are CC0 (public domain), CC BY 4.0 with the credit below, or made for this project. The two fonts are SIL Open Font License 1.1. Nothing here is Mixamo, Splice, or any other licence that forbids redistributing the file.

## Sources

| Source | Author | Link | Licence | Licence text |
|---|---|---|---|---|
| Free Pack - Human Skeleton | PolyOne Studio | https://sketchfab.com/3d-models/free-pack-human-skeleton-950d0a46531f492ab8715777e312a5bf | CC BY 4.0 | [licenses/CC-BY-4.0.txt](licenses/CC-BY-4.0.txt) |
| Universal Animation Library (Standard) | Quaternius (quaternius.com) | https://quaternius.com/packs/universalanimationlibrary.html | CC0 1.0 | [licenses/Quaternius-Universal-Animation-Library.txt](licenses/Quaternius-Universal-Animation-Library.txt) |
| Modular Character Outfits - Fantasy (Standard) | Quaternius (quaternius.com) | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html | CC0 1.0 | [licenses/Quaternius-Modular-Character-Outfits-Fantasy.txt](licenses/Quaternius-Modular-Character-Outfits-Fantasy.txt) |
| MakeHuman community garments (suits02, gloves01) | Donitz, Rehman Polanski, MRT (makehumancommunity.org) | http://www.makehumancommunity.org/clothes.html | CC0 1.0 | [licenses/MakeHuman-community-assets.txt](licenses/MakeHuman-community-assets.txt) |
| KayKit Dungeon Remastered 1.0 | Kay Lousberg (kaylousberg.com) | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | CC0 1.0 | [licenses/KayKit-Dungeon-Remastered-LICENSE.txt](licenses/KayKit-Dungeon-Remastered-LICENSE.txt) |

## Credit required by CC BY 4.0

"Free Pack - Human Skeleton" by PolyOne Studio, https://sketchfab.com/3d-models/free-pack-human-skeleton-950d0a46531f492ab8715777e312a5bf, licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: posed onto the Quaternius rig, decimated and repainted; lower-detail copies removed. The same credit is shown on the game's title screen.

## Characters and animations

Every humanoid uses one rig, the Universal Animation Library rig (53 `DEF-*` joints), so bodies, clips and held gear are interchangeable.

| File | What it is | Source | Licence |
|---|---|---|---|
| `public/models/characters/skeleton.glb` | The skeleton body used by the hero and both monsters | "Free Pack - Human Skeleton" by PolyOne Studio, fitted to the rig, decimated and repainted for Movement Lab (`blender/variant_skeleton.py` in that repository); lower-detail copies stripped here by `tools/build-characters.ts` | CC BY 4.0 |
| `public/models/animations/humanoid.glb` | The rig and 15 clips (idle, walk, jog, sprint, sword attack, punches, spell, hits, death, roll, landing) | Universal Animation Library (Standard) by Quaternius, Godot Asset Store build; the clips are picked out by `tools/build-characters.ts` | CC0 1.0 |

Rebuild both with:

```bash
node tools/build-characters.ts <skeleton.glb> <character-with-clips.glb> public/models/characters/skeleton.glb public/models/animations/humanoid.glb
```

## Weapons

| File | Source | Author | Licence |
|---|---|---|---|
| `public/models/weapons/greatsword.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/hex_staff.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/rusted_blade.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/sword_1h.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |

Rebuild with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_weapons.py -- "$PWD/public/models/weapons"
```

## Clothing and armour

Skinned pieces made once and worn by every character on the shared rig. The first table is parts of "Modular Character Outfits - Fantasy" (Standard) by Quaternius, paths relative to `Exports/glTF (Godot-Unreal)/` in the pack. `data/wearables.json` turns each file into one or more wearables with a tint.

The pack's rig has 65 joints with Unreal names (`pelvis`, `spine_01`, `hand_r`) and slightly different proportions, so `blender/build_wearables.py` changes every part: it drops the bare-skin faces that ship with arm parts, moves each vertex from the pack's rest pose to ours joint by joint, renames and merges the vertex groups to our 53 `DEF-*` joints, and repacks the UV islands the part uses into its own 256 to 1024 pixel WebP textures. `blender/wearables.json` lists the parts; the refit is in `blender/wearable_fit.py` and the texture repack in `blender/wearable_textures.py`.

| File | What it is | Original | Licence |
|---|---|---|---|
| `public/models/wear/peasant_shirt.glb` | Shirt with belt | `Modular Parts/Male_Peasant_Body.gltf` | CC0 1.0 |
| `public/models/wear/peasant_sleeves.glb` | Under-sleeves | `Modular Parts/Male_Peasant_Arms.gltf`, without the bare hands | CC0 1.0 |
| `public/models/wear/peasant_trousers.glb` | Trousers | `Modular Parts/Male_Peasant_Legs.gltf` | CC0 1.0 |
| `public/models/wear/peasant_boots.glb` | Boots | `Modular Parts/Male_Peasant_Feet.gltf` | CC0 1.0 |
| `public/models/wear/ranger_hood.glb` | Hood | `Modular Parts/Male_Ranger_Head_Hood.gltf` | CC0 1.0 |
| `public/models/wear/ranger_vest.glb` | Vest, skirt and two belts | `Modular Parts/Male_Ranger_Body.gltf` | CC0 1.0 |
| `public/models/wear/ranger_pauldron.glb` | Shoulder plate | `Modular Parts/Male_Ranger_Acc_Pauldron.gltf` | CC0 1.0 |
| `public/models/wear/ranger_sleeves.glb` | Sleeves, shoulder to wrist | `Modular Parts/Male_Ranger_Arms.gltf`, cut at the wrist, without the bare fingers | CC0 1.0 |
| `public/models/wear/ranger_bracers.glb` | Bracers and fingerless gloves | `Outfits/Male_Ranger.gltf`: `Male_Ranger_Arms_Bracer` and the gloves of `Male_Ranger_Arms` | CC0 1.0 |
| `public/models/wear/ranger_trousers.glb` | Trousers | `Modular Parts/Male_Ranger_Legs.gltf` | CC0 1.0 |
| `public/models/wear/ranger_boots.glb` | Boots | `Modular Parts/Male_Ranger_Feet_Boots.gltf`, decimated to 40% | CC0 1.0 |

MakeHuman community garments come as a mesh fitted to the MakeHuman base body, with no skin of their own. `blender/wearable_makehuman.py` places each vertex from the garment's bindings to that body, takes its skin weights from the MakeHuman default rig through the same bindings, and maps MakeHuman's 163 bones onto our joints. Only garments whose own `.mhclo` header says CC0 are used; the header lines are quoted in the licence text.

| File | What it is | Original | Licence |
|---|---|---|---|
| `public/models/wear/monk_robe.glb` | Hooded robe with rope belt | "Monks Robe" by Donitz, `suits02_cc0.zip`, decimated to 50% | CC0 1.0 |
| `public/models/wear/monk_hood.glb` | Hood for the robe | "Monks Hood" by Donitz, `suits02_cc0.zip`, decimated to 50%, widened to fit the skull | CC0 1.0 |
| `public/models/wear/mail_tunic.glb` | Ring mail over a padded tunic | "TunicViking" by Rehman Polanski, `suits02_cc0.zip`, decimated to 60% | CC0 1.0 |
| `public/models/wear/viking_breeches.glb` | Breeches | "PantsViking" by Rehman Polanski, `suits02_cc0.zip` | CC0 1.0 |
| `public/models/wear/leather_gloves.glb` | Gloves | "Gloves_Medium" by MRT, `gloves01_cc0.zip`, decimated to 50% | CC0 1.0 |

Rebuild with the packs unpacked somewhere outside this repository:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_wearables.py -- blender/wearables.json public/models/characters/skeleton.glb public/models/wear <scratch-dir> "quaternius_outfits_fantasy=<path to>/Modular Character Outfits - Fantasy[Standard]" makehuman_suits02=<path to suits02_cc0> makehuman_gloves01=<path to gloves01_cc0> makehuman_rig=<folder with base.obj, default.mhskel and default_weights.mhw>
```

The arguments are the manifest, the body whose rig the parts are fitted to, the output folder, a scratch folder for the repacked PNG textures, and one `<pack>=<folder>` per source pack. Parts of a pack with no folder are left as they are. Add `only=<id>,<id>` to rebuild some parts. The build stops with an error when it would build nothing.

## Arena

Unmodified downloads, renamed to lower case.

| File | Original file | Pack | Licence |
|---|---|---|---|
| `public/models/arena/banner_patternA_blue.glb` | `Assets/gltf/banner_patternA_blue.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/banner_shield_blue.glb` | `Assets/gltf/banner_shield_blue.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/barrel_large.glb` | `Assets/gltf/barrel_large.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/barrel_small_stack.glb` | `Assets/gltf/barrel_small_stack.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/barrier.glb` | `Assets/gltf/barrier.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/box_large.glb` | `Assets/gltf/box_large.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/coin.glb` | `Assets/gltf/coin.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/coin_stack_small.glb` | `Assets/gltf/coin_stack_small.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/column.glb` | `Assets/gltf/column.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/crates_stacked.glb` | `Assets/gltf/crates_stacked.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/floor_dirt_large.glb` | `Assets/gltf/floor_dirt_large.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/floor_dirt_large_rocky.glb` | `Assets/gltf/floor_dirt_large_rocky.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/floor_tile_big_grate.glb` | `Assets/gltf/floor_tile_big_grate.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/floor_tile_large.glb` | `Assets/gltf/floor_tile_large.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/floor_tile_large_rocks.glb` | `Assets/gltf/floor_tile_large_rocks.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/pillar.glb` | `Assets/gltf/pillar.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/pillar_decorated.glb` | `Assets/gltf/pillar_decorated.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/rubble_half.glb` | `Assets/gltf/rubble_half.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/rubble_large.glb` | `Assets/gltf/rubble_large.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/sword_shield_broken.glb` | `Assets/gltf/sword_shield_broken.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/torch_lit.glb` | `Assets/gltf/torch_lit.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/torch_mounted.glb` | `Assets/gltf/torch_mounted.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/wall.glb` | `Assets/gltf/wall.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/wall_archedwindow_gated.glb` | `Assets/gltf/wall_archedwindow_gated.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/wall_broken.glb` | `Assets/gltf/wall_broken.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/wall_corner.glb` | `Assets/gltf/wall_corner.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/wall_cracked.glb` | `Assets/gltf/wall_cracked.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/wall_endcap.glb` | `Assets/gltf/wall_endcap.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/wall_half.glb` | `Assets/gltf/wall_half.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |
| `public/models/arena/wall_pillar.glb` | `Assets/gltf/wall_pillar.gltf.glb` | KayKit Dungeon Remastered 1.0 | CC0 1.0 |

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
