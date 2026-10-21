package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
	"unicode/utf8"
	"unsafe"
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

var errMissing = errors.New("file not found")
var errIrregular = errors.New("not a regular file")

func (w *workspaceFiles) Open(name string) (*workspaceFile, error) {
	info, err := w.root.Lstat(name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, errMissing
	}
	if err != nil || !info.Mode().IsRegular() {
		return nil, errIrregular
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
	saveFolderMissing
	saveAlreadyExists
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

// Create writes a new file next to its existing parent and links it into place,
// so a file that appears meanwhile is never overwritten.
func (w *workspaceFiles) Create(name, content string) saveFailure {
	parent := filepath.Dir(name)
	info, err := w.root.Lstat(parent)
	if err != nil || !info.IsDir() {
		return saveFolderMissing
	}
	var random [16]byte
	if _, err = rand.Read(random[:]); err != nil {
		return savePreparationFailed
	}
	temporary := filepath.Join(parent, ".scratch-tab-"+hex.EncodeToString(random[:]))
	file, err := w.root.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return saveCreationFailed
	}
	defer w.root.Remove(temporary)
	_, err = file.WriteString(content)
	if err == nil {
		if stat, ok := info.Sys().(*syscall.Stat_t); ok {
			err = file.Chown(int(stat.Uid), int(stat.Gid))
		}
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		return saveWriteFailed
	}
	directory, err := w.root.Open(parent)
	if err != nil {
		return saveDirectoryFailed
	}
	defer directory.Close()
	err = linkat(int(directory.Fd()), filepath.Base(temporary), int(directory.Fd()), filepath.Base(name))
	if errors.Is(err, fs.ErrExist) {
		return saveAlreadyExists
	}
	if err != nil {
		return saveReplacementFailed
	}
	return saveSucceeded
}

// linkat is absent from package syscall; the raw call keeps the command dependency-free.
func linkat(oldDirectory int, oldName string, newDirectory int, newName string) error {
	from, err := syscall.BytePtrFromString(oldName)
	if err != nil {
		return err
	}
	to, err := syscall.BytePtrFromString(newName)
	if err != nil {
		return err
	}
	_, _, errno := syscall.Syscall6(syscall.SYS_LINKAT, uintptr(oldDirectory), uintptr(unsafe.Pointer(from)), uintptr(newDirectory), uintptr(unsafe.Pointer(to)), 0, 0)
	if errno != 0 {
		return errno
	}
	return nil
}
