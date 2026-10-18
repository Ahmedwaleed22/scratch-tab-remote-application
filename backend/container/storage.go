package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"syscall"
	"unicode/utf8"
)

// A rooted workspace owns filesystem access; callers never build absolute disk paths.
type workspaceFiles struct{ root *os.Root }
type workspaceFile struct {
	root *os.Root
	name string
	info os.FileInfo
}

func openWorkspace(path string) (*workspaceFiles, error) {
	root, err := os.OpenRoot(path)
	if err != nil {
		return nil, err
	}
	return &workspaceFiles{root: root}, nil
}
func (w *workspaceFiles) Close() { w.root.Close() }
func (w *workspaceFiles) Open(name string) (*workspaceFile, error) {
	info, err := w.root.Lstat(name)
	if err != nil || !info.Mode().IsRegular() {
		return nil, errors.New("not a regular file")
	}
	return &workspaceFile{root: w.root, name: name, info: info}, nil
}
func (f *workspaceFile) Read() ([]byte, error) {
	file, err := f.root.Open(f.name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if len(data) > limit || !utf8.Valid(data) || bytes.ContainsRune(data, 0) {
		return nil, errors.New("unsupported file")
	}
	return data, nil
}

type saveFailure uint8

const (
	saveSucceeded saveFailure = iota
	savePreparationFailed
	saveCreationFailed
	saveWriteFailed
	saveRevisionChanged
	saveDirectoryFailed
	saveReplacementFailed
)

// Replace keeps the existing temporary-write, revision-check and rename ordering.
func (f *workspaceFile) Replace(content, revision string) saveFailure {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return savePreparationFailed
	}
	temporary := filepath.Join(filepath.Dir(f.name), ".scratch-tab-"+hex.EncodeToString(random[:]))
	file, err := f.root.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return saveCreationFailed
	}
	defer f.root.Remove(temporary)
	_, err = file.WriteString(content)
	if err == nil {
		if stat, ok := f.info.Sys().(*syscall.Stat_t); ok {
			err = file.Chown(int(stat.Uid), int(stat.Gid))
		}
	}
	if err == nil {
		err = file.Chmod(f.info.Mode().Perm())
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		return saveWriteFailed
	}
	current, err := f.Read()
	if err != nil || digest(current) != revision {
		return saveRevisionChanged
	}
	// Pin the validated parent and rename only basenames (compatible with Go 1.24).
	directory, err := f.root.Open(filepath.Dir(f.name))
	if err != nil {
		return saveDirectoryFailed
	}
	defer directory.Close()
	if err = syscall.Renameat(int(directory.Fd()), filepath.Base(temporary), int(directory.Fd()), filepath.Base(f.name)); err != nil {
		return saveReplacementFailed
	}
	return saveSucceeded
}
