import type { GuideData } from '../data.ts';
import { guideData, item, path, place, skill } from '../data.ts';
import {
  affixLine,
  afterRouteText,
  bossLevels,
  bossSpeedRank,
  carelessBossShare,
  carelessDeaths,
  deathWords,
  groupNeeds,
  groupWeapons,
  manaWeapons,
  modShare,
  placeLevel,
  speedRank,
  steadyBossShare,
  steadyBossLife,
  steadyDeaths,
  weaponNames,
} from '../facts.ts';
import { esc, percent } from '../html.ts';
import type { BuildNotes } from './build-page.ts';
import { buildName } from './build-page.ts';

function name(data: GuideData, id: string): string {
  return esc(place(data, id).name);
}

function skillName(data: GuideData, id: string): string {
  return esc(skill(data, id).name);
}

function pathName(data: GuideData, id: string): string {
  return esc(path(data, id).name);
}

function tank(data: GuideData): BuildNotes {
  const id: string = 'bulwark';
  const keystone: number = placeLevel(data, id, 'the_unmoved');
  const slow: string = percent(modShare(data, 'the_unmoved', 'moveSpeed'));
  const armour: string = percent(modShare(data, 'the_unmoved', 'armour'));
  const heave: number = placeLevel(data, id, 'heaving_cleave');
  const [first = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: null,
    forWho: 'For players who want a big weapon, heavy blows, and to walk out of every fight.',
    plays: [
      `You stand in the pack and let it burn. The Emberwarden walks ${pathName(data, 'stone')}, the path of fire, life and armour, with ${groupNeeds(data, 'heavy')} in your hands: every place on the path answers only while you hold one. It spends little on damage until it is hard to kill, and later crosses into ${pathName(data, 'echo')} for skills that hit a whole crowd.`,
      `${skillName(data, 'thunderclap')} is your first point: when the pack closes around you, slam the ground and they are thrown back, staggered and set alight. ${skillName(data, 'held_breath')} comes at level ${placeLevel(data, id, 'stone_held_breath')}. Use it when you are surrounded or a big enemy is winding up: everything near you slows to a crawl and you do not.`,
      `At level ${placeLevel(data, id, 'shoulder_through')} ${name(data, 'shoulder_through')} turns your roll into a charge that ends in a burst of fire, so the way out of a pack is also a blow. ${skillName(data, 'banked_fire')} comes at level ${placeLevel(data, id, 'stone_banked_fire')}: a fire around you that burns hotter every second they stay in it.`,
      `At level ${heave} ${name(data, 'heaving_cleave')} lets you hold ${skillName(data, 'cleave')}: let go and one heavy sweep throws everything in front of you far back. ${skillName(data, 'firewall')} follows at level ${placeLevel(data, id, 'stone_fire_burst')}: hold and drag across the ground to draw a wall of fire the pack cannot cross, and whatever touches it burns.`,
      `At level ${keystone} you take ${name(data, 'the_unmoved')}: ${armour} more armour, more life and more damage, and you move ${slow} slower. You stop being quick. You also stop being in danger.`,
    ],
    lean: [
      `Lean on ${skillName(data, 'cleave')}, held. A held sweep from ${name(data, 'heaving_cleave')} hits far harder than a quick swing and throws the pack off you.`,
      `${skillName(data, 'thunderclap')} is not your damage; it is how you stop being hit while the sweep is gathering. Light ${skillName(data, 'banked_fire')} and stay in it: it is weak when lit and twice as hot by the end. ${skillName(data, 'held_breath')} has a long wait, so keep it for the moment a fight turns.`,
    ],
    lookFor: [
      `A heavy weapon: ${weaponNames(groupWeapons(data, 'heavy'))}. They hit much harder, which suits a held sweep.`,
      affixLine(data, 'hale'),
      affixLine(data, 'vital'),
      affixLine(data, 'plated'),
      affixLine(data, 'sturdy'),
      affixLine(data, 'mending'),
    ],
    avoid: [
      `Any weapon that is not heavy. With a blade, a staff or a crossbow in hand, ${pathName(data, 'stone')} keeps its life, its armour and its fire but none of the damage it gives your weapon, ${name(data, 'heaving_cleave')} and ${name(data, 'shoulder_through')} stop changing your skills, and the Skill Tree shows those lines struck through.`,
      'Trading life or armour for damage on gear. The tree gives you damage later; your gear keeps you standing.',
      'Chasing fast enemies across the map. Let them come.',
    ],
    legendaries: [
      { item: 'groundbreaker', changes: `Every swing into a pack sets off ${skillName(data, 'thunderclap')}s, and the longer you stand in it the harder you are to hurt.` },
      { item: 'anvilback_hauberk', changes: `A held heave hits both ways: the sweep in front and a ${skillName(data, 'thunderclap')} all around, with armour for every enemy it catches.` },
      { item: 'bellwether_helm', changes: 'Being hit becomes a weapon. Stand in the crowd and the helm answers it for you.' },
    ],
    chase: `It is a weapon, so it takes no slot you need for armour, and its ${skillName(data, 'thunderclap')}s come from the ${skillName(data, 'cleave')} you press all the time.`,
    strengths: [
      `Surviving. In the measurements it ${deathWords(steadyDeaths(data, id))} played steadily and ${deathWords(carelessDeaths(data, id))} played carelessly.`,
      `The boss, even with mistakes. Played carelessly it won ${percent(carelessBossShare(data, id, first))} of its fights with the boss at level ${first}.`,
    ],
    weakSpots: [
      `Quick boss fights. Against the boss at level ${first} it was ${bossSpeedRank(data, id, first)} build to win: it wins, but it takes its time.`,
      'Enemies that run or throw from far away. You walk to them slowly.',
    ],
    thin: [
      `The game has no two-handed weapons as such. The heavy weapons are the maces, mauls and greatswords: they hit harder.`,
      'The simulated player wears whatever raises its damage and toughness most, not always a heavy weapon, so the numbers here are for the route, not for the weapon.',
    ],
    marks: {
      stone_thunderclap: 'Your first point. It buys you room from the first fight.',
      tempered_body: 'Life and life regeneration early. The build begins to feel sturdy here.',
      shoulder_through: 'The roll becomes a charge that ends in fire.',
      stone_banked_fire: 'A fire around you that grows hotter while they stay.',
      heaving_cleave: 'Hold Cleave for the big sweep. The build starts here.',
      the_unmoved: `${armour} more armour, more life, more damage, ${slow} slower.`,
      worn_groove: 'From here the route turns toward area damage.',
    },
    afterRoute: afterRouteText(data, id, 'More life and more area. Nothing past here makes you more fragile.'),
  };
}

