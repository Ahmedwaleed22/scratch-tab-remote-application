import MarkdownIt from 'markdown-it';
import createDOMPurify from 'dompurify';

const markdown = new MarkdownIt({ html: true });
type ResolveUrl = (value: string, image: boolean) => string | null;

export function renderMarkdown(text: string, resolveUrl: ResolveUrl): string {
  // Use a separate instance so preview hooks cannot affect Mermaid's sanitizer.
  const purifier = createDOMPurify();
  purifier.addHook('afterSanitizeAttributes', node => {
    const tag = node.tagName.toLowerCase();
    if (node.hasAttribute('class')) {
      const language = tag === 'code' && /^language-[\w-]+$/.test(node.getAttribute('class')!);
      if (!language) node.removeAttribute('class');
    }
    // Markdown-it emits table alignment as CSS; retain only that formatting.
    const alignment = /^(?:text-align:\s*)(left|center|right);?$/i.exec(
      node.getAttribute('style') ?? '',
    );
    node.removeAttribute('style');
    if ((tag === 'th' || tag === 'td') && alignment) node.setAttribute('align', alignment[1]!);
    if (tag === 'a') {
      const href = node.hasAttribute('href') ? resolveUrl(node.getAttribute('href')!, false) : null;
      node.setAttribute('href', href ?? '#');
      if (href && !href.startsWith('#')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (tag === 'img') {
      const src = node.hasAttribute('src') ? resolveUrl(node.getAttribute('src')!, true) : null;
      if (!src) {
        node.replaceWith(node.ownerDocument.createTextNode(node.getAttribute('alt') ?? ''));
        return;
      }
      node.setAttribute('src', src);
      node.setAttribute('loading', 'lazy');
      node.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
  return purifier.sanitize(markdown.render(text), {
    ALLOWED_TAGS: [
      'a',
      'abbr',
      'b',
      'blockquote',
      'br',
      'caption',
      'code',
      'dd',
      'del',
      'details',
      'div',
      'dl',
      'dt',
      'em',
      'figcaption',
      'figure',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'i',
      'img',
      'kbd',
      'li',
      'ol',
      'p',
      'pre',
      's',
      'samp',
      'small',
      'span',
      'strong',
      'sub',
      'summary',
      'sup',
      'table',
      'tbody',
      'td',
      'tfoot',
      'th',
      'thead',
      'tr',
      'u',
      'ul',
      'var',
    ],
    ALLOWED_ATTR: [
      'align',
      'alt',
      'class',
      'colspan',
      'height',
      'href',
      'open',
      'rowspan',
      'src',
      'start',
      'style',
      'title',
      'width',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
