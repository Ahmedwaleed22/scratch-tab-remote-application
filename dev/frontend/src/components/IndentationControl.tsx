import { useState } from 'preact/hooks';
import type { EditorTools } from '../hooks/useEditorTools.js';
import QuickPick, { type QuickPickOption } from './QuickPick.js';
const actions: QuickPickOption[] = [
  { value: 'spaces', label: 'Indent Using Spaces' },
  { value: 'tabs', label: 'Indent Using Tabs' },
  { value: 'size', label: 'Change Tab Display Size' },
  { value: 'detect', label: 'Detect Indentation from Content', separated: true },
  { value: 'convert-spaces', label: 'Convert Indentation to Spaces' },
  { value: 'convert-tabs', label: 'Convert Indentation to Tabs' },
  { value: 'trim', label: 'Trim Trailing Whitespace' },
];
const sizes: QuickPickOption[] = Array.from({ length: 8 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));
export default function IndentationControl({
  tools,
  disabled,
}: {
  tools: EditorTools;
  disabled: boolean;
}) {
  const [stage, setStage] = useState<string | null>(null);
  return (
    <QuickPick
      class="scratch-tab-indentation"
      label="Indentation settings"
      disabled={disabled}
      trigger={
        <>
          {tools.indentation.spaces ? 'Spaces' : 'Tab Size'}: {tools.indentation.size}
        </>
      }
      placeholder={stage ? 'Select Tab Size' : 'Select Action'}
      listLabel={stage ? 'Tab sizes' : 'Indentation actions'}
      empty="No matching actions"
      options={stage ? sizes : actions}
      stage={stage ?? ''}
      onOpen={() => setStage(null)}
      onChoose={(value, close) => {
        if (stage) {
          tools.configure({
            size: Number(value),
            spaces: stage === 'size' ? tools.indentation.spaces : stage === 'spaces',
          });
          close();
          tools.focusEditor();
        } else if (['spaces', 'tabs', 'size'].includes(value)) {
          setStage(value);
        } else {
          close();
          tools.command(value);
          tools.focusEditor();
        }
      }}
    />
  );
}
