package repositories

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

type boundedOutput struct{ bytes.Buffer }

func (b *boundedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 512*1024 {
		return 0, errors.New("Git output exceeds 512 KiB; select a smaller file")
	}
	return b.Buffer.Write(p)
}

func RunGit(directory string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", append([]string{"--no-pager", "--literal-pathspecs", "-c", "core.fsmonitor=false"}, args...)...)
	cmd.Dir = directory
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
	cmd.WaitDelay = time.Second
	// Never let Git prompt on the command's JSON stdin or inherit repository overrides.
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(entry, "GIT_") {
			cmd.Env = append(cmd.Env, entry)
		}
	}
	cmd.Env = append(cmd.Env, "GIT_TERMINAL_PROMPT=0", "GIT_OPTIONAL_LOCKS=0", "LC_ALL=C")
	var out, diagnostics boundedOutput
	cmd.Stdout = &out
	cmd.Stderr = &diagnostics
	err := cmd.Run()
	if ctx.Err() != nil {
		return "", errors.New("Git timed out; refresh to check the repository state")
	}
	if err != nil {
		message := strings.TrimSpace(diagnostics.String())
		if message == "" {
			message = err.Error()
		}
		return out.String(), fmt.Errorf("%s", message)
	}
	return out.String(), nil
}

func DiscoverGit(root string) ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result := []string{}
	visited := 0
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if ctx.Err() != nil {
			return errors.New("Repository scan timed out; narrow the workspace folders")
		}
		visited++
		if visited > 200000 {
			return errors.New("Repository scan exceeds 200000 entries")
		}
		if err != nil {
			if path == root {
				return err
			}
			return nil
		}
		if entry.Name() == ".git" {
			parent := filepath.Dir(path)
			if _, err := RunGit(parent, "rev-parse", "--show-toplevel"); err == nil {
				result = append(result, parent)
			}
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() && path != root {
			switch entry.Name() {
			case "node_modules", ".cache", ".venv", "vendor":
				return filepath.SkipDir
			}
		}
		return nil
	})
	return result, err
}
