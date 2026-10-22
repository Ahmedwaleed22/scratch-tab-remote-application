export interface SlotContext {
  projectId?: string;
  chatId?: string;
  cwd?: string;
  instance?: { applicationId: string };
}
export type ChatContext = SlotContext & { projectId: string; chatId: string };
export interface Popup {
  close(): void;
}
export interface BackendOptions {
  projectId: string;
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}
// The subset of Remote's extension API consumed by Scratch Tab.
export interface Remote {
  application: { id: string; version: string };
  slots: {
    applicationCardActions: string;
    sidebarHeaderActions: string;
    chatHeaderActions: string;
  };
  files?: {
    registerOpener(
      open: (request: {
        projectId?: string;
        cwd: string;
        path: string;
        line?: number;
        column?: number;
      }) => string | null,
    ): () => void;
  };
  backend: {
    call<T>(path: string, options: BackendOptions): Promise<T>;
    fetch(path: string, options: BackendOptions): Promise<Response>;
  };
  ui: {
    register(
      slot: string,
      mount: (host: HTMLElement, context: SlotContext) => void | (() => void),
      options?: { when(context: SlotContext): boolean },
    ): () => void;
    openPopup(options: {
      title: string;
      width: number;
      mount(body: HTMLElement): () => void;
    }): Popup;
    addIconButton(
      slot: string,
      options: {
        icon: string;
        label: string;
        title: string;
        when(context: SlotContext): boolean;
        onClick(): void;
      },
    ): () => void;
  };
}
export interface FileTarget {
  hasDefaultEditor?: boolean;
  line?: number;
  column?: number;
  path: string;
  name: string;
  ide: string;
  download: string;
}
export interface FileRead {
  content: string;
  revision: string;
}
export interface FileSaved {
  revision: string;
}
export interface Files {
  read(path: string): Promise<FileRead>;
  save(path: string, content: string, revision: string, create?: boolean): Promise<FileSaved>;
}
export interface Draft extends FileRead {
  baseline: string;
  crlf: boolean;
}
export type Drafts = Map<string, Draft>;
export interface Tab {
  path: string;
  name: string;
  dirty: boolean;
  select(): void;
  close(): void;
}
