import type { Drafts, Files, FileRead } from '../types.js';

export type SaveCommand =
  | { kind: 'idle' }
  | { kind: 'too-large' }
  | { kind: 'save'; snapshot: string; content: string; revision: string; create: boolean };
import { MAX_FILE_BYTES } from '../config/editor.js';

// Owns document revisions and drafts; it has no browser or Remote dependencies.
export class EditorDocument {
  #path: string;
  #draftKey: string;
  #drafts: Drafts;
  #files: Files;
  #text = '';
  #baseline = '';
  #revision = '';
  #loaded = false;
  #saving = false;
  #crlf = false;
  #missing = false;

  constructor(path: string, draftKey: string, drafts: Drafts, files: Files) {
    this.#path = path;
    this.#draftKey = draftKey;
    this.#drafts = drafts;
    this.#files = files;
  }

  get text(): string {
    return this.#text;
  }
  get dirty(): boolean {
    return this.#loaded && this.#text !== this.#baseline;
  }
  get missing(): boolean {
    return this.#missing;
  }
  // A deleted file stays savable so its last text can be written back.
  get canSave(): boolean {
    return this.#loaded && !this.#saving && (this.dirty || this.#missing);
  }

  read(): Promise<FileRead> {
    return this.#files.read(this.#path);
  }

  load(result: FileRead, normalizedText: string): boolean {
    this.#crlf = result.content.includes('\r\n');
    this.#text = this.#baseline = normalizedText;
    this.#revision = result.revision;
    const draft = this.#drafts.get(this.#draftKey);
    if (draft) {
      this.#text = draft.content;
      this.#baseline = draft.baseline;
      this.#revision = draft.revision;
      this.#crlf = draft.crlf;
    }
    this.#loaded = true;
    this.#missing = false;
    return Boolean(draft);
  }

  // A remembered draft outlives its file; load it so the edits can recreate the file.
  loadMissing(): boolean {
    const draft = this.#drafts.get(this.#draftKey);
    if (!draft) return false;
    this.#text = draft.content;
    this.#baseline = draft.baseline;
    this.#revision = draft.revision;
    this.#crlf = draft.crlf;
    this.#loaded = true;
    this.#missing = true;
    return true;
  }

  markMissing(): void {
    this.#missing = true;
  }

  edit(text: string): void {
    this.#text = text;
  }

  remember(): void {
    if (!this.#loaded) return;
    if (this.dirty) {
      this.#drafts.set(this.#draftKey, {
        content: this.#text,
        baseline: this.#baseline,
        revision: this.#revision,
        crlf: this.#crlf,
      });
    } else this.discardDraft();
  }

  discardDraft(): void {
    this.#drafts.delete(this.#draftKey);
  }

  beginSave(): SaveCommand {
    if (!this.canSave) return { kind: 'idle' };
    const snapshot = this.#text;
    const content = this.#crlf ? snapshot.replace(/\n/g, '\r\n') : snapshot;
    if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) return { kind: 'too-large' };
    this.#saving = true;
    return { kind: 'save', snapshot, content, revision: this.#revision, create: this.#missing };
  }

  async commitSave(command: Extract<SaveCommand, { kind: 'save' }>): Promise<void> {
    const result = await this.#files.save(
      this.#path,
      command.content,
      command.revision,
      command.create,
    );
    this.#revision = result.revision;
    if (command.create) this.#missing = false;
    this.#baseline = command.snapshot;
    this.remember();
  }

  finishSave(): void {
    this.#saving = false;
  }
}
