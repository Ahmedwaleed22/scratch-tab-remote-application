import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { importFixtureModule, installBrowserImports, runtimeModule } from './support/runtime.js';
const { indentationEdit, detectIndentation, convertIndentation, indentationPreference } =
  await importFixtureModule('services/indentation.js');
const { findMatches } = await importFixtureModule('hooks/useEditorTools.js');

test('indentation keeps whitespace, uses tab stops and excludes the next line from block indent', () => {
  const settings = { size: 4, spaces: true };
  assert.equal(indentationEdit('  hello', 7, 7, 'Enter', false, settings)?.text, '\n  ');
  assert.equal(indentationEdit('\thello', 6, 6, 'Enter', false, settings)?.text, '\n\t');
  assert.equal(indentationEdit('ab', 2, 2, 'Tab', false, settings)?.text, '  ');
  assert.equal(indentationEdit('abc', 3, 3, 'Tab', false, { size: 2, spaces: false })?.text, '\t');
  const text = 'one\ntwo\nthree';
  const edit = indentationEdit(text, 0, 8, 'Tab', false, { size: 2, spaces: true })!;
  assert.equal(text.slice(0, edit.start) + edit.text + text.slice(edit.end), '  one\n  two\nthree');
  const outdent = indentationEdit('  one\n  two', 0, 11, 'Tab', true, { size: 2, spaces: true })!;
  assert.equal(outdent.text, 'one\ntwo');
  assert.equal(indentationEdit('hello', 2, 2, 'ArrowLeft', false, settings), null);
  assert.equal(indentationEdit('hello', 0, 0, 'Tab', true, settings)?.text, 'hello');
  assert.deepEqual(detectIndentation('x\n  y\n    z', settings), { size: 2, spaces: true });
  assert.deepEqual(detectIndentation('x\n\ty\n\t\tz', settings), { size: 4, spaces: false });
  assert.deepEqual(detectIndentation('', settings), settings);
  assert.equal(convertIndentation('\tx\n\t\ty', { size: 2, spaces: true }), '  x\n    y');
  assert.equal(convertIndentation('  x\n    y', { size: 2, spaces: false }), '\tx\n\t\ty');
});

test('find is literal and case insensitive, with empty and missing query cases', () => {
  assert.deepEqual(findMatches('A.b a.b', 'a.b'), [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
  ]);
  assert.deepEqual(findMatches('hello', ''), []);
  assert.deepEqual(findMatches('hello', '['), []);
  assert.deepEqual(findMatches('hello', 'missing'), []);
});

