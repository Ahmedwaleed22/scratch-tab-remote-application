# Scratch Tab maintenance

This document is for the plugin owner. The README is for people installing and using Scratch Tab.

## Architecture

The browser, host backend, and container command are independently built deployment units. They meet through the existing `POST file` JSON request/response contract; this refactor does not change that contract, the interface, or save behavior.

### Browser extension

- `dev/frontend/src/index.tsx` exports the Remote activation entry from `dev/frontend/src/App.tsx`.
- `dev/frontend/src/App.tsx` composes Remote slots, the project-scoped API, draft lifetime, and chat session. Desktop and mobile toolbar slots are mounted together, so their owners share one project update notice and global icon registration. Releasing one slot keeps the notice alive until the last owner leaves; stale project cleanup cannot dispose the current notice.
- `dev/frontend/src/app/chat.ts` owns the window collection, stacking order, direct file opening, tab groups, and current project composition.
- `dev/frontend/src/pages/Editor.tsx` calls `useEditorWindow`, which composes `useEditor`, and renders `dev/frontend/src/components/EditorWindow.tsx`. `dev/frontend/src/pages/Updates.tsx` calls `useUpdates`. Components reach file and update workflows through custom hooks, then services, then APIs.
- `dev/frontend/src/hooks/useEditor.ts` starts reading on mount, subscribes to document feedback, exposes edit/save/close actions, updates the uncontrolled textarea only after a load, and owns browser-leave handling. It unsubscribes on unmount. Window/tab changes keep that hook mounted and do not reread the file.
- `dev/frontend/src/hooks/useEditorWindow.ts` owns DOM refs, layout binding, focus, preview state and the narrow imperative window handle used by chat composition. `dev/frontend/src/hooks/useSyntaxHighlight.ts` owns painting, resize observation and scroll synchronization. Hook cleanup releases observers, animation frames and subscriptions.
- `dev/frontend/src/hooks/useUpdates.ts` owns popup subscriptions and polling; `dev/frontend/src/hooks/useUpdateNotice.ts` owns background polling. They invoke injected services and clear timers on unmount.
- `dev/frontend/src/services/editorSession.ts` owns read/save workflows, unsupported-file decisions, draft restoration and close policy. `dev/frontend/src/services/editorDocument.ts` remains the sole owner of document text, revisions, CRLF handling and save transitions. Both are independent of Preact and the DOM.
- `dev/frontend/src/state/editor.ts` owns document feedback and derives dirty/save state from the document model. `dev/frontend/src/state/updates.ts` owns updater snapshots and installation ownership. Hooks subscribe without mirroring these values into another state owner.
- `dev/frontend/src/services/updates.ts` owns release checks, draft protection, installation sequencing and refresh decisions through injected dependencies. `dev/frontend/src/services/updateNotice.ts` owns background release eligibility and cache policy.
- `dev/frontend/src/app/editor.tsx`, `dev/frontend/src/app/updates.tsx` and `dev/frontend/src/app/updateNotice.tsx` construct services, state and APIs and mount their components. They own the Remote contribution and root lifetime, while hooks own component effects.
- Supported file-open intent goes directly to Scratch Tab. `dev/frontend/src/links.ts` and `dev/frontend/src/adapters/fileOpenings.ts` parse and capture file-open intent.
- `dev/frontend/src/api/` owns the file and update request shapes; Remote supplies the backend transport. `dev/frontend/src/presenters/windowLayout.ts` retains layout mechanics and `dev/frontend/src/adapters/windowGeometry.ts` persists project geometry.
- `dev/frontend/src/config/` owns public limits, catalogs, layout values and polling intervals. `dev/frontend/src/types.ts` retains the consumed Remote API and existing file contracts. View snapshots and update DTOs live under `dev/frontend/src/model/`; service dependencies and the imperative window capability live under `dev/frontend/src/port/`.

All handwritten browser code and the build script use TypeScript. Preact owns rendered DOM. The main flow is `component → custom hook → service → API`; composition constructs dependencies and components never call APIs directly. The textarea is uncontrolled and stays mounted during state updates and Markdown toggles to preserve native undo, selection and scroll. Geometry uses DOM refs because it measures and moves actual windows. Each Preact root is unmounted on disposal; syntax effects cancel animation frames and disconnect observers.

Draft memory remains module-scoped, as before, so switching chats or stopping the extension can retain drafts until the browser reloads. Reads are still allowed to finish after closing a window; the document service suppresses their results after cancellation. Save requests already in flight still finish. These behaviors are deliberately preserved rather than changed during a refactor.

### Host backend

