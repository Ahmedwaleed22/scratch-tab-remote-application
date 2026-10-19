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
export function highlightCode(text, language) {
  return hljs.highlight(text, { language, ignoreIllegals: true }).value;
}
