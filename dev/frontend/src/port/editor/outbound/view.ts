import type { Tab } from '../../../types.js';
import type { EditorWindowGeometry } from '../../../model/editor/application/window.js';

export interface EditorWindowView {
  readonly geometry: EditorWindowGeometry;
  close(force?: boolean, confirmed?: boolean): void;
  restore(): void;
  focus(): void;
  setTabs(entries: Tab[], activePath: string | null): void;
  focusTab(): void;
  setVisible(visible: boolean): void;
  copyGeometry(other: { readonly geometry: EditorWindowGeometry }): void;
  offset(): void;
  refreshLinks(): void;
}