`backend/main.go` wires the Remote API adapter to `clients/container.go`. The API owns caller/scope/route checks, request deadlines and response mapping. The client owns LXD lookup, arguments and stdin/stdout. The instance's container name is the only execution target; browser input never chooses a container or shell command. Host request limits and deadlines live in `backend/config/`.

### Container command

The files remain in one root Go package, which Remote installs as `/usr/local/bin/scratch-tab`:

- `main.go`: process composition.
- `command.go`: command lock and JSON stdin/stdout transport.
- `protocol.go`: existing request/response DTOs.
- `workspace.go`: path/content validation, revision policy, and public result mapping.
- `storage.go`: rooted reads, file metadata, temporary writes, revision recheck, and directory-relative rename.
- `config.go`: container limits and fixed runtime paths.

The container command supports Go 1.24.7 and later. Keep its Linux `renameat` operation: `os.Root.Rename` is unavailable in Remote's Go 1.24.7 installer.

## Checks

```sh
npm ci
npm run format:check
npm run typecheck
npm run build
npx playwright install chromium
npm run test:frontend
GO111MODULE=off go test ./backend/container
GO111MODULE=off go vet ./backend/container
npm run test:infra
python3 -B backend/tests/test_host_backend.py --remote-root /path/to/remote.futrx
```

Tests follow their deployment unit: `dev/frontend/tests/*.test.mjs` contains one frontend scenario per file, `backend/` contains Go tests and `backend/tests/test_host_backend.py`, and root `tests/test_*.py` contains one packaging check per file. Run `npm test` at the app root for type checking and all local suites, or `npm test` inside `dev/frontend` for frontend tests alone. The frontend package reuses dependencies installed by root `npm ci`. Use `npm run test:backend` and `npm run test:infra` for the other local suites. The host integration harness separately requires a Remote checkout. Historical v0.6.0/v0.6.1 publishing workflows pin their legacy harness because those tags predate this test layout.

Run `npm ci` after cloning to install the shared Git hooks, then `npx playwright install chromium` for browser tests. The pre-commit hook formats staged TypeScript, CSS and test files, then runs `npm test` (type checking, production build, frontend tests, container tests and packaging tests). This keeps formatting inside the original signed commit, including when staging only part of a file.

The Prettier workflow runs on every push and pull request: it formats the checkout and fails if that creates a diff. It has read-only repository permissions and never commits or pushes, so it cannot put local branches behind or create formatting-only merge conflicts. Fix failures locally with `npm run format` and include them in the next commit. Changes made by other people still require the usual fetch and merge/rebase.

Use `npm run format` to format handwritten TypeScript, CSS, build scripts, and browser tests. `npm run format:check` verifies the same files locally and in CI. Generated JavaScript in `dist/` and temporary browser-test modules in `.test-build/` are excluded from formatting.

Public frontend constants and functions declare their types explicitly. Syntax languages and window bounds have shared models; layout persistence and updater workflows expose named contracts. Strict TypeScript includes `noUncheckedIndexedAccess`, and `infra/frontend-types.ts` checks that public contracts retain their exact types. JSON enters adapters as `unknown` and is narrowed before use; API adapters reject malformed responses while accepting Remote packages without a version.

`infra/build.ts` uses esbuild to bundle `dev/frontend/src/index.tsx`, Preact, Highlight.js, Markdown-it and Mermaid into `dist/main.js`. No runtime CDN or bare package imports are needed. It also collects third-party notices in `dev/frontend/ui/licenses/THIRD-PARTY.txt`, including Preact's MIT license and Highlight.js's BSD license. `npm run typecheck` uses strict TypeScript without emitting files. Node.js 22.18 or later runs the build script with type stripping; esbuild compiles TSX with `jsxImportSource: preact`. Markdown-it ships its own types.

`dev/frontend/src/config/syntax.ts` owns the extension catalog and line-length limit. `dev/frontend/src/presenters/syntax.ts` owns language detection and literal-text fallback. `dev/frontend/src/components/SyntaxSurface.tsx` renders the paint layer; `dev/frontend/src/hooks/useSyntaxHighlight.ts` paints behind the native textarea and synchronizes scroll and size. Plain-text files use the textarea directly.

Set `PLAYWRIGHT_BROWSERS_PATH` when using an existing Chromium cache. The browser fixture exercises links, file-manager click/keyboard activation, direct opening and the default editor action, text editing, save errors, in-flight edits, CRLF, drafts, close protection and disposal. Activation scenarios serve the actual `dist/main.js` production bundle. Component scenarios compile TypeScript entry points into a temporary shared module graph under `dev/frontend/.test-build/`, removed after testing. Remote and LXD are replaced at their boundaries. The backend script validates the catalog, compiles through Remote's generated-module builder, and tests/vets the host packages using the checkout's required Go version.

