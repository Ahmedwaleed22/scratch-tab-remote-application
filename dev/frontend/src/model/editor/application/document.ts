export interface EditorSnapshot {
  canSave: boolean;
  dirty: boolean;
  editable: boolean;
  unsupported: boolean;
  revision: number;
  status: string;
  failed: boolean;
}
export type EditorChange = 'state' | 'text' | 'status' | 'error' | 'unsupported';