function whirlwind(data: GuideData): BuildNotes {
  const id: string = 'whirlwind';
  const whirl: number = placeLevel(data, id, 'whirling_cleave');
  const endless: number = placeLevel(data, id, 'endless_turn');
  const wake: number = placeLevel(data, id, 'long_wake');
  const undertow: number = placeLevel(data, id, 'wind_downdraught');
  const riptide: number = placeLevel(data, id, 'riptide');
  const race: number = placeLevel(data, id, 'blade_millrace');
  const echoes: number = placeLevel(data, id, 'twice_swung');
  const wheel: string = skillName(data, 'cleave_millwheel');
  const millwheel: string = esc(item(data, 'the_millwheel').name);
  const [first = 0, second = 0, top = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: wheel,
    forWho: 'For players who want to spin through a pack, drag it under and drink from the fight without stopping.',
    plays: [
      `The Maelstrom walks ${pathName(data, 'blade')} with ${groupNeeds(data, 'blade')} in your hands: the spin and the skills around it are stronger while you hold one. At level ${whirl} ${name(data, 'whirling_cleave')} turns ${skillName(data, 'cleave')} into a full turn that strikes everything around you. At level ${endless} ${name(data, 'endless_turn')} turns that into the ${wheel}: hold it and you keep turning while you run.`,
      `Every enemy the ${wheel} strikes builds momentum: you turn faster, reach wider and nothing knocks you off your feet. ${name(data, 'millstone')}, right after, lets the momentum climb higher and more than doubles the share of its damage that comes back as life, so spinning through a pack keeps you standing.`,
      `At level ${undertow} you learn ${skillName(data, 'downdraught')}: a whirlpool where you aim that drags the pack together, so one turn strikes all of it.`,
      `At level ${riptide} your roll becomes ${skillName(data, 'dodge_roll_riptide')}: a longer roll that leaves a rip current where you land and drags the pack in after you. At level ${race} you learn ${skillName(data, 'millrace')}: let go of the ${wheel} and throw its momentum out as one wave that crashes through the pack, harder, wider and farther the more you held, and stuns everything it strikes for longer the more you held. Throw it into the pack, then spin through it while it stands still. From then on every four enemies the ${wheel} strikes put a charge back in each flask.`,
      `${name(data, 'long_wake')} at level ${wake} holds your momentum longer after the last hit, so it carries from one pack to the next. It sits past ${name(data, 'racing_cloud')}, a crossbow place: with a blade that one gives only its movement speed, and the route takes it for what lies beyond.`,
      `At level ${echoes} the route crosses into ${pathName(data, 'echo')} for ${name(data, 'twice_swung')}. A held spin does not echo; it hits harder instead, every turn.`,
    ],
    lean: [
      `The ${wheel} is the button you hold. Each hit gives back a little mana and turning through empty air only spends it, so keep it turning through enemies, not between them.`,
      `Because it swings your weapon, your weapon's damage is most of your damage. Every place on the route that says "weapon skills", "Damage" or "Attack Speed" makes each turn hit harder or come sooner.`,
      `${millwheel}, a legendary blade, makes ${skillName(data, 'cleave')} the ${wheel} by itself, long before ${name(data, 'endless_turn')}. It is a blade, so every place on ${pathName(data, 'blade')} still counts with it in hand.`,
    ],
    lookFor: [
      `A blade with more damage that does not swing slower: ${weaponNames(groupWeapons(data, 'blade'))}. Read the damage range first.`,
      affixLine(data, 'quick'),
      affixLine(data, 'honed'),
      affixLine(data, 'fleet'),
      affixLine(data, 'hale'),
      affixLine(data, 'jagged'),
    ],
    avoid: [
      `Any weapon that is not a blade. With a heavy weapon, a staff or a crossbow, ${skillName(data, 'cleave')} stops turning, the ${wheel} is gone, and ${pathName(data, 'blade')} keeps ${skillName(data, 'downdraught')}, ${skillName(data, 'millrace')}, its life and its speed but none of its weapon damage.`,
      'Stopping. Momentum fades a moment after the last hit, and a turn that starts cold is a slow one.',
    ],
    legendaries: [
      { item: 'the_millwheel', changes: `${skillName(data, 'cleave')} becomes a spin you hold while you run, so you never stop to swing.` },
      { item: 'gyre_stitched_breeches', changes: `The spin drags the pack into it, and every third turn throws a ${skillName(data, 'thunderclap')} from the middle.` },
      { item: 'grinders_bracers', changes: 'The more enemies you are cutting, the faster and harder you hit.' },
    ],
    chase: `The other two work with ${skillName(data, 'cleave_whirl')} too, but the Millwheel is the spin they were made for: it never ends while you hold it.`,
    strengths: [
      'Crowds. Every turn hits everything around you, and the more it hits the faster it turns.',
      `Levelling. It was ${speedRank(data, id, second)} build to reach level ${second}.`,
      'Moving. You keep turning while you run, so the pack and the next one are one fight.',
      `The boss, once it is grown. At level ${top} it won ${percent(steadyBossShare(data, id, top))} of its fights played steadily, with ${percent(steadyBossLife(data, id, top))} of its life left on average.`,
    ],
    weakSpots: [
      `The boss early on. At level ${first} it won ${percent(steadyBossShare(data, id, first))} of its fights played steadily and ${percent(carelessBossShare(data, id, first))} played carelessly: the boss is one enemy, and a turn made for crowds builds little momentum on one.`,
      `Mistakes. There is little between you and the blow: played carelessly it ${deathWords(carelessDeaths(data, id))}.`,
    ],
    thin: [],
    marks: {
      heavy_hands: 'The single biggest damage place early.',
      whirling_cleave: 'The build starts here.',
      endless_turn: `Your turn becomes the ${wheel}.`,
      millstone: 'More momentum, and more of its damage back as life.',
      blade_millrace: `Let go of the ${wheel} and spend its momentum in one wave that stuns the pack.`,
      racing_cloud: 'A crossbow place: with a blade it gives only its movement speed. It leads to the next one.',
      long_wake: 'Momentum that lasts from one pack to the next.',
      twice_swung: 'The held spin does not echo: it hits harder instead.',
    },
    afterRoute: afterRouteText(data, id, 'More damage and more ways to move.'),
  };
}

