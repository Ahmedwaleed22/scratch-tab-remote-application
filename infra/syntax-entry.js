import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import php from 'highlight.js/lib/languages/php';

for (const [name, grammar] of Object.entries({
  javascript,
  typescript,
  python,
  go,
  json,
  bash,
  xml,
  css,
  markdown,
  yaml,
  sql,
  rust,
  java,
  cpp,
  php,
}))
  hljs.registerLanguage(name, grammar);
const extensions = new Map(
  Object.entries({
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    py: 'python',
    pyw: 'python',
    go: 'go',
    json: 'json',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    html: 'xml',
    htm: 'xml',
    xml: 'xml',
    css: 'css',
    md: 'markdown',
    markdown: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    rs: 'rust',
    java: 'java',
    c: 'cpp',
    h: 'cpp',
    cc: 'cpp',
    cpp: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    php: 'php',
  }),
);
export function languageFor(name) {
  const filename = name.split('/').pop().toLowerCase();
  if (!filename.includes('.')) return null;
  return extensions.get(filename.split('.').pop()) || null;
}
export function highlightCode(text, language) {
  return hljs.highlight(text, { language, ignoreIllegals: true }).value;
}
