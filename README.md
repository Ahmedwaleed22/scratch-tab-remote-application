# Scratch Tab

A UI-only Remote application for quick looks at small workspace text files. No core changes, backend, container service, ports, credentials, or dependencies.

## Install

Upload `scratch-tab-0.1.0.zip` through Settings → Applications, then install and start Scratch Tab in the desired project. No live upload or installation is performed by the build process.

## Use

Click a `/workspace/...` file link in an agent message. Choose Scratch Tab or Code Server each time. Scratch Tab displays UTF-8 text read-only; use Open in Code Server to edit. Its macOS-style controls close, minimize, and maximize the window. Drag the title bar, resize the bottom-right corner, or focus Move and use arrow keys. Escape closes the focused window. The chat header's Scratch Tab button restores the most recently opened window. Reopening an already open file focuses it; reopening a closed file reloads it from disk.

Multiple windows can remain open within the current chat. Leaving that chat, stopping, or uninstalling the app removes windows, aborts requests, and unregisters link handling. No contents or positions are stored. Modified clicks retain browser behavior.

## Implementation and limits

The supported chat-header slot owns the lifecycle of a document capture listener and application-owned floating windows. The listener recognizes only same-origin `/api/chats/<current-chat>/ide-open` links with workspace paths. Existing authenticated file-download endpoints read files; server authorization remains authoritative. Contents are assigned to a read-only textarea and never interpreted as markup. UTF-8 files up to 1 MiB are supported; binary, invalid UTF-8, HTTP errors and oversized streams show an error with Code Server still available.

This deliberately uses the DOM interception requested by the product owner. It depends on Remote's existing file-link URL format; a future URL change may require an application update. It does not intercept file-browser buttons that directly call window.open, folder links, host filesystem paths, media links, external Code Server URLs, or modified clicks. It does not edit/save, auto-refresh, or jump to a link's line number; Code Server preserves the original link including line references.

## Verification

Run `node --test infra/test.mjs` from this directory with Playwright available in the workspace. If the existing browser cache is under `/root/.cache/ms-playwright`, set `PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright`.

Tests cover URL selection and exclusions, UTF-8 reads and failures, and a real Chromium fixture exercising choice, content, window controls, reopening and disposal. The fixture mocks Remote's extension API and download responses; verification against a live installed Remote instance remains necessary.

For an update, bump application.json's version and upload a new ZIP. Stopping or uninstalling only removes the UI; workspace files are never modified or deleted.
