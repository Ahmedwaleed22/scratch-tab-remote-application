import type { JSX } from 'preact';
import { fileIconFor } from '../presenters/fileIcon.js';

export default function FileIcon({ name }: { name: string }): JSX.Element {
  const style = fileIconFor(name);
  if (!style)
    return (
      <svg class="scratch-tab-file-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 2h5l3 3v9H4zM9 2v3h3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linejoin="round"
          opacity="0.7"
        />
      </svg>
    );
  const text = (
    <text
      x="8"
      y="8.6"
      fill={style.color}
      font-size={style.label.length > 1 ? 6 : 8}
      font-weight="700"
      font-family="system-ui, sans-serif"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {style.label}
    </text>
  );
  return (
    <svg class="scratch-tab-file-icon" viewBox="0 0 16 16" aria-hidden="true">
      {style.shape === 'hexagon' ? (
        <path
          d="M8 1.2l5.9 3.4v6.8L8 14.8l-5.9-3.4V4.6z"
          fill="none"
          stroke={style.color}
          stroke-width="1.3"
          stroke-linejoin="round"
        />
      ) : (
        <rect x="1.5" y="2" width="13" height="12" rx="2.5" fill={style.color} opacity="0.16" />
      )}
      {text}
    </svg>
  );
}
