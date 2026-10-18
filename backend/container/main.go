package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unicode/utf8"
)

const limit = 128 * 1024

type Request struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Revision string `json:"revision"`
	Save     bool   `json:"save"`
}
type Result struct {
	Content  string `json:"content"`
	Revision string `json:"revision,omitempty"`
	Error    string `json:"error,omitempty"`
	Status   int    `json:"status"`
}

func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
func operate(workspace string, request Request) Result {
	fail := func(status int, message string) Result { return Result{Status: status, Error: message} }
	if !strings.HasPrefix(request.Path, "/workspace/") {
		return fail(400, "Choose a workspace file.")
	}
	name := strings.TrimPrefix(request.Path, "/workspace/")
	if name == "" || filepath.Clean(name) != name || strings.HasPrefix(name, "../") || strings.ContainsRune(name, 0) {
		return fail(400, "Invalid workspace path.")
	}
	root, err := os.OpenRoot(workspace)
	if err != nil {
		return fail(503, "Workspace is unavailable.")
	}
	defer root.Close()
	info, err := root.Lstat(name)
	if err != nil || !info.Mode().IsRegular() {
		return fail(400, "Choose an existing regular file, not a symlink or directory.")
	}
	read := func() ([]byte, error) {
		file, err := root.Open(name)
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
	data, err := read()
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
	if len(request.Content) > limit || !utf8.ValidString(request.Content) || strings.ContainsRune(request.Content, 0) {
		return fail(400, "Only UTF-8 text up to 128 KiB can be saved.")
	}
	var random [16]byte
	if _, err = rand.Read(random[:]); err != nil {
		return fail(500, "Cannot prepare save.")
	}
	temporary := filepath.Join(filepath.Dir(name), ".scratch-tab-"+hex.EncodeToString(random[:]))
	file, err := root.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return fail(500, "Cannot create save file.")
	}
	defer root.Remove(temporary)
	_, err = file.WriteString(request.Content)
	if err == nil {
		if stat, ok := info.Sys().(*syscall.Stat_t); ok {
			err = file.Chown(int(stat.Uid), int(stat.Gid))
		}
	}
	if err == nil {
		err = file.Chmod(info.Mode().Perm())
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		return fail(500, "Cannot write file. Original file was kept.")
	}
	current, err := read()
	if err != nil || digest(current) != revision {
		return fail(409, "File changed during save. Copy your edits and reopen it.")
	}
	// Pin the validated parent directory and rename only basenames within it.
	// os.Root.Rename is unavailable in Remote's Go 1.24 container toolchain.
	directory, err := root.Open(filepath.Dir(name))
	if err != nil {
		return fail(500, "Cannot open save directory. Original file was kept.")
	}
	defer directory.Close()
	if err = syscall.Renameat(int(directory.Fd()), filepath.Base(temporary), int(directory.Fd()), filepath.Base(name)); err != nil {
		return fail(500, "Cannot replace file. Original file was kept.")
	}
	return Result{Status: 200, Revision: digest([]byte(request.Content))}
}
func main() {
	lock, err := os.OpenFile("/run/lock/scratch-tab.lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		json.NewEncoder(os.Stdout).Encode(Result{Status: 503, Error: "Save lock unavailable."})
		return
	}
	defer lock.Close()
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		json.NewEncoder(os.Stdout).Encode(Result{Status: 503, Error: "Save lock unavailable."})
		return
	}
	var request Request
	decoder := json.NewDecoder(io.LimitReader(os.Stdin, 8*limit))
	if err = decoder.Decode(&request); err != nil {
		json.NewEncoder(os.Stdout).Encode(Result{Status: 400, Error: "Invalid file request."})
		return
	}
	if err = json.NewEncoder(os.Stdout).Encode(operate("/workspace", request)); err != nil {
		fmt.Fprintln(os.Stderr, "Cannot encode result")
	}
}
