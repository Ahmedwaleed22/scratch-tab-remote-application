let nextId = 0;
let pending: Promise<string | void> = Promise.resolve();

// Mermaid has shared configuration and diagram state; serialize work across windows.
export function renderMermaid(source: string, dark: boolean): Promise<string> {
  const result = pending.then(async () => {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: dark ? 'dark' : 'default',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      maxTextSize: 50000,
      maxEdges: 500,
      secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering'],
    });
    const staging = document.createElement('div');
    staging.style.cssText = 'position:fixed;left:-100000px;top:0;width:1000px;visibility:hidden';
    document.body.append(staging);
    try {
      const { svg } = await mermaid.render(`scratch-mermaid-${++nextId}`, source, staging);
      return svg;
    } finally {
      staging.remove();
    }
  });
  pending = result.catch(() => {});
  return result;
}
