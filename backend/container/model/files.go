package model

type Request struct {
	List     bool        `json:"list,omitempty"`
	Git      *GitRequest `json:"git,omitempty"`
	Path     string      `json:"path"`
	Content  string      `json:"content"`
	Revision string      `json:"revision"`
	Save     bool        `json:"save"`
	Create   bool        `json:"create,omitempty"`
}
type DirectoryEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

type Result struct {
	Entries  *[]DirectoryEntry `json:"entries,omitempty"`
	Git      *GitResult        `json:"git,omitempty"`
	Content  string            `json:"content"`
	Revision string            `json:"revision,omitempty"`
	Error    string            `json:"error,omitempty"`
	Status   int               `json:"status"`
}
