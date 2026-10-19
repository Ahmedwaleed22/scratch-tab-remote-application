import { createUpdates } from '../api/updates.js';

let installing = false;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function isNewer(version, current) {
  const parse = value =>
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.split('.').map(BigInt) : null;
  const next = parse(version),
    old = parse(current);
  if (!next || !old) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== old[i]) return next[i] > old[i];
  }
  return false;
}

export function mountUpdates(
  host,
  { remote, projectId, drafts, reload = () => location.reload() },
) {
  const lifetime = new AbortController();
  const api = createUpdates(remote.backend, projectId, lifetime.signal);
  const section = document.createElement('section');
  section.className = 'scratch-tab-updates';
  const title = document.createElement('strong');
  title.textContent = 'Scratch Tab updates';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const note = document.createElement('p');
  note.textContent =
    'Administrator access required. Updates replace Scratch Tab in every project on this server. Save work in other tabs before updating.';
  const actions = document.createElement('div');
  const check = document.createElement('button');
  check.type = 'button';
  check.textContent = 'Check for updates';
  const update = document.createElement('button');
  update.type = 'button';
  update.textContent = 'Update';
  update.hidden = true;
  actions.append(check, update);
  section.append(title, status, note, actions);
  host.append(section);
  let latest,
    busy = false,
    installed = false;
  function message(text) {
    if (!lifetime.signal.aborted) status.textContent = text;
  }
  function controls() {
    check.disabled = busy || installed;
    update.disabled = busy;
  }
  async function checkRelease() {
    if (busy || installed) return;
    busy = true;
    controls();
    message('Checking GitHub…');
    try {
      await api.packages(); // Hide release checks behind Remote's administrator permission.
      latest = await api.latest();
      update.hidden = !isNewer(latest.version, remote.application.version);
      message(
        update.hidden
          ? `Scratch Tab ${remote.application.version} is up to date.`
          : `Version ${latest.version} is available (installed: ${remote.application.version}).`,
      );
    } catch (error) {
      update.hidden = true;
      message(error.message);
    } finally {
      busy = false;
      controls();
    }
  }
  function refresh() {
    if (drafts.size) {
      message('Save or discard all Scratch Tab drafts in this tab before refreshing.');
      return;
    }
    reload();
  }
  async function install() {
    if (installed) {
      refresh();
      return;
    }
    if (busy || installing || !latest) return;
    if (drafts.size) {
      message('Save or discard all Scratch Tab drafts in this tab before updating.');
      return;
    }
    if (
      !confirm(
        `Update Scratch Tab to ${latest.version} in every project on this server? Save work in other tabs first. This page will refresh when ready.`,
      )
    )
      return;
    busy = installing = true;
    controls();
    message('Downloading and installing…');
    try {
      const packages = await api.packages();
      const current = packages.find(item => item.id === 'scratch-tab');
      if (!current || !isNewer(latest.version, current.version))
        throw new Error('The server package changed. Refresh Remote before updating.');
      if (drafts.size) throw new Error('Save or discard Scratch Tab drafts before updating.');
      const result = await api.install(latest.version, () => {
        if (lifetime.signal.aborted) throw new Error('Update cancelled before upload.');
        if (drafts.size)
          throw new Error(
            'A Scratch Tab draft was created during download. Save it before updating.',
          );
      });
      if (result.id !== 'scratch-tab' || result.version !== latest.version)
        throw new Error('Unexpected package response. Check Applications before refreshing.');
      installed = true;
      update.textContent = 'Refresh page';
      const failed = (result.upgraded || []).filter(item => item.error);
      if (failed.length) {
        message(
          `Package updated, but ${failed.length} project upgrade(s) failed. Open Applications to inspect errors and retry by starting the affected copy.`,
        );
      } else {
        message('Update installed. Refresh to load it.');
        if (!lifetime.signal.aborted) refresh();
      }
    } catch (error) {
      message(error.message);
    } finally {
      busy = installing = false;
      controls();
    }
  }
  check.addEventListener('click', () => void checkRelease(), { signal: lifetime.signal });
  update.addEventListener('click', () => void install(), { signal: lifetime.signal });
  void checkRelease();
  const interval = setInterval(() => void checkRelease(), CHECK_INTERVAL_MS);
  return () => {
    lifetime.abort();
    clearInterval(interval);
    section.remove();
  };
}

// Chat slots use the platform's icon sizing and own the notice's lifetime.
export function mountUpdateNotice({ remote, projectId, drafts, checks }) {
  const lifetime = new AbortController();
  const api = createUpdates(remote.backend, projectId, lifetime.signal);
  const intervalMs = 60 * 60 * 1000;
  let disposeButton,
    popup,
    busy = false;
  function show(version) {
    disposeButton?.();
    disposeButton = undefined;
    if (!isNewer(version, remote.application.version)) return;
    disposeButton = remote.ui.addIconButton(remote.slots.chatHeaderActions, {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/><circle cx="20" cy="4" r="3" fill="currentColor" stroke="none"/></svg>',
      label: `Scratch Tab update available: v${version}`,
      title: `Scratch Tab v${version} is available. Click to update.`,
      when: context => context.projectId === projectId && Boolean(context.chatId),
      onClick: () => {
        popup?.close();
        popup = remote.ui.openPopup({
          title: 'Scratch Tab updates',
          width: 420,
          mount: body => mountUpdates(body, { remote, projectId, drafts }),
        });
      },
    });
  }
  async function check() {
    if (busy || lifetime.signal.aborted) return;
    const cached = checks.get(projectId);
    if (cached && Date.now() - cached.checkedAt < intervalMs) {
      show(cached.version);
      return;
    }
    busy = true;
    try {
      await api.packages();
      const latest = await api.latest();
      if (lifetime.signal.aborted) return;
      checks.set(projectId, { version: latest.version, checkedAt: Date.now() });
      show(latest.version);
    } catch {
      // Background failures stay quiet; the app-card updater exposes retry errors.
      if (!lifetime.signal.aborted) {
        checks.delete(projectId);
        disposeButton?.();
        disposeButton = undefined;
      }
    } finally {
      busy = false;
    }
  }
  void check();
  const interval = setInterval(() => void check(), intervalMs);
  return () => {
    lifetime.abort();
    clearInterval(interval);
    disposeButton?.();
    popup?.close();
  };
}
