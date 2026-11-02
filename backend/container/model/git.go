package model

type GitRequest struct {
	Action     string `json:"action"`
	Repository string `json:"repository"`
	Path       string `json:"path,omitempty"`
	Staged     bool   `json:"staged,omitempty"`
	All        bool   `json:"all,omitempty"`
	Message    string `json:"message,omitempty"`
}
type GitChange struct {
	Path     string `json:"path"`
	Original string `json:"original,omitempty"`
	Index    string `json:"index"`
	Worktree string `json:"worktree"`
}
type GitCommit struct {
	Hash    string   `json:"hash"`
	Parents []string `json:"parents"`
	Subject string   `json:"subject"`
	Author  string   `json:"author"`
	Date    string   `json:"date"`
	Refs    []string `json:"refs,omitempty"`
}
type GitResult struct {
	Repositories []string    `json:"repositories,omitempty"`
	Branch       string      `json:"branch,omitempty"`
	Upstream     string      `json:"upstream,omitempty"`
	Detached     bool        `json:"detached,omitempty"`
	Ahead        int         `json:"ahead,omitempty"`
	Behind       int         `json:"behind,omitempty"`
	Remote       string      `json:"remote,omitempty"`
	Changes      []GitChange `json:"changes"`
	Commits      []GitCommit `json:"commits,omitempty"`
	Diff         string      `json:"diff,omitempty"`
	Output       string      `json:"output,omitempty"`
}
