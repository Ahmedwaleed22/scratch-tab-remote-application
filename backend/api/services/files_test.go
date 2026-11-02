package services

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestGitCommandsHaveTimeForHooksWhileFilesKeepShortDeadline(t *testing.T) {
	for _, tt := range []struct {
		body             string
		minimum, maximum time.Duration
	}{
		{`{"path":"/workspace/note.txt"}`, 7 * time.Second, 9 * time.Second},
		{`{"git":{"action":"commit","repository":"/workspace/repo","message":"test"}}`, 89 * time.Second, 91 * time.Second},
	} {
		expected := errors.New("container failed")
		service := Files{Run: func(ctx context.Context, container string, body []byte) ([]byte, error) {
			deadline, ok := ctx.Deadline()
			remaining := time.Until(deadline)
			if !ok || remaining < tt.minimum || remaining > tt.maximum || container != "project" || string(body) != tt.body {
				t.Fatal(deadline, container, string(body))
			}
			return nil, expected
		}}
		if _, err := service.Execute(context.Background(), "project", []byte(tt.body)); !errors.Is(err, expected) {
			t.Fatal(err)
		}
	}
}
