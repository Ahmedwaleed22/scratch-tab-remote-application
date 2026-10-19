import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false });
const renderImage = markdown.renderer.rules.image;

markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  const token = tokens[index];
  const href = environment.resolveUrl(token.attrGet('href'), false);
  token.attrSet('href', href ?? '#');
  if (href && !href.startsWith('#')) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return renderer.renderToken(tokens, index, options);
};

markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
  const token = tokens[index];
  const src = environment.resolveUrl(token.attrGet('src'), true);
  if (!src) return markdown.utils.escapeHtml(token.content);
  token.attrSet('src', src);
  token.attrSet('loading', 'lazy');
  token.attrSet('referrerpolicy', 'no-referrer');
  return renderImage(tokens, index, options, environment, renderer);
};

export function renderMarkdown(text, resolveUrl) {
  return markdown.render(text, { resolveUrl });
}
