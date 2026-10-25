package transport

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"

	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
)

type closer func() error

func (f closer) Close() error { return f() }

type output struct {
	bytes.Buffer
	locked *bool
}

func (w *output) Write(p []byte) (int, error) {
	if !*w.locked {
		panic("output encoded without command lock")
	}
	return w.Buffer.Write(p)
}
func TestCommandLockLifetime(t *testing.T) {
	for _, body := range []string{`{"path":"/workspace/note"}`, `broken`} {
		locked := false
		called := false
		writer := &output{locked: &locked}
		command := Command{
			Lock: func() (io.Closer, error) {
				locked = true
				return closer(func() error { locked = false; return nil }), nil
			},
			Operate: func(request model.Request) model.Result {
				called = true
				if !locked || request.Path != "/workspace/note" {
					t.Fatal(request, locked)
				}
				return model.Result{Status: 200, Content: "hello"}
			},
		}
		var diagnostics bytes.Buffer
		command.Serve(strings.NewReader(body), writer, &diagnostics)
		if locked || diagnostics.Len() != 0 {
			t.Fatal(locked, diagnostics.String())
		}
		if body == "broken" {
			if called || writer.String() != "{\"content\":\"\",\"error\":\"Invalid file request.\",\"status\":400}\n" {
				t.Fatal(called, writer.String())
			}
		} else if !called || writer.String() != "{\"content\":\"hello\",\"status\":200}\n" {
			t.Fatal(called, writer.String())
		}
	}
}
func TestCommandLockUnavailable(t *testing.T) {
	command := Command{Lock: func() (io.Closer, error) { return nil, errors.New("unavailable") }}
	var result, diagnostics bytes.Buffer
	command.Serve(strings.NewReader("{}"), &result, &diagnostics)
	if result.String() != "{\"content\":\"\",\"error\":\"Save lock unavailable.\",\"status\":503}\n" || diagnostics.Len() != 0 {
		t.Fatal(result.String(), diagnostics.String())
	}
}
