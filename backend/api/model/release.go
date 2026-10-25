package model

type Release struct {
	Version string `json:"version"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Digest  string `json:"digest"`
	Size    int64  `json:"size"`
}
