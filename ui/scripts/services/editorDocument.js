import { MAX_FILE_BYTES } from '../config/editor.js';

// Owns document revisions and drafts; it has no browser or Remote dependencies.
export class EditorDocument {
  #path;
  #draftKey;
  #drafts;
  #files;
  #text = '';
  #baseline = '';
  #revision = '';
  #loaded = false;
  #saving = false;
  #crlf = false;

  constructor(path, draftKey, drafts, files) {
    this.#path = path;
    this.#draftKey = draftKey;
    this.#drafts = drafts;
    this.#files = files;
  }

  get text() { return this.#text; }
  get dirty() { return this.#loaded && this.#text !== this.#baseline; }
  get canSave() { return this.#loaded && !this.#saving && this.dirty; }

  read() { return this.#files.read(this.#path); }

  load(result, normalizedText) {
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
    return Boolean(draft);
  }

  edit(text) { this.#text = text; }

  remember() {
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

  discardDraft() { this.#drafts.delete(this.#draftKey); }

  beginSave() {
    if (!this.canSave) return { kind: 'idle' };
    const snapshot = this.#text;
    const content = this.#crlf ? snapshot.replace(/\n/g, '\r\n') : snapshot;
    if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) return { kind: 'too-large' };
    this.#saving = true;
    return { kind: 'save', snapshot, content, revision: this.#revision };
  }

  async commitSave(command) {
    const result = await this.#files.save(this.#path, command.content, command.revision);
    this.#revision = result.revision;
    this.#baseline = command.snapshot;
    this.remember();
  }

  finishSave() { this.#saving = false; }
}
