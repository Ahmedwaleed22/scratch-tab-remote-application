import type { SyntaxLanguage } from '../model/editor/application/syntax.js';

export const MARKDOWN_EXTENSION: RegExp = /\.(md|markdown)$/i;

export const MAX_HIGHLIGHT_LINE_LENGTH: number = 8192;

export const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, SyntaxLanguage> = new Map(
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
  } satisfies Record<string, SyntaxLanguage>),
);
