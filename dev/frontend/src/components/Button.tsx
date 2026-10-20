import type { ButtonHTMLAttributes } from 'preact';

export default function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}