test('keyboard editing, indentation palette, native undo and Remote-style find work together', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      return path.endsWith('.js')
        ? route.fulfill({ contentType: 'text/javascript', body: await runtimeModule(path) })
        : route.fulfill({
            contentType: 'text/html',
            body: '<meta name="viewport" content="width=device-width, initial-scale=1">',
          });
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(async () => {
      const { mountEditorWindow } = await window.importModule('/app/editor.js');
      const { EditorDocument } = await window.importModule('/services/editorDocument.js');
      const { windowGeometry } = await window.importModule('/adapters/windowGeometry.js');
      window.disk = '  const value = 1;\n  const other = 2;';
      const documentModel = new EditorDocument('/workspace/main.js', 'test', new Map(), {
        async read() {
          return { content: window.disk, revision: 'original' };
        },
        async save(_path, content) {
          window.disk = content;
          return { revision: 'saved' };
        },
      });
      window.view = mountEditorWindow({
        target: { name: 'main.js', path: '/workspace/main.js', ide: '', download: '' },
        documentModel,
        index: 0,
        layoutPersistence: windowGeometry('tools'),
        nextLayer: () => 101,
        launchIde: () => {},
        onClosed: () => {},
      });
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    });
    const input = page.locator('textarea');
    await page.waitForFunction(() => !document.querySelector('textarea')?.readOnly);
    const indent = page.getByRole('button', { name: 'Indentation settings', exact: true });
    assert.equal(await indent.textContent(), 'Spaces: 2');
    await input.focus();
    await input.press('Control+End');
    await input.press('Enter');
    assert.equal(await input.inputValue(), '  const value = 1;\n  const other = 2;\n  ');
    await input.press('Tab');
    assert.ok((await input.inputValue()).endsWith('\n    '));
    await input.press('Control+z');
    assert.ok((await input.inputValue()).endsWith('\n  '));
    await input.press('Shift+Tab');
    assert.ok((await input.inputValue()).endsWith('\n'));
    const beforeModeChange = await input.inputValue();
    await indent.click();
    await page.getByRole('option', { name: 'Indent Using Tabs', exact: true }).click();
    await page.getByRole('option', { name: '4', exact: true }).click();
    assert.equal(await indent.textContent(), 'Tab Size: 4');
    assert.equal(await input.inputValue(), beforeModeChange);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('scratch-tab:indentation')!)),
      { size: 4, spaces: false },
    );
    assert.equal(await input.evaluate(node => getComputedStyle(node).tabSize), '4');
    await input.focus();
    await input.press('Control+End');
    await input.press('Tab');
    assert.ok((await input.inputValue()).endsWith('\n\t'));
    await indent.click();
    await page.getByRole('option', { name: 'Convert Indentation to Spaces', exact: true }).click();
    assert.equal(await indent.textContent(), 'Spaces: 4');
    await input.focus();
    await input.press('Control+f');
    const query = page.getByRole('textbox', { name: 'Find in file', exact: true });
    await query.fill('CoNsT');
    await query.press('Control+f');
    assert.equal(await query.inputValue(), 'CoNsT');
    await page.getByText('1 of 2', { exact: true }).waitFor();
    assert.equal(await page.locator('.scratch-tab-find-highlights mark').count(), 2);
    await query.press('Enter');
    await page.getByText('2 of 2', { exact: true }).waitFor();
    await query.press('Enter');
    await page.getByText('1 of 2', { exact: true }).waitFor();
    await query.press('Shift+Enter');
    await page.getByText('2 of 2', { exact: true }).waitFor();
    await query.fill('[');
    await page.getByText('No results', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Next match' }).isDisabled(), true);
    await query.press('Escape');
    assert.equal(await page.getByRole('search').count(), 0);
    assert.equal(await page.getByRole('dialog', { name: 'main.js' }).count(), 1);
    const beforeBlockIndent = await input.inputValue();
    await input.press('Control+a');
    await input.press('Tab');
    assert.ok((await input.inputValue()).startsWith('      const'));
    await input.press('Control+z');
    assert.equal(await input.inputValue(), beforeBlockIndent);
    await input.press('Control+s');
    await page.waitForFunction(() => window.disk === document.querySelector('textarea')?.value);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.cssText =
          theme === 'dark'
            ? '--bg-surface-rgb:20 21 25;--bg-raised-rgb:27 28 33;--fg:227 227 231;--accent-blue:138 180 255;--line:rgba(255,255,255,.13)'
            : '--bg-surface-rgb:250 250 250;--bg-raised-rgb:255 255 255;--fg:32 32 36;--accent-blue:45 100 215;--line:#ddd';
      }, theme);
      await page.getByRole('button', { name: 'Find in file', exact: true }).click();
      await query.fill('const');
      await page.screenshot({ path: `/workspace/.browser/scratch-editor-tools-${theme}.png` });
      await page.getByRole('button', { name: 'Close find' }).click();
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole('button', { name: 'Find in file', exact: true }).click();
    const bar = await page.getByRole('search').boundingBox();
    assert.ok(bar && bar.x >= 0 && bar.x + bar.width <= 320);
    await page.screenshot({ path: '/workspace/.browser/scratch-editor-tools-mobile.png' });
    await page.getByRole('button', { name: 'Close find' }).click();
    await indent.click();
    await page.screenshot({ path: '/workspace/.browser/scratch-editor-indentation-mobile.png' });
    const palette = await page
      .getByRole('dialog', { name: 'Indentation settings', exact: true })
      .boundingBox();
    assert.ok(palette && palette.x >= 0 && palette.x + palette.width <= 320 && palette.y >= 0);
    await page.getByRole('combobox', { name: 'Select Action' }).press('Escape');
    assert.equal(await page.getByRole('dialog', { name: 'main.js' }).count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('indentation preferences survive blocked or malformed browser storage', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    let saved = '';
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem() {
          return saved;
        },
        setItem(_key: string, value: string) {
          saved = value;
        },
      },
    });
    indentationPreference({ size: 2, spaces: false });
    assert.deepEqual(indentationPreference(), { size: 2, spaces: false });
    saved = '{"size":0,"spaces":true}';
    assert.deepEqual(indentationPreference(), { size: 2, spaces: false });
    saved = 'broken';
    assert.deepEqual(indentationPreference(), { size: 2, spaces: false });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    indentationPreference({ size: 3, spaces: true });
    assert.deepEqual(indentationPreference(), { size: 3, spaces: true });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    indentationPreference({ size: 4, spaces: true });
  }
});

