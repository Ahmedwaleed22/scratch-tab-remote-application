package services

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"futrx.local/catalog/applications/scratch-tab/backend/container/config"
	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
)

func savable(content string) bool {
	return len(content) <= config.Limit && utf8.ValidString(content) && !strings.ContainsRune(content, 0)
}

func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }

// Files owns path validation, revision policy and file workflows.
type Files struct{ Open OpenWorkspace }

func (s Files) Operate(workspace string, request model.Request) model.Result {
	if !strings.HasPrefix(request.Path, "/workspace/") {
		return fail(400, "Choose a workspace file.")
	}
	name := strings.TrimPrefix(request.Path, "/workspace/")
	if name == "" || filepath.Clean(name) != name || strings.HasPrefix(name, "../") || strings.ContainsRune(name, 0) {
		return fail(400, "Invalid workspace path.")
	}
	files, err := s.Open(workspace)
	if err != nil {
		return fail(503, "Workspace is unavailable.")
	}
	defer files.Close()
	file, err := files.Open(name)
	if err == model.ErrMissing && request.Save && request.Create {
		return create(files, name, request.Content)
	}
	if err == model.ErrMissing {
		return fail(404, config.MissingFile)
	}
	if err != nil {
		return fail(400, "Choose an existing regular file, not a symlink or directory.")
	}
	if request.Create {
		return fail(409, config.FileAlreadyExists)
	}
	data, err := file.Read()
	if err != nil {
		return fail(400, "Only UTF-8 text files up to 128 KiB are supported.")
	}
	revision := digest(data)
	if !request.Save {
		return model.Result{Status: 200, Content: string(data), Revision: revision}
	}
	if request.Revision == "" || request.Revision != revision {
		return fail(409, "File changed on disk. Reopen it before saving; copy your edits first.")
	}
	if !savable(request.Content) {
		return fail(400, config.UnsavableContent)
	}
	return replacementResult(file.Replace(request.Content, revision), request.Content)
}

// create recreates a missing file without replacing one that appeared meanwhile.
func create(files Workspace, name, content string) model.Result {
	if !savable(content) {
		return fail(400, config.UnsavableContent)
	}
	return creationResult(files.Create(name, content), content)
}
