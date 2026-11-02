package services_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
	"futrx.local/catalog/applications/scratch-tab/backend/container/repositories"
	"futrx.local/catalog/applications/scratch-tab/backend/container/services"
)

func git(t *testing.T, directory string, args ...string) string {
	t.Helper()
	output, err := repositories.RunGit(directory, args...)
	if err != nil {
		t.Fatal(args, err)
	}
	return output
}
func initRepo(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0755); err != nil {
		t.Fatal(err)
	}
	git(t, path, "init")
	git(t, path, "config", "user.email", "test@example.com")
	git(t, path, "config", "user.name", "Test")
}
func write(t *testing.T, repository, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(repository, name), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}
func operateGit(t *testing.T, root string, request model.GitRequest) *model.GitResult {
	t.Helper()
	result := (services.Git{Run: repositories.RunGit, Discover: repositories.DiscoverGit}).Operate(root, request)
	if result.Status != 200 || result.Git == nil {
		t.Fatal(request, result)
	}
	return result.Git
}
func TestGitDiscoversNestedSiblingAndWorktree(t *testing.T) {
	root := t.TempDir()
	one := filepath.Join(root, "one")
	two := filepath.Join(root, "other", "two")
	nested := filepath.Join(one, "nested")
	for _, path := range []string{one, two, nested} {
		initRepo(t, path)
	}
	write(t, two, "note.txt", "first\n")
	git(t, two, "add", ".")
	git(t, two, "commit", "-m", "initial")
	worktree := filepath.Join(root, "worktree")
	git(t, two, "worktree", "add", "-b", "another", worktree)
	result := operateGit(t, root, model.GitRequest{Action: "repositories"})
	if len(result.Repositories) != 4 {
		t.Fatal(result.Repositories)
	}
	for _, path := range []string{one, two, nested, worktree} {
		found := false
		for _, actual := range result.Repositories {
			found = found || actual == path
		}
		if !found {
			t.Fatal(path, result.Repositories)
		}
	}
	operateGit(t, root, model.GitRequest{Action: "status", Repository: worktree})
}
func TestGitDiffStageUnstageCommitAndRename(t *testing.T) {
	root := t.TempDir()
	repo := filepath.Join(root, "repo")
	initRepo(t, repo)
	name := "note [draft].txt"
	write(t, repo, name, "first\n")
	request := model.GitRequest{Repository: repo, Action: "diff", Path: name}
	if diff := operateGit(t, root, request).Diff; !strings.Contains(diff, "new file mode") || !strings.Contains(diff, "@@ -0,0 +1,1 @@\n+first\n") || strings.Contains(diff, "No newline") {
		t.Fatal(diff)
	}
	write(t, repo, "partial.txt", "one\ntwo")
	if diff := operateGit(t, root, model.GitRequest{Repository: repo, Action: "diff", Path: "partial.txt"}).Diff; !strings.HasSuffix(diff, "@@ -0,0 +1,2 @@\n+one\n+two\n\\ No newline at end of file\n") {
		t.Fatal(diff)
	}
	if err := os.Remove(filepath.Join(repo, "partial.txt")); err != nil {
		t.Fatal(err)
	}
	request.Action = "stage"
	operateGit(t, root, request)
	request.Action = "unstage"
	operateGit(t, root, request)
	if output := git(t, repo, "ls-files"); output != "" {
		t.Fatal(output)
	}
	request.Action = "stage"
	operateGit(t, root, request)
	operateGit(t, root, model.GitRequest{Action: "commit", Repository: repo, Message: "first commit"})
	write(t, repo, name, "second\n")
	request.Action = "diff"
	if diff := operateGit(t, root, request).Diff; !strings.Contains(diff, "-first") || !strings.Contains(diff, "+second") {
		t.Fatal(diff)
	}
	request.Action = "stage"
	operateGit(t, root, request)
	request.Action = "diff"
	request.Staged = true
	if diff := operateGit(t, root, request).Diff; !strings.Contains(diff, "+second") {
		t.Fatal(diff)
	}
	request.Action = "unstage"
	operateGit(t, root, request)
	write(t, repo, "other.txt", "other\n")
	operateGit(t, root, model.GitRequest{Action: "stage", Repository: repo, All: true})
	if staged := git(t, repo, "diff", "--cached", "--name-only"); !strings.Contains(staged, "other.txt") || !strings.Contains(staged, name) {
		t.Fatal(staged)
	}
	operateGit(t, root, model.GitRequest{Action: "unstage", Repository: repo, All: true})
	if staged := git(t, repo, "diff", "--cached", "--name-only"); staged != "" {
		t.Fatal(staged)
	}
	if err := os.Remove(filepath.Join(repo, "other.txt")); err != nil {
		t.Fatal(err)
	}
	git(t, repo, "restore", "--", name)
	git(t, repo, "mv", name, "renamed.txt")
	diff := operateGit(t, root, model.GitRequest{Action: "diff", Repository: repo, Path: "renamed.txt", Staged: true}).Diff
	if !strings.Contains(diff, "rename from "+name) || !strings.Contains(diff, "rename to renamed.txt") {
		t.Fatal("Rename diff must retain the original path:", diff)
	}
	status := operateGit(t, root, model.GitRequest{Action: "status", Repository: repo})
	if len(status.Changes) != 1 || status.Changes[0].Original != name {
		t.Fatal(status)
	}
	request.Path = "renamed.txt"
	request.Action = "unstage"
	operateGit(t, root, request)
	if diff := git(t, repo, "diff", "--cached"); diff != "" {
		t.Fatal("rename did not fully unstage", diff)
	}
}
func TestGitErrorsAndLiteralPaths(t *testing.T) {
	root := t.TempDir()
	repo := filepath.Join(root, "repo")
	initRepo(t, repo)
	svc := services.Git{Run: repositories.RunGit, Discover: repositories.DiscoverGit}
	for _, request := range []model.GitRequest{
		{Action: "status", Repository: "/tmp"}, {Action: "status", Repository: filepath.Join(repo, "missing")},
		{Action: "stage", Repository: repo, Path: "../outside"}, {Action: "stage", Repository: repo, Path: ""},
		{Action: "commit", Repository: repo, Message: ""}, {Action: "commit", Repository: repo, Message: "no files"},
		{Action: "push", Repository: repo}, {Action: "reset", Repository: repo},
	} {
		if result := svc.Operate(root, request); result.Status == 200 || result.Error == "" {
			t.Fatal(request, result)
		}
	}
	write(t, repo, "a.txt", "a")
	write(t, repo, "b.txt", "b")
	if result := svc.Operate(root, model.GitRequest{Action: "stage", Repository: repo, Path: "*.txt"}); result.Status == 200 {
		t.Fatal("wildcard expanded")
	}
	outside := t.TempDir()
	write(t, outside, "secret.txt", "private")
	if err := os.Symlink(filepath.Join(outside, "secret.txt"), filepath.Join(repo, "link.txt")); err != nil {
		t.Fatal(err)
	}
	if result := svc.Operate(root, model.GitRequest{Action: "diff", Repository: repo, Path: "link.txt"}); result.Status == 200 {
		t.Fatal("external symlink read")
	}
}
func TestGitLocalRemoteFetchPullPush(t *testing.T) {
	root := t.TempDir()
	remote := filepath.Join(root, "remote.git")
	initRepo(t, remote)
	git(t, remote, "config", "core.bare", "true")
	repo := filepath.Join(root, "working")
	initRepo(t, repo)
	write(t, repo, "note.txt", "one")
	git(t, repo, "add", ".")
	git(t, repo, "commit", "-m", "first")
	if result := (services.Git{Run: repositories.RunGit}).Operate(root, model.GitRequest{Action: "publish", Repository: repo}); result.Status == 200 {
		t.Fatal("published without a remote")
	}
	git(t, repo, "remote", "add", "origin", remote)
	status := operateGit(t, root, model.GitRequest{Action: "status", Repository: repo})
	if status.Remote != "origin" || status.Upstream != "" || status.Branch == "" {
		t.Fatal(status)
	}
	operateGit(t, root, model.GitRequest{Action: "publish", Repository: repo})
	write(t, repo, "note.txt", "two")
	write(t, repo, "new.txt", "new")
	operateGit(t, root, model.GitRequest{Action: "commit", Repository: repo, Message: "all", All: true})
	status = operateGit(t, root, model.GitRequest{Action: "status", Repository: repo})
	if status.Upstream != "origin/"+status.Branch || status.Ahead != 1 || status.Behind != 0 || len(status.Changes) != 0 {
		t.Fatal(status)
	}
	for _, action := range []string{"fetch", "pull", "push", "sync"} {
		operateGit(t, root, model.GitRequest{Action: action, Repository: repo})
	}
	if status = operateGit(t, root, model.GitRequest{Action: "status", Repository: repo}); status.Ahead != 0 {
		t.Fatal(status)
	}
	log := operateGit(t, root, model.GitRequest{Action: "log", Repository: repo})
	head := "refs/heads/" + status.Branch
	if len(log.Commits) != 2 || log.Commits[0].Subject != "all" || log.Commits[0].Refs[0] != head || log.Commits[0].Parents[0] != log.Commits[1].Hash || len(log.Commits[1].Parents) != 0 {
		t.Fatal(log.Commits)
	}
	git(t, repo, "checkout", "--detach", "HEAD~1")
	if status = operateGit(t, root, model.GitRequest{Action: "status", Repository: repo}); !status.Detached || !strings.HasPrefix(log.Commits[1].Hash, status.Branch) {
		t.Fatal(status)
	}
	empty := filepath.Join(root, "empty")
	initRepo(t, empty)
	if log := operateGit(t, root, model.GitRequest{Action: "log", Repository: empty}); len(log.Commits) != 0 {
		t.Fatal(log.Commits)
	}
}

