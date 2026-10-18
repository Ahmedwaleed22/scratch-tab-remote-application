# Scratch Tab

A lightweight text editor for [Remote](https://github.com/futrx-com/remote.futrx). Open small workspace files in movable windows, make a quick edit, and get back to your conversation.

[Download Scratch Tab](https://github.com/Ahmedwaleed22/scratch-tab-remote-application/releases/latest) · [License](LICENSE)

## Install

Download the installable ZIP, upload it through **Settings → Applications**, then install and start Scratch Tab in your project. To update an existing installation, upload the newer ZIP and refresh Remote.

## Open a file

Click a workspace file link in an agent message, or select a text file in the file manager. Choose **Scratch Tab** or **Code Server** from the small menu beside the file. File-manager search results work the same way.

![Choose Scratch Tab or Code Server beside a file link](docs/images/editor-choice.png)

## Edit and save

Edit the text, then click **Save** or press **Ctrl/Cmd+S**. A dot beside the filename marks unsaved changes. **Open in Code Server** opens the same file in the full editor.

![Edit a file in a movable Scratch Tab window](docs/images/editor-window.png)

Drag the title bar to move the window and resize it from the corner. Open several files at once; selecting an already open file brings its window forward. Click the red dot or press Escape to close a window. If there are unsaved changes, Scratch Tab asks before discarding them.

For keyboard navigation, use the arrow keys in the editor-choice menu. Focus a window’s title bar and use the arrow keys to move it.

## Files and drafts

- Supports existing UTF-8 text files up to **128 KiB** inside `/workspace`.
- Folders, downloads, images, audio, video, PDFs and archives keep Remote’s usual behavior.
- Save is explicit; there is no autosave or automatic backup. Creating, renaming and deleting files stays in Remote or Code Server.
- If a file changed on disk since you opened it, saving reports a conflict. Copy your edits before reopening the file.
- Unsaved drafts survive chat changes in browser memory. Refreshing or closing the browser loses those drafts, so save your work before leaving.
- CRLF line endings are preserved. Mixed line endings normalize when saved. Symlinks and binary files are not editable; hard links and extended file attributes are not preserved on save.

Stopping or uninstalling Scratch Tab keeps your workspace files.

## License

Copyright © 2026 Futrx. Licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE) for the complete text. Provided without warranty.