function caster(data: GuideData): BuildNotes {
  const id: string = 'stormcaller';
  const lance: number = placeLevel(data, id, 'storm_lance');
  const twice: number = placeLevel(data, id, 'twice_told_bolt');
  const keystone: number = placeLevel(data, id, 'eye_of_the_storm');
  const lifeCut: string = percent(modShare(data, 'eye_of_the_storm', 'maxLife'));
  const bolt: string = skillName(data, 'storm_bolt');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: null,
    forWho: 'For players who want to fight from a distance and let the lightning do the work.',
    plays: [
      `The Stormcaller walks ${pathName(data, 'storm')} with ${groupNeeds(data, 'staff')} in your hands. Nearly every place on the path answers only while you hold one; with any other weapon its lightning places keep their life and mana and lose their damage. Your first point is ${bolt}, and from then on it is the button you press.`,
      `${name(data, 'forked_bolt')} soon makes each cast throw more bolts, and ${skillName(data, 'squall')} comes early too: step into the pack and it forms around you, striking everything under it every half second while you keep casting.`,
      `At level ${lance} ${name(data, 'storm_lance')} changes ${bolt}: one straight line of lightning that hits everything along it at once. At level ${twice} ${name(data, 'twice_told_bolt')} gives it a second form, a bolt whose echo flies the same way a moment later. ${bolt} uses one of them at a time: choose which on that place's card on the Skill Tree, or right-click the skill on your bar (hold it on a phone).`,
      `At level ${keystone} you take ${name(data, 'eye_of_the_storm')}. It costs ${lifeCut} of your life and makes your lightning far stronger. ${skillName(data, 'standing_storm')} comes at level ${placeLevel(data, id, 'standing_thunder')}: a storm around you that heals you for every enemy it strikes, for the moments the pack does reach you. ${name(data, 'static_step')} follows, so your roll comes back sooner and carries you further.`,
    ],
    lean: [
      `${bolt} costs a little mana every cast. Mana is your limit, not waiting. The places on the route that add mana are there for this, and so is the mana flask on 2.`,
      `Your skills still add your weapon's damage, so a staff with more damage helps. A staff that adds mana helps more early on.`,
      `Take ${name(data, 'storm_lance')} for packs that come at you in a line, and ${name(data, 'twice_told_bolt')} for a single big enemy. You can switch between them whenever you like, for nothing.`,
    ],
    lookFor: [
      `A staff: ${weaponNames(groupWeapons(data, 'staff'))}. The ones that add mana help most: ${weaponNames(manaWeapons(data))}.`,
      affixLine(data, 'brimming'),
      affixLine(data, 'clear'),
      affixLine(data, 'honed'),
      affixLine(data, 'hale'),
      affixLine(data, 'grounded'),
    ],
    avoid: [
      `Any weapon that is not a staff. ${bolt} still casts, and ${name(data, 'storm_lance')} still changes it, but ${pathName(data, 'storm')} stops adding its damage, ${name(data, 'twice_told_bolt')} stops changing it, and the Skill Tree shows those lines struck through.`,
      'Attack speed on gear. Your spells do not cast faster for it.',
      `Standing in the pack. ${name(data, 'storm_lance')} is a line: step back so the enemies come at you along it.`,
    ],
    legendaries: [
      { item: 'crown_of_the_struck_hour', changes: `Every ${skillName(data, 'storm_bolt')} becomes two: the bolt, and a ${skillName(data, 'forkline')} from the first enemy it hits.` },
      { item: 'lantern_of_second_sounds', changes: 'Lightning reaches deeper into a pack and lands its hardest blow on the last enemy, not the first.' },
      { item: 'rainmaker', changes: `Every ${skillName(data, 'squall')} you drop breaks over you as well, so the storm comes with you, and every area you leave lasts longer.` },
    ],
    chase: `${skillName(data, 'storm_bolt')} is the button you press most, and the Crown turns every one of them into a ${skillName(data, 'forkline')} as well.`,
    strengths: [
      `Packs that come at you from one side. ${name(data, 'storm_lance')} hits the whole line.`,
      `The boss once the build comes together. At level ${second} it was ${bossSpeedRank(data, id, second)} build to win.`,
    ],
    weakSpots: [
      'Running out of mana in a long fight. Drink the mana flask before you are empty, not after.',
      `Being caught. With ${name(data, 'eye_of_the_storm')} taken you have little life. Played carelessly it won ${percent(carelessBossShare(data, id, first))} of its fights with the boss at level ${first}.`,
      'Enemies all around you at once. Step out so they are on one side again.',
    ],
    thin: [],
    marks: {
      storm_storm_bolt: 'Your first point, and your main skill from now on.',
      storm_lance: 'The build starts here.',
      eye_of_the_storm: `This is where you give up ${lifeCut} of your life for a lot more lightning damage.`,
      rolling_thunder: `This one changes ${skillName(data, 'thunderclap')}, which this build does not have. The route passes through it on the way to the keystone.`,
      twice_told_bolt: `A second form for ${bolt}. Choose which one it uses on this place's card.`,
      standing_thunder: 'A storm around you that heals you while it strikes.',
    },
    afterRoute: afterRouteText(data, id, 'More lightning and more mana, all still on the staff.'),
  };
}

