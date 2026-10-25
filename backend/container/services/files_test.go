package services_test

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"futrx.local/catalog/applications/scratch-tab/backend/container/config"
	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
	"futrx.local/catalog/applications/scratch-tab/backend/container/repositories"
	"futrx.local/catalog/applications/scratch-tab/backend/container/services"
)

func TestReadSaveConflict(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "note.txt")
	os.WriteFile(file, []byte("hello\r\n"), 0640)
	read := operate(root, model.Request{Path: "/workspace/note.txt"})
	if read.Status != 200 || read.Content != "hello\r\n" || read.Revision == "" {
		t.Fatal(read)
	}
	saved := operate(root, model.Request{Path: "/workspace/note.txt", Save: true, Content: "edited\r\n", Revision: read.Revision})
	if saved.Status != 200 {
		t.Fatal(saved)
	}
	data, _ := os.ReadFile(file)
	if string(data) != "edited\r\n" {
		t.Fatal(string(data))
	}
	info, _ := os.Stat(file)
	if info.Mode().Perm() != 0640 {
		t.Fatal(info.Mode())
	}
	conflict := operate(root, model.Request{Path: "/workspace/note.txt", Save: true, Content: "stale", Revision: read.Revision})
	if conflict.Status != 409 {
		t.Fatal(conflict)
	}
	data, _ = os.ReadFile(file)
	if string(data) != "edited\r\n" {
		t.Fatal("conflict overwrote file")
	}
}
func TestRejectUnsafeAndUnsupported(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	os.WriteFile(filepath.Join(outside, "secret"), []byte("secret"), 0600)
	os.Symlink(outside, filepath.Join(root, "escape"))
	os.Symlink(filepath.Join(outside, "secret"), filepath.Join(root, "link"))
	for _, path := range []string{"/etc/passwd", "/workspace/../secret", "/workspace/escape/secret", "/workspace/link", "/workspace/missing"} {
		if got := operate(root, model.Request{Path: path}); got.Status == 200 {
			t.Fatal(path, got)
		}
	}
	for _, data := range []string{"a\x00b", string([]byte{255}), strings.Repeat("x", config.Limit+1)} {
		os.WriteFile(filepath.Join(root, "bad"), []byte(data), 0600)
		if got := operate(root, model.Request{Path: "/workspace/bad"}); got.Status == 200 {
			t.Fatal("accepted unsupported data")
		}
	}
}

func TestSaveNestedFileWithGo124Rename(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "notes"), 0750); err != nil {
		t.Fatal(err)
	}
	name := filepath.Join(root, "notes", "small.txt")
	if err := os.WriteFile(name, []byte("before"), 0600); err != nil {
		t.Fatal(err)
	}
	read := operate(root, model.Request{Path: "/workspace/notes/small.txt"})
	result := operate(root, model.Request{Path: "/workspace/notes/small.txt", Save: true, Revision: read.Revision, Content: "after"})
	if result.Status != 200 {
		t.Fatal(result)
	}
	data, err := os.ReadFile(name)
	if err != nil || string(data) != "after" {
		t.Fatal(string(data), err)
	}
	entries, err := os.ReadDir(filepath.Dir(name))
	if err != nil || len(entries) != 1 || entries[0].Name() != "small.txt" {
		t.Fatal(entries, err)
	}
}

func TestDeletedFileReportsMissingAndCanBeRecreated(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "notes"), 0750); err != nil {
		t.Fatal(err)
	}
	name := filepath.Join(root, "notes", "draft.md")
	os.WriteFile(name, []byte("before"), 0600)
	read := operate(root, model.Request{Path: "/workspace/notes/draft.md"})
	os.Remove(name)
	if got := operate(root, model.Request{Path: "/workspace/notes/draft.md"}); got.Status != 404 || got.Error != config.MissingFile {
		t.Fatal(got)
	}
	if got := operate(root, model.Request{Path: "/workspace/notes/draft.md", Save: true, Content: "kept", Revision: read.Revision}); got.Status != 404 || got.Error != config.MissingFile {
		t.Fatal(got)
	}
	created := operate(root, model.Request{Path: "/workspace/notes/draft.md", Save: true, Create: true, Content: "kept"})
	if created.Status != 200 || created.Revision != digest([]byte("kept")) {
		t.Fatal(created)
	}
	data, err := os.ReadFile(name)
	if err != nil || string(data) != "kept" {
		t.Fatal(string(data), err)
	}
	if entries, _ := os.ReadDir(filepath.Dir(name)); len(entries) != 1 {
		t.Fatal("temporary file left behind", entries)
	}
	if got := operate(root, model.Request{Path: "/workspace/notes/draft.md", Save: true, Create: true, Content: "clobber"}); got.Status != 409 {
		t.Fatal(got)
	}
	if data, _ = os.ReadFile(name); string(data) != "kept" {
		t.Fatal("create overwrote an existing file")
	}
	saved := operate(root, model.Request{Path: "/workspace/notes/draft.md", Save: true, Content: "edited", Revision: created.Revision})
	if saved.Status != 200 {
		t.Fatal(saved)
	}
}

func TestRecreateRejectsMissingFolderAndUnsafePaths(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	os.Symlink(outside, filepath.Join(root, "escape"))
	if got := operate(root, model.Request{Path: "/workspace/gone/file.txt", Save: true, Create: true, Content: "x"}); got.Status != 404 {
		t.Fatal(got)
	}
	if got := operate(root, model.Request{Path: "/workspace/escape/file.txt", Save: true, Create: true, Content: "x"}); got.Status == 200 {
		t.Fatal(got)
	}
	if entries, _ := os.ReadDir(outside); len(entries) != 0 {
		t.Fatal("created a file outside the workspace", entries)
	}
	if got := operate(root, model.Request{Path: "/workspace/bad.txt", Save: true, Create: true, Content: "a\x00b"}); got.Status != 400 {
		t.Fatal(got)
	}
}

func operate(root string, request model.Request) model.Result {
	return (services.Files{Open: repositories.OpenWorkspace}).Operate(root, request)
}
func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
