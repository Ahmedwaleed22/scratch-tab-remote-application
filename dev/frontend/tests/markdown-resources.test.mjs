import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fixtureRoot } from './support/runtime.mjs';

test('Markdown preview renders safely and resolves workspace resources', async () => {
  const { markdownPreview } = await import(new URL('presenters/markdown.js', fixtureRoot));
  const target = {
    path: '/workspace/docs/README.MD',
    download: '/api/chats/a/files/download?path=docs%2FREADME.MD',
  };
  const html = markdownPreview(
    '# Heading\n\n**bold** and *italic*\n\n- item\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n[guide](guide.md) ![icon](images/icon.png)\n\n[bad](javascript:alert(1))\n\n<script>alert(1)</script>',
    target,
  );
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<table>/);
  assert.match(html, /<code class="language-js">/);
  assert.match(html, /href="\/api\/chats\/a\/ide-open\?path=%2Fworkspace%2Fdocs%2Fguide.md"/);
  assert.match(html, /src="\/api\/chats\/a\/files\/download\?path=docs%2Fimages%2Ficon.png"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<script|href="javascript:/i);
  const escaped = markdownPreview(
    '![bad](data:image/png;base64,AAAA) [outside](../../etc/passwd)',
    target,
  );
  assert.doesNotMatch(escaped, /<img|href="\/api/);
});
