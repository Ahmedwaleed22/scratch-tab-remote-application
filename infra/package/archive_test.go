package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

func sourceRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate package tests")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "../.."))
}
func read(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func write(t *testing.T, root, name, content string) {
	t.Helper()
	target := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}
func fixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for name, content := range map[string]string{
		"application.json": `{"version":"1.0.0"}`,
		"README.md":        "readme", "LICENSE": "license", "dev/frontend/ui/licenses/THIRD-PARTY.txt": "notices",
	} {
		write(t, root, name, content)
	}
	return root
}

func TestRuntimeZIPAndLicense(t *testing.T) {
	root := sourceRoot(t)
	var manifest struct {
		Version string `json:"version"`
		UI      struct {
			Entry string `json:"entry"`
		} `json:"ui"`
	}
	if err := json.Unmarshal(read(t, filepath.Join(root, "application.json")), &manifest); err != nil {
		t.Fatal(err)
	}
	archive, err := buildPackage(root, t.TempDir(), "v"+manifest.Version)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(archive)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() >= 2*1024*1024 {
		t.Fatal("ZIP exceeds automatic update limit", info.Size())
	}
	reader, err := zip.OpenReader(archive)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	contents := map[string][]byte{}
	var js, css []string
	imports := regexp.MustCompile(`(?:from\s*|import\s*)['"](\.[^'"]+)['"]`)
	for _, file := range reader.File {
		stream, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(stream)
		stream.Close()
		if err != nil {
			t.Fatal(err)
		} // Also verifies CRC.
		if _, duplicate := contents[file.Name]; duplicate {
			t.Fatal("duplicate ZIP entry", file.Name)
		}
		contents[file.Name] = data
		if strings.HasPrefix(file.Name, "docs/") {
			t.Fatal("docs included", file.Name)
		}
		for _, suffix := range []string{"_test.go", ".mjs", ".py", ".ts", ".tsx"} {
			if strings.HasSuffix(file.Name, suffix) {
				t.Fatal("development source included", file.Name)
			}
		}
		if strings.HasSuffix(file.Name, ".js") {
			js = append(js, file.Name)
		}
		if strings.HasSuffix(file.Name, ".css") {
			css = append(css, file.Name)
		}
	}
	for _, name := range []string{"LICENSE", "ui/licenses/THIRD-PARTY.txt", "ui/" + manifest.UI.Entry, "backend/container/main.go", "backend/container/repositories/storage.go"} {
		if _, ok := contents[name]; !ok {
			t.Fatal("missing entry", name)
		}
	}
	for _, notice := range []string{"BSD 3-Clause", "preact", "mermaid"} {
		if !bytes.Contains(contents["ui/licenses/THIRD-PARTY.txt"], []byte(notice)) {
			t.Fatal("missing notice", notice)
		}
	}
	chunks, err := filepath.Glob(filepath.Join(root, "dist/chunks/*.js"))
	if err != nil {
		t.Fatal(err)
	}
	if len(chunks) == 0 {
		t.Fatal("no JavaScript chunks")
	}
	expectedJS := []string{"ui/scripts/main.js"}
	for _, chunk := range chunks {
		expectedJS = append(expectedJS, "ui/scripts/chunks/"+filepath.Base(chunk))
	}
	if !reflect.DeepEqual(js, expectedJS) {
		t.Fatal("unexpected JavaScript entries", js)
	}
	if !reflect.DeepEqual(css, []string{"ui/style/scratch.css"}) {
		t.Fatal("unexpected stylesheets", css)
	}
	if len(contents["ui/scripts/main.js"]) >= 512*1024 {
		t.Fatal("main bundle exceeds limit")
	}
	for entry, source := range map[string]string{"ui/scripts/main.js": "dist/main.js", "ui/style/scratch.css": "dist/style/scratch.css"} {
		if !bytes.Equal(contents[entry], read(t, filepath.Join(root, source))) {
			t.Fatal("packaged bytes differ", entry)
		}
	}
	if float64(len(contents["ui/style/scratch.css"])) >= float64(len(read(t, filepath.Join(root, "dev/frontend/ui/style/scratch.css"))))*0.9 {
		t.Fatal("stylesheet is not minified")
	}
	for _, name := range js {
		for _, match := range imports.FindAllSubmatch(contents[name], -1) {
			dependency := path.Clean(path.Join(path.Dir(name), string(match[1])))
			if _, ok := contents[dependency]; !ok {
				t.Fatal("missing module import", name, dependency)
			}
		}
	}
}

func TestMissingBundleRejected(t *testing.T) {
	root := fixture(t)
	if _, err := buildPackage(root, t.TempDir(), "v1.0.0"); err == nil || !strings.Contains(err.Error(), "run npm run build first") {
		t.Fatal(err)
	}
}
func TestWrongTagRejected(t *testing.T) {
	if _, err := buildPackage(sourceRoot(t), t.TempDir(), "v0.0.0"); err == nil || !strings.Contains(err.Error(), "tag must match") {
		t.Fatal(err)
	}
}
func TestSymlinkRejected(t *testing.T) {
	for _, name := range []string{"README.md", "dist/main.js", "dist/chunks/lazy.js", "dist/style/scratch.css"} {
		t.Run(name, func(t *testing.T) {
			root := fixture(t)
			write(t, root, "dist/main.js", "main")
			write(t, root, "dist/chunks/lazy.js", "chunk")
			write(t, root, "dev/frontend/ui/style/scratch.css", "style")
			write(t, root, "dist/style/scratch.css", "style")
			target := filepath.Join(root, name)
			if err := os.Remove(target); err != nil {
				t.Fatal(err)
			}
			outside := filepath.Join(t.TempDir(), "outside")
			if err := os.WriteFile(outside, []byte("outside"), 0644); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(outside, target); err != nil {
				t.Fatal(err)
			}
			if _, err := buildPackage(root, t.TempDir(), "v1.0.0"); err == nil {
				t.Fatal("accepted symlink", name)
			}
		})
	}
}