CI runs container tests, vet and an installer-style build on Go 1.24.7 and 1.25, then browser/package checks. Live installation, actual LXD execution, project membership enforcement, and theme integration still need a Remote server.

## Release ownership

Only the owner manages versions and publishes packages. Set `application.json` to the intended version, run the checks, commit, and push a matching `vX.Y.Z` tag after its commit reaches main. The workflow builds a runtime-only ZIP and attaches it to a GitHub Release. Main-branch pushes run checks without publishing. A manual workflow dispatch accepts an existing tag for retries.

```sh
npm run build
python3 -B infra/package.py --tag v0.6.4 --output-dir /tmp/scratch-tab-package
```

The packager maps `dist/main.js` to `ui/scripts/main.js` (the manifest entry) and includes runtime Go/CSS, README, licenses and README screenshots. It rejects packaging without a built JavaScript bundle and excludes TypeScript sources. It excludes tests, maintainer documentation, Git metadata, local artifacts and credentials. Package tests check that module imports and README images exist inside the ZIP. Source archives and this maintainer guide remain available in the repository.

## Existing integration constraints

- The chat-header slot owns listeners but renders no launcher. Same-project context changes rebind its capture handlers without closing windows. Leaving the chat scope suspends the windows and unregisters handlers; sidebar scope removal disposes the session.
- Supported links include active-chat `ide-open`, `code--<project>.<Remote host>` file links, and legacy Code Server payload links. The active chat cwd supplies the project slug for isolation.
- File-manager integration depends on `#workspace-files-pane` rows with `role="button"` and a file download anchor. The Open with default editor action replays the original row action under the adapter's recursion guard. Other projects, media, archives, folders, download controls and modified clicks are excluded.
- Other editors do not share Scratch Tab's lock. A change between the final revision check and rename is still possible. The refactor preserves that existing limitation.
- Saves preserve ownership and Unix permission bits, but replace the inode and do not retain ACLs, extended attributes or hard-link relationships. No backups or persistent undo history are added.
- Upgrading an old UI-only 0.1.0 instance may require uninstalling and reinstalling in its project to attach the project container. Workspace files are retained.
- Uninstall removes the UI/backend but leaves the inert file command in the shared project container until replacement or container rebuild.

## v0.3.0 refactor record

| Original smell (v0.2.5) | Principle | Resulting owner |
| --- | --- | --- |
| `ui/scripts/main.js:57` mixed DOM rendering, drafts and RPC saves | One owner per responsibility; presentation depends on intent callbacks | `views/editorWindow.js`, `presenters/editor.js`, `services/editorDocument.js`, and `api/files.js` |
| `ui/scripts/main.js:150` combined event capture and chooser construction | Separate host adaptation from rendering | `adapters/fileOpenings.js` and `views/chooser.js` |
| `backend/api/api.go:23` launched LXD inside the inbound API package | Keep infrastructure behind the existing injected runner contract | `backend/clients/container.go`, composed in `backend/main.go` |
| `backend/container/main.go:31` mixed JSON transport, validation and disk replacement | Separate delivery mapping, command policy and persistence mechanics | `command.go`, `workspace.go`, and `storage.go` |
| The package script listed individual runtime source files | Packaging follows the deployment unit, not its current internal layout | Runtime source discovery plus checks for missing module imports and README images |

Behavior was preserved using the existing browser scenario, focused CRLF/in-flight-save characterization, worker tests and vet, host API tests and vet, and Remote's generated-module builder. A before/after executable comparison also matched stdout, stderr and resulting file bytes across 12 read/save/error cases. The chooser and editor screenshots were byte-identical to the pre-refactor dark-theme fixture captures. A 320 px browser run passed too.

The work was split into independently checked commits:

| Commit | Structural checkpoint | Verification before commit |
| --- | --- | --- |
| `6631beb` | Separate link capture and chooser presentation from extension composition | Browser and package tests |
| `d2363f9` | Characterize newline handling and edits made during an in-flight save | Browser tests against the pre-extraction document code |
| `fe712d8` | Give document state and editor presentation independent owners | Browser and package tests |
| `a11f209` | Separate host API handling from LXD command execution | Generated-module builder; host tests and vet |
| `f4657b6` | Separate container command transport, file policy, and rooted storage | Worker tests, vet, installer-style build and 12-case executable comparison |

Deliberately excluded: feature additions, visual changes, fixes to the existing save-race window, persistent drafts, new opener APIs, Remote core changes, and live installation/deployment. The Go-version adjustment belongs only to the verification harness; runtime requirements and behavior are unchanged.

## GitHub updater

The installed Scratch Tab card owns an Updates button that opens the updater popup; closing the popup or disposing the card aborts pending checks/downloads and clears its six-hour timer. The host caches valid release metadata for one hour per instance. It does not poll while the popup is closed or run unattended installations. This feature requires one manual installation before it can update future releases.

