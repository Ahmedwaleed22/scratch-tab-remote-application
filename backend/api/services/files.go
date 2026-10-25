package services

import (
	"context"

	"futrx.local/catalog/applications/scratch-tab/backend/api/config"
)

type Runner func(context.Context, string, []byte) ([]byte, error)
type Files struct{ Run Runner }

func (s Files) Execute(ctx context.Context, container string, body []byte) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, config.FileCommandTimeout)
	defer cancel()
	return s.Run(ctx, container, body)
}
