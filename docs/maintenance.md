# Scratch Tab maintenance

This document is for the plugin owner. The README is for people installing and using Scratch Tab.

## Architecture

The browser, host backend, and container command are independently built deployment units. They meet through the existing `POST file` JSON request/response contract; this refactor does not change that contract, the interface, or save behavior.

### Browser extension

- `ui/scripts/main.js` composes the Remote slot, project-scoped file API, draft lifetime, and chat session.
- `app/chat.js` owns the open-window collection, stacking order, chooser lifecycle, and dependency composition for the current project.
- `links.js` parses the supported editor links without touching the DOM.
- `adapters/fileOpenings.js` translates chat links and file-manager rows into file-open intent. It owns capture listeners and the guard around Remote's original row action.
- `api/files.js` owns the `file` request shapes and project target selection. Remote supplies the transport and error parsing.
- `services/editorDocument.js` owns document text, baseline, revision, CRLF handling, draft snapshots and save transitions. It has no DOM or Remote imports.
- `presenters/editor.js` connects document intent/state to the view and owns load, save and close feedback and browser-leave handling.
- `views/` owns DOM rendering, keyboard/pointer interactions, focus, geometry, and accessible labels. Views receive intent callbacks and render-ready state.
- `config/editor.js` contains the browser's public file-size limit, initial stacking layer, and media/archive catalog.

Draft memory remains module-scoped, as before, so switching chats or stopping the extension can retain drafts until the browser reloads. Reads are still allowed to finish after closing a window; the presenter suppresses their results. Save requests already in flight still finish. These behaviors are deliberately preserved rather than changed during a refactor.

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
npm run build:syntax
npx playwright install chromium
node --test infra/test.mjs
GO111MODULE=off go test ./backend/container
GO111MODULE=off go vet ./backend/container
python3 -B infra/test_package.py
python3 -B infra/test_backend.py --remote-root /path/to/remote.futrx
```

Run `npm ci` after cloning to install the shared Git hooks, then `npx playwright install chromium` for browser tests. The pre-commit hook runs lint-staged to format only staged handwritten JavaScript and CSS, then runs the browser tests. This keeps formatting inside the original signed commit, including when staging only part of a file. There is no TypeScript typecheck because this project uses JavaScript.

The Prettier workflow runs on every push and pull request: it formats the checkout and fails if that creates a diff. It has read-only repository permissions and never commits or pushes, so it cannot put local branches behind or create formatting-only merge conflicts. Fix failures locally with `npm run format` and include them in the next commit. Changes made by other people still require the usual fetch and merge/rebase.

Use `npm run format` to format handwritten browser JavaScript, CSS, build scripts, and browser tests. `npm run format:check` verifies the same files locally and in CI. The generated vendor bundle is excluded from formatting.

The checked-in `ui/scripts/vendor/syntax.js` bundle is built from `infra/syntax-entry.js` with pinned Highlight.js and esbuild versions in `package-lock.json`. Rebuild it with `npm run build:syntax` when changing grammars. CI rebuilds and checks the generated bundle for drift. The ZIP includes the Highlight.js BSD license. No CDN is used. `config/syntax.js` owns the extension catalog and line-length limit. `presenters/syntax.js` owns language detection and the decision to highlight or display literal text. `views/syntax.js` only paints behind the native textarea and synchronizes scroll, size, and lifecycle. Plain-text files use the textarea directly. The textarea continues to own input, undo, selection, and accessibility.

Set `PLAYWRIGHT_BROWSERS_PATH` when using an existing Chromium cache. The browser fixture exercises links, file-manager click/keyboard activation, both editor choices, text editing, save errors, in-flight edits, CRLF, drafts, close protection and disposal. It serves the actual module graph, with Remote and LXD replaced at their boundaries. The backend script validates the catalog, compiles through Remote's generated-module builder, and tests/vets the host packages using the checkout's required Go version.

CI runs container tests, vet and an installer-style build on Go 1.24.7 and 1.25, then browser/package checks. Live installation, actual LXD execution, project membership enforcement, and theme integration still need a Remote server.

## Release ownership

Only the owner manages versions and publishes packages. Set `application.json` to the intended version, run the checks, commit, and push a matching `vX.Y.Z` tag after its commit reaches main. The workflow builds a runtime-only ZIP and attaches it to a GitHub Release. Main-branch pushes run checks without publishing. A manual workflow dispatch accepts an existing tag for retries.

```sh
python3 -B infra/package.py --tag v0.3.0 --output-dir dist
```

The packager includes runtime Go/JavaScript/CSS, the README, license, and README screenshots. It excludes tests, maintainer documentation, Git metadata, local artifacts and credentials. Package tests check that module imports and README images exist inside the ZIP. Source archives and this maintainer guide remain available in the repository.

## Existing integration constraints

- The chat-header slot owns listeners but renders no launcher. Same-project context changes rebind its capture handlers without closing windows. Leaving the chat scope suspends the windows and unregisters handlers; sidebar scope removal disposes the session.
- Supported links include active-chat `ide-open`, `code--<project>.<Remote host>` file links, and legacy Code Server payload links. The active chat cwd supplies the project slug for isolation.
- File-manager integration depends on `#workspace-files-pane` rows with `role="button"` and a file download anchor. Choosing Code Server replays the original row action under the adapter's recursion guard. Other projects, media, archives, folders, download controls and modified clicks are excluded.
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

