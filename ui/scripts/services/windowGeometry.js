// Store layout only, never document content. Storage may be disabled by the browser.
export function windowGeometry(projectId) {
  const key = `scratch-tab:window-geometry:${projectId}`;
  return {
    read() {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (
          !value ||
          !['left', 'top', 'width', 'height'].every(name => Number.isFinite(value[name]))
        )
          return null;
        if (value.width < 280 || value.height < 180) return null;
        return Object.fromEntries(
          Object.entries(value)
            .filter(([name]) => ['left', 'top', 'width', 'height'].includes(name))
            .map(([name, number]) => [name, `${number}px`]),
        );
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Editing remains available when storage is full or blocked.
      }
    },
  };
}
