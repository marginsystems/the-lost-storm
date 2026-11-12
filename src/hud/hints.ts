import { hintSegments, hintWording } from '../../sim/content/hints.ts';
import type { HintDef, HintPanel, HintsDef, HintSegment } from '../../sim/content/hints.ts';
import { createHintState, seedVeteran, stepHints } from '../../sim/hints.ts';
import type { HintChange, HintState } from '../../sim/hints.ts';
import type { World, WorldEvent } from '../../sim/world/types.ts';
import type { HintStore } from '../hints-store.ts';
import type { ResolvedKeys } from '../settings/bindings.ts';
import { el } from './dom.ts';
import hintsCss from './hints.css?inline';
import { iconSvg } from './icons.ts';
import type { TouchLabel } from './key-labels.ts';
import { keyLabel, touchLabel } from './key-labels.ts';

export interface Hints {
  update(world: World, events: readonly WorldEvent[]): void;
}

function showTouch(parent: HTMLElement, label: TouchLabel): void {
  switch (label.kind) {
    case 'icon': {
      const chip: HTMLElement = el('kbd', 'hint-key hint-icon', parent);
      chip.innerHTML = iconSvg(label.icon);
      chip.setAttribute('aria-label', label.name);
      break;
    }
    case 'words':
      el('kbd', 'hint-key', parent).textContent = label.text;
      break;
  }
}

export function createHints(parent: HTMLElement, defs: HintsDef, store: HintStore, keys: () => ResolvedKeys, openPanels: () => ReadonlySet<HintPanel>, touch: boolean): Hints {
  el('style', '', parent).textContent = hintsCss;
  const element: HTMLDivElement = el('div', 'hud-hint', null);
  parent.insertBefore(element, parent.firstChild);
  let state: HintState | null = null;
  let showing: boolean = false;

  const fill = (world: World, hint: HintDef): void => {
    element.replaceChildren();
    hintSegments(hintWording(hint, touch)).forEach((segment: HintSegment): void => {
      if (segment.type === 'words') element.append(document.createTextNode(segment.text));
      else if (touch) showTouch(element, touchLabel(world, segment.name));
      else el('kbd', 'hint-key', element).textContent = keyLabel(keys(), segment.name);
    });
  };

  const setShown = (wanted: boolean): void => {
    const next: boolean = wanted && element.childNodes.length > 0;
    if (next === showing) return;
    showing = next;
    element.classList.toggle('visible', next);
  };

  return {
    update(world: World, events: readonly WorldEvent[]): void {
      if (state === null) {
        const record = store.read();
        state = createHintState(record?.seen ?? []);
        if (record === null) seedVeteran(defs, state, world);
      }
      const changes: HintChange[] = stepHints(defs, world, state, { events, open: openPanels(), enabled: store.isEnabled() });
      for (const change of changes) {
        if (change.type === 'show') {
          fill(world, change.hint);
          setShown(true);
        } else {
          if (change.done) store.remember(change.hint.id, [...state.seen]);
          setShown(false);
        }
      }
      if (state.active !== null) setShown(world.dialogue === null);
    },
  };
}
