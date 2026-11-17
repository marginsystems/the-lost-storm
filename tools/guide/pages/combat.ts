import type { BossDef, BossPhase, MonsterDef, SkillDef } from '../../../sim/content/types.ts';
import type { MonsterModDef } from '../../../sim/content/combat-types.ts';
import type { PackRankDef, RankModChoice, RankScale } from '../../../sim/content/rank-types.ts';
import { gapBand, gapScale } from '../../../sim/progression.ts';
import { ARMOUR_HALF_POINT, armourReduction } from '../../../sim/stats.ts';
import type { GuideData } from '../data.ts';
import { monster, skill, zone } from '../data.ts';
import { capPercent } from '../facts.ts';
import { bullets, decimal, esc, link, list, note, para, percent, section, subsection, table, terms } from '../html.ts';
import type { PageBody } from '../layout.ts';
import { gateLevel } from './start.ts';

export const COMBAT_PAGE = {
  armourSamples: [10, 25, 50, 100, 200, 300],
  gapHero: 10,
  gapSteps: [0, 4, 5, 6, 7, 8, 10],
  boss: 'timekeeper_gatekeeper',
} as const;

function times(scale: number): string {
  return `×${decimal(scale, 2)}`;
}

function more(scale: number): string {
  return scale >= 1 ? `${percent(scale - 1)} more` : `${percent(1 - scale)} less`;
}

function rank(data: GuideData, id: string): PackRankDef {
  const found: PackRankDef | undefined = data.content.packRanks.ranks.find((entry: PackRankDef): boolean => entry.id === id);
  if (found === undefined) throw new Error(`no pack rank ${id}`);
  return found;
}

function scaleLine(scale: RankScale): string {
  return `${more(scale.life)} life, ${more(scale.damage)} damage, ${times(scale.xp)} experience`;
}

function modEffect(data: GuideData, mod: MonsterModDef): string {
  const parts: string[] = [];
  if (mod.speedScale !== 1) parts.push(`moves ${percent(Math.abs(mod.speedScale - 1))} ${mod.speedScale > 1 ? 'faster' : 'slower'}`);
  if (mod.lifeScale !== 1) parts.push(`has ${more(mod.lifeScale)} life`);
  if (mod.damageScale !== 1) parts.push(`hits ${percent(Math.abs(mod.damageScale - 1))} ${mod.damageScale > 1 ? 'harder' : 'softer'}`);
  if (mod.sizeScale > 1) parts.push('is bigger');
  if (mod.staggerScale < 1) parts.push(`is staggered ${percent(1 - mod.staggerScale)} less`);
  if (mod.regen > 0) parts.push(`heals ${percent(mod.regen)} of its life a second once it has gone a while without being hit`);
  if (mod.deathSkill !== null) parts.push(`bursts a moment after it dies, where it fell (${esc(skill(data, mod.deathSkill).name)}), so step away from it`);
  return parts.join(', ');
}

function poolMods(data: GuideData): MonsterModDef[] {
  return data.content.packRanks.pool.map((choice: RankModChoice): MonsterModDef => {
    const found: MonsterModDef | undefined = data.content.monsterMods.get(choice.mod);
    if (found === undefined) throw new Error(`no monster mod ${choice.mod}`);
    return found;
  });
}

function bossOf(data: GuideData): { readonly monster: MonsterDef; readonly boss: BossDef } {
  const found: MonsterDef = monster(data, COMBAT_PAGE.boss);
  if (found.boss === null) throw new Error(`${found.id} is not a boss`);
  return { monster: found, boss: found.boss };
}

function phaseSkills(data: GuideData, phase: BossPhase): SkillDef[] {
  return phase.skills.map((entry): SkillDef => skill(data, entry.skill));
}

function phaseText(data: GuideData, phase: BossPhase, index: number, all: readonly BossPhase[]): string {
  const skills: readonly SkillDef[] = phaseSkills(data, phase);
  const before: ReadonlySet<string> = new Set<string>(index === 0 ? [] : phaseSkills(data, all[index - 1] ?? phase).map((entry: SkillDef): string => entry.id));
  const now: ReadonlySet<string> = new Set<string>(skills.map((entry: SkillDef): string => entry.id));
  const added: SkillDef[] = skills.filter((entry: SkillDef): boolean => !before.has(entry.id));
  const dropped: SkillDef[] = index === 0 ? [] : phaseSkills(data, all[index - 1] ?? phase).filter((entry: SkillDef): boolean => !now.has(entry.id));
  const when: string = index === 0 ? 'From the start' : `Below ${percent(phase.below)} of its life`;
  const what: string = added.map((entry: SkillDef): string => `<b>${esc(entry.name)}</b>: ${esc(entry.description)}`).join(' ');
  const gone: string = dropped.length === 0 ? '' : ` It stops using ${esc(list(dropped.map((entry: SkillDef): string => entry.name)))}.`;
  return `${when}. ${index === 0 ? 'It uses' : 'It adds'} ${what}${gone}`;
}

