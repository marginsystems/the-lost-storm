# Assets

Every file under `public/models` and `public/textures` is listed here with its source and licence. `test/rules.test.ts` fails when a model is added without a row.

Shipped models are CC0 (public domain), CC BY 4.0 with the credit below, or made for this project. The two fonts are SIL Open Font License 1.1. Nothing here is Mixamo, Splice, or any other licence that forbids redistributing the file.

## Sources

| Source | Author | Link | Licence | Licence text |
|---|---|---|---|---|
| Free Pack - Human Skeleton | PolyOne Studio | https://sketchfab.com/3d-models/free-pack-human-skeleton-950d0a46531f492ab8715777e312a5bf | CC BY 4.0 | [licenses/CC-BY-4.0.txt](licenses/CC-BY-4.0.txt) |
| Universal Animation Library (Standard) | Quaternius (quaternius.com) | https://quaternius.com/packs/universalanimationlibrary.html | CC0 1.0 | [licenses/Quaternius-Universal-Animation-Library.txt](licenses/Quaternius-Universal-Animation-Library.txt) |
| Universal Animation Library 2 (Standard) | Quaternius (quaternius.com) | https://quaternius.com/packs/universalanimationlibrary2.html | CC0 1.0 | [licenses/Quaternius-Universal-Animation-Library-2.txt](licenses/Quaternius-Universal-Animation-Library-2.txt) |
| The 100STYLE Dataset (SpinAntiClock_ID.bvh) | Ian Mason, Sebastian Starke, Taku Komura | https://www.ianxmason.com/100style/ | CC BY 4.0 | [licenses/CC-BY-4.0.txt](licenses/CC-BY-4.0.txt) |
| Universal Base Characters (Standard) | Quaternius (quaternius.com) | https://quaternius.com/packs/universalbasecharacters.html | CC0 1.0 | [licenses/Quaternius-Universal-Base-Characters.txt](licenses/Quaternius-Universal-Base-Characters.txt) |
| Modular Character Outfits - Fantasy (Standard) | Quaternius (quaternius.com) | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html | CC0 1.0 | [licenses/Quaternius-Modular-Character-Outfits-Fantasy.txt](licenses/Quaternius-Modular-Character-Outfits-Fantasy.txt) |
| Ultimate Animated Animals | Quaternius (quaternius.com) | https://quaternius.com/packs/ultimateanimatedanimals.html | CC0 1.0 | [licenses/Quaternius-Ultimate-Animated-Animals.txt](licenses/Quaternius-Ultimate-Animated-Animals.txt) |
| Easy Enemy Pack | Quaternius (quaternius.com) | https://quaternius.com/packs/easyenemy.html | CC0 1.0 | [licenses/Quaternius-Easy-Enemy.txt](licenses/Quaternius-Easy-Enemy.txt) |
| Animated Monster Pack | Quaternius (quaternius.com) | https://quaternius.com/packs/animatedmonster.html | CC0 1.0 | [licenses/Quaternius-Animated-Monster.txt](licenses/Quaternius-Animated-Monster.txt) |
| Swamp Limule | CDmir, with TinyWorlds (OpenGameArt) | https://opengameart.org/content/swamp-limule | CC0 1.0 | [licenses/CDmir-Swamp-Limule.txt](licenses/CDmir-Swamp-Limule.txt) |
| MakeHuman community garments (suits02) | Donitz (makehumancommunity.org) | http://www.makehumancommunity.org/clothes.html | CC0 1.0 | [licenses/MakeHuman-community-assets.txt](licenses/MakeHuman-community-assets.txt) |
| MakeHuman base mesh | The MakeHuman project: Data Collection AB, Joel Palmius, Jonas Hauquier (makehumancommunity.org) | https://github.com/makehumancommunity/makehuman | CC0 1.0 | [licenses/MakeHuman-community-assets.txt](licenses/MakeHuman-community-assets.txt) |
| Poly Haven models and textures | The authors named in the tables below (polyhaven.com) | https://polyhaven.com | CC0 1.0 | [licenses/Poly-Haven-CC0.txt](licenses/Poly-Haven-CC0.txt) |
| Poly Pizza models by Quaternius | Quaternius (quaternius.com) | https://poly.pizza/u/Quaternius | CC0 1.0 | [licenses/Poly-Pizza-Quaternius-CC0.txt](licenses/Poly-Pizza-Quaternius-CC0.txt) |
| Poly Pizza models by Kay Lousberg | Kay Lousberg (kaylousberg.com) | https://poly.pizza/u/Kay%20Lousberg | CC0 1.0 | [licenses/Poly-Pizza-Kay-Lousberg-CC0.txt](licenses/Poly-Pizza-Kay-Lousberg-CC0.txt) |
| Graveyard Kit (5.0) | Kenney (kenney.nl) | https://kenney.nl/assets/graveyard-kit | CC0 1.0 | [licenses/Kenney-Graveyard-Kit.txt](licenses/Kenney-Graveyard-Kit.txt) |

## Landing page images

`src/landing/images/`, `public/og.jpg` and `public/apple-touch-icon.png` are screenshots of this game, captured from it for this project, and `public/favicon.svg` was drawn for it; `public/favicon.ico` and `public/icon-192.png` are that drawing at 48 and 192 pixels. They fall under the repository's MIT licence. What appears in them (models, textures) is credited in the rows below.

## Interface icons

