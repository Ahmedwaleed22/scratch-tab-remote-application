export interface FixtureModules {
  '/main.js': typeof import('../../src/index.js');
  '/app/chat.js': typeof import('../../src/app/chat.js');
  '/app/editor.js': typeof import('../../src/app/editor.js');
  '/app/updates.js': typeof import('../../src/app/updates.js');
  '/services/editorDocument.js': typeof import('../../src/services/editorDocument.js');
  '/services/releaseVersion.js': typeof import('../../src/services/releaseVersion.js');
  '/adapters/windowGeometry.js': typeof import('../../src/adapters/windowGeometry.js');
  'api/files.js': typeof import('../../src/api/files.js');
  'api/directories.js': typeof import('../../src/api/directories.js');
  'services/fileTree.js': typeof import('../../src/services/fileTree.js');
  'state/fileTree.js': typeof import('../../src/state/fileTree.js');
  'api/updates.js': typeof import('../../src/api/updates.js');
  'links.js': typeof import('../../src/links.js');
  'presenters/syntax.js': typeof import('../../src/presenters/syntax.js');
  'vendor/syntax.js': typeof import('../../src/vendor/syntax.js');
  'presenters/markdown.js': typeof import('../../src/presenters/markdown.js');
  'adapters/windowGeometry.js': typeof import('../../src/adapters/windowGeometry.js');
}

export interface BackendFixtureOptions {
  projectId: string;
  method?: string;
  signal?: AbortSignal;
  body: { path: string; content: string; revision: string; save?: boolean };
}
export type SlotMount = (
  host?: HTMLElement,
  context?: import('../../src/types.js').SlotContext,
) => void | (() => void);
export interface RemoteFixture {
  application?: Partial<import('../../src/types.js').Remote['application']>;
  slots?: Partial<import('../../src/types.js').Remote['slots']>;
  files?: import('../../src/types.js').Remote['files'];
  backend?: {
    call?(path: string, options: BackendFixtureOptions): Promise<unknown>;
    fetch?(path: string, options: BackendFixtureOptions): Promise<Response>;
  };
  ui?: {
    register(
      slot: string,
      mount: SlotMount,
      options?: { when(context: import('../../src/types.js').SlotContext): boolean },
    ): void | (() => void);
    addIconButton?: import('../../src/types.js').Remote['ui']['addIconButton'];
    openPopup?: import('../../src/types.js').Remote['ui']['openPopup'];
  };
}
declare global {
  type RemoteTestFixture = RemoteFixture;
  interface Window {
    createRemote(fixture: RemoteFixture): import('../../src/types.js').Remote;
    importModule<K extends keyof FixtureModules>(path: K): Promise<FixtureModules[K]>;
    defaultEditor: string | null;
    editorChanged: () => void;
    aborted: boolean;
    archiveName: string;
    bad: boolean;
    badDownload: boolean;
    cardCleanup: () => void;
    chatId: string;
    checks: number;
    chatCleanup: import('../../src/app/chat.js').ChatSession;
    cleanup: () => void;
    cleanupChat: () => void;
    closeFirst: () => void;
    closeSecond: () => void;
    comparisons: boolean[];
    completeSave: () => void;
    deferSave: boolean;
    deferred: boolean;
    denied: boolean;
    desktopCleanup: () => void;
    desktopResize: Promise<void>;
    disk: string;
    dispose: (() => void) | null | undefined;
    downloads: number;
    draftDuringDownload: boolean;
    drafts: import('../../src/types.js').Drafts;
    editor: import('../../src/port/editor/outbound/view.js').EditorWindowView;
    fail: boolean;
    failSave: boolean;
    finishCheck: () => void;
    finishDownload: () => void;
    finishRead: (content: string) => void;
    firstSignal: AbortSignal;
    folderOpens: number;
    iconOptions: Parameters<import('../../src/types.js').Remote['ui']['addIconButton']>[1];
    iconSlot: string;
    ideUrls: string[];
    lastCleanup: () => void;
    lastFilePath: string;
    lastProject: string | undefined;
    latest: string;
    mediaOpens: number;
    mobileCleanup: () => void;
    mount: () => void;
    mountChatActions: SlotMount;
    navigate: (chatId: string, projectId?: string) => void;
    nextCleanup: () => void;
    oldIntercepted: boolean | undefined;
    oldRowOpens: number;
    opened: Parameters<Window['open']>;
    openCount: number;
    fileContents: Record<string, string>;
    originalOpens: number;
    originals: Element[];
    ownerCleanup: () => void;
    partial: boolean;
    projects: (string | undefined)[];
    reads: number;
    reloads: number;
    remount: () => void;
    render: SlotMount;
    renderChat: SlotMount;
    revision: string;
    saved: string;
    savedPath: string;
    showFile: (extension: string, error?: string) => void;
    slots: string[];
    timers: Map<number, { fn: () => void | Promise<void>; ms: number | undefined }>;
    intervalIds: Set<number>;
    uploads: number;
    view: import('../../src/port/editor/outbound/view.js').EditorWindowView;
    writes: import('../../src/types.js').BackendOptions[];
    workspace: Record<string, string>;
    listings: string[];
    creates: string[];
  }
}
