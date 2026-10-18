package api

import (
	"context"
	"errors"
	"github.com/futrx-com/remote.futrx.com/pkg/applications"
	"testing"
)

func TestScopedFileCall(t *testing.T) {
	called := false
	b := New(func(_ context.Context, container string, body []byte) ([]byte, error) {
		called = true
		if container != "project-one" || string(body) != "{}" {
			t.Fatal(container, string(body))
		}
		return []byte(`{"status":200,"revision":"abc"}`), nil
	})
	if err := b.Init(applications.Instance{Scope: "project", ProjectID: "p1", ContainerName: "project-one"}); err != nil {
		t.Fatal(err)
	}
	response, _ := b.Handle(applications.Request{Method: "POST", Path: "file", Body: []byte("{}"), Caller: applications.Caller{Email: "member@example.com"}})
	if response.Status != 200 || !called {
		t.Fatal(response)
	}
	response, _ = b.Handle(applications.Request{Method: "POST", Path: "file"})
	if response.Status != 401 {
		t.Fatal(response)
	}
}
func TestUnavailableAndInvalidScope(t *testing.T) {
	b := New(func(context.Context, string, []byte) ([]byte, error) { return nil, errors.New("failed") })
	if err := b.Init(applications.Instance{Scope: "global"}); err == nil {
		t.Fatal("global accepted")
	}
	b.Init(applications.Instance{Scope: "project", ProjectID: "p1", ContainerName: "one"})
	response, _ := b.Handle(applications.Request{Method: "POST", Path: "file", Caller: applications.Caller{Email: "user"}})
	if response.Status != 503 {
		t.Fatal(response)
	}
}
