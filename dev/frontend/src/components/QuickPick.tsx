import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import Button from './Button.js';

export interface QuickPickOption {
  value: string;
  label: string;
  detail?: string;
  separated?: boolean;
}

/** Filterable VS Code style quick pick anchored to a trigger button. */
export default function QuickPick({
  label,
  trigger,
  class: className,
  disabled,
  placement = 'above',
  placeholder,
  listLabel,
  options,
  selectedValue,
  empty = 'No matching items',
  stage,
  onOpen,
  onChoose,
}: {
  label: string;
  trigger: ComponentChildren;
  class?: string;
  disabled?: boolean;
  placement?: 'above' | 'below';
  placeholder: string;
  listLabel: string;
  options: QuickPickOption[];
  selectedValue?: string;
  empty?: string;
  /** Changing the stage resets the filter while keeping the picker open. */
  stage?: string;
  onOpen?(): void;
  /** Receives `close`; leave it uncalled to keep the picker open for another stage. */
  onChoose(value: string, close: () => void): void;
}): JSX.Element {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const filtered = options.filter(option =>
    `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const close = (): void => {
    setOpen(false);
    button.current?.focus();
  };
  const initial = (): number =>
    Math.max(
      0,
      options.findIndex(option => option.value === selectedValue),
    );
  useLayoutEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(initial());
    input.current?.focus();
  }, [open, stage]);
  useLayoutEffect(() => {
    if (!open) return;
    const panel = root.current?.closest<HTMLElement>('.scratch-tab-window');
    if (!panel) return;
    const resize = (): void => {
      if (menu.current) menu.current.style.maxHeight = `${Math.max(80, panel.clientHeight - 80)}px`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(panel);
    resize();
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useLayoutEffect(() => {
    if (open)
      menu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, selected]);
  return (
    <div class={`scratch-tab-quick-pick ${className ?? ''}`} ref={root}>
      <Button
        ref={button}
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        {trigger}
      </Button>
      {open && (
        <div
          class="scratch-tab-quick-pick-menu"
          ref={menu}
          data-placement={placement}
          role="dialog"
          aria-label={label}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected(
                (selected + (event.key === 'ArrowDown' ? 1 : filtered.length - 1)) %
                  Math.max(1, filtered.length),
              );
            }
            if (event.key === 'Enter' && event.target === input.current && filtered[selected]) {
              event.preventDefault();
              onChoose(filtered[selected]!.value, close);
            }
          }}
        >
          <input
            ref={input}
            value={query}
            onInput={event => {
              setQuery(event.currentTarget.value);
              setSelected(0);
            }}
            role="combobox"
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={filtered[selected] ? `${listId}-${selected}` : undefined}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          <div id={listId} role="listbox" aria-label={listLabel}>
            {filtered.map((option, i) => (
              <Button
                key={option.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selected}
                data-current={option.value === selectedValue || undefined}
                data-separated={(option.separated && !query) || undefined}
                onPointerMove={() => setSelected(i)}
                onClick={() => onChoose(option.value, close)}
              >
                <span>{option.label}</span>
                {option.detail && <small>{option.detail}</small>}
              </Button>
            ))}
            {!filtered.length && <p>{empty}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
