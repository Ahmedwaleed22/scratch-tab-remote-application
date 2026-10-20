import type { Release, Package } from '../../../model/updates/api/releases.js';

export interface ReleaseSource {
  latest(): Promise<Release>;
  packages(): Promise<Package[]>;
  install(version: string, beforeUpload: () => void): Promise<Package>;
}