test('plain text and Markdown support find without changing the draft or leaking shortcuts', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await installBrowserImports(page);
    await page.route('https://remote.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill(
        path.endsWith('.js')
          ? { contentType: 'text/javascript', body: await runtimeModule(path) }
          : { contentType: 'text/html', body: 'Editor fixture' },
      );
    });
    await page.goto('https://remote.test/');
    await page.addStyleTag({
      content: await readFile(new URL('../ui/style/scratch.css', import.meta.url), 'utf8'),
    });
    for (const name of ['notes.txt', 'notes.md']) {
      await page.evaluate(async name => {
        window.view?.close(true);
        const { mountEditorWindow } = await window.importModule('/app/editor.js');
        const { EditorDocument } = await window.importModule('/services/editorDocument.js');
        const { windowGeometry } = await window.importModule('/adapters/windowGeometry.js');
        window.disk = '  first needle\n  second NEEDLE  ';
        window.view = mountEditorWindow({
          target: { name, path: '/workspace/' + name, ide: '', download: '' },
          documentModel: new EditorDocument('/workspace/' + name, name, new Map(), {
            async read() {
              return { content: window.disk, revision: 'original' };
            },
            async save(_path, content) {
              window.disk = content;
              return { revision: 'saved' };
            },
          }),
          index: 0,
          layoutPersistence: windowGeometry('plain'),
          nextLayer: () => 101,
          launchIde() {},
          onClosed() {},
        });
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }, name);
      const input = page.locator('textarea');
      await page.waitForFunction(() => !document.querySelector('textarea')?.readOnly);
      if (name.endsWith('.md'))
        assert.equal(await page.locator('.scratch-tab-markdown').isVisible(), true);
      await page.getByRole('button', { name: 'Find in file', exact: true }).click();
      assert.equal(await input.isVisible(), true);
      const query = page.getByRole('textbox', { name: 'Find in file', exact: true });
      await query.fill('needle');
      await page.getByText('1 of 2', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Next match' }).click();
      await page.getByText('2 of 2', { exact: true }).waitFor();
      assert.equal(
        await input.evaluate((node: HTMLTextAreaElement) =>
          node.value.slice(node.selectionStart, node.selectionEnd),
        ),
        'NEEDLE',
      );
      await input.focus();
      await input.press('Control+Home');
      await page.keyboard.insertText('X');
      await page.evaluate(
        () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
      );
      assert.equal(await input.evaluate((node: HTMLTextAreaElement) => node.selectionStart), 1);
      await input.press('Control+z');
      await query.press('Escape');
      assert.equal(
        await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(),
        true,
      );
      await page.getByRole('button', { name: 'Indentation settings', exact: true }).click();
      const actions = page.getByRole('combobox', { name: 'Select Action' });
      await actions.fill('Trim Trailing');
      await actions.press('Enter');
      await page.waitForFunction(() =>
        document.querySelector('textarea')?.value.endsWith('NEEDLE'),
      );
      assert.equal(
        await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(),
        false,
      );
      assert.equal(await input.inputValue(), '  first needle\n  second NEEDLE');
    }
  } finally {
    await browser.close();
  }
});
