package main

type Request struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Revision string `json:"revision"`
	Save     bool   `json:"save"`
	Create   bool   `json:"create,omitempty"`
}
type Result struct {
	Content  string `json:"content"`
	Revision string `json:"revision,omitempty"`
	Error    string `json:"error,omitempty"`
	Status   int    `json:"status"`
}