function echoer(data: GuideData): BuildNotes {
  const id: string = 'echo-weaver';
  const echoes: number = placeLevel(data, id, 'twice_swung');
  const forked: number = placeLevel(data, id, 'forked');
  const keystone: number = placeLevel(data, id, 'twice_remembered');
  const brand: number = placeLevel(data, id, 'blade_static_brand');
  const fork: string = skillName(data, 'forkline');
  const field: string = skillName(data, 'static_field');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: 'your main attack',
    forWho: 'For players who want every blow to land twice, whatever they hold.',
    plays: [
      `${pathName(data, 'echo')} asks for no weapon and has no element: it follows whatever you hold. Your first point is ${field}, charged air around you for half a minute that makes your lightning hit harder and come sooner and gives mana back, and ${name(data, 'first_echo')} right after makes every area skill last longer and hit harder.`,
      `At level ${echoes} ${name(data, 'twice_swung')} makes your main attack happen twice: a moment after it lands, its echo strikes the same way again for half the damage. Your main attack is whatever your weapon makes of it: ${skillName(data, 'cleave')} and its turns with a blade or a heavy weapon, ${skillName(data, 'quarrel')} with a crossbow, ${skillName(data, 'storm_bolt')} with a staff. A held spin does not echo; it hits harder instead.`,
      `At level ${forked} ${name(data, 'forked')} lets each hit of your main attack throw a ${fork} from the enemy it struck. At level ${keystone} ${name(data, 'twice_remembered')} trades a little damage on everything for bigger, longer area skills and a shorter wait on ${skillName(data, 'held_breath')}.`,
      `${skillName(data, 'static_brand')} comes at level ${brand}: it marks the first enemy it touches, and your next hit on that enemy bursts the mark over everything around it. With your main attack striking twice, a mark rarely waits long.`,
    ],
    lean: [
      'Your main attack is the button you hold. Every echo hits again for free, and every hit can throw a Forkline, so a crowd is where the build is strongest.',
      `Brand the biggest enemy in a pack with ${skillName(data, 'static_brand')}, then strike it: the burst catches the rest.`,
      `This route's last places come from ${pathName(data, 'storm')}, for ${fork}'s lightning. They work with any weapon; their weapon damage lines answer only to ${groupNeeds(data, 'staff')}.`,
    ],
    lookFor: [
      'A better weapon of the kind you already hold. The echo copies its damage.',
      affixLine(data, 'honed'),
      affixLine(data, 'keen'),
      affixLine(data, 'brimming'),
      affixLine(data, 'hale'),
      affixLine(data, 'vital'),
    ],
    avoid: [
      'Changing weapons for every fight. Every skill works with any weapon, but each arm\'s skills are stronger with their own, and its weapon damage lines answer only to it.',
      `Letting ${field} lapse in a long fight. Raise it again before its fuse runs out.`,
    ],
    legendaries: [
      { item: 'wirethread_gloves', changes: `An enemy your echo kills throws a ${skillName(data, 'forkline')}, so a pack that starts dying keeps dying.` },
      { item: 'lantern_of_second_sounds', changes: `Every ${skillName(data, 'forkline')} you throw jumps further and hits hardest at the end of its chain.` },
      { item: 'crown_of_the_struck_hour', changes: `With a staff in hand, each ${skillName(data, 'storm_bolt')} also splits into a ${skillName(data, 'forkline')}.` },
    ],
    chase: 'They are the one piece that answers the echo itself, whatever weapon you hold.',
    strengths: [
      `Clearing. It was ${speedRank(data, id, second)} build to reach level ${second}.`,
      `The boss. At level ${second} it was ${bossSpeedRank(data, id, second)} build to win, and played steadily it won ${percent(steadyBossShare(data, id, first))} of its fights at level ${first}.`,
      'Any weapon. If the next good drop is a crossbow instead of a staff, the Echo keeps working.',
    ],
    weakSpots: [
      `Mana. Every skill costs it; ${field} gives some back while it stands, and the mana flask covers the rest.`,
      `Mistakes at the start. Played carelessly it won ${percent(carelessBossShare(data, id, first))} of its fights with the boss at level ${first}.`,
    ],
    thin: [
      'The simulated player that made the numbers on this page wears whichever weapon raises its numbers most, not one kind, so the numbers are for the route, not for one weapon.',
    ],
    marks: {
      echo_forkline: `Your first point: ${field}.`,
      twice_swung: 'Your main attack happens twice from here.',
      forked: `Every hit of your main attack can throw a ${fork}.`,
      twice_remembered: 'Bigger, longer area skills for a little less damage on everything.',
      blade_static_brand: 'A mark that bursts when you hit it again.',
      thunder_in_the_bones: `From here the route turns to ${pathName(data, 'storm')}, which makes ${fork} stronger. These places need a staff.`,
    },
    afterRoute: afterRouteText(data, id, 'More lightning and more mana, for a staff in hand.'),
  };
}

