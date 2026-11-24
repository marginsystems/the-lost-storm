import type { MonsterState, World } from '../../sim/world/types.ts';
import { piecesHolding } from '../../sim/world/count.ts';
import { clamp01, el, setClass, setText } from './dom.ts';

const BOSS_PIECES = {
  step: 0.004,
} as const;

export interface PieceReading {
  readonly id: number;
  readonly name: string;
  readonly ratio: number;
  readonly standing: boolean;
}

export interface BossPieces {
  readonly element: HTMLElement;
  update(world: World, boss: MonsterState | null): void;
}

interface PieceSlot {
  readonly element: HTMLElement;
  readonly fill: HTMLElement;
  readonly chip: HTMLElement;
  ratio: number;
  standing: boolean;
  fresh: boolean;
  leaving: boolean;
}

export function readPieces(world: World, boss: MonsterState | null): PieceReading[] {
  if (boss === null || !boss.alive) return [];
  return piecesHolding(world, boss).map((piece: MonsterState): PieceReading => ({
    id: piece.id,
    name: piece.def.name,
    ratio: piece.alive ? Math.round(clamp01(piece.life / piece.maxLife) / BOSS_PIECES.step) * BOSS_PIECES.step : 0,
    standing: piece.alive,
  }));
}

export function piecesCaption(readings: readonly PieceReading[]): string {
  const names: string[] = [];
  for (const reading of readings) if (!names.includes(reading.name)) names.push(reading.name);
  const standing: number = readings.filter((reading: PieceReading): boolean => reading.standing).length;
  return names.length === 0 ? '' : `${names.join(' · ')} · ${standing} left`;
}

export function createBossPieces(parent: HTMLElement): BossPieces {
  const element: HTMLDivElement = el('div', 'boss-pieces', parent);
  const caption: HTMLDivElement = el('div', 'boss-pieces-name', element);
  const row: HTMLDivElement = el('div', 'boss-pieces-row', element);
  const slots: Map<number, PieceSlot> = new Map<number, PieceSlot>();
  let visible: boolean = false;

  const slotFor = (reading: PieceReading): PieceSlot => {
    const known: PieceSlot | undefined = slots.get(reading.id);
    if (known !== undefined) return known;
    const slot: HTMLDivElement = el('div', 'boss-piece', row);
    const chip: HTMLDivElement = el('div', 'boss-piece-chip', slot);
    const fill: HTMLDivElement = el('div', 'boss-piece-fill', slot);
    const made: PieceSlot = { element: slot, fill, chip, ratio: -1, standing: true, fresh: true, leaving: false };
    slot.addEventListener('transitionend', (event: TransitionEvent): void => {
      if (event.target !== slot || !made.leaving || event.propertyName !== 'opacity') return;
      slot.remove();
      if (slots.get(reading.id) === made) slots.delete(reading.id);
    });
    slots.set(reading.id, made);
    return made;
  };

  return {
    element,
    update(world: World, boss: MonsterState | null): void {
      const readings: PieceReading[] = readPieces(world, boss);
      const show: boolean = readings.some((reading: PieceReading): boolean => reading.standing);
      if (show !== visible) {
        visible = show;
        element.classList.toggle('visible', show);
      }
      if (readings.length > 0) setText(caption, piecesCaption(readings), visible);
      for (const [id, slot] of slots) {
        if (readings.some((reading: PieceReading): boolean => reading.id === id) || slot.leaving) continue;
        slot.leaving = true;
        if (slot.element.classList.contains('shown')) {
          slot.element.classList.remove('shown');
          continue;
        }
        slot.element.remove();
        slots.delete(id);
      }
      for (const reading of readings) {
        const slot: PieceSlot = slotFor(reading);
        if (slot.leaving) {
          slot.leaving = false;
          slot.element.classList.add('shown');
        }
        if (slot.fresh) {
          slot.fresh = false;
          requestAnimationFrame((): void => {
            if (!slot.leaving) slot.element.classList.add('shown');
          });
        }
        if (reading.standing !== slot.standing) {
          slot.standing = reading.standing;
          setClass(slot.element, 'broken', !reading.standing);
        }
        if (reading.ratio === slot.ratio) continue;
        slot.ratio = reading.ratio;
        slot.fill.style.transform = `scaleX(${reading.ratio.toFixed(3)})`;
        slot.chip.style.transform = `scaleX(${reading.ratio.toFixed(3)})`;
      }
    },
  };
}
