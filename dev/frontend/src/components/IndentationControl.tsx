import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { EditorTools } from '../hooks/useEditorTools.js';
import Button from './Button.js';
const actions = [
  ['spaces', 'Indent Using Spaces'],
  ['tabs', 'Indent Using Tabs'],
  ['size', 'Change Tab Display Size'],
  ['detect', 'Detect Indentation from Content'],
  ['convert-spaces', 'Convert Indentation to Spaces'],
  ['convert-tabs', 'Convert Indentation to Tabs'],
  ['trim', 'Trim Trailing Whitespace'],
];
export default function IndentationControl({
  tools,
  disabled,
}: {
  tools: EditorTools;
  disabled: boolean;
}) {
  const listId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = stage
    ? Array.from({ length: 8 }, (_, i) => [String(i + 1), String(i + 1)])
    : actions;
  const filtered = options.filter(([, label]) =>
    label!.toLowerCase().includes(query.toLowerCase()),
  );
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(value: string) {
    if (stage) {
      tools.configure({
        size: Number(value),
        spaces: stage === 'size' ? tools.indentation.spaces : stage === 'spaces',
      });
      close();
      tools.focusEditor();
    } else if (['spaces', 'tabs', 'size'].includes(value)) {
      setStage(value);
      setQuery('');
      setSelected(0);
    } else {
      close();
      tools.command(value);
      tools.focusEditor();
    }
  }
  useLayoutEffect(() => {
    if (open) input.current?.focus();
  }, [open, stage]);
  useLayoutEffect(() => {
    if (!open) return;
    const panel = root.current?.closest<HTMLElement>('.scratch-tab-window');
    if (!panel) return;
    const resize = () => {
      if (menu.current) menu.current.style.maxHeight = `${Math.max(80, panel.clientHeight - 80)}px`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(panel);
    resize();
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div class="scratch-tab-indentation" ref={root}>
      <Button
        ref={trigger}
        disabled={disabled}
        aria-label="Indentation settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setStage(null);
          setQuery('');
          setSelected(0);
          setOpen(!open);
        }}
      >
        {tools.indentation.spaces ? 'Spaces' : 'Tab Size'}: {tools.indentation.size}
      </Button>
      {open && (
        <div
          class="scratch-tab-indent-menu"
          ref={menu}
          data-mode={stage ? 'size' : 'actions'}
          role="dialog"
          aria-label="Indentation settings"
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
              choose(filtered[selected]![0]!);
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
            placeholder={stage ? 'Select Tab Size' : 'Select Action'}
            aria-label={stage ? 'Select Tab Size' : 'Select Action'}
          />
          <div id={listId} role="listbox" aria-label={stage ? 'Tab sizes' : 'Indentation actions'}>
            {filtered.map(([value, label], i) => (
              <Button
                key={value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selected}
                onPointerMove={() => setSelected(i)}
                onClick={() => choose(value!)}
              >
                {label}
              </Button>
            ))}
            {!filtered.length && <p>No matching actions</p>}
          </div>
        </div>
      )}
    </div>
  );
}
