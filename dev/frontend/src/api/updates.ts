import type { Remote } from '../types.js';
import type { Package, Release } from '../model/updates/api/releases.js';
import type { ReleaseSource } from '../port/updates/outbound/releases.js';
import { isJsonObject } from '../shared/json.js';

function isPackage(value: unknown): value is Package {
  if (
    !isJsonObject(value) ||
    typeof value.id !== 'string' ||
    (value.version !== undefined && typeof value.version !== 'string')
  )
    return false;
  if (value.upgraded === undefined) return true;
  if (!Array.isArray(value.upgraded)) return false;
  const outcomes: readonly unknown[] = value.upgraded;
  return outcomes.every(
    outcome =>
      isJsonObject(outcome) && (outcome.error === undefined || typeof outcome.error === 'string'),
  );
}

// Package mutations use Remote's authenticated admin API, never host credentials.
export function createUpdates(
  backend: Remote['backend'],
  projectId: string,
  signal: AbortSignal,
): ReleaseSource {
  async function request(url: string, options: RequestInit = {}): Promise<unknown> {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    if (!response.ok) {
      if (response.status === 403) throw new Error('Only administrators can update Scratch Tab.');
      throw new Error(
        `Remote returned HTTP ${response.status}. Check Applications before retrying.`,
      );
    }
    return response.json();
  }
  return {
    async latest(): Promise<Release> {
      const result = await backend.call<unknown>('updates', { projectId, signal });
      if (!isJsonObject(result) || typeof result.version !== 'string')
        throw new Error('Unexpected release response.');
      return { version: result.version };
    },
    async packages(): Promise<Package[]> {
      const result = await request('/api/applications/packages', { signal });
      if (!Array.isArray(result)) throw new Error('Unexpected package list response.');
      const packages: unknown[] = result;
      if (!packages.every(isPackage)) throw new Error('Unexpected package list response.');
      return packages;
    },
    async install(version: string, beforeUpload: () => void): Promise<Package> {
      const response = await backend.fetch('updates/archive', {
        projectId,
        method: 'POST',
        body: { version },
        signal,
      });
      if (!response.ok) {
        const error: unknown = await response.json();
        throw new Error(
          isJsonObject(error) && typeof error.error === 'string' && error.error
            ? error.error
            : 'Could not download the verified release ZIP.',
        );
      }
      const form = new FormData();
      form.append('package', await response.blob(), `scratch-tab-${version}.zip`);
      beforeUpload();
      // Once submitted, allow Remote to finish even if the update popup is closed.
      const result = await request('/api/applications/packages', { method: 'POST', body: form });
      if (!isPackage(result))
        throw new Error('Unexpected package response. Check Applications before refreshing.');
      return result;
    },
  };
}
