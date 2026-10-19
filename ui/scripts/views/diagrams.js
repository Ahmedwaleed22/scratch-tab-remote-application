let renderer;
let queue = Promise.resolve();
let sequence = 0;

// Mermaid has shared configuration; serialize renders across tabs and windows.
export function renderDiagrams(preview, current) {
  const blocks = [...preview.querySelectorAll('pre > code.language-mermaid')];
  if (!blocks.length) return;
  renderer ??= import('../vendor/mermaid.js').then(module => module.default);
  for (const block of blocks) {
    queue = queue.then(async () => {
      if (!current() || !block.isConnected) return;
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-100000px;top:0;width:1200px;visibility:hidden';
      document.body.append(host);
      try {
        const mermaid = await renderer;
        if (!current() || !block.isConnected) return;
        const color = getComputedStyle(preview)
          .color.match(/[\d.]+/g)
          ?.map(Number);
        const dark = color && color.slice(0, 3).reduce((sum, channel) => sum + channel, 0) > 420;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          theme: dark ? 'dark' : 'default',
          fontFamily: 'system-ui, sans-serif',
          flowchart: { htmlLabels: false },
          maxTextSize: 50000,
          maxEdges: 500,
        });
        const { svg } = await mermaid.render(
          `scratch-diagram-${++sequence}`,
          block.textContent,
          host,
        );
        if (!current() || !block.isConnected) return;
        const diagram = document.createElement('div');
        diagram.className = 'scratch-tab-diagram';
        diagram.setAttribute('role', 'img');
        diagram.setAttribute('aria-label', 'Mermaid diagram');
        diagram.tabIndex = 0;
        diagram.innerHTML = svg;
        const drawing = diagram.querySelector('svg');
        const width = drawing.viewBox.baseVal.width;
        drawing.style.maxWidth = 'none';
        drawing.style.width = `${Math.max(280, Math.min(width, 1600))}px`;
        drawing.style.height = 'auto';
        block.parentElement.replaceWith(diagram);
      } catch {
        if (current() && block.isConnected) {
          const message = document.createElement('p');
          message.className = 'scratch-tab-error';
          message.textContent = 'Unable to render Mermaid diagram. Check its source syntax.';
          block.parentElement.before(message);
        }
      } finally {
        host.remove();
      }
    });
  }
}
