import type { JSX, ButtonHTMLAttributes } from 'preact';

export default function Button(props: ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return <button type="button" {...props} />;
}
