import type { JSX } from 'preact';

const paths = {
  'chevron-down': 'M4 6l4 4 4-4',
  'chevron-right': 'M6 4l4 4-4 4',
  repo: 'M4.5 2h8v9.5h-8a1.5 1.5 0 0 0 0 3h8 M3 13V3.5A1.5 1.5 0 0 1 4.5 2 M6 2v9.5',
  branch:
    'M5 5.5v5 M11 6.5c0 2.5-6 1.5-6 4 M6.5 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z M6.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z M12.5 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  sync: 'M13 7.5A5 5 0 0 0 4 5 M3 8.5A5 5 0 0 0 12 11 M4 2v3h3 M12 14v-3H9',
  check: 'M3 8.5l3 3 7-7',
  refresh: 'M13 8a5 5 0 1 1-1.6-3.7 M13 2v3h-3',
  publish:
    'M5 12H4.5a3 3 0 0 1-.3-6A4 4 0 0 1 12 6.5 2.75 2.75 0 0 1 11.5 12H11 M8 14V8.5 M6 10.5l2-2 2 2',
  more: 'M3.5 8h.01 M8 8h.01 M12.5 8h.01',
  plus: 'M8 3v10 M3 8h10',
  minus: 'M3 8h10',
  close: 'M4 4l8 8 M12 4l-8 8',
  file: 'M4 1.5h5.5l3 3v10h-8.5Z M9.5 1.5v3h3',
  cloud: 'M5 12.5H4.5a3 3 0 0 1-.3-6A4 4 0 0 1 12 7a2.75 2.75 0 0 1-.5 5.5Z',
  tag: 'M2.5 2.5h5l6 6-5 5-6-6Z M5.5 5.5h.01',
  target: 'M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0Z M9.5 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  'collapse-all': 'M5.5 5.5h8v8h-8Z M3 11V3h8 M7.5 9.5h4',
} as const;

export type GitIconName = keyof typeof paths;
export default function GitIcon({ name }: { name: GitIconName }): JSX.Element {
  return (
    <svg
      class="scratch-tab-git-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width={name === 'more' ? 2.2 : 1.2}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
