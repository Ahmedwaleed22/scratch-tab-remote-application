import Button from '../components/Button.js';
import { useUpdates } from '../hooks/useUpdates.js';
import type { UpdatesBinding } from '../hooks/useUpdates.js';

export default function Updates({ binding }: { binding: UpdatesBinding }) {
  const { state, check, install } = useUpdates(binding);
  return (
    <section class="scratch-tab-updates">
      <strong>Scratch Tab updates</strong>
      <p role="status">{state.status}</p>
      <p>
        Administrator access required. Updates replace Scratch Tab in every project on this server.
        Save work in other tabs before updating.
      </p>
      <div>
        <Button disabled={state.busy || state.installed} onClick={check}>
          Check for updates
        </Button>
        <Button hidden={!state.available} disabled={state.busy} onClick={install}>
          {state.installed ? 'Refresh page' : 'Update'}
        </Button>
      </div>
    </section>
  );
}