The Discord, GitHub and X marks in the footers of the title screen (`play/index.html`) and the landing page (`index.html`) are the SVG paths from [Simple Icons](https://simpleicons.org) 13.21.0, CC0 1.0, licence text in [licenses/Simple-Icons-CC0.txt](licenses/Simple-Icons-CC0.txt). The marks are the trademarks of their owners and are used only to link to this game's pages on those services. The feedback speech bubble was drawn for this project.

## Credit required by CC BY 4.0

"Free Pack - Human Skeleton" by PolyOne Studio, https://sketchfab.com/3d-models/free-pack-human-skeleton-950d0a46531f492ab8715777e312a5bf, licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: posed onto the Quaternius rig, decimated and repainted; lower-detail copies removed. The same credit is shown on the game's title screen.

"The 100STYLE Dataset" by Ian Mason, Sebastian Starke and Taku Komura, https://www.ianxmason.com/100style/ (https://zenodo.org/records/8127870), licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: the SpinAntiClock_ID take retargeted onto the Quaternius universal skeleton, its heading removed, played at twice its speed, its arms replaced by authored Quaternius sword poses, and cut into `public/models/animations/universal/Spin_Mocap_In.glb`, `Spin_Mocap_Loop.glb` and `Spin_Mocap_Out.glb`. The same credit is shown on the game's title screen.

## Characters and animations

Humans (the hero, the townsfolk and the unfinished) stand on the Quaternius universal skeleton (65 joints: `pelvis`, `spine_01`, `hand_r`, `index_01_r` and so on). A body is a head with eyes and brows; everything below it is a modular clothing part. Any body with the same joint names plays the same clips, because `src/render/clip-fit.ts` fits each clip to the body's rest pose when it loads. The skeleton monsters keep the older Universal Animation Library rig (53 `DEF-*` joints) and its clip folder.

| File | What it is | Source | Licence |
|---|---|---|---|
| `public/models/characters/skeleton.glb` | The skeleton body of the skeleton monsters | "Free Pack - Human Skeleton" by PolyOne Studio, fitted to the rig, decimated and repainted in an earlier prototype; lower-detail copies stripped here by `tools/build-characters.ts` | CC BY 4.0 |
| `public/models/characters/man.glb`, `public/models/characters/woman.glb` | The man's and the woman's bodies: head, neck, eyes and brows on the universal skeleton; the woman's neck reaches down to her collarbones so it runs under every neckline | Head, neck, eyes and brows of `Superhero_Male_FullBody.gltf` and `Superhero_Female_FullBody.gltf` with their own Superhero skin material and texture, from Universal Base Characters [Standard] by Quaternius; joint proportions from the Ranger outfits of Modular Character Outfits - Fantasy [Standard] by Quaternius; assembled by `tools/assemble-body.ts` from `tools/universal-bodies.json` | CC0 1.0 |
| `public/models/wear/man/hair.glb`, `public/models/wear/woman/hair.glb` | The hairstyles and the beard, one mesh per style | The head-bone hairstyles of Universal Base Characters [Standard] by Quaternius, assembled by `tools/assemble-body.ts` | CC0 1.0 |
| `public/models/wear/man/peasant.glb`, `public/models/wear/woman/peasant.glb` | The Peasant outfit, one mesh per part | Male and Female Peasant parts of Modular Character Outfits - Fantasy [Standard] by Quaternius, assembled by `tools/assemble-body.ts`, which fits the collar out over the body's neck in one smooth piece and flattens the normal map's baked relief where the fit reshapes the cloth | CC0 1.0 |
| `public/models/wear/man/ranger.glb`, `public/models/wear/woman/ranger.glb` | The Ranger outfit, one mesh per part | Male and Female Ranger parts of Modular Character Outfits - Fantasy [Standard] by Quaternius, assembled by `tools/assemble-body.ts`, which fits the collar and hood out over the body's neck in one smooth piece and flattens the normal map's baked relief where the fit reshapes the cloth | CC0 1.0 |
| `public/models/wear/man/headgear.glb`, `public/models/wear/woman/headgear.glb` | The head pieces (Lens Mask, Slit Mask, Iron Helm, Circlet, Keeper's Loupe, Crown of the Struck Hour), one mesh per piece, fitted to each body's head and skinned to its skeleton | Made for this game: original geometry written by `tools/build-headgear.ts` (shapes in `tools/headgear-designs.ts` and `tools/headgear-shapes.ts`) from the measured head of `public/models/characters/<frame>.glb`; untextured, dressed in game through `surfaces` | CC0 1.0 |
| `public/models/wear/man/charms.glb`, `public/models/wear/woman/charms.glb` | The charms worn at the neck (Gale Charm, Ember Charm, Gilded Token, Tidestone Charm, Storm Idol, Lantern of Second Sounds), each a pendant on a bail and a cord, one mesh per charm and per fit (`_Coat` over the coats and hauberks), fitted to each body and skinned to its skeleton | Made for this game: original geometry written by `tools/build-charms.ts` (pendants in `tools/charm-designs.ts`, the cord fit in `tools/charm-fit.ts`) from the bodies and the chest garments already in this repository; plain coloured materials, no textures | CC0 1.0 |
| `public/models/animations/universal/Chop.glb`, `public/models/animations/universal/Claw_Lunge.glb`, `public/models/animations/universal/Death01.glb`, `public/models/animations/universal/Death_Collapse.glb`, `public/models/animations/universal/Death_Knockback.glb`, `public/models/animations/universal/Hit_Chest.glb`, `public/models/animations/universal/Hit_Head.glb`, `public/models/animations/universal/Idle_Loop.glb`, `public/models/animations/universal/Idle_Torch_Loop.glb`, `public/models/animations/universal/Jog_Fwd_Loop.glb`, `public/models/animations/universal/Jump_Land.glb`, `public/models/animations/universal/Leap.glb`, `public/models/animations/universal/Pistol_Idle_Loop.glb`, `public/models/animations/universal/Pistol_Shoot.glb`, `public/models/animations/universal/Punch_Cross.glb`, `public/models/animations/universal/Punch_Jab.glb`, `public/models/animations/universal/Roll.glb`, `public/models/animations/universal/Shield_Bash.glb`, `public/models/animations/universal/Shield_Block.glb`, `public/models/animations/universal/Shield_Break.glb`, `public/models/animations/universal/Shield_Idle_Loop.glb`, `public/models/animations/universal/Spell_Simple_Shoot.glb`, `public/models/animations/universal/Sprint_Loop.glb`, `public/models/animations/universal/Sword_Attack.glb`, `public/models/animations/universal/Sword_Block.glb`, `public/models/animations/universal/Sword_Combo_A.glb`, `public/models/animations/universal/Sword_Combo_B.glb`, `public/models/animations/universal/Sword_Combo_C.glb`, `public/models/animations/universal/Sword_Dash.glb`, `public/models/animations/universal/Sword_Idle.glb`, `public/models/animations/universal/Sword_Lunge.glb`, `public/models/animations/universal/Sword_Slam.glb`, `public/models/animations/universal/Sword_Slam_Charged.glb`, `public/models/animations/universal/Sword_Sweep.glb`, `public/models/animations/universal/Throw.glb`, `public/models/animations/universal/Walk_Loop.glb`, `public/models/animations/universal/Zombie_Idle_Loop.glb`, `public/models/animations/universal/Zombie_Scratch.glb`, `public/models/animations/universal/Zombie_Walk_Loop.glb` | The humans' clips, one clip per file | Universal Animation Library [Standard] and Universal Animation Library 2 [Standard] (Unreal-Godot glb) by Quaternius, built by the commands below | CC0 1.0 |
| `public/models/animations/universal/Spin_Mocap_In.glb`, `public/models/animations/universal/Spin_Mocap_Loop.glb`, `public/models/animations/universal/Spin_Mocap_Out.glb` | The Millwheel's mocap spin: wind-in, loop and release | Legs, hips and spine of SpinAntiClock_ID.bvh from The 100STYLE Dataset by Ian Mason, Sebastian Starke and Taku Komura, retargeted onto the universal skeleton; arms and hands from Idle_Loop and Sword_Heavy_Combo of Universal Animation Library [Standard] by Quaternius | CC BY 4.0 |
| `public/models/animations/universal/Spin_Skate_In.glb`, `public/models/animations/universal/Spin_Skate_Loop.glb`, `public/models/animations/universal/Spin_Skate_Out.glb`, `public/models/animations/universal/Spin_Twohand_In.glb`, `public/models/animations/universal/Spin_Twohand_Loop.glb`, `public/models/animations/universal/Spin_Twohand_Out.glb`, `public/models/animations/universal/Spin_Low_In.glb`, `public/models/animations/universal/Spin_Low_Loop.glb`, `public/models/animations/universal/Spin_Low_Out.glb` | The Millwheel's composed spins: wind-in, loop and release, each a held pose made of authored clip frames (Idle_Loop, Walk_Loop, Shield_Idle_Loop, Sword_Heavy_Combo) with the hands as their clips authored them | Universal Animation Library [Standard] and Universal Animation Library 2 [Standard] by Quaternius | CC0 1.0 |

Build the human clips with the packs and a scratch folder outside this repository. Both libraries are read in their own skeleton (the `Unreal-Godot` glb of each pack). `scratch/universal.glb` below is the 17 kept clips of library 1 on that skeleton (the 15 the skeleton monsters use plus the one-handed aim and shot, `Pistol_Idle_Loop` and `Pistol_Shoot`, that a hand crossbow is held and fired with), not the older `humanoid.glb` of the skeleton monsters. `tools/universal-clips.json` maps every joint to itself. `retarget-clips.ts` still does all its steps on that map: it corrects the rest-pose difference between the two libraries (measured at 0.05 degrees at most, at a thumb joint), rescales the hip travel by the two hip heights (it logs the scale, 1.000 for these files), resamples at 30 frames a second, and cuts and joins the clips of library 2:

```bash
node tools/build-characters.ts <UAL1_Standard.glb> <UAL1_Standard.glb> <scratch/unused-body.glb> <scratch/universal.glb>
node tools/retarget-clips.ts <scratch/universal.glb> <UAL2_Standard.glb> tools/universal-clips.json <scratch/universal-combat.glb>
node tools/resample-clips.ts <scratch/universal.glb> <scratch/universal-combat.glb>
node tools/split-clips.ts <scratch/universal.glb> <scratch/universal-combat.glb> public/models/animations/universal
node tools/compress-models.ts public/models/animations/universal/*.glb
```

Build the bodies and the clothes with both Quaternius packs unpacked in one sources folder (`ffmpeg`, `sips` and `cwebp` on the path):

```bash
node tools/assemble-body.ts tools/universal-bodies.json <sources-folder>
node tools/compress-models.ts public/models/characters/man.glb public/models/characters/woman.glb public/models/wear/man/*.glb public/models/wear/woman/*.glb
```

Build the head pieces from the two bodies already in this repository (no outside sources):

```bash
node tools/build-headgear.ts
node tools/compress-models.ts public/models/wear/man/headgear.glb public/models/wear/woman/headgear.glb
```

Build the charms the same way, after the bodies and the chest garments:

```bash
node tools/build-charms.ts
node tools/compress-models.ts public/models/wear/man/charms.glb public/models/wear/woman/charms.glb
```

Three texture references in the pack's Superhero glTF files point at `*_png.png` names that the pack does not ship. Put a copy of `T_Hair_1_Normal.png`, `T_Hair_2_Normal.png` and `T_Eye_Normal.png` under those names beside them before assembling.

The creatures, each a body and its own clips on its own skeleton:

| File | What it is | Source | Licence |
|---|---|---|---|
| `public/models/creatures/wolf.glb` | The Wolf body, its four colour materials and its skeleton, with no clips | `glTF/Wolf.gltf` of Ultimate Animated Animals by Quaternius, built by the commands below | CC0 1.0 |
| `public/models/animations/wolf/Death.glb`, `public/models/animations/wolf/Gallop.glb`, `public/models/animations/wolf/Gallop_Jump.glb`, `public/models/animations/wolf/Idle.glb`, `public/models/animations/wolf/Idle_HitReact1.glb`, `public/models/animations/wolf/Idle_HitReact2.glb`, `public/models/animations/wolf/Walk.glb` | The Wolf's clips, one clip per file | `glTF/Wolf.gltf` of Ultimate Animated Animals by Quaternius, built by the commands below | CC0 1.0 |
| `public/models/creatures/rat.glb` | The Rat body, its two colour materials and its skeleton, with no clips | `FBX/Rat.fbx` of the Easy Enemy Pack by Quaternius, converted to GLB in Blender and built by the commands below | CC0 1.0 |
| `public/models/animations/rat/Rat_Attack.glb`, `public/models/animations/rat/Rat_Death.glb`, `public/models/animations/rat/Rat_Idle.glb`, `public/models/animations/rat/Rat_Run.glb`, `public/models/animations/rat/Rat_Walk.glb` | The Rat's clips, one clip per file | `FBX/Rat.fbx` of the Easy Enemy Pack by Quaternius, converted to GLB in Blender and built by the commands below | CC0 1.0 |
| `public/models/creatures/bat.glb` | The Bat body, its five colour materials and its skeleton, with no clips | `FBX/Bat.fbx` of the Animated Monster Pack by Quaternius, converted to GLB in Blender and built by the commands below | CC0 1.0 |
| `public/models/animations/bat/Bat_Attack.glb`, `public/models/animations/bat/Bat_Death.glb`, `public/models/animations/bat/Bat_Flying.glb`, `public/models/animations/bat/Bat_Hit.glb` | The Bat's clips, one clip per file | `FBX/Bat.fbx` of the Animated Monster Pack by Quaternius, converted to GLB in Blender and built by the commands below | CC0 1.0 |
| `public/models/creatures/spider.glb` | The Spider body, its two colour materials and its skeleton, with no clips | `FBX/Spider.fbx` of the Easy Enemy Pack by Quaternius, converted to GLB in Blender and built by the commands below | CC0 1.0 |
| `public/models/animations/spider/Spider_Death.glb`, `public/models/animations/spider/Spider_Idle.glb`, `public/models/animations/spider/Spider_Jump.glb`, `public/models/animations/spider/Spider_Walk.glb` | The Spider's clips, one clip per file | `FBX/Spider.fbx` of the Easy Enemy Pack by Quaternius, converted to GLB in Blender and built by the commands below | CC0 1.0 |
| `public/models/creatures/crawler.glb` | The Crawler body and its skeleton, with no clips and no texture: one flat colour | `limule-final.blend` of Swamp Limule by CDmir, exported to GLB from Blender and built by the commands below with `--flat`, which drops the packed textures | CC0 1.0 |
| `public/models/animations/crawler/Attack.000.glb`, `public/models/animations/crawler/Forward.glb`, `public/models/animations/crawler/Idle.glb`, `public/models/animations/crawler/OnBack.glb` | The Crawler's clips, one clip per file; the single-pose Idle is held for a second | `limule-final.blend` of Swamp Limule by CDmir, exported to GLB from Blender and built by the commands below | CC0 1.0 |
| `public/models/creatures/standing_clock.glb` | The Standing Clock body (a tall case clock of dark wood and brass with a pale face, one hand and a pendulum behind an open door frame), its five flat colour materials and its skeleton (root, case, door, pendulum, hood, hand), with no clips | Made for this game: original geometry and clips written by `blender/build_struck_bodies.py` in Blender 4.4, split by the commands below | CC0 1.0 |
| `public/models/animations/standing_clock/Clock_Death.glb`, `public/models/animations/standing_clock/Clock_Hit.glb`, `public/models/animations/standing_clock/Clock_Idle.glb` | The Standing Clock's clips, one clip per file: the pendulum swinging once every 1.6 seconds while the hand ticks, a shudder, and the case cracking and toppling onto its back | Made for this game: written by `blender/build_struck_bodies.py`, split by the commands below | CC0 1.0 |
| `public/models/creatures/ledger_plinth.glb` | The Ledger Plinth body (a stone plinth with a slanted top and a large open book on it), its six flat colour materials and its skeleton (root, plinth, lectern, book, leaf, page), with no clips | Made for this game: original geometry and clips written by `blender/build_struck_bodies.py` in Blender 4.4, split by the commands below | CC0 1.0 |
| `public/models/animations/ledger_plinth/Ledger_Death.glb`, `public/models/animations/ledger_plinth/Ledger_Hit.glb`, `public/models/animations/ledger_plinth/Ledger_Idle.glb` | The Ledger Plinth's clips, one clip per file: a page barely stirring, a shudder, and the book slamming shut and sliding off onto the floor while the top cracks | Made for this game: written by `blender/build_struck_bodies.py`, split by the commands below | CC0 1.0 |
| `public/models/creatures/stegosaurus.glb` | The Stegosaurus body, its three colour materials and its skeleton, with no clips | "Stegosaurus" by Quaternius on Poly Pizza (https://poly.pizza/m/eFcNbOlpvl), the GLB download, built by the commands below | CC0 1.0 |
| `public/models/animations/stegosaurus/Stegosaurus_Death.glb`, `public/models/animations/stegosaurus/Stegosaurus_Idle.glb`, `public/models/animations/stegosaurus/Stegosaurus_Jump.glb`, `public/models/animations/stegosaurus/Stegosaurus_Run.glb`, `public/models/animations/stegosaurus/Stegosaurus_Walk.glb` | The Stegosaurus clips, one clip per file | "Stegosaurus" by Quaternius on Poly Pizza (https://poly.pizza/m/eFcNbOlpvl), the GLB download, built by the commands below | CC0 1.0 |
| `public/models/creatures/silt_ooze.glb` | The Silt Ooze body, its body and eye colour materials and its skeleton, with no clips; the eyes are hidden in the game (`hiddenNodes`) | "Green Blob" by Quaternius on Poly Pizza (https://poly.pizza/m/y4kJh8EeYS), part of the Ultimate Monsters Bundle, the GLB download, built by the commands below | CC0 1.0 |
| `public/models/animations/silt_ooze/Bite_Front.glb`, `public/models/animations/silt_ooze/Death.glb`, `public/models/animations/silt_ooze/HitRecieve.glb`, `public/models/animations/silt_ooze/Idle.glb`, `public/models/animations/silt_ooze/Jump.glb`, `public/models/animations/silt_ooze/Walk.glb` | The Silt Ooze's clips, one clip per file; the pack's Dance, No and Yes clips are not shipped | "Green Blob" by Quaternius on Poly Pizza (https://poly.pizza/m/y4kJh8EeYS), part of the Ultimate Monsters Bundle, the GLB download, built by the commands below | CC0 1.0 |
| `public/models/creatures/spined_ooze.glb` | The Spined Ooze body and its skeleton, with no clips and no texture: one flat colour; the eyes are hidden in the game (`hiddenNodes`) | "Green Spiky Blob" by Quaternius on Poly Pizza (https://poly.pizza/m/IoWG5F9WUc), part of the Ultimate Monsters Bundle, the GLB download, built by the commands below with `--flat` | CC0 1.0 |
| `public/models/animations/spined_ooze/Bite_Front.glb`, `public/models/animations/spined_ooze/Death.glb`, `public/models/animations/spined_ooze/HitRecieve.glb`, `public/models/animations/spined_ooze/Idle.glb`, `public/models/animations/spined_ooze/Jump.glb`, `public/models/animations/spined_ooze/Walk.glb` | The Spined Ooze's clips, one clip per file; the pack's Dance, No and Yes clips are not shipped | "Green Spiky Blob" by Quaternius on Poly Pizza (https://poly.pizza/m/IoWG5F9WUc), part of the Ultimate Monsters Bundle, the GLB download, built by the commands below with `--flat` | CC0 1.0 |
| `public/models/creatures/sporecap.glb` | The Sporecap body and its skeleton, with no clips and no texture: one flat colour; the eyes are hidden in the game (`hiddenNodes`) | "Mushnub Evolved" by Quaternius on Poly Pizza (https://poly.pizza/m/0SZyA6MV51), part of the Ultimate Monsters Bundle, the GLB download, built by the commands below with `--flat` | CC0 1.0 |
| `public/models/animations/sporecap/Bite_Front.glb`, `public/models/animations/sporecap/Death.glb`, `public/models/animations/sporecap/HitRecieve.glb`, `public/models/animations/sporecap/Idle.glb`, `public/models/animations/sporecap/Jump.glb`, `public/models/animations/sporecap/Walk.glb` | The Sporecap's clips, one clip per file; the pack's Dance, No and Yes clips are not shipped | "Mushnub Evolved" by Quaternius on Poly Pizza (https://poly.pizza/m/0SZyA6MV51), part of the Ultimate Monsters Bundle, the GLB download, built by the commands below with `--flat` | CC0 1.0 |

Build a creature from its pack file into a body and a clip folder. `tools/build-creature.ts` drops the clips from the body, writes each clip on bare joints under its plain action name (Blender writes `Armature|Armature|Action`), makes any material that a conversion left see-through or glowing opaque and unlit, and holds a clip of a single pose for a second so it can loop; `--flat #rrggbb` drops every texture and paints the body one colour; keep only the clip files the rig names. A pack that ships only FBX is first converted in Blender 4.4: import the FBX with automatic bone orientation off, then export GLB with every action as its own animation and sampling forced:

```bash
node tools/build-creature.ts <glTF/Wolf.gltf> public/models/creatures/wolf.glb public/models/animations/wolf
node tools/compress-models.ts public/models/creatures/wolf.glb public/models/animations/wolf/*.glb
node tools/build-creature.ts <Rat.glb converted from FBX/Rat.fbx> public/models/creatures/rat.glb public/models/animations/rat
node tools/compress-models.ts public/models/creatures/rat.glb public/models/animations/rat/*.glb
node tools/build-creature.ts <Bat.glb converted from FBX/Bat.fbx> public/models/creatures/bat.glb public/models/animations/bat
node tools/compress-models.ts public/models/creatures/bat.glb public/models/animations/bat/*.glb
node tools/build-creature.ts <Spider.glb converted from FBX/Spider.fbx> public/models/creatures/spider.glb public/models/animations/spider
node tools/compress-models.ts public/models/creatures/spider.glb public/models/animations/spider/*.glb
node tools/build-creature.ts <limule.glb exported from limule-final.blend> public/models/creatures/crawler.glb public/models/animations/crawler --flat '#6b5d45'
node tools/compress-models.ts public/models/creatures/crawler.glb public/models/animations/crawler/*.glb
blender -b --factory-startup --python blender/build_struck_bodies.py -- <scratch>
node tools/build-creature.ts <scratch>/standing_clock.glb public/models/creatures/standing_clock.glb public/models/animations/standing_clock
node tools/compress-models.ts public/models/creatures/standing_clock.glb public/models/animations/standing_clock/*.glb
node tools/build-creature.ts <scratch>/ledger_plinth.glb public/models/creatures/ledger_plinth.glb public/models/animations/ledger_plinth
node tools/compress-models.ts public/models/creatures/ledger_plinth.glb public/models/animations/ledger_plinth/*.glb
node tools/build-creature.ts <Stegosaurus.glb from Poly Pizza> public/models/creatures/stegosaurus.glb public/models/animations/stegosaurus
node tools/compress-models.ts public/models/creatures/stegosaurus.glb public/models/animations/stegosaurus/*.glb
node tools/build-creature.ts <Green Blob.glb from Poly Pizza> public/models/creatures/silt_ooze.glb public/models/animations/silt_ooze
node tools/build-creature.ts <Green Spiky Blob.glb from Poly Pizza> public/models/creatures/spined_ooze.glb public/models/animations/spined_ooze --flat '#2c3324'
node tools/build-creature.ts <Mushnub Evolved.glb from Poly Pizza> public/models/creatures/sporecap.glb public/models/animations/sporecap --flat '#7a6d58'
node tools/compress-models.ts public/models/creatures/{silt_ooze,spined_ooze,sporecap}.glb public/models/animations/{silt_ooze,spined_ooze,sporecap}/*.glb
```

The skeleton monsters' rig and clips:

| File | What it is | Source | Licence |
|---|---|---|---|
| `public/models/animations/humanoid.glb` | The rig and 15 clips (idle, walk, jog, sprint, sword attack, punches, spell, hits, death, roll, landing), built before `tools/build-characters.ts` also kept the two aim clips, which a rebuild would add | Universal Animation Library (Standard) by Quaternius, Godot Asset Store build; the clips are picked out by `tools/build-characters.ts` | CC0 1.0 |
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

The worn pieces were thinned once with `tools/simplify-models.ts <ratio> <error> <files>` (meshoptimizer's simplifier with the normals, texture coordinates and skin weights as weights, borders locked so the parts still meet and the UV seams stay), then compressed again with `compress-models.ts`. Triangle counts before and after, with the ratio asked for each file: `wear/{man,woman}/ranger.glb` 27,000 to 14,900 (0.55), `peasant.glb` 12,900 and 13,600 to 7,300 and 7,500 (0.55), `hair.glb` 10,200 to 6,300 (0.6), `headgear.glb` 14,700 to 7,600 (0.5), `charms.glb` 35,300 to 10,500 and 10,800 (0.4, most of it was the cord of each charm). Running it again thins the file again, so start from the originals in git history when changing a ratio.

`characters/skeleton.glb` was thinned the same way (15,679 to 8,373 triangles, ratio 0.5). Textures that are large for how small a model is on screen are halved with `node tools/shrink-textures.ts 512 <files>`, which resizes every embedded image whose longer edge is over 512 and writes it back as WebP: `characters/skeleton.glb` (one 1024 texture) and `cave/{earth_roots_b,boulder_large,rock_face_a,rock_face_b,scree_shards,basket_lidded,rock_chunk_a,rock_chunk_b}.glb`. `cave/earth_roots_a.glb`, `shore/standing_stone_slender.glb` and `shore/standing_stone_broad.glb` keep their 1024 textures.

## Weapons

| File | Source | Author | Licence |
|---|---|---|---|
| `public/models/weapons/bone_javelin.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/broadsword.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/flanged_mace.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/greatsword.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/hand_axe.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
| `public/models/weapons/hand_crossbow.glb` | Built by `blender/build_weapons.py` | Made for this project | MIT |
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

Clothes are the modular parts in `public/models/wear/<frame>/` listed in the table above. A file holds every part of an outfit; an entry in `data/wearables.json` names its model and the parts it shows in `pieces`, so one file gives several wearables. A part is bound to the wearer's skeleton by joint name when it is put on.

## World

The walls, pillars, stairs, lamps, furniture, graves, dead trees, houses and stalls are built from boxes, cylinders and noise by `blender/build_environment.py` (helpers in `blender/environment_kit.py`). They carry no textures of their own: each material in a file has a plain name (`stone`, `wood`, `iron`, `cloth`, `bark`), and `data/props.json` dresses that name in a surface from `data/surfaces.json`, so one wall model serves the town in one stone and the bastion in another.

The waypoint, the ways down and up and the checkpoint stone are built by `blender/build_markers.py` in the same way. Their moving parts are separate nodes (`focal`, `seal`, `veil`), and `data/markers.json` names the parts that light up and the stone the zone's `markerSurfaces` may redress. Rebuild with `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_markers.py -- "$PWD/public/models/world"`, then `node tools/compress-models.ts public/models/world/waypoint.glb public/models/world/way_up.glb public/models/world/way_down.glb public/models/world/checkpoint_stone.glb`.

| File | What it is | Source | Licence |
|---|---|---|---|
| `public/models/world/banner.glb` | Hanging banner | Built by `blender/build_environment.py` | MIT |
| `public/models/world/banner_wide.glb` | Wide hanging banner with a boss | Built by `blender/build_environment.py` | MIT |
| `public/models/world/bench.glb` | Bench | Built by `blender/build_environment.py` | MIT |
| `public/models/world/brazier.glb` | Iron brazier | Built by `blender/build_environment.py` | MIT |
| `public/models/world/bridge_broken.glb` | Broken timber bridge | Built by `blender/build_road.py` | MIT |
| `public/models/world/cairn.glb` | Stacked stone post | Built by `blender/build_environment.py` | MIT |
| `public/models/world/checkpoint_stone.glb` | Waist-high carved stele that marks a checkpoint, a groove and a diamond cut in its face (`glyph`) | Made for this game: built by `blender/build_markers.py` | MIT |
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
| `public/models/world/hall_column.glb` | Tall fluted hall column | Built by `blender/build_environment.py` | MIT |
| `public/models/world/hall_column_broken.glb` | Broken hall column, two drums standing | Built by `blender/build_environment.py` | MIT |
| `public/models/world/hall_column_fallen.glb` | Fallen hall column, drums and capital on the floor | Built by `blender/build_environment.py` | MIT |
| `public/models/world/hall_gallery.glb` | Tall gallery tiers with a back wall | Built by `blender/build_environment.py` | MIT |
| `public/models/world/hall_niches.glb` | Wall of identical niches, each holding a sealed tablet | Built by `blender/build_environment.py` | MIT |
| `public/models/world/hall_shelf.glb` | Stone shelves of sealed tablets | Built by `blender/build_environment.py` | MIT |
| `public/models/world/hall_tiers.glb` | Low stepped tiers | Built by `blender/build_environment.py` | MIT |
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
| `public/models/world/still_figure.glb` | Still figure standing, in a hooded robe | Built from the MakeHuman base body and the "Monks Robe" and "Monks Hood" garments (Donitz, `suits02_cc0.zip`), posed, joined and decimated to about 1400 triangles with the textures dropped. The builder read the MakeHuman-era townsfolk body and wearables, which are no longer in this repository, so the two figures are kept as built and cannot be rebuilt from here | CC0 1.0 |
| `public/models/world/still_figure_bowed.glb` | Still figure with bowed head, in a hooded robe | Built like `still_figure.glb` with the neck, head and spine turned forward | CC0 1.0 |
| `public/models/world/sunken_cart.glb` | Cart sunk to its axle | Built by `blender/build_road.py` | MIT |
| `public/models/world/table_broken.glb` | Broken trestle table | Built by `blender/build_environment.py` | MIT |
| `public/models/world/tally_stone.glb` | Standing stone cut with tally marks | Built by `blender/build_environment.py` | MIT |
| `public/models/world/torch.glb` | Wall torch | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_a.glb` | Wall section | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_b.glb` | Wall section with a buttress | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_low.glb` | Low wall | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_low_piers.glb` | Low wall with piers | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_ruin.glb` | Broken wall section | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_scaffold.glb` | Wall section with scaffolding | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_window.glb` | Wall section with a barred window | Built by `blender/build_environment.py` | MIT |
| `public/models/world/wall_works.glb` | Unfinished wall with a timber frame | Built by `blender/build_environment.py` | MIT |
| `public/models/world/waypoint.glb` | Waypoint: an octagonal two-step dais with four corner posts, a cradle at its centre and inlaid marks (`glyph`), and a diamond-shaped crystal on its own node (`focal`) that rests in the cradle | Made for this game: built by `blender/build_markers.py` | MIT |
| `public/models/world/way_down.glb` | Way down: a stone well ringed by waist-high parapets with four corner blocks, marks inlaid on their tops and a chevron on the back coping (`glyph`), a floor and back plane for the shader inside (`veil`), and a lid that closes it (`seal`) | Made for this game: built by `blender/build_markers.py` | MIT |
| `public/models/world/way_up.glb` | Way up: a round stone arch of nine voussoirs on two piers above three rising steps, a plane filling the opening for the shader (`veil`), and a slab that closes it (`seal`) | Made for this game: built by `blender/build_markers.py` | MIT |
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
| `public/textures/dirt_color.webp`, `public/textures/dirt_normal.webp`, `public/textures/half/dirt_color.webp`, `public/textures/half/dirt_normal.webp` | "Brown Mud Rocks 01" (`brown_mud_rocks_01`) | Rob Tuytel | CC0 1.0 |
| `public/textures/forest_color.webp`, `public/textures/forest_normal.webp`, `public/textures/half/forest_color.webp`, `public/textures/half/forest_normal.webp` | "Forest Ground 04" (`forest_ground_04`) | Rob Tuytel, Rico Cilliers | CC0 1.0 |
| `public/textures/trail_color.webp`, `public/textures/trail_normal.webp`, `public/textures/half/trail_color.webp`, `public/textures/half/trail_normal.webp` | "Rocky Trail 02" (`rocky_trail_02`) | Amal Kumar | CC0 1.0 |
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

## Cave dressing

Rocks, bones, containers, lamps and other dressing for the underground levels, in `public/models/cave/`. Every file is one `.glb` standing on its origin: the middle of its footprint at x and z and its lowest point at y = 0, scaled to the size it should have in the world. Each went through the same steps. The model was taken from the source below, its animations and skin were dropped, it was grouped under one node that carries the scale, the origin move and, for `pickaxe_old`, a turn onto its side, and `tools/compress-models.ts` compressed it. The scans from Poly Haven were first reduced to 1400 to 2850 triangles and their textures to at most 1024 pixels by `blender/import_polyhaven.py`. The models from Poly Pizza and Kenney keep the materials of their authors; where a material was metal 0.4 by default it was made non-metallic unless it is metal, gold or iron. `stalagmites_dark` had its 2048 pixel texture reduced to 1024.

### Scans from Poly Haven

| File | Poly Haven asset | Authors | Licence |
|---|---|---|---|
| `public/models/cave/rock_chunk_a.glb` | "Rock 07" (`rock_07`) | Jenelle van Heerden | CC0 1.0 |
| `public/models/cave/rock_chunk_b.glb` | "Rock 09" (`rock_09`) | Jenelle van Heerden | CC0 1.0 |
| `public/models/cave/rock_face_a.glb` | "Rock Face 01" (`rock_face_01`) | Dario Barresi | CC0 1.0 |
| `public/models/cave/rock_face_b.glb` | "Rock Face 02" (`rock_face_02`) | Dario Barresi, Rico Cilliers | CC0 1.0 |
| `public/models/cave/boulder_large.glb` | "Boulder 01" (`boulder_01`) | Rico Cilliers | CC0 1.0 |
| `public/models/cave/scree_shards.glb` | "Rock Moss Set 02" (`rock_moss_set_02`) | Kless Gyzen | CC0 1.0 |
| `public/models/cave/earth_roots_a.glb` | "Root Cluster 01" (`root_cluster_01`) | Jenelle van Heerden, Rico Cilliers | CC0 1.0 |
| `public/models/cave/earth_roots_b.glb` | "Root Cluster 02" (`root_cluster_02`) | Jenelle van Heerden | CC0 1.0 |
| `public/models/cave/urn_white.glb` | "Ceramic Vase 04" (`ceramic_vase_04`) | James Ray Cock | CC0 1.0 |
| `public/models/cave/jug_white.glb` | "Ceramic Vase 02" (`ceramic_vase_02`) | James Ray Cock | CC0 1.0 |
| `public/models/cave/pot_clay.glb` | "Planter Pot Clay" (`planter_pot_clay`) | Amal Kumar | CC0 1.0 |
| `public/models/cave/basket_lidded.glb` | "Wicker Basket 02" (`wicker_basket_02`) | Kuutti Siitonen | CC0 1.0 |
| `public/models/cave/pickaxe_old.glb` | "Picke Dirty 01" (`picke_dirty_01`) | Dennis Halbeck | CC0 1.0 |
| `public/models/cave/ladder_wood.glb` | "Wooden Ladder 02" (`wooden_ladder_02`) | JN_3DPRINTINGNERD | CC0 1.0 |

### Models by Quaternius and Kay Lousberg from Poly Pizza

Poly Pizza (https://poly.pizza) lists each model below with the licence CC0 1.0 and the author named in the row; the page of the model is the link in the row. The licence texts are in [licenses/Poly-Pizza-Quaternius-CC0.txt](licenses/Poly-Pizza-Quaternius-CC0.txt) and [licenses/Poly-Pizza-Kay-Lousberg-CC0.txt](licenses/Poly-Pizza-Kay-Lousberg-CC0.txt).

| File | Poly Pizza model | Author | Licence | Changes |
|---|---|---|---|---|
| `public/models/cave/stalagmites_dark.glb` | "Rocks" (https://poly.pizza/m/gYhoEOKItJ) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/boulder_mossy_a.glb` | "Rock Medium" (https://poly.pizza/m/JQxF95498B) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/boulder_mossy_b.glb` | "Rock Medium" (https://poly.pizza/m/KZdEP3uUpa) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/boulder_mossy_c.glb` | "Rock Medium" (https://poly.pizza/m/s1OJ3bBzqc) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/rock_large_a.glb` | "Rock Large" (https://poly.pizza/m/54jZKTAt5p) | Quaternius | CC0 1.0 | Scaled and set on the ground, palette texture replaced by a flat dark grey colour; materials made non-metallic where they are not metal |
| `public/models/cave/rock_large_b.glb` | "Rock Large" (https://poly.pizza/m/li0YBlBEMz) | Quaternius | CC0 1.0 | Scaled and set on the ground, palette texture replaced by a flat dark grey colour; materials made non-metallic where they are not metal |
| `public/models/cave/stalagmite_tall.glb` | "Rock" (https://poly.pizza/m/R2UjZAX3By) | Quaternius | CC0 1.0 | Scaled and set on the ground, palette texture replaced by a flat dark grey colour; materials made non-metallic where they are not metal |
| `public/models/cave/shards_grey.glb` | "Rock" (https://poly.pizza/m/JmFMh7ztL9) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/spire_grey.glb` | "Rock" (https://poly.pizza/m/4MUaQTcDdc) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/crystal_purple.glb` | "Crystal" (https://poly.pizza/m/nBlnK8G6xw) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/crystal_cluster.glb` | "Big Crystal" (https://poly.pizza/m/pf5lzmgr2J) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/mineral_pink.glb` | "Mineral" (https://poly.pizza/m/STixpWYaTd) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/bone_a.glb` | "Bone" (https://poly.pizza/m/uMs0lDp1u3) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/bone_b.glb` | "Bone" (https://poly.pizza/m/2jLwMoAb2y) | Kay Lousberg | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/giant_ribs.glb` | "Large Bone" (https://poly.pizza/m/A67un3x9nV) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/ribcage.glb` | "Ribcage" (https://poly.pizza/m/UlVnlvHPtv) | Kay Lousberg | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/skull_a.glb` | "Skull" (https://poly.pizza/m/7clFQGz5jH) | Kay Lousberg | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/skull_b.glb` | "Skull" (https://poly.pizza/m/YgmRBtFlcF) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/skull_crossbones.glb` | "Skull" (https://poly.pizza/m/ExZmhOIjka) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/satchel.glb` | "Bag" (https://poly.pizza/m/Wq1JPPqHZS) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/sack_open.glb` | "Bag Open" (https://poly.pizza/m/rJuZexcuhU) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/sacks_stack.glb` | "Bags" (https://poly.pizza/m/gzvyAQ797z) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/coin_bag.glb` | "Coin Bag" (https://poly.pizza/m/iUpWtNWXI7) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/gold_bag.glb` | "Gold Bag" (https://poly.pizza/m/vFFblhnHtb) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/coin_pile.glb` | "Coin Piles" (https://poly.pizza/m/9OWkKczINo) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/gold_ore.glb` | "Gold ore" (https://poly.pizza/m/i1ic0r7FUI) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/broken_cart.glb` | "Broken Cart" (https://poly.pizza/m/NBDHe8J7f9) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/lantern.glb` | "Lantern" (https://poly.pizza/m/CtHBJ1ufeW) | Kay Lousberg | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/lantern_hanging.glb` | "Hanging Lantern" (https://poly.pizza/m/3jzk3YShv1) | Kay Lousberg | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/torch.glb` | "Torch" (https://poly.pizza/m/Gq38E7hFZw) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/column_round.glb` | "Column Round" (https://poly.pizza/m/n8ZvVFcJhl) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/pillar.glb` | "Pillar" (https://poly.pizza/m/1nt8n3rVKU) | Kay Lousberg | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/debris_pile.glb` | "Debris Pile" (https://poly.pizza/m/WrIiMMxyEP) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/mushrooms_grey.glb` | "Mushroom" (https://poly.pizza/m/aOW08oSrd4) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/mushroom_shelf.glb` | "Mushroom Laetiporus" (https://poly.pizza/m/mxDOl0n6zt) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |
| `public/models/cave/mushroom_red.glb` | "Mushroom" (https://poly.pizza/m/db1tjMhmiA) | Quaternius | CC0 1.0 | Scaled and set on the ground; materials made non-metallic where they are not metal |

### Models from Kenney's Graveyard Kit

| File | Source | Author | Licence | Changes |
|---|---|---|---|---|
| `public/models/cave/urn_round.glb` | `urn-round` of Graveyard Kit (5.0) | Kenney | CC0 1.0 | Scaled and set on the ground |
| `public/models/cave/urn_square.glb` | `urn-square` of Graveyard Kit (5.0) | Kenney | CC0 1.0 | Scaled and set on the ground |

### Cave surface textures

Ground and rock textures from polyhaven.com, all CC0, made like the surface textures above: the 1k JPEG download of the diffuse, normal (OpenGL) and ARM maps written as `cwebp` WebP at 1024 pixels, and half-size copies in `public/textures/half/`. The ARM map (occlusion, roughness, metalness) is the `orm` file.

| Files | Poly Haven asset | Authors | Licence |
|---|---|---|---|
| `public/textures/wet_rock_color.webp`, `public/textures/wet_rock_normal.webp`, `public/textures/wet_rock_orm.webp`, `public/textures/half/wet_rock_color.webp`, `public/textures/half/wet_rock_normal.webp`, `public/textures/half/wet_rock_orm.webp` | "Seaside Rock" (`seaside_rock`) | Dimitrios Savva | CC0 1.0 |
| `public/textures/grit_color.webp`, `public/textures/grit_normal.webp`, `public/textures/grit_orm.webp`, `public/textures/half/grit_color.webp`, `public/textures/half/grit_normal.webp`, `public/textures/half/grit_orm.webp` | "Gravel Stones" (`gravel_stones`) | Amal Kumar | CC0 1.0 |
| `public/textures/pebbles_color.webp`, `public/textures/pebbles_normal.webp`, `public/textures/pebbles_orm.webp`, `public/textures/half/pebbles_color.webp`, `public/textures/half/pebbles_normal.webp`, `public/textures/half/pebbles_orm.webp` | "Dry River Pebbles" (`dry_river_pebbles`) | Amal Kumar | CC0 1.0 |
| `public/textures/moss_rock_color.webp`, `public/textures/moss_rock_normal.webp`, `public/textures/moss_rock_orm.webp`, `public/textures/half/moss_rock_color.webp`, `public/textures/half/moss_rock_normal.webp`, `public/textures/half/moss_rock_orm.webp` | "Mossy Rock" (`mossy_rock`) | Rob Tuytel | CC0 1.0 |
| `public/textures/cave_mud_color.webp`, `public/textures/cave_mud_normal.webp`, `public/textures/cave_mud_orm.webp`, `public/textures/half/cave_mud_color.webp`, `public/textures/half/cave_mud_normal.webp`, `public/textures/half/cave_mud_orm.webp` | "Mud Forest" (`mud_forest`) | eye-candy.xyz | CC0 1.0 |
| `public/textures/dark_cobble_color.webp`, `public/textures/dark_cobble_normal.webp`, `public/textures/dark_cobble_orm.webp`, `public/textures/half/dark_cobble_color.webp`, `public/textures/half/dark_cobble_normal.webp`, `public/textures/half/dark_cobble_orm.webp` | "Rock Wall 08" (`rock_wall_08`) | Amal Kumar | CC0 1.0 |
| `public/textures/old_tiles_color.webp`, `public/textures/old_tiles_normal.webp`, `public/textures/old_tiles_orm.webp`, `public/textures/half/old_tiles_color.webp`, `public/textures/half/old_tiles_normal.webp`, `public/textures/half/old_tiles_orm.webp` | "Mixed Stone Tiles" (`mixed_stone_tiles`) | Dimitrios Savva | CC0 1.0 |

## Shore dressing

Standing stones, arches, spires and steps for the opening area, in `public/models/shore/`. Every file is one `.glb` standing on its origin: the middle of its footprint at x and z and its lowest point at y = 0, scaled to the size it should have in the world, without animations, skins, cameras or lights. Each went through the same steps as the cave dressing: the model was taken from the source below, the wanted object was kept and its parents' transforms were baked in, it was turned upright where noted, scaled to its size (the paving slabs flattened to 0.14 m), reduced to the triangle count in the manifest, and its textures reduced to at most 1024 pixels (512 for the models from Poly Pizza) and written as WebP; `tools/compress-models.ts` compressed it. The scans from Poly Haven went through `blender/import_polyhaven.py`'s steps (weld, decimate to 2400 triangles, ARM maps rewired). On the Poly Pizza models `rock_spire_tall` has its snow material coloured as the rock, and `rock_pillar_faceted` has its palette texture replaced by a flat dark grey colour; materials were made non-metallic where they are not metal.

### Scans from Poly Haven

| File | Poly Haven asset | Authors | Licence |
|---|---|---|---|
| `public/models/shore/standing_stone_slender.glb` | "Namaqualand Boulder 06" (`namaqualand_boulder_06`, https://polyhaven.com/a/namaqualand_boulder_06), stood on end | Greg Zaal, Jenelle van Heerden | CC0 1.0 |
| `public/models/shore/standing_stone_broad.glb` | "Namaqualand Boulder 03" (`namaqualand_boulder_03`, https://polyhaven.com/a/namaqualand_boulder_03), stood on end | Dario Barresi, Jenelle van Heerden | CC0 1.0 |

### Models by Quaternius from Poly Pizza

Poly Pizza (https://poly.pizza) lists each model below with the licence "Public Domain (CC0)" and Quaternius as the author, read on 2026-11-15; the page of the model is the link in the row. The licence text and the file list are in [licenses/Poly-Pizza-Quaternius-CC0.txt](licenses/Poly-Pizza-Quaternius-CC0.txt).

| File | Poly Pizza model | Author | Licence | Changes |
|---|---|---|---|---|
| `public/models/shore/arch_ruined_broken.glb` | "Modular Ruins Pack" (https://poly.pizza/m/F2LAK03B0r), object `Wall_ArchRound_Broken` | Quaternius | CC0 1.0 | Single object kept, scaled to 6 m wide |
| `public/models/shore/statue_stag_plinth.glb` | "Modular Ruins Pack" (https://poly.pizza/m/F2LAK03B0r), object `Statue_Stag` | Quaternius | CC0 1.0 | Single object kept, scaled to 4.6 m tall |
| `public/models/shore/stone_steps.glb` | "Modular Ruins Pack" (https://poly.pizza/m/F2LAK03B0r), object `Stairs_2` | Quaternius | CC0 1.0 | Single object kept, scaled to 3 m wide |
| `public/models/shore/rock_spire_tall.glb` | "Mountain" (https://poly.pizza/m/XY4ej3Zg3I) | Quaternius | CC0 1.0 | Scaled to 9 m tall, snow material coloured as rock |
| `public/models/shore/rock_pillar_faceted.glb` | "Rock Large" (https://poly.pizza/m/d2VWOdthtR) | Quaternius | CC0 1.0 | Scaled to 9.5 m tall and 4.6 m wide, palette texture replaced by a flat dark grey colour |

## Fonts

The font files are not committed. They come from npm packages that Vite bundles into the build, so the page makes no request to a font host.

| Font | Used for | Package | Source | Licence | Licence text |
|---|---|---|---|---|---|
| Cinzel | Labels, buttons, headings, banners, damage numbers, loot labels | `@fontsource/cinzel` | https://fonts.google.com/specimen/Cinzel (Natanael Gama) | SIL OFL 1.1 | [licenses/Cinzel-OFL-1.1.txt](licenses/Cinzel-OFL-1.1.txt) |
| Alegreya Sans | Body text, tooltips, numbers | `@fontsource/alegreya-sans` | https://fonts.google.com/specimen/Alegreya+Sans (Juan Pablo del Peral, Huerta Tipográfica) | SIL OFL 1.1 | [licenses/Alegreya-Sans-OFL-1.1.txt](licenses/Alegreya-Sans-OFL-1.1.txt) |

## Everything else

Effects (slashes, bolts, shockwaves, lightning, particles), the HUD and its icons are drawn in code or CSS in this repository and are covered by the MIT licence in [LICENSE](LICENSE). This repository holds no audio: the game's sounds are licensed for use in the game only and are served separately.

## Assets that must not be committed

Some licences allow use in a game but not handing the files to others, so those files never go in this repository:

- Mixamo characters and animations (Adobe): free to use in a game, not to be redistributed as files.
- Splice samples: Splice's terms allow use inside a game, including as sound effects, but forbid distributing the samples to third parties except as part of the finished work.

Put such files in `public/models/local/` or `public/audio/local/`, which are git-ignored.

Before adding any asset: confirm the licence on the author's own page, download it from the author's own distribution, add its row here and keep its licence text in `licenses/`. A CC BY asset needs the author, title, source link, licence and a note of changes, here and on the title screen.

## Audit before publishing

Checked on 2026-11-15. Every model and texture in the tracked files has a row above, and every licence text is in `licenses/`. Models and textures removed in earlier commits stay in the git history; each was CC0 or made for this project, and the only other binary files the history carries are screenshots of the game. There are no Mixamo, Splice or store-bought files, no secrets and no personal data. `skeleton.glb` and `humanoid.glb` came through an earlier prototype's processed copies; their inputs are CC BY 4.0 and CC0, so they may be redistributed with the credit above.
