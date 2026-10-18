package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadSaveConflict(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "note.txt")
	os.WriteFile(file, []byte("hello\r\n"), 0640)
	read := operate(root, Request{Path: "/workspace/note.txt"})
	if read.Status != 200 || read.Content != "hello\r\n" || read.Revision == "" {
		t.Fatal(read)
	}
	saved := operate(root, Request{Path: "/workspace/note.txt", Save: true, Content: "edited\r\n", Revision: read.Revision})
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
	conflict := operate(root, Request{Path: "/workspace/note.txt", Save: true, Content: "stale", Revision: read.Revision})
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
		if got := operate(root, Request{Path: path}); got.Status == 200 {
			t.Fatal(path, got)
		}
	}
	for _, data := range []string{"a\x00b", string([]byte{255}), strings.Repeat("x", limit+1)} {
		os.WriteFile(filepath.Join(root, "bad"), []byte(data), 0600)
		if got := operate(root, Request{Path: "/workspace/bad"}); got.Status == 200 {
			t.Fatal("accepted unsupported data")
		}
	}
}
