export function createFileTabs({ button, onSeparate }) {
  const tabBar = document.createElement('div');
  tabBar.className = 'scratch-tab-tabbar';
  tabBar.hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'scratch-tab-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Open files');
  tabBar.append(tabs);
  const separate = button('Separate window', () => onSeparate?.(), tabBar);
  separate.className = 'scratch-tab-separate';
  return {
    element: tabBar,
    setTabs(entries, activePath) {
      tabBar.hidden = false;
      separate.disabled = entries.length < 2;
      const focused = tabs.contains(document.activeElement)
        ? {
            path: document.activeElement.dataset.path,
            close: document.activeElement.classList.contains('scratch-tab-tab-close'),
          }
        : null;
      const scroll = tabs.scrollLeft;
      tabs.replaceChildren();
      for (const [index, entry] of entries.entries()) {
        const entryHost = document.createElement('div');
        entryHost.className = 'scratch-tab-tab';
        entryHost.setAttribute('role', 'presentation');
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.textContent = `${entry.dirty ? '● ' : ''}${entry.name}`;
        tab.title = entry.path;
        tab.dataset.path = entry.path;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(entry.path === activePath));
        tab.tabIndex = entry.path === activePath ? 0 : -1;
        tab.addEventListener('click', entry.select);
        tab.addEventListener('keydown', event => {
          const next =
            event.key === 'ArrowRight'
              ? (index + 1) % entries.length
              : event.key === 'ArrowLeft'
                ? (index + entries.length - 1) % entries.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? entries.length - 1
                    : null;
          if (next === null) return;
          event.preventDefault();
          entries[next].select();
        });
        entryHost.append(tab);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'scratch-tab-tab-close';
        close.textContent = '×';
        close.dataset.path = entry.path;
        close.setAttribute('aria-label', `Close tab ${entry.name}`);
        close.title = `Close tab ${entry.name}`;
        close.addEventListener('click', entry.close);
        entryHost.append(close);
        tabs.append(entryHost);
      }
      tabs.scrollLeft = scroll;
      if (focused)
        [...tabs.querySelectorAll('button')]
          .find(
            tab =>
              tab.dataset.path === focused.path &&
              tab.classList.contains('scratch-tab-tab-close') === focused.close,
          )
          ?.focus({ preventScroll: true });
    },
    focusTab() {
      const selected = tabs.querySelector('[aria-selected="true"]');
      selected?.focus({ preventScroll: true });
      selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
  };
}