function typedSkills(data: GuideData, type: 'storm' | 'frost'): string[] {
  const { boss } = bossOf(data);
  const fromBoss: SkillDef[] = boss.phases.flatMap((phase: BossPhase): SkillDef[] => phaseSkills(data, phase));
  const fromMods: SkillDef[] = poolMods(data).flatMap((mod: MonsterModDef): SkillDef[] => (mod.deathSkill === null ? [] : [skill(data, mod.deathSkill)]));
  const names: string[] = [...fromBoss, ...fromMods].filter((entry: SkillDef): boolean => entry.damage.type === type).map((entry: SkillDef): string => entry.name);
  return [...new Set(names)];
}

export function gapRows(data: GuideData): string[][] {
  const gap = data.content.player.xp.gap;
  const hero: number = COMBAT_PAGE.gapHero;
  return COMBAT_PAGE.gapSteps.map((step: number): string[] => [step === 0 ? 'Your level' : `${step} levels apart`, percent(gapScale(gap, hero, hero - step))]);
}

export function combatPage(data: GuideData): PageBody {
  const base = data.content.player.baseStats;
  const per = data.content.player.perLevel;
  const rules = data.content.player.resistance;
  const gap = data.content.player.xp.gap;
  const magic: PackRankDef = rank(data, 'magic');
  const rare: PackRankDef = rank(data, 'rare');
  const { monster: boss, boss: bossDef } = bossOf(data);
  const manaPerLevel: number = per.find((mod): boolean => mod.stat === 'maxMana')?.value ?? 0;
  const lifePerLevel: number = per.find((mod): boolean => mod.stat === 'maxLife')?.value ?? 0;
  return {
    kicker: 'Guide',
    title: 'How combat works',
    lede: 'What decides how hard you hit, how much of it you take, and why some fights go badly.',
    description: 'How combat works in The Lost Storm: damage, critical strikes, armour, resistances, mana, stagger, experience, magic and rare packs, and the first boss.',
    body: [
      section(
        'damage',
        'Damage',
        [
          para(
            'Every skill you use starts from your weapon. A hit rolls a number in your weapon\'s damage range, adds your Damage bonus, and takes the share of that the skill uses. Some skills add a little damage of their own on top. Then the hit may be a critical strike.',
            'So a better weapon makes every skill stronger, spells included. "Damage" on the tree and on gear is a bonus to all of it; "damage for weapon skills" or "damage for lightning skills" counts only for that kind of skill.',
            `You start with a ${decimal(base.damageMin, 0)} to ${decimal(base.damageMax, 0)} damage range of your own, and every level adds a little to it. Your weapon adds far more.`,
          ),
          subsection(
            'Critical strikes',
            para(`A critical strike multiplies the hit. You start with a ${percent(base.critChance)} chance and a ${times(base.critMultiplier)} multiplier. Chance stops counting at ${capPercent(data, 'critChance')}; the multiplier has no cap.`),
          ),
        ].join('\n'),
      ),
      section(
        'defence',
        'Armour and resistances',
        [
          para(`Armour takes a share off every hit you take. The first points count the most: ${ARMOUR_HALF_POINT} armour takes off ${percent(armourReduction(ARMOUR_HALF_POINT, rules.armourCap))}, and no amount takes off more than ${percent(rules.armourCap)}.`),
          table({ head: ['Armour', 'Taken off each hit'], rows: COMBAT_PAGE.armourSamples.map((value: number): string[] => [String(value), percent(armourReduction(value, rules.armourCap))]) }),
          para(
            `Storm and frost resistance take a further share off hits of that kind, after armour. They stop at ${percent(rules.cap)}. The storm hits you will meet are ${esc(list(typedSkills(data, 'storm')))}; the frost ones are ${esc(list(typedSkills(data, 'frost')))}. Everything else is plain physical damage, which only armour lowers.`,
          ),
          para(`Life is the other half of staying alive. You start with ${decimal(base.maxLife, 0)} and gain ${decimal(lifePerLevel, 0)} with every level.`),
        ].join('\n'),
      ),
      section(
        'mana',
        'Mana',
        para(
          `Skills cost mana; ${esc(skill(data, 'cleave').name)} and ${esc(skill(data, 'dodge_roll').name)} cost none. You start with ${decimal(base.maxMana, 0)}, gain ${decimal(manaPerLevel, 0)} with every level, and regain ${decimal(base.manaRegen, 1)} a second. The mana flask on 2 refills it faster. A spell build runs out of mana long before it runs out of cooldowns, so mana on gear and on the tree matters to it.`,
        ),
      ),
      section(
        'stagger',
        'Stagger and knockback',
        [
          para(
            'Every hit pushes the enemy back a little and staggers it for a moment. A staggered enemy that was winding up an attack loses that attack. Heavier skills push further and stagger longer: a charged blow or a slam can stop a big swing that a quick cut would not.',
            'Some big attacks pass a point where they can no longer be stopped by a light hit. Only a heavy one breaks them then. Unyielding enemies are staggered less, and the boss is never staggered and barely moves when struck.',
          ),
          note(`Watch for the wind-up. The bigger the attack, the longer the wind-up, and the more it pays to roll away or hit it with something heavy before it lands.`),
        ].join('\n'),
      ),
      section(
        'xp',
        'Experience and the level gap',
        [
          para(
            `In ${esc(zone(data, 'hall_of_time').name)} and ${esc(zone(data, 'keepers_gate').name)} the enemies are your level, so there is always a fair fight in front of you. Enemies far from your level, above or below, give less experience. Up to ${gapBand(gap, COMBAT_PAGE.gapHero)} levels apart (a little more as you grow) there is no loss; past that it falls off quickly.`,
          ),
          table({ head: ['Enemy level', 'Experience you get'], rows: gapRows(data), caption: `For a level ${COMBAT_PAGE.gapHero} character` }),
          para(`Dying costs ${percent(data.content.player.deathPenalty.xpPercent)} of the experience you need for your next level. It never takes a level away.`),
        ].join('\n'),
      ),
      section(
        'packs',
        'Magic and rare packs',
        [
          para(`Most packs are plain. Some glow: blue for magic, gold for rare. The deeper you are in levels, the more of them there are.`),
          terms([
            [
              `<span style="color: ${esc(magic.color)}">${esc(magic.name)}</span>`,
              `About ${percent(magic.chance?.base ?? 0)} of packs at first, up to ${percent(magic.chance?.max ?? 0)}. Every member has ${scaleLine(magic.members)}, and one trait from the list below. They drop more items.`,
            ],
            [
              `<span style="color: ${esc(rare.color)}">${esc(rare.name)}</span>`,
              `About ${percent(rare.chance?.base ?? 0)} of packs at first, up to ${percent(rare.chance?.max ?? 0)}. The members have ${scaleLine(rare.members)}. The leader has a two-word name, ${scaleLine(rare.leader ?? rare.members)}, ${rare.leader?.mods ?? 0} traits, and always drops ${rare.leader?.items ?? 0} extra items that are at least magic.`,
            ],
          ]),
          subsection('Traits', bullets(poolMods(data).map((mod: MonsterModDef): string => `<b>${esc(mod.prefix)}</b>: ${modEffect(data, mod)}.`))),
        ].join('\n'),
      ),
      section(
        'boss',
        `The boss: ${boss.name}`,
        [
          para(
            `${esc(boss.name)} waits at ${esc(zone(data, 'keepers_gate').name)}, behind the gate that opens at level ${gateLevel(data)}. It is slow, it follows you, and it changes how it fights twice as it loses life. If you would rather meet it fresh, stop reading here.`,
          ),
          bullets(bossDef.phases.map((phase: BossPhase, index: number): string => phaseText(data, phase, index, bossDef.phases))),
          para(
            `Every time it falls it drops ${bossDef.drop.items} items of ${bossDef.drop.floor} rarity or better and some gold. The first time, it also gives you ${percent(bossDef.firstKill?.xpShare ?? 0)} of a level.`,
            `What helps: keep moving out of the sweep, never stand still inside the slowed ground, and roll through the lines that hold you. Each ${link('/guide/builds/', 'build page')} shows how often that build won against it.`,
          ),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