func TestGitDiffDoesNotScanRepositoryStatus(t *testing.T) {
	root := t.TempDir()
	repo := filepath.Join(root, "repo")
	initRepo(t, repo)
	write(t, repo, "note.txt", "before\n")
	git(t, repo, "add", ".")
	git(t, repo, "commit", "-m", "initial")
	write(t, repo, "note.txt", "after\n")
	service := services.Git{Run: func(directory string, args ...string) (string, error) {
		if args[0] == "status" {
			t.Error("Single-file diff scans the entire repository")
		}
		return repositories.RunGit(directory, args...)
	}}
	result := service.Operate(root, model.GitRequest{Action: "diff", Repository: repo, Path: "note.txt"})
	if result.Status != 200 || result.Git == nil || !strings.Contains(result.Git.Diff, "+after") {
		t.Fatal(result)
	}
}

func TestGitFindsActiveRepositoryWithoutWorkspaceScan(t *testing.T) {
	root := t.TempDir()
	parent := filepath.Join(root, "parent")
	nested := filepath.Join(parent, "nested")
	initRepo(t, parent)
	initRepo(t, nested)
	write(t, parent, "note.txt", "first")
	git(t, parent, "add", "note.txt")
	git(t, parent, "commit", "-m", "initial")
	worktree := filepath.Join(root, "worktree")
	git(t, parent, "worktree", "add", "-b", "another", worktree)
	svc := services.Git{Run: repositories.RunGit, Discover: func(string) ([]string, error) {
		t.Fatal("Active repository lookup scanned the workspace")
		return nil, nil
	}}
	for _, repo := range []string{parent, nested, worktree} {
		folder := filepath.Join(repo, "src")
		if err := os.MkdirAll(folder, 0755); err != nil {
			t.Fatal(err)
		}
		result := svc.Operate(root, model.GitRequest{Action: "repository", Path: filepath.Join(folder, "missing.txt")})
		if result.Status != 200 || result.Git == nil || len(result.Git.Repositories) != 1 || result.Git.Repositories[0] != repo {
			t.Fatal(repo, result)
		}
	}
	empty := svc.Operate(root, model.GitRequest{Action: "repository", Path: filepath.Join(root, "outside-repos.txt")})
	if empty.Status != 200 || empty.Git == nil || len(empty.Git.Repositories) != 0 {
		t.Fatal(empty)
	}
	broken := filepath.Join(root, "broken")
	if err := os.MkdirAll(broken, 0755); err != nil {
		t.Fatal(err)
	}
	write(t, broken, ".git", "invalid worktree metadata")
	if result := svc.Operate(root, model.GitRequest{Action: "repository", Path: filepath.Join(broken, "note.txt")}); result.Status == 200 || result.Error == "" {
		t.Fatal(result)
	}
	outside := t.TempDir()
	link := filepath.Join(root, "escape")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	if result := svc.Operate(root, model.GitRequest{Action: "repository", Path: filepath.Join(link, "note.txt")}); result.Status == 200 {
		t.Fatal(result)
	}

	for _, path := range []string{"relative/file", "/tmp/outside.txt", "", filepath.Join(root, "bad\x00.txt")} {
		if result := svc.Operate(root, model.GitRequest{Action: "repository", Path: path}); result.Status == 200 {
			t.Fatal(path, result)
		}
	}
}

