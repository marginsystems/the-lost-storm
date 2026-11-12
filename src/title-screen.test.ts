import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ClassTarget } from './title-screen.ts';
import { foldAfterClick, GAME_LAYERS, markInput, markPlaying, pressesEnter, settlesAway, TITLE_SCREEN } from './title-screen.ts';

function fakeBody(): ClassTarget & { readonly tokens: Set<string> } {
  const tokens: Set<string> = new Set<string>();
  return {
    tokens,
    classList: {
      toggle(token: string, force?: boolean): boolean {
        const on: boolean = force ?? !tokens.has(token);
        if (on) tokens.add(token);
        else tokens.delete(token);
        return on;
      },
    },
  };
}

function ruleFor(css: string, selector: string): string | null {
  for (const block of css.split('}')) {
    const [head, body] = block.split('{');
    if (head === undefined || body === undefined) continue;
    const selectors: string[] = head.split(',').map((part: string): string => part.trim());
    if (selectors.includes(selector)) return body;
  }
  return null;
}

void test('every game layer is hidden and untouchable until the player has entered', (): void => {
  const css: string = readFileSync(new URL('./title-screen.css', import.meta.url), 'utf8');
  for (const layer of GAME_LAYERS) {
    const rule: string | null = ruleFor(css, `body:not(.${TITLE_SCREEN.playingClass}) ${layer}`);
    assert.ok(rule !== null, `${layer} has no rule hiding it before Enter`);
    assert.match(rule, /opacity:\s*0;/);
    assert.match(rule, /visibility:\s*hidden;/);
    assert.match(rule, /pointer-events:\s*none\s*!important;/);
  }
});

void test('the body is marked playing on Enter and unmarked when it leaves', (): void => {
  const body = fakeBody();
  assert.equal(body.tokens.has(TITLE_SCREEN.playingClass), false);
  markPlaying(body, true);
  assert.equal(body.tokens.has(TITLE_SCREEN.playingClass), true);
  markPlaying(body, false);
  assert.equal(body.tokens.has(TITLE_SCREEN.playingClass), false);
});

void test('the input kind is marked once known, touch or not', (): void => {
  const touch = fakeBody();
  markInput(touch, true);
  assert.deepEqual([...touch.tokens].toSorted(), [TITLE_SCREEN.inputKnownClass, TITLE_SCREEN.touchClass].toSorted());
  const mouse = fakeBody();
  markInput(mouse, false);
  assert.deepEqual([...mouse.tokens], [TITLE_SCREEN.inputKnownClass]);
});

void test('Enter and Space on the title press Enter, but not while a control has focus or the title is not showing', (): void => {
  assert.equal(pressesEnter('Enter', 'page', true), true);
  assert.equal(pressesEnter(' ', 'page', true), true);
  assert.equal(pressesEnter('Enter', 'control', true), false);
  assert.equal(pressesEnter(' ', 'page', false), false);
  assert.equal(pressesEnter('Escape', 'page', true), false);
});

void test('entering clears the settled-away mark so the game layers can show again', (): void => {
  const body = fakeBody();
  body.classList.toggle(TITLE_SCREEN.awayClass, true);
  markPlaying(body, true);
  assert.equal(body.tokens.has(TITLE_SCREEN.awayClass), false);
});

void test('the game layers settle away only when their own fade ends on the title', (): void => {
  assert.equal(settlesAway(TITLE_SCREEN.awayProperty, true, false), true);
  assert.equal(settlesAway(TITLE_SCREEN.awayProperty, true, true), false);
  assert.equal(settlesAway(TITLE_SCREEN.awayProperty, false, false), false);
  assert.equal(settlesAway('transform', true, false), false);
});

void test('the hard hide of every layer child waits for the settled-away mark', (): void => {
  const css: string = readFileSync(new URL('./title-screen.css', import.meta.url), 'utf8');
  const rule: string | null = ruleFor(css, `body.${TITLE_SCREEN.awayClass}:not(.${TITLE_SCREEN.playingClass}) #hud *`);
  assert.ok(rule !== null);
  assert.match(rule, /visibility:\s*hidden\s*!important;/);
  assert.match(readFileSync(new URL('../play/index.html', import.meta.url), 'utf8'), new RegExp(`<body class="${TITLE_SCREEN.awayClass}">`));
});

void test('a fold opens on its button, closes on a second press, and opening one closes the other', (): void => {
  assert.equal(foldAfterClick(null, 0), 0);
  assert.equal(foldAfterClick(0, 0), null);
  assert.equal(foldAfterClick(0, 1), 1);
  assert.equal(foldAfterClick(1, 0), 0);
});