Only Remote-resolved administrator callers can access `GET updates` or `POST updates/archive`. Downloads use the fixed public repository and stable `vX.Y.Z` tags, exact versioned ZIP names, bounded HTTPS redirects, a 2 MiB archive cap, GitHub's SHA-256 asset digest, and a matching root `application.json`. This verifies integrity against GitHub metadata, not an independent publisher signature. Larger or digest-less releases require a manual upload.

The browser checks administrator access and the current package version, downloads through its project backend, then sends multipart `package` to Remote's existing package API. Remote remains responsible for validation, package storage, backend replacement, and per-project upgrades. The backend never writes its own installed files or receives administrator cookies. An upload already submitted is allowed to finish if the popup closes. A network failure during upload may leave a completed server update; the UI asks users to inspect Applications before retrying.

The drafts map blocks installation before and after download and blocks refresh if edits appear during upload. Other tabs and other projects' editors cannot be inspected; the confirmation explicitly asks users to save them. Partial upgrades keep their errors visible and offer a manual refresh. Concurrent administrators can still race package uploads because Remote has no conditional replacement API. No core code changes or automatic rollback are included.

Validation includes host release/ZIP tests, non-admin route denial, browser version comparison, draft blocking, download errors, multipart upload, partial failures, successful refresh, and slot disposal. A focused browser characterization verifies that installation ownership is shared across popups and that a cancelled download releases ownership without uploading; it passes against both the pre-refactor and refactored implementations. Live package installation remains a server integration check.

## Tabbed windows

`dev/frontend/src/App.tsx` keeps a single active project session across keyed chat remounts. The persistent sidebar-header slot owns final cleanup, without rendering a launcher. Chat-slot cleanup suspends link capture, hides the windows. The next chat render resumes the windows only for the same project; a different project disposes them. Sidebar scope removal (including stopping the extension) disposes the session. Context rebinding updates download/IDE links and removes callbacks to the old file-manager DOM. File reads, saves, tab membership and geometry stay intact.

New files join the active window's tab group. `dev/frontend/src/app/chat.ts` owns group membership, active-file selection, and splitting a tab into its own window. Each file retains its existing document model, service and mounted hook, so switching or separating files does not read them again, reset their revisions, or discard edits. Reopening the same path selects its existing tab. Closing the active file selects a remaining tab; dirty closes still require confirmation. Project-session disposal remembers all drafts and closes all groups.

`dev/frontend/src/components/EditorWindow.tsx` and `dev/frontend/src/components/FileTabs.tsx` render the tab strip, selected state, keyboard navigation and Separate window action. Inactive file panels are hidden; selected files inherit their group's current geometry. Separate windows can move and resize independently on desktop. On phones, each window still fits the visual viewport. Window groups and positions remain in memory across same-project chat changes, but are not restored after leaving the project or refreshing the browser.


## Markdown preview

`dev/frontend/src/hooks/useEditorWindow.ts` owns per-file Preview/Source state and focus changes. Markdown starts in Preview; `dev/frontend/src/services/markdownPreference.ts` persists the last toggle choice under `scratch-tab:markdown-view` in localStorage for newly opened Markdown files. With blocked storage it remembers the choice in page memory. Plain-text and code files always start in Source. `dev/frontend/src/components/EditorWindow.tsx` renders the toggle and passes prepared HTML to `dev/frontend/src/components/MarkdownPreview.tsx`. It hides the existing source surface rather than replacing the textarea, so switching views preserves edits, native undo, and document state. The preview renders the current textarea value on entry and when loaded text or chat resource URLs change. Saving from preview uses `useEditor` and the document service with the same source text.

`dev/frontend/src/presenters/markdown.ts` resolves relative links and images inside `/workspace` through the current chat's IDE/download URLs. External HTTP(S) links open separately with `noopener noreferrer`; images use a no-referrer policy. Other schemes and paths outside the workspace are omitted. `dev/frontend/src/vendor/markdown.ts` configures Markdown-it with embedded HTML disabled. `npm run build` bundles both renderers with Preact and collects their license notices. The preview includes standard Markdown, tables and fenced `mermaid` diagrams. `useMermaidPreview` delegates rendering to `services/mermaid.ts`, serializes Mermaid operations, uses strict security, follows the Remote theme, ignores stale results and retains source with an error message for invalid diagrams. Raw HTML and standalone math rendering are not enabled. Wide diagrams retain a readable width and scroll horizontally on phones. The ZIP must fit the current 2 MiB automatic update cap. Installations still enforcing the older 512 KiB cap require a manual ZIP upgrade.
