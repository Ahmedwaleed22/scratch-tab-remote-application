package services

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
)

func gitPath(root, path string) (string, error) {
	if !filepath.IsAbs(path) || strings.ContainsRune(path, 0) {
		return "", errors.New("Choose a workspace repository")
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(root, resolved)
	if err != nil || relative == ".." || strings.HasPrefix(relative, "../") {
		return "", errors.New("Repository must be inside the workspace")
	}
	return resolved, nil
}

type Git struct {
	Run      func(string, ...string) (string, error)
	Discover func(string) ([]string, error)
}

func (s Git) Operate(root string, request model.GitRequest) model.Result {
	result := &model.GitResult{Changes: []model.GitChange{}}
	success := func() model.Result { return model.Result{Status: 200, Git: result} }
	failure := func(err error) model.Result { return fail(400, err.Error()) }
	if request.Action == "repository" {
		if !filepath.IsAbs(request.Path) || strings.ContainsRune(request.Path, 0) {
			return failure(errors.New("Choose a workspace file"))
		}
		directory, err := gitPath(root, filepath.Dir(request.Path))
		if err != nil {
			return failure(err)
		}
		for {
			marker := filepath.Join(directory, ".git")
			info, err := os.Stat(marker)
			if err == nil && info.IsDir() {
				// An empty placeholder is not a repository. Nonempty broken metadata
				// must still report Git's error rather than hide a damaged repository.
				folder, openErr := os.Open(marker)
				if openErr != nil {
					return failure(openErr)
				}
				_, readErr := folder.Readdirnames(1)
				folder.Close()
				if readErr == io.EOF {
					err = os.ErrNotExist
				} else if readErr != nil {
					return failure(readErr)
				}
			}
			if err == nil {
				top, err := s.Run(directory, "rev-parse", "--show-toplevel")
				if err != nil {
					return failure(err)
				}
				resolved, err := gitPath(root, strings.TrimSpace(top))
				if err != nil {
					return failure(err)
				}
				result.Repositories = []string{resolved}
				return success()
			}
			if !os.IsNotExist(err) {
				return failure(err)
			}
			if directory == root {
				return success()
			}
			directory = filepath.Dir(directory)
		}
	}
	if request.Action == "repositories" {
		paths, err := s.Discover(root)
		if err != nil {
			return failure(err)
		}
		result.Repositories = paths
		return success()
	}
	directory, err := gitPath(root, request.Repository)
	if err != nil {
		return failure(err)
	}
	top, err := s.Run(directory, "rev-parse", "--show-toplevel")
	if err != nil || strings.TrimSpace(top) != directory {
		return failure(errors.New("Choose a repository root"))
	}
	run := func(args ...string) model.Result {
		output, err := s.Run(directory, args...)
		if err != nil {
			return failure(err)
		}
		result.Output = output
		return success()
	}
	switch request.Action {
	case "status":
		output, err := s.Run(directory, "status", "--porcelain=v1", "-z", "--untracked-files=all")
		if err != nil {
			return failure(err)
		}
		result.Changes = gitChanges(output)
		branch, err := s.Run(directory, "status", "--porcelain=v2", "--branch", "--untracked-files=no")
		if err != nil {
			return failure(err)
		}
		gitBranch(branch, result)
		remote, err := s.remote(directory)
		if err != nil {
			return failure(err)
		}
		result.Remote = remote
		return success()
	case "log":
		if _, err := s.Run(directory, "rev-parse", "--verify", "HEAD"); err != nil {
			return success()
		}
		// Like VS Code's "Auto" graph: the current branch plus its upstream.
		args := []string{"log", "--topo-order", "--decorate=full", "-n", "200", "--format=%H%x1f%P%x1f%s%x1f%an%x1f%ar%x1f%D%x1e", "HEAD"}
		if _, err := s.Run(directory, "rev-parse", "--verify", "--quiet", "@{upstream}"); err == nil {
			args = append(args, "@{upstream}")
		}
		output, err := s.Run(directory, append(args, "--")...)
		if err != nil {
			return failure(err)
		}
		result.Commits = gitCommits(output)
		return success()
	case "stage", "unstage", "diff":
		if request.All && request.Action == "stage" {
			return run("add", "-A")
		}
		if request.All && request.Action == "unstage" {
			if _, err := s.Run(directory, "rev-parse", "--verify", "HEAD"); err != nil {
				return run("rm", "-r", "--cached", "--quiet", "--", ".")
			}
			return run("restore", "--staged", "--", ".")
		}
		name := request.Path
		if name == "" || filepath.IsAbs(name) || filepath.Clean(name) != name || name == ".." || strings.HasPrefix(name, "../") || strings.ContainsRune(name, 0) {
			return failure(errors.New("Choose a repository-relative file"))
		}
		paths := []string{name}
		// Staging either side of a rename must include its partner; diffs already
		// receive the selected path and must not scan unrelated untracked files.
		if request.Action != "diff" {
			changes, err := s.Run(directory, "status", "--porcelain=v1", "-z", "--untracked-files=all")
			if err != nil {
				return failure(err)
			}
			for _, change := range gitChanges(changes) {
				if change.Path == name && change.Original != "" {
					paths = append(paths, change.Original)
				}
			}
		}
		if request.Action == "stage" {
			return run(append([]string{"add", "--"}, paths...)...)
		}
		if request.Action == "unstage" {
			if _, err := s.Run(directory, "rev-parse", "--verify", "HEAD"); err != nil {
				return run(append([]string{"rm", "--cached", "--"}, paths...)...)
			}
			return run(append([]string{"restore", "--staged", "--"}, paths...)...)
		}
		if request.Action == "diff" && request.Staged {
			// Read index renames without walking the worktree or enumerating untracked files.
			renamed, err := s.Run(directory, "diff", "--cached", "--name-status", "-z", "--diff-filter=R", "--no-ext-diff", "--no-textconv")
			if err != nil {
				return failure(err)
			}
			entries := strings.Split(renamed, "\x00")
			for i := 0; i+2 < len(entries); i += 3 {
				if entries[i+2] == name {
					paths = append(paths, entries[i+1])
				}
			}
		}
		args := []string{"diff", "--no-ext-diff", "--no-textconv", "--no-color"}
		if request.Staged {
			args = append(args, "--cached")
		}
		output, err := s.Run(directory, append(append(args, "--"), paths...)...)
		if err != nil {
			return failure(err)
		}
		if output == "" && !request.Staged {
			tracked, err := s.Run(directory, "ls-files", "--", name)
			if err != nil {
				return failure(err)
			}
			if tracked == "" {
				root, err := os.OpenRoot(directory)
				if err != nil {
					return failure(err)
				}
				defer root.Close()
				file, err := root.Open(name)
				if err != nil {
					return failure(err)
				}
				defer file.Close()
				info, err := file.Stat()
				if err != nil || !info.Mode().IsRegular() || info.Size() > 128*1024 {
					return failure(errors.New("Untracked diff supports regular files up to 128 KiB"))
				}
				data, err := io.ReadAll(io.LimitReader(file, 128*1024+1))
				if err != nil {
					return failure(err)
				}
				output = untrackedDiff(name, string(data))
			}
		}
		result.Diff = output
		return success()
	case "commit":
		if strings.TrimSpace(request.Message) == "" || len(request.Message) > 8192 {
			return failure(errors.New("Enter a commit message up to 8192 bytes"))
		}
		if request.All {
			if _, err := s.Run(directory, "add", "-A"); err != nil {
				return failure(err)
			}
		}
		return run("commit", "-m", request.Message)
	case "fetch":
		return run("fetch")
	case "pull":
		return run("pull", "--ff-only")
	case "push":
		return run("push")
	case "sync":
		pulled, err := s.Run(directory, "pull", "--ff-only")
		if err != nil {
			return failure(err)
		}
		pushed, err := s.Run(directory, "push")
		if err != nil {
			return failure(err)
		}
		result.Output = strings.TrimSpace(pulled + "\n" + pushed)
		return success()
	case "publish":
		remote, err := s.remote(directory)
		if err != nil {
			return failure(err)
		}
		if remote == "" {
			return failure(errors.New("Add a Git remote before publishing this branch"))
		}
		return run("push", "-u", remote, "HEAD")
	default:
		return failure(errors.New("Unknown Git action"))
	}
}

func gitChanges(output string) []model.GitChange {
	changes := []model.GitChange{}
	entries := strings.Split(output, "\x00")
	for i := 0; i < len(entries); i++ {
		entry := entries[i]
		if len(entry) < 4 {
			continue
		}
		change := model.GitChange{Path: entry[3:], Index: entry[:1], Worktree: entry[1:2]}
		if strings.ContainsAny(entry[:2], "RC") && i+1 < len(entries) {
			i++
			change.Original = entries[i]
		}
		changes = append(changes, change)
	}
	return changes
}

// remote prefers origin, matching Git's default clone remote.
func (s Git) remote(directory string) (string, error) {
	output, err := s.Run(directory, "remote")
	if err != nil {
		return "", err
	}
	remotes := strings.Fields(output)
	for _, name := range remotes {
		if name == "origin" {
			return name, nil
		}
	}
	if len(remotes) > 0 {
		return remotes[0], nil
	}
	return "", nil
}

func gitBranch(output string, result *model.GitResult) {
	oid := ""
	for _, line := range strings.Split(output, "\n") {
		key, value, _ := strings.Cut(strings.TrimPrefix(line, "# "), " ")
		switch key {
		case "branch.oid":
			oid = value
		case "branch.head":
			result.Branch = value
		case "branch.upstream":
			result.Upstream = value
		case "branch.ab":
			fmt.Sscanf(value, "+%d -%d", &result.Ahead, &result.Behind)
		}
	}
	if result.Branch == "(detached)" && len(oid) >= 8 {
		result.Branch = oid[:8]
		result.Detached = true
	}
}

func gitCommits(output string) []model.GitCommit {
	commits := []model.GitCommit{}
	for _, record := range strings.Split(output, "\x1e") {
		fields := strings.Split(strings.TrimSpace(record), "\x1f")
		if len(fields) != 6 {
			continue
		}
		refs := []string{}
		for _, ref := range strings.Split(fields[5], ", ") {
			ref = strings.TrimPrefix(ref, "HEAD -> ")
			if ref != "" {
				refs = append(refs, ref)
			}
		}
		commits = append(commits, model.GitCommit{Hash: fields[0], Parents: strings.Fields(fields[1]), Subject: fields[2], Author: fields[3], Date: fields[4], Refs: refs})
	}
	return commits
}

// untrackedDiff renders a new file the way `git diff --no-index /dev/null file` would.
func untrackedDiff(name, content string) string {
	header := "new file mode 100644\n"
	if !savable(content) {
		return header + "Binary files /dev/null and b/" + name + " differ\n"
	}
	header += "--- /dev/null\n+++ b/" + name + "\n"
	if content == "" {
		return header
	}
	text := strings.TrimSuffix(content, "\n")
	lines := strings.Split(text, "\n")
	var out strings.Builder
	out.WriteString(header + "@@ -0,0 +1," + strconv.Itoa(len(lines)) + " @@\n")
	for _, line := range lines {
		out.WriteString("+" + line + "\n")
	}
	if text == content {
		out.WriteString("\\ No newline at end of file\n")
	}
	return out.String()
}
