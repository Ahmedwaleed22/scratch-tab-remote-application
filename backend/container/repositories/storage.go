package repositories

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
	"unicode/utf8"

	"futrx.local/catalog/applications/scratch-tab/backend/container/config"
	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
	"futrx.local/catalog/applications/scratch-tab/backend/container/services"
)

// A rooted workspace owns filesystem access; callers never build absolute disk paths.
type workspaceFiles struct{ root *os.Root }
type workspaceFile struct {
	root *os.Root
	name string
	info os.FileInfo
}

func OpenWorkspace(path string) (services.Workspace, error) {
	root, err := os.OpenRoot(path)
	if err != nil {
		return nil, err
	}
	return &workspaceFiles{root: root}, nil
}
func (w *workspaceFiles) Close() { w.root.Close() }

func (w *workspaceFiles) Open(name string) (services.File, error) {
	info, err := w.root.Lstat(name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, model.ErrMissing
	}
	if err != nil || !info.Mode().IsRegular() {
		return nil, model.ErrIrregular
	}
	return &workspaceFile{root: w.root, name: name, info: info}, nil
}
func (f *workspaceFile) Read() ([]byte, error) {
	file, err := f.root.Open(f.name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, config.Limit+1))
	if err != nil {
		return nil, err
	}
	if len(data) > config.Limit || !utf8.Valid(data) || bytes.ContainsRune(data, 0) {
		return nil, errors.New("unsupported file")
	}
	return data, nil
}

// Replace keeps the existing temporary-write, revision-check and rename ordering.
func (f *workspaceFile) Replace(content, revision string) model.SaveFailure {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return model.SavePreparationFailed
	}
	temporary := filepath.Join(filepath.Dir(f.name), ".scratch-tab-"+hex.EncodeToString(random[:]))
	file, err := f.root.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return model.SaveCreationFailed
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
		return model.SaveWriteFailed
	}
	current, err := f.Read()
	if err != nil || digest(current) != revision {
		return model.SaveRevisionChanged
	}
	// Pin the validated parent and rename only basenames (compatible with Go 1.24).
	directory, err := f.root.Open(filepath.Dir(f.name))
	if err != nil {
		return model.SaveDirectoryFailed
	}
	defer directory.Close()
	if err = syscall.Renameat(int(directory.Fd()), filepath.Base(temporary), int(directory.Fd()), filepath.Base(f.name)); err != nil {
		return model.SaveReplacementFailed
	}
	return model.SaveSucceeded
}

// Create writes a new file next to its existing parent and links it into place,
// so a file that appears meanwhile is never overwritten.
func (w *workspaceFiles) Create(name, content string) model.SaveFailure {
	parent := filepath.Dir(name)
	info, err := w.root.Lstat(parent)
	if err != nil || !info.IsDir() {
		return model.SaveFolderMissing
	}
	var random [16]byte
	if _, err = rand.Read(random[:]); err != nil {
		return model.SavePreparationFailed
	}
	temporary := filepath.Join(parent, ".scratch-tab-"+hex.EncodeToString(random[:]))
	file, err := w.root.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return model.SaveCreationFailed
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
		return model.SaveWriteFailed
	}
	directory, err := w.root.Open(parent)
	if err != nil {
		return model.SaveDirectoryFailed
	}
	defer directory.Close()
	err = linkat(int(directory.Fd()), filepath.Base(temporary), int(directory.Fd()), filepath.Base(name))
	if errors.Is(err, fs.ErrExist) {
		return model.SaveAlreadyExists
	}
	if err != nil {
		return model.SaveReplacementFailed
	}
	return model.SaveSucceeded
}

func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