func TestGitActiveRepositorySkipsEmptyGitDirectory(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0755); err != nil {
		t.Fatal(err)
	}
	result := (services.Git{Run: repositories.RunGit}).Operate(root, model.GitRequest{Action: "repository", Path: filepath.Join(root, "note.txt")})
	if result.Status != 200 || result.Git == nil || len(result.Git.Repositories) != 0 {
		t.Fatalf("An empty .git folder is not a repository: %+v", result)
	}
	repo := filepath.Join(root, "repo")
	initRepo(t, repo)
	folder := filepath.Join(repo, "src")
	if err := os.MkdirAll(filepath.Join(folder, ".git"), 0755); err != nil {
		t.Fatal(err)
	}
	result = (services.Git{Run: repositories.RunGit}).Operate(root, model.GitRequest{Action: "repository", Path: filepath.Join(folder, "note.txt")})
	if result.Status != 200 || result.Git == nil || len(result.Git.Repositories) != 1 || result.Git.Repositories[0] != repo {
		t.Fatalf("Lookup must continue to the real parent repository: %+v", result)
	}
	write(t, root, ".git/incomplete", "broken metadata")
	result = (services.Git{Run: repositories.RunGit}).Operate(root, model.GitRequest{Action: "repository", Path: filepath.Join(root, "note.txt")})
	if result.Status == 200 || result.Error == "" {
		t.Fatal("Nonempty damaged metadata must still report an error", result)
	}

}
