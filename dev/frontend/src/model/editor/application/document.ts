export interface EditorSnapshot {
  canSave: boolean;
  dirty: boolean;
  editable: boolean;
  unsupported: boolean;
  /** The file could not be found and there is no text to show. */
  notFound: boolean;
  /** The file was deleted after loading; saving recreates it. */
  missing: boolean;
  revision: number;
  status: string;
  failed: boolean;
}
export type EditorChange = 'state' | 'text' | 'status' | 'error' | 'unsupported' | 'not-found';
