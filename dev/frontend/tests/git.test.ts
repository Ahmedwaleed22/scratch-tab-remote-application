import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  backendFixture,
  importFixtureModule,
  installBrowserImports,
  runtimeModule,
} from './support/runtime.js';

test('Git API keeps project scoping and rejects malformed responses', async () => {
  const { createGit } = await importFixtureModule('api/git.js');
  let result: unknown = {
    git: { changes: [], repositories: ['/workspace/one', '/workspace/two'] },
  };
  const calls: unknown[] = [];
  const api = createGit(
    backendFixture({
      async call(path, options) {
        calls.push({ path, ...options });
        return result;
      },
    }),
    'project',
  );
  assert.deepEqual((await api.execute({ action: 'repositories', repository: '' })).repositories, [
    '/workspace/one',
    '/workspace/two',
  ]);
  assert.deepEqual(calls, [
    {
      path: 'file',
      projectId: 'project',
      method: 'POST',
      body: { git: { action: 'repositories', repository: '' } },
    },
  ]);
  result = {
    git: {
      changes: [],
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      remote: 'origin',
      detached: true,
      commits: [
        {
          hash: 'abc',
          parents: ['def'],
          subject: 'Init',
          author: 'A',
          date: 'now',
          refs: ['refs/heads/main'],
        },
      ],
    },
  };
  const status = await api.execute({ action: 'status', repository: '/workspace/one' });
  assert.equal(status.ahead, 2);
  assert.equal(status.behind, 0);
  assert.equal(status.upstream, 'origin/main');
  assert.equal(status.detached, true);
  assert.deepEqual(status.commits, [
    {
      hash: 'abc',
      parents: ['def'],
      subject: 'Init',
      author: 'A',
      date: 'now',
      refs: ['refs/heads/main'],
    },
  ]);
  for (const bad of [
    null,
    {},
    { git: {} },
    { git: { changes: [{ path: 1 }] } },
    { git: { changes: [], repositories: [1] } },
    { git: { changes: [], diff: 1 } },
    { git: { changes: [], ahead: -1 } },
    { git: { changes: [], commits: [{ hash: 'a' }] } },
    {
      git: {
        changes: [],
        commits: [{ hash: 'a', parents: 'b', subject: '', author: '', date: '' }],
      },
    },
    { git: { changes: [], detached: 'yes' } },
  ]) {
    result = bad;
    await assert.rejects(
      api.execute({ action: 'status', repository: '/workspace/one' }),
      /Unexpected Git/,
    );
  }
});

test('Graph layout gives branches their own lanes and joins merges back', async () => {
  const { layoutGraph } = await importFixtureModule('model/git/application/graph.js');
  const commit = (hash: string, ...parents: string[]) => ({
    hash,
    parents,
    subject: hash,
    author: '',
    date: '',
    refs: [],
  });
  // merge ← (main: m1) + (feature: f1) ← base
  const rows = layoutGraph([
    commit('merge', 'm1', 'f1'),
    commit('m1', 'base'),
    commit('f1', 'base'),
    commit('base'),
  ]);
  assert.deepEqual(
    rows.map(row => [row.commit.hash, row.column, row.width]),
    [
      ['merge', 0, 2],
      ['m1', 0, 2],
      ['f1', 1, 2],
      ['base', 0, 2],
    ],
  );
  assert.deepEqual(rows[0]!.edges, [
    { kind: 'bottom', from: 0, to: 0, color: 0 },
    { kind: 'bottom', from: 0, to: 1, color: 1 },
  ]);
  assert.deepEqual(
    rows[1]!.edges.map(edge => edge.kind),
    ['top', 'pass', 'bottom'],
  );
  assert.ok(
    rows[3]!.edges.some(edge => edge.kind === 'top' && edge.from === 1 && edge.to === 0),
    'The feature lane must merge back into its base commit',
  );
  assert.equal(
    rows[3]!.edges.some(edge => edge.kind === 'bottom'),
    false,
  );
});

