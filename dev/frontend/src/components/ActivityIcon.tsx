import type { JSX } from 'preact';

export type ActivityName = 'files' | 'git';
export default function ActivityIcon({ name }: { name: ActivityName }): JSX.Element {
  const paths: Record<ActivityName, string> = {
    files:
      'M9 3h6l5 5v12a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M14 3v6h6 M6 8H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2',
    git: 'M6 3v13 M8 18c8 0 10-5 10-11 M8 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M21 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  };
  return (
    <svg
      viewBox="0 0 26 26"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
