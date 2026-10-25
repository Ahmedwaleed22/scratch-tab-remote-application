package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type packageFile struct{ source, name string }

func regular(name string) bool {
	info, err := os.Lstat(name)
	return err == nil && info.Mode().IsRegular()
}

func buildPackage(root, output, tag string) (string, error) {
	manifest, err := os.ReadFile(filepath.Join(root, "application.json"))
	if err != nil {
		return "", err
	}
	var app struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(manifest, &app); err != nil {
		return "", err
	}
	if !regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`).MatchString(app.Version) || tag != "v"+app.Version {
		return "", fmt.Errorf("tag must match application.json version vX.Y.Z")
	}
	files := []packageFile{}
	for _, name := range []string{"README.md", "LICENSE", "application.json", "dev/frontend/ui/licenses/THIRD-PARTY.txt"} {
		files = append(files, packageFile{name, strings.TrimPrefix(name, "dev/frontend/")})
	}
	backend := filepath.Join(root, "backend")
	if _, err := os.Stat(backend); err == nil {
		err = filepath.WalkDir(backend, func(name string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
				return nil
			}
			info, err := os.Stat(name)
			if err != nil || !info.Mode().IsRegular() {
				return err
			}
			relative, err := filepath.Rel(root, name)
			if err != nil {
				return err
			}
			relative = filepath.ToSlash(relative)
			files = append(files, packageFile{relative, relative})
			return nil
		})
		if err != nil {
			return "", err
		}
	} else if !os.IsNotExist(err) {
		return "", err
	}
	for _, file := range files {
		if !regular(filepath.Join(root, file.source)) {
			return "", fmt.Errorf("missing regular package file: %s", file.source)
		}
	}
	if !regular(filepath.Join(root, "dist/main.js")) {
		return "", fmt.Errorf("missing JavaScript bundle: run npm run build first")
	}
	files = append(files, packageFile{"dist/main.js", "ui/scripts/main.js"})
	chunks, err := filepath.Glob(filepath.Join(root, "dist/chunks/*.js"))
	if err != nil {
		return "", err
	}
	for _, chunk := range chunks {
		if !regular(chunk) {
			return "", fmt.Errorf("JavaScript chunks must be regular files")
		}
		files = append(files, packageFile{filepath.Join("dist/chunks", filepath.Base(chunk)), "ui/scripts/chunks/" + filepath.Base(chunk)})
	}
	styles, err := filepath.Glob(filepath.Join(root, "dev/frontend/ui/style/*.css"))
	if err != nil {
		return "", err
	}
	for _, style := range styles {
		name := filepath.Base(style)
		source := filepath.Join("dist/style", name)
		if !regular(filepath.Join(root, source)) {
			return "", fmt.Errorf("missing minified stylesheet %s: run npm run build first", name)
		}
		files = append(files, packageFile{source, "ui/style/" + name})
	}
	if err := os.MkdirAll(output, 0755); err != nil {
		return "", err
	}
	archive := filepath.Join(output, "scratch-tab-"+app.Version+".zip")
	if err := writeArchive(root, archive, files); err != nil {
		return "", err
	}
	return archive, nil
}

func writeArchive(root, archive string, files []packageFile) (err error) {
	output, err := os.Create(archive)
	if err != nil {
		return err
	}
	defer func() {
		if closeErr := output.Close(); err == nil {
			err = closeErr
		}
	}()
	writer := zip.NewWriter(output)
	for _, file := range files {
		if err = appendFile(writer, filepath.Join(root, file.source), file.name); err != nil {
			writer.Close()
			return err
		}
	}
	return writer.Close()
}

func appendFile(writer *zip.Writer, source, name string) error {
	file, err := os.Open(source)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = name
	header.Method = zip.Deflate
	destination, err := writer.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(destination, file)
	return err
}
