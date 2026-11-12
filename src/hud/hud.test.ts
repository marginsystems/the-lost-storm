import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const HUD_FOLDER = 'src/hud';

function hudFiles(extension: string): string[] {
  return readdirSync(HUD_FOLDER)
    .filter((name: string): boolean => name.endsWith(extension) && !name.endsWith(`.test${extension}`))
    .map((name: string): string => `${HUD_FOLDER}/${name}`);
}

function controlClasses(): Map<string, string> {
  const found: Map<string, string> = new Map<string, string>();
  for (const file of hudFiles('.ts')) {
    for (const match of readFileSync(file, 'utf8').matchAll(/el\('(?:button|input|select|textarea)', '([^' ]+)/g)) {
      const name: string | undefined = match[1];
      if (name !== undefined) found.set(name, file);
    }
  }
  return found;
}

void test('every HUD control is styled by a stylesheet the HUD itself loads', (): void => {
  const css: string = hudFiles('.css')
    .map((file: string): string => readFileSync(file, 'utf8'))
    .join('\n');
  const controls: Map<string, string> = controlClasses();
  assert.ok(controls.size > 0);
  for (const [name, file] of controls) assert.ok(new RegExp(`\\.${name}(?![\\w-])`).test(css), `.${name} from ${file} has no rule in any stylesheet in ${HUD_FOLDER}`);
});

void test('every HUD stylesheet is injected by the HUD', (): void => {
  const sources: string = hudFiles('.ts')
    .map((file: string): string => readFileSync(file, 'utf8'))
    .join('\n');
  for (const file of hudFiles('.css')) {
    const name: string = file.slice(HUD_FOLDER.length + 1);
    assert.ok(sources.includes(`./${name}?inline`), `${name} is never imported by the HUD`);
  }
});

void test('the graphics notice takes its own clicks only while it is shown', (): void => {
  const css: string = readFileSync(`${HUD_FOLDER}/context-notice.css`, 'utf8');
  const rule = (selector: string): string => {
    const start: number = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, selector);
    return css.slice(start, css.indexOf('}', start));
  };
  assert.match(rule('.ctx-notice'), /pointer-events: none/);
  assert.match(rule('.ctx-notice.on'), /pointer-events: auto/);
  assert.match(rule('.ctx-notice.failed .ctx-reload'), /pointer-events: auto/);
});