function windrunner(data: GuideData): BuildNotes {
  const id: string = 'windrunner';
  const keystone: number = placeLevel(data, id, 'never_still');
  const armourCut: string = percent(modShare(data, 'never_still', 'armour'));
  const quarrel: string = skillName(data, 'quarrel');
  const [first = 0, second = 0] = bossLevels(data);
  return {
    id,
    ...buildName(id),
    mainSkill: skill(data, 'quarrel').name,
    forWho: 'For players who like to fight from range, step through the pack and shoot out of the shadow.',
    plays: [
      `The Nightshot walks ${pathName(data, 'wind')} with ${groupNeeds(data, 'crossbow')} in your hands, which turns ${skillName(data, 'cleave')} into ${quarrel}. Almost every place on the path answers only while you hold one. Your first point is ${skillName(data, 'ghost_wave')}: a pale wave that rolls through the whole line.`,
      `${name(data, 'shadow_veil')} comes at level ${placeLevel(data, id, 'shadow_veil')}: after every roll your shots hit harder and pierce one more enemy for two seconds. At level ${placeLevel(data, id, 'slip_through')} ${name(data, 'slip_through')} turns your roll into a step through the shadow to where you aim, and it veils you like a roll.`,
      `${skillName(data, 'umbra')} comes at level ${placeLevel(data, id, 'wind_umbra')}: a shadow around you in which enemies deal less damage. At level ${keystone} you take ${name(data, 'never_still')}: faster attacks, faster feet and shorter waits on your movement, and ${armourCut} less armour.`,
      `At level ${placeLevel(data, id, 'fanned_shot')} ${name(data, 'fanned_shot')} turns ${quarrel} into a fan of bolts across the way ahead, and at level ${placeLevel(data, id, 'heavy_shot')} ${name(data, 'heavy_shot')} gives it a second form: hold it and let go of one heavy bolt. ${quarrel} uses one at a time: choose which on that place's card on the Skill Tree, or right-click the skill on your bar (hold it on a phone).`,
    ],
    lean: [
      `Roll, then shoot. ${skillName(data, 'quarrel')} is strongest in the two seconds after a roll or a step, so move often and fire right after.`,
      `Open with ${skillName(data, 'ghost_wave')} down the line of a pack, and drop ${skillName(data, 'umbra')} when they reach you.`,
    ],
    lookFor: [
      `A crossbow: ${weaponNames(groupWeapons(data, 'crossbow'))}.`,
      affixLine(data, 'quick'),
      affixLine(data, 'honed'),
      affixLine(data, 'hale'),
    ],
    avoid: [
      `Any weapon that is not a crossbow. Without one ${quarrel} is ${skillName(data, 'cleave')} again, and ${pathName(data, 'wind')} keeps its life, its speed, ${skillName(data, 'ghost_wave')} and ${skillName(data, 'umbra')} but none of the damage it gives your shots.`,
      'Standing still. The Veil only works after you move.',
      'Armour to make up for the keystone. Life does more for you.',
    ],
    legendaries: [
      { item: 'quietshot', changes: 'A roll before you shoot is worth more than any line on your gear, and one bolt goes through a whole line of enemies.' },
      { item: 'nightjar_gloves', changes: `Each roll turns the next shots into a fan of three bolts, so a roll into a pack is an attack.` },
      { item: 'longsight_coat', changes: 'You shoot from much further back, and whatever reaches you is thrown away again.' },
      { item: 'mist_treader_boots', changes: `You roll more often, and each roll leaves an ${skillName(data, 'downdraught')} behind. Any build can wear them; this one rolls most.` },
    ],
    chase: 'It is a weapon, and the other pieces all build on the roll it rewards. You can wear three legendaries at once, so with all three Quietshot pieces, leave the boots off.',
    strengths: [
      `Getting going. It was ${speedRank(data, id, first)} build to reach level ${first}.`,
      'Getting out of trouble. No build moves as much or as often.',
      `The boss, once it is grown. Played steadily it won ${percent(steadyBossShare(data, id, second))} of its fights at level ${second}.`,
    ],
    weakSpots: [
      `The boss at level ${first}. Played steadily it won ${percent(steadyBossShare(data, id, first))} of its fights there. Get a few more levels before you go.`,
      'Fights you cannot step out of. If you are held in place, your low armour shows.',
    ],
    thin: [],
    marks: {
      wind_ghost_wave: 'Your first point: a wave down the line of a pack.',
      shadow_veil: 'Every roll now makes your next shots stronger.',
      slip_through: 'Your roll now goes where you aim.',
      never_still: `Faster at everything, and ${armourCut} less armour.`,
      fanned_shot: `${quarrel} looses a fan of bolts.`,
      heavy_shot: `A second form for ${quarrel}. Choose which one it uses on this place's card.`,
    },
    afterRoute: afterRouteText(data, id, 'More life from the stone path: the right answer to a build that gave up its armour.'),
  };
}

export function buildNotes(data: GuideData): readonly BuildNotes[] {
  return [caster(data), tank(data), whirlwind(data), windrunner(data), echoer(data)];
}

export const BUILD_NOTES: readonly BuildNotes[] = buildNotes(guideData());
