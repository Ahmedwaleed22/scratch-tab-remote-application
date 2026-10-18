# Scratch Tab

A lightweight text editor for [Remote](https://github.com/futrx-com/remote.futrx). Click an agent's workspace file link, choose Scratch Tab or Code Server, and read or edit the file in a small movable window.

[Download the latest installable ZIP](https://github.com/Ahmedwaleed22/Scratch-tab-remote-application/releases/latest) · [License](LICENSE)

## Install or upgrade

Download `scratch-tab-0.2.2.zip` from Releases. Upload it through **Settings → Applications**, then install and start Scratch Tab in the desired project. Uploading a newer version updates existing installations and provisions the file command. If upgrading a UI-only 0.1.0 installation leaves no project container attached, uninstall and reinstall Scratch Tab in that project; workspace files are retained.

Scratch Tab requires Remote's application-backend and container-Go capabilities and a working LXD project container. It adds no core changes, listening ports, credentials, third-party services, or always-running container process. Remote builds the application-owned Go backend and installs the file command automatically.

## Use

Click a `/workspace/...` file link in an agent message. Choose **Scratch Tab** or **Code Server** every time. Edit the text, then press **Save** or **Ctrl/Cmd+S**. A dot beside the filename marks unsaved changes. **Open in Code Server** opens the same file, preserving any line reference.

The macOS-style buttons close, minimize, and maximize the window. Drag its title bar or resize its corner. Focus **Move** and use arrow keys for keyboard movement; Escape closes the focused window. The chat header's Scratch Tab button restores the most recently opened window. Several files can stay open; reopening one focuses its existing window.

Closing a dirty file asks before discarding changes. Leaving the chat or stopping the extension keeps unsaved drafts in browser memory, restored when you reopen the file in that project. Refreshing or closing the browser loses these drafts; a browser leave warning protects open dirty windows. Drafts are not disk saves, and drafts hidden by a chat change have no browser leave warning. Save before leaving if the changes matter.

## Files and save behavior

- Existing UTF-8 regular files up to 128 KiB; empty files and UTF-8 BOMs are supported. Binary files, invalid UTF-8, final symlinks and directories are refused.
- File access stays beneath `/workspace` through Go's rooted filesystem API. The host backend uses only the installed instance's project container, never a container supplied by the browser. Remote checks project membership; the backend also requires a signed-in caller.
- Saves check a SHA-256 revision and refuse stale edits with an error. Copy your edits and reopen the file if another tool changed it. Scratch Tab commands serialize through a container lock. Other editors do not share that lock: a change in the tiny interval between the final check and rename is still possible.
- Saving writes a temporary file in the same directory, syncs it, preserves Unix ownership and permission bits, then replaces the original. This changes the inode, so hard links, ACLs and extended attributes are not preserved. No automatic backups or undo history across windows.
- CRLF files retain CRLF on save. Mixed line endings normalize to CRLF when any CRLF exists; otherwise they normalize to LF. No autosave, create, rename or delete operation.

The document click handler recognizes only same-origin chat `ide-open` links for the currently active chat. File-browser buttons that directly call `window.open`, host paths, folders, media, external Code Server links and modified clicks keep their existing behavior. This uses DOM interception by design and depends on Remote's current file-link URL format. Link line numbers are used by Code Server; Scratch Tab opens at the beginning.

## Development and checks

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node --test infra/test.mjs
GO111MODULE=off go test ./backend/container
GO111MODULE=off go vet ./backend/container
python3 -B infra/test_package.py
python3 -B infra/test_backend.py --remote-root /path/to/remote.futrx
```

The container file command supports Go 1.24.7 and later, matching Remote's installer. The host-backend check uses the Go version required by your Remote checkout. Set `PLAYWRIGHT_BROWSERS_PATH` if Chromium is already installed in a custom cache. Tests cover editing, saving, save failure, close protection and window lifecycle in Chromium; container tests cover real file writes, stale revisions, traversal, symlinks and unsupported files. The backend check validates the package, compiles it through Remote's generated-module builder, and tests/vets its host API. Browser tests mock the extension API; live installation and actual LXD execution require a Remote server.

## Releases

Update `application.json`, run the checks, commit, and push a matching `vX.Y.Z` tag. The release workflow follows Connectly's convention: validate the version, test, build a runtime-only ZIP containing the license, and attach it to a GitHub Release. Pushes to main run checks without publishing. To retry an existing tag, use Actions → Release installable ZIP → Run workflow and enter the tag. Source archives remain available from GitHub. To build locally:

```sh
python3 -B infra/package.py --tag v0.2.2 --output-dir dist
```

Version 0.2.2 fixes installation with Remote’s Go 1.24.7 container toolchain and tests releases against both Go 1.24.7 and 1.25. Version 0.2.1 adds editing and saving, revision conflict checks, unsaved draft protection, the project-scoped file backend, AGPL licensing and tagged release packaging. Version 0.1.0 was the initial read-only UI.

Stopping or uninstalling removes the UI/backend. Project workspace files are kept. The provisioned `/usr/local/bin/scratch-tab` command remains inert in the shared project container until it is replaced or the container is rebuilt.

## License

Copyright © 2026 Futrx. Licensed under **AGPL-3.0-or-later**, matching Connectly. See [LICENSE](LICENSE) for the complete text. Provided without warranty. The editor's About button links to the license and source code.