Only Remote-resolved administrator callers can access `GET updates` or `POST updates/archive`. Downloads use the fixed public repository and stable `vX.Y.Z` tags, exact versioned ZIP names, bounded HTTPS redirects, a 512 KiB archive cap, GitHub's SHA-256 asset digest, and a matching root `application.json`. This verifies integrity against GitHub metadata, not an independent publisher signature. Larger or digest-less releases require a manual upload.

The browser checks administrator access and the current package version, downloads through its project backend, then sends multipart `package` to Remote's existing package API. Remote remains responsible for validation, package storage, backend replacement, and per-project upgrades. The backend never writes its own installed files or receives administrator cookies. An upload already submitted is allowed to finish if the popup closes. A network failure during upload may leave a completed server update; the UI asks users to inspect Applications before retrying.

The drafts map blocks installation before and after download and blocks refresh if edits appear during upload. Other tabs and other projects' editors cannot be inspected; the confirmation explicitly asks users to save them. Partial upgrades keep their errors visible and offer a manual refresh. Concurrent administrators can still race package uploads because Remote has no conditional replacement API. No core code changes or automatic rollback are included.

Validation includes host release/ZIP tests, non-admin route denial, browser version comparison, draft blocking, download errors, multipart upload, partial failures, successful refresh, and slot disposal. Live package installation remains a server integration check.

## Tabbed windows

`main.js` keeps a single active project session across keyed chat remounts. The persistent sidebar-header slot owns final cleanup, without rendering a launcher. Chat-slot cleanup suspends link capture, hides the windows and closes the chooser. The next chat render resumes the windows only for the same project; a different project disposes them. Sidebar scope removal (including stopping the extension) disposes the session. Context rebinding updates download/IDE links and removes callbacks to the old file-manager DOM. File reads, saves, tab membership and geometry stay intact.

New files join the active window's tab group. `app/chat.js` owns group membership, active-file selection, and splitting a tab into its own window. Each file retains its existing document model and presenter, so switching or separating files does not read them again, reset their revisions, or discard edits. Reopening the same path selects its existing tab. Closing the active file selects a remaining tab; dirty closes still require confirmation. Project-session disposal remembers all drafts and closes all groups.

`views/editorWindow.js` renders the tab strip, selected state, keyboard navigation and Separate window action. Inactive file panels are hidden; selected files inherit their group's current geometry. Separate windows can move and resize independently on desktop. On phones, each window still fits the visual viewport. Window groups and positions remain in memory across same-project chat changes, but are not restored after leaving the project or refreshing the browser.


## Markdown preview

`views/markdown.js` owns the per-file Preview/Source toggle. It hides the existing source surface rather than replacing the textarea, so switching views preserves edits, native undo, and document state. The preview renders the current textarea value on entry and when loaded text or chat resource URLs change. Saving from preview still uses the existing document presenter and source text.

`presenters/markdown.js` resolves relative links and images inside `/workspace` through the current chat's IDE/download URLs. External HTTP(S) links open separately with `noopener noreferrer`; images use a no-referrer policy. Other schemes and paths outside the workspace are omitted. `infra/markdown-entry.js` configures Markdown-it with embedded HTML disabled. `npm run build:syntax` builds both renderer bundles and copies their license notices. The preview includes standard Markdown and tables; raw HTML, Mermaid, and math rendering are not enabled.
