export interface FileIconStyle {
  /** Short glyph drawn inside the badge. */
  label: string;
  color: string;
  /** Node package files use the hexagon badge. */
  shape: 'badge' | 'hexagon';
}