test('Diff parsing hides Git headers, numbers lines and marks edited words', async () => {
  const { parseDiff, splitRows } = await importFixtureModule('model/git/application/diff.js');
  const { renderDiffLines, splitHighlightedLines, markRange } =
    await importFixtureModule('presenters/diff.js');
  const diff = parseDiff(
    [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -10,4 +10,5 @@ function run() {',
      ' const keep = 1;',
      "-const name = 'first';",
      "+const name = 'second';",
      '+const added = `multi',
      '+line`;',
      ' }',
      '\\ No newline at end of file',
      '',
    ].join('\n'),
  );
  assert.equal(diff.status, 'modified');
  assert.equal(diff.additions, 3);
  assert.equal(diff.deletions, 1);
  const [hunk] = diff.hunks;
  assert.equal(hunk!.header, '@@ -10,4 +10,5 @@ function run() {');
  assert.deepEqual(
    hunk!.lines.map(line => [line.kind, line.old, line.new, line.text]),
    [
      ['context', 10, 10, 'const keep = 1;'],
      ['delete', 11, undefined, "const name = 'first';"],
      ['add', undefined, 11, "const name = 'second';"],
      ['add', undefined, 12, 'const added = `multi'],
      ['add', undefined, 13, 'line`;'],
      ['context', 12, 14, '}'],
    ],
  );
  assert.equal(hunk!.lines[5]!.noNewline, true);
  assert.deepEqual(hunk!.lines[1]!.changed, [14, 19]);
  assert.deepEqual(hunk!.lines[2]!.changed, [14, 20]);
  assert.equal(hunk!.lines[3]!.changed, undefined, 'Unrelated lines are not word-highlighted');
  assert.deepEqual(
    splitRows(hunk!.lines).map(row => [row.left?.kind, row.right?.kind]),
    [
      ['context', 'context'],
      ['delete', 'add'],
      [undefined, 'add'],
      [undefined, 'add'],
      ['context', 'context'],
    ],
  );
  const html = renderDiffLines(diff.hunks, 'src/a.ts');
  assert.match(html.get(hunk!.lines[2]!)!, /<mark>second<\/mark>/);
  assert.match(html.get(hunk!.lines[2]!)!, /hljs-keyword/);
  assert.match(
    html.get(hunk!.lines[4]!)!,
    /^<span class="hljs-string">line`<\/span>/,
    'Template strings keep their colour across lines',
  );
  assert.deepEqual(splitHighlightedLines('<span class="a">x\ny</span>z'), [
    '<span class="a">x</span>',
    '<span class="a">y</span>z',
  ]);
  assert.equal(markRange('a<b>&lt;c</b>d', [1, 3]), 'a<b><mark>&lt;c</mark></b>d');
  assert.equal(
    renderDiffLines(parseDiff('@@ -1 +1 @@\n-<b>\n+<i>\n').hunks, 'note.txt').get(
      parseDiff('@@ -1 +1 @@\n-<b>\n+<i>\n').hunks[0]!.lines[0]!,
    ),
    undefined,
  );
  const added = parseDiff(
    'new file mode 100644\n--- /dev/null\n+++ b/n.txt\n@@ -0,0 +1,1 @@\n+<b>\n',
  );
  assert.equal(added.status, 'added');
  assert.equal(renderDiffLines(added.hunks, 'n.txt').get(added.hunks[0]!.lines[0]!), '&#60;b&#62;');
  assert.equal(parseDiff('Binary files a/x and b/x differ\n').binary, true);
  assert.equal(parseDiff('rename from old.txt\nrename to new.txt\n').renamedFrom, 'old.txt');
});

test('Source Control stacks every repository with its own commit box, changes and graph on desktop and phone', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
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
    for (const name of ['scratch'])
      await page.addStyleTag({
        content: await readFile(new URL(`../ui/style/${name}.css`, import.meta.url), 'utf8'),
      });
    await page.evaluate(async () => {
      const { mountEditorWindow } = await window.importModule('/app/editor.js');
      const { EditorDocument } = await window.importModule('/services/editorDocument.js');
      const { windowGeometry } = await window.importModule('/adapters/windowGeometry.js');
      const files = {
        async read() {
          return { content: 'second\n', revision: 'r' };
        },
        async save(_path: string, content: string) {
          window.saved = content;
          return { revision: 'saved' };
        },
      };
      const slowScan = new Promise<void>(resolve => {
        window.finishDownload = resolve;
      });
      const slowStatus = new Promise<void>(resolve => {
        window.finishCheck = resolve;
      });
      let staged = false;
      let committed = false;
      window.gitCalls = [];
      window.view = mountEditorWindow({
        target: { name: 'note.txt', path: '/workspace/one/note.txt', ide: '', download: '' },
        documentModel: new EditorDocument('/workspace/one/note.txt', 'git-test', new Map(), files),
        index: 0,
        layoutPersistence: windowGeometry('git'),
        nextLayer: () => 101,
        launchIde: () => {},
        canLaunchIde: () => false,
        onClosed: () => {},
        git: {
          async execute(request) {
            window.gitCalls.push(request);
            const one = request.repository === '/workspace/one';
            const result = {
              repositories: ['/workspace/one', '/workspace/two', '/workspace/one/nested'],
              branch: request.repository === '/workspace/two' ? 'feat/publish' : 'main',
              upstream: request.repository === '/workspace/two' ? '' : 'origin/main',
              detached: false,
              ahead: one ? 1 : 0,
              behind: 0,
              remote: 'origin',
              changes: [] as import('../src/model/git/application/git.js').GitChange[],
              commits: [] as import('../src/model/git/application/git.js').GitCommit[],
              diff: '',
              output: '',
            };
            if (request.action === 'repository') {
              return { ...result, repositories: ['/workspace/one'] };
            }
            if (request.action === 'repositories') {
              await slowScan;
              if (window.fail) throw new Error('Repository scan failed.');
              return result;
            }
            if (request.action === 'status' && request.repository === '/workspace/two')
              await slowStatus;
            if (request.action === 'log' && window.bad) throw new Error('Git graph failed.');
            if (request.action === 'push') throw new Error('No configured push destination.');
            if (request.action === 'stage') staged = true;
            if (request.action === 'unstage') staged = false;
            if (request.action === 'commit') {
              if (request.message !== 'Save note' || !(staged || request.all))
                throw new Error('Invalid commit');
              committed = true;
            }
            if (request.action === 'log')
              result.commits = [
                {
                  hash: 'c3',
                  parents: ['b2', 'f1'],
                  subject: committed ? 'Save note' : 'Merge feature',
                  author: 'Test',
                  date: 'now',
                  refs: ['refs/heads/main', 'refs/remotes/origin/main'],
                },
                {
                  hash: 'f1',
                  parents: ['a1'],
                  subject: 'Feature work',
                  author: 'Test',
                  date: 'then',
                  refs: [],
                },
                {
                  hash: 'b2',
                  parents: ['a1'],
                  subject: 'Second commit',
                  author: 'Test',
                  date: 'then',
                  refs: ['tag: refs/tags/v1'],
                },
                {
                  hash: 'a1',
                  parents: [],
                  subject: 'Initial commit',
                  author: 'Test',
                  date: 'then',
                  refs: [],
                },
              ];
            if (request.action === 'diff' && request.path === 'docs/new.md') {
              if (window.deferred)
                await new Promise<string>(resolve => {
                  window.finishRead = resolve;
                });
              if (window.denied) throw new Error('Diff unavailable.');
            }
            if (request.action === 'diff')
              result.diff = [
                'diff --git a/note.txt b/note.txt',
                'index 1111111..2222222 100644',
                '--- a/note.txt',
                '+++ b/note.txt',
                '@@ -1,3 +1,3 @@ heading',
                ' keep',
                '-value first here',
                window.saved === 'updated\n' ? '+value updated here' : '+value second here',
                ' tail',
                '',
              ].join('\n');
            if (request.action === 'status' && one && !committed)
              result.changes = [
                { path: 'note.txt', index: staged ? 'M' : ' ', worktree: staged ? ' ' : 'M' },
                { path: 'docs/new.md', index: '?', worktree: '?' },
                {
                  path: 'a/very/long/nested/folder/structure/that/keeps/going/and/going/file.ts',
                  index: ' ',
                  worktree: 'M',
                },
              ];
            return result;
          },
        },
      });
    });
    const panel = page.getByRole('dialog', { name: 'note.txt' });
    await panel.getByRole('button', { name: 'Source Control', exact: true }).click();
    const git = panel.getByRole('complementary', { name: 'Source Control' });
    await git
      .getByRole('region', { name: 'Graph' })
      .getByText('Merge feature', { exact: true })
      .waitFor({ timeout: 2000 });
    assert.deepEqual(await page.evaluate(() => window.gitCalls[0]), {
      action: 'repository',
      repository: '',
      path: '/workspace/one/note.txt',
    });
    const readyDiff = git.getByRole('button', { name: 'View working diff note.txt' });
    await readyDiff.waitFor();
    assert.equal(
      await readyDiff.isEnabled(),
      true,
      'A slow sibling repository must not block diffs',
    );
    await readyDiff.click();
    await panel.getByRole('region', { name: 'Git diff' }).waitFor({ timeout: 2000 });
    assert.equal(
      await git.getByRole('group', { name: 'Repository two' }).count(),
      0,
      'Active repository is usable before the workspace scan completes',
    );
    const draft = git.getByRole('textbox', { name: 'Commit message for one' });
    await draft.fill('Draft during discovery');
    await page.evaluate(() => window.finishDownload());
    await git.getByRole('group', { name: 'Repository two' }).waitFor();
    assert.equal(await draft.inputValue(), 'Draft during discovery');
    assert.equal(
      await panel.getByRole('region', { name: 'Git diff' }).count(),
      1,
      'Discovery must preserve the open diff',
    );
    await draft.fill('');
    await panel.getByRole('button', { name: 'Close diff' }).click();
    await page.evaluate(() => window.finishCheck());
    await git.getByText('Repositories refreshed.', { exact: true }).waitFor();
    const one = git.getByRole('group', { name: 'Repository one' });
    const two = git.getByRole('group', { name: 'Repository two' });
    const nested = git.getByRole('group', { name: 'Repository nested' });
    for (const repository of [one, two, nested])
      await repository.getByRole('textbox', { name: /Commit message for/ }).waitFor();
    assert.match(
      (await one.getByRole('textbox').getAttribute('placeholder')) ?? '',
      /to commit on "main"/,
    );
    await two.getByRole('button', { name: 'Publish Branch' }).first().waitFor();
    assert.equal(await nested.locator('.scratch-tab-git-primary').isDisabled(), true);
    assert.equal(await one.locator('.scratch-tab-git-letter[data-status="U"]').count(), 1);
    await one.getByText('docs', { exact: true }).waitFor();
    const graph = git.getByRole('region', { name: 'Graph' });
    const picker = graph.getByRole('button', { name: 'Graph repository' });
    assert.equal(await picker.innerText(), 'one');
    await graph.getByText('Merge feature', { exact: true }).waitFor();
    assert.equal(
      await graph.locator('svg.scratch-tab-git-lanes').first().getAttribute('width'),
      '25',
    );
    await graph.locator('li[data-head]').getByText('main', { exact: true }).waitFor();
    const changes = git.getByRole('region', { name: 'Changes' }).first();
    assert.ok(
      await changes.evaluate(node => node.scrollWidth <= node.clientWidth),
      'Long paths must not scroll the panel sideways',
    );

    await one.getByRole('button', { name: 'View working diff note.txt' }).click();
    const diff = panel.getByRole('region', { name: 'Git diff' });
    await diff.locator('td[data-kind="add"] mark').getByText('second').waitFor();
    assert.equal(await diff.getByText('diff --git', { exact: false }).count(), 0);
    assert.equal(await diff.getByText('index 1111111', { exact: false }).count(), 0);
    await diff.getByText('@@ -1,3 +1,3 @@ heading', { exact: true }).waitFor();
    await diff.getByRole('img', { name: '1 addition, 1 deletion' }).waitFor();
    assert.deepEqual(
      await diff
        .locator('tr:has(td[data-kind="delete"]) td.scratch-tab-diff-number')
        .evaluateAll(cells => cells.map(cell => cell.getAttribute('data-line'))),
      ['2', null],
    );
    await diff.press('Escape');
    assert.equal(await diff.count(), 0);
    const loadedDiffs = await page.evaluate(
      () =>
        window.gitCalls.filter(call => call.action === 'diff' && call.path === 'note.txt').length,
    );
    await one.getByRole('button', { name: 'View working diff note.txt' }).click();
    await diff.locator('td[data-kind="add"] mark').getByText('second').waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          window.gitCalls.filter(call => call.action === 'diff' && call.path === 'note.txt').length,
      ),
      loadedDiffs,
      'Reopening a fresh diff must not wait for another container round trip',
    );
    await diff.getByRole('button', { name: 'Close diff' }).click();

    await page.evaluate(() => {
      window.deferred = true;
    });
    await one.getByRole('button', { name: 'Refresh', exact: true }).click();
    await git.getByText('Status completed.', { exact: true }).waitFor();
    const newFile = one.getByRole('button', { name: 'View working diff docs/new.md' });
    await newFile.click();
    await diff.getByRole('status').getByText('Loading diff…').waitFor({ timeout: 2000 });
    assert.equal(
      await one.getByRole('button', { name: 'View working diff note.txt' }).isEnabled(),
      true,
    );
    await one.getByRole('button', { name: 'View working diff note.txt' }).click();
    await diff.locator('td[data-kind="add"] mark').getByText('second').waitFor();
    await page.evaluate(async () => {
      window.finishRead('done');
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(
      await diff.locator('.scratch-tab-diff-path strong').innerText(),
      'note.txt',
      'An older response must not replace the selected file',
    );
    await one.getByRole('button', { name: 'Refresh', exact: true }).click();
    await git.getByText('Status completed.', { exact: true }).waitFor();
    await newFile.click();
    await diff.getByRole('status').getByText('Loading diff…').waitFor();
    await diff.getByRole('button', { name: 'Close diff' }).click();
    await page.evaluate(async () => {
      window.finishRead('done');
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(await diff.count(), 0, 'A pending response must not reopen a closed diff');
    await page.evaluate(() => {
      window.deferred = false;
      window.denied = true;
    });
    await one.getByRole('button', { name: 'Refresh', exact: true }).click();
    await git.getByText('Status completed.', { exact: true }).waitFor();
    await newFile.click();
    await git.getByRole('alert').getByText('Diff unavailable.', { exact: true }).waitFor();
    await page.evaluate(() => {
      window.denied = false;
    });
    await newFile.click();
    await diff.locator('td[data-kind="add"] mark').getByText('second').waitFor();
    await diff.getByRole('button', { name: 'Close diff' }).click();
    await one.getByRole('button', { name: 'Stage note.txt', exact: true }).click();
    await one.getByRole('region', { name: 'Staged Changes' }).waitFor();
    await one.getByRole('button', { name: 'View staged diff note.txt' }).waitFor();
    await one.getByRole('button', { name: 'Unstage note.txt', exact: true }).click();
    await one.getByRole('button', { name: 'View working diff note.txt' }).waitFor();
    assert.equal(await one.getByRole('region', { name: 'Staged Changes' }).count(), 0);

    await page.addStyleTag({
      content:
        ':root{--bg-surface-rgb:24 27 32;--bg-raised-rgb:28 31 36;--fg:225 228 235;--line:#343941;--accent-blue:138 180 255}',
    });
    assert.equal(
      await one.locator('.scratch-tab-git-primary').evaluate(node => getComputedStyle(node).color),
      'rgb(24, 27, 32)',
      'Primary button text must contrast with a light accent',
    );
    await panel.evaluate(node => {
      node.style.height = '640px';
      node.style.width = '900px';
    });
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await panel.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-git-desktop.png' });
    const sidebarHandle = panel.getByRole('separator', { name: 'Resize Source Control' });
    const width = async () => (await git.boundingBox())!.width;
    const drag = async (
      handle: import('playwright').Locator,
      dx: number,
      dy: number,
    ): Promise<void> => {
      const box = (await handle.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y + dy / 2);
      await page.mouse.move(x + dx, y + dy);
      await page.mouse.up();
    };
    assert.equal(Math.round(await width()), 300);
    await drag(sidebarHandle, 100, 0);
    assert.equal(Math.round(await width()), 400);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('scratch-tab:panel-size:source-control')),
      '400',
    );
    assert.equal(await sidebarHandle.getAttribute('aria-valuenow'), '400');
    await sidebarHandle.press('ArrowLeft');
    await sidebarHandle.press('Shift+ArrowLeft');
    assert.equal(Math.round(await width()), 340);
    await drag(sidebarHandle, 2000, 0);
    const body = await panel.locator('.scratch-tab-body').evaluate(node => node.clientWidth);
    assert.equal(Math.round(await width()), body - 240, 'The editor keeps at least 240px');
    await sidebarHandle.dblclick();
    assert.equal(Math.round(await width()), 300);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('scratch-tab:panel-size:source-control')),
      null,
    );

    const graphHandle = git.getByRole('separator', { name: 'Resize Graph' });
    const graphHeight = async () => (await graph.boundingBox())!.height;
    const before = await graphHeight();
    await drag(graphHandle, 0, -80);
    // The default height is 35% of the panel, so allow sub-pixel rounding.
    const near = (actual: number, expected: number) =>
      assert.ok(Math.abs(actual - expected) <= 1, `${actual} ≉ ${expected}`);
    near(await graphHeight(), before + 80);
    await graphHandle.press('ArrowDown');
    near(await graphHeight(), before + 70);
    await graphHandle.press('Home');
    assert.equal(Math.round(await graphHeight()), 60);
    await drag(graphHandle, 0, -2000);
    const aside = await git.evaluate(node => node.clientHeight);
    assert.equal(Math.round(await graphHeight()), aside - 150);
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await panel.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-git-resized.png' });
    await graph.getByRole('button', { name: 'Graph', exact: true }).click();
    assert.equal(await graphHandle.count(), 0, 'A collapsed graph has no resize handle');
    await graph.getByRole('button', { name: 'Graph', exact: true }).click();
    await graphHandle.dblclick();
    near(await graphHeight(), before);

    await panel.evaluate(node => {
      node.style.width = '1200px';
    });
    await one.getByRole('button', { name: 'View working diff note.txt' }).click();
    await diff.getByRole('button', { name: 'Split' }).click();
    assert.equal(await diff.locator('table[data-view="split"]').count(), 1);
    const [left, right] = await Promise.all(
      ['delete', 'add'].map(kind =>
        diff.locator(`td.scratch-tab-diff-code[data-kind="${kind}"]`).boundingBox(),
      ),
    );
    assert.ok(left && right && Math.abs(left.y - right.y) < 1 && right.x > left.x);
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await panel.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-git-diff-split.png' });
    await diff.getByRole('button', { name: 'Unified' }).click();
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await panel.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-git-diff.png' });
    await diff.getByRole('button', { name: 'Stage file' }).click();
    await diff.getByText('Staged', { exact: true }).waitFor();
    await one.getByRole('button', { name: 'View staged diff note.txt' }).waitFor();
    await diff.getByRole('button', { name: 'Unstage file' }).click();
    await diff.getByText('Working tree', { exact: true }).waitFor();
    await diff.getByRole('button', { name: 'Close diff' }).click();
    await panel.evaluate(node => {
      node.style.width = '900px';
    });

    page.on('dialog', dialog => dialog.accept());
    await two.getByRole('button', { name: 'Publish Branch' }).last().click();
    await page.waitForFunction(() =>
      window.gitCalls.some(
        call => call.action === 'publish' && call.repository === '/workspace/two',
      ),
    );
    await one.getByRole('button', { name: 'More Actions' }).click();
    await one.getByRole('menuitem', { name: 'Push' }).click();
    await git.getByRole('alert').getByText('No configured push destination.').waitFor();

    await picker.click();
    const pick = graph.getByRole('dialog', { name: 'Graph repository' });
    await pick.getByRole('option').first().waitFor();
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await panel.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-git-picker.png' });
    await pick.getByRole('combobox').fill('tw');
    await pick.getByRole('option', { name: /two/ }).waitFor();
    assert.equal(await pick.getByRole('option').count(), 1);
    await pick.getByRole('combobox').press('Enter');
    assert.equal(await pick.count(), 0);
    assert.equal(await picker.innerText(), 'two');
    await page.waitForFunction(() =>
      window.gitCalls.some(call => call.action === 'log' && call.repository === '/workspace/two'),
    );

    await two.locator('.scratch-tab-git-repo-row').click({ button: 'right' });
    const context = git.getByRole('menu', { name: 'Repository actions' });
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await panel.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-git-context.png' });
    await context.getByRole('menuitem', { name: 'Close Repository' }).click();
    assert.equal(await two.count(), 0);
    assert.equal(await picker.innerText(), 'one');
    await nested.locator('.scratch-tab-git-repo-row').click({ button: 'right' });
    await context.getByRole('menuitem', { name: 'Close Other Repositories' }).press('Enter');
    assert.equal(await nested.count(), 1);
    assert.equal(await one.count(), 0);
    await git.getByRole('button', { name: 'Reopen 2 Closed Repositories' }).click();
    await one.waitFor();
    await two.waitFor();
    await nested.locator('.scratch-tab-git-repo-row').click({ button: 'right' });
    await context.press('Escape');
    assert.equal(await context.count(), 0);

    await page.setViewportSize({ width: 360, height: 640 });
    await one.getByRole('button', { name: 'View working diff note.txt' }).click();
    await diff.locator('table[data-view="unified"]').waitFor();
    // The ResizeObserver publishes the narrow layout after the viewport changes.
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLButtonElement>('.scratch-tab-git-diff button')].some(
        button => button.textContent === 'Split' && button.disabled,
      ),
    );
    assert.equal(await diff.getByRole('button', { name: 'Split' }).isDisabled(), true);
    const removed = await diff
      .locator('td.scratch-tab-diff-code[data-kind="delete"]')
      .boundingBox();
    const added = await diff.locator('td.scratch-tab-diff-code[data-kind="add"]').boundingBox();
    assert.ok(removed && added && added.y > removed.y, 'Diff lines must stack vertically');
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await panel.screenshot({
        path: process.env.SCRATCH_TAB_SCREENSHOTS + '-git-mobile-diff.png',
      });
    const diffBounds = await diff.boundingBox();
    assert.ok(diffBounds && diffBounds.width <= 360 && diffBounds.x >= 0);
    await diff.getByRole('button', { name: 'Close diff' }).click();

    await panel.locator('.scratch-tab-source textarea').fill('updated\n');
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await panel
      .locator('footer [role="status"]')
      .getByText('Saved · UTF-8', { exact: true })
      .waitFor();
    await one.getByRole('button', { name: 'View working diff note.txt' }).click();
    await diff.locator('td[data-kind="add"] mark').getByText('updated').waitFor();
    await diff.getByRole('button', { name: 'Close diff' }).click();
    await panel.locator('.scratch-tab-source textarea').fill('second\n');
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await panel
      .locator('footer [role="status"]')
      .getByText('Saved · UTF-8', { exact: true })
      .waitFor();
    await one.getByRole('button', { name: 'Commit', exact: true }).last().click();
    await git.getByRole('alert').getByText('Enter a commit message.').waitFor();
    await one.getByRole('textbox').fill('Save note');
    await one.getByRole('textbox').press('Control+Enter');
    await one.getByRole('button', { name: 'Sync Changes 1↑' }).waitFor();
    assert.equal(await one.getByRole('textbox').inputValue(), '');
    assert.ok(
      await page.evaluate(() =>
        window.gitCalls.some(call => call.action === 'commit' && call.all === true),
      ),
    );
    const bounds = await git.boundingBox();
    assert.ok(bounds && bounds.width <= 360);
    if (process.env.SCRATCH_TAB_SCREENSHOTS)
      await panel.screenshot({ path: process.env.SCRATCH_TAB_SCREENSHOTS + '-git-mobile.png' });
    await git.getByRole('button', { name: 'Close Source Control' }).click();
    assert.equal(await git.count(), 0);
    const scans = await page.evaluate(
      () => window.gitCalls.filter(call => call.action === 'repositories').length,
    );
    await panel.getByRole('button', { name: 'Source Control', exact: true }).click();
    await git.getByText('Repositories refreshed.', { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => window.gitCalls.filter(call => call.action === 'repositories').length,
      ),
      scans,
      'Reopening must reuse discovered repositories',
    );
    await page.evaluate(() => {
      window.fail = true;
    });
    await git.getByRole('button', { name: 'Discover repositories and refresh changes' }).click();
    await git.getByRole('alert').getByText('Repository scan failed.').waitFor();
    const failedScans = await page.evaluate(
      () => window.gitCalls.filter(call => call.action === 'repositories').length,
    );
    await page.evaluate(() => {
      window.fail = false;
      window.bad = true;
    });
    await git.getByRole('button', { name: 'Discover repositories and refresh changes' }).click();
    await git.getByRole('alert').getByText('Git graph failed.').waitFor();
    await page.waitForFunction(
      count => window.gitCalls.filter(call => call.action === 'repositories').length > count,
      failedScans,
    );
    await one.waitFor();
    await two.waitFor();
    await git.getByRole('button', { name: 'Close Source Control' }).click();
    assert.equal(await panel.locator('.scratch-tab-source textarea').inputValue(), 'second\n');
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.view.close(true));
  } finally {
    await browser.close();
  }
});
