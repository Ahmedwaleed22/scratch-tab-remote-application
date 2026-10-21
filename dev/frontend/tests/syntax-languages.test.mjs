import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fixtureRoot } from './support/runtime.mjs';

test('syntax languages follow extensions and escape source markup', async () => {
  const { languageFor } = await import(new URL('presenters/syntax.js', fixtureRoot));
  const { highlightCode } = await import(new URL('vendor/syntax.js', fixtureRoot));
  for (const [name, language] of Object.entries({
    'APP.TSX': 'typescript',
    'app.jsx': 'javascript',
    'file.py': 'python',
    'main.go': 'go',
    'data.json': 'json',
    'run.sh': 'bash',
    'index.html': 'xml',
    'style.css': 'css',
    'README.md': 'markdown',
    'config.yml': 'yaml',
    'query.sql': 'sql',
    'main.rs': 'rust',
    'Main.java': 'java',
    'main.cpp': 'cpp',
    'main.c': 'cpp',
    'index.php': 'php',
  }))
    assert.equal(languageFor(name), language);
  for (const name of ['notes.txt', 'unknown.xyz', 'Makefile', '.env'])
    assert.equal(languageFor(name), null);
  const output = highlightCode(
    'const markup = "<img src=x onerror=alert(1)>"; // comment',
    'javascript',
  );
  assert.match(output, /hljs-keyword/);
  assert.match(output, /hljs-string/);
  assert.match(output, /hljs-comment/);
  assert.doesNotMatch(output, /<img/);
});
