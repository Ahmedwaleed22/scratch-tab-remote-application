package services

import (
	"context"
	"encoding/json"

	"futrx.local/catalog/applications/scratch-tab/backend/api/config"
)

type Runner func(context.Context, string, []byte) ([]byte, error)
type Files struct{ Run Runner }

func (s Files) Execute(ctx context.Context, container string, body []byte) ([]byte, error) {
	timeout := config.FileCommandTimeout
	var request struct {
		Git json.RawMessage `json:"git"`
	}
	if json.Unmarshal(body, &request) == nil && len(request.Git) > 0 {
		timeout = config.GitCommandTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return s.Run(ctx, container, body)
}
