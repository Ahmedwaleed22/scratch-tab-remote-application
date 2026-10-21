package main

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// The browser matches missingFile exactly to offer recreating a deleted file.
const missingFile = "File not found. It may have been deleted or moved."
const unsavableContent = "Only UTF-8 text up to 128 KiB can be saved."

func savable(content string) bool {
	return len(content) <= limit && utf8.ValidString(content) && !strings.ContainsRune(content, 0)
}

func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }

// operate owns the command's validation, revision policy and public error mapping.
func operate(workspace string, request Request) Result {
	fail := func(status int, message string) Result { return Result{Status: status, Error: message} }
	if !strings.HasPrefix(request.Path, "/workspace/") {
		return fail(400, "Choose a workspace file.")
	}
	name := strings.TrimPrefix(request.Path, "/workspace/")
	if name == "" || filepath.Clean(name) != name || strings.HasPrefix(name, "../") || strings.ContainsRune(name, 0) {
		return fail(400, "Invalid workspace path.")
	}
	files, err := openWorkspace(workspace)
	if err != nil {
		return fail(503, "Workspace is unavailable.")
	}
	defer files.Close()
	file, err := files.Open(name)
	if err == errMissing && request.Save && request.Create {
		return create(files, name, request.Content)
	}
	if err == errMissing {
		return fail(404, missingFile)
	}
	if err != nil {
		return fail(400, "Choose an existing regular file, not a symlink or directory.")
	}
	if request.Create {
		return fail(409, "A file already exists at this path. Reopen it before saving; copy your edits first.")
	}
	data, err := file.Read()
	if err != nil {
		return fail(400, "Only UTF-8 text files up to 128 KiB are supported.")
	}
	revision := digest(data)
	if !request.Save {
		return Result{Status: 200, Content: string(data), Revision: revision}
	}
	if request.Revision == "" || request.Revision != revision {
		return fail(409, "File changed on disk. Reopen it before saving; copy your edits first.")
	}
	if !savable(request.Content) {
		return fail(400, unsavableContent)
	}
	switch file.Replace(request.Content, revision) {
	case savePreparationFailed:
		return fail(500, "Cannot prepare save.")
	case saveCreationFailed:
		return fail(500, "Cannot create save file.")
	case saveWriteFailed:
		return fail(500, "Cannot write file. Original file was kept.")
	case saveRevisionChanged:
		return fail(409, "File changed during save. Copy your edits and reopen it.")
	case saveDirectoryFailed:
		return fail(500, "Cannot open save directory. Original file was kept.")
	case saveReplacementFailed:
		return fail(500, "Cannot replace file. Original file was kept.")
	}
	return Result{Status: 200, Revision: digest([]byte(request.Content))}
}

// create recreates a missing file without replacing one that appeared meanwhile.
func create(files *workspaceFiles, name, content string) Result {
	fail := func(status int, message string) Result { return Result{Status: status, Error: message} }
	if !savable(content) {
		return fail(400, unsavableContent)
	}
	switch files.Create(name, content) {
	case saveFolderMissing:
		return fail(404, "Folder not found. Recreate the folder first; copy your edits.")
	case saveAlreadyExists:
		return fail(409, "A file already exists at this path. Reopen it before saving; copy your edits first.")
	case savePreparationFailed:
		return fail(500, "Cannot prepare save.")
	case saveCreationFailed, saveWriteFailed:
		return fail(500, "Cannot create file.")
	case saveDirectoryFailed, saveReplacementFailed:
		return fail(500, "Cannot create file in its folder.")
	}
	return Result{Status: 200, Revision: digest([]byte(content))}
}
