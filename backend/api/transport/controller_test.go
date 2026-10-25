package transport

import (
	"context"
	"errors"
	"testing"

	"futrx.local/catalog/applications/scratch-tab/backend/api/services"
	"github.com/futrx-com/remote.futrx.com/pkg/applications"
)

func TestScopedFileCall(t *testing.T) {
	called := false
	b := New(services.Files{Run: func(_ context.Context, container string, body []byte) ([]byte, error) {
		called = true
		if container != "project-one" || string(body) != "{}" {
			t.Fatal(container, string(body))
		}
		return []byte(`{"status":200,"revision":"abc"}`), nil
	}}, nil)
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
	b := New(services.Files{Run: func(context.Context, string, []byte) ([]byte, error) { return nil, errors.New("failed") }}, nil)
	if err := b.Init(applications.Instance{Scope: "global"}); err == nil {
		t.Fatal("global accepted")
	}
	b.Init(applications.Instance{Scope: "project", ProjectID: "p1", ContainerName: "one"})
	response, _ := b.Handle(applications.Request{Method: "POST", Path: "file", Caller: applications.Caller{Email: "user"}})
	if response.Status != 503 {
		t.Fatal(response)
	}
}

func TestUpdatesRequireAdministrator(t *testing.T) {
	b := New(services.Files{}, nil)
	for _, path := range []string{"updates", "updates/archive"} {
		r, _ := b.Handle(applications.Request{Method: "GET", Path: path, Caller: applications.Caller{Email: "member@example.com"}})
		if r.Status != 403 {
			t.Fatal(path, r)
		}
	}
}

func TestInvalidUpdateRequests(t *testing.T) {
	b := New(services.Files{}, nil)
	for _, tt := range []struct {
		method, path, body string
		status             int
	}{
		{"DELETE", "updates", "", 405},
		{"POST", "updates/archive", "{}", 400},
		{"POST", "updates/archive", "broken", 400},
	} {
		r, _ := b.Handle(applications.Request{Method: tt.method, Path: tt.path, Body: []byte(tt.body), Caller: applications.Caller{Email: "admin@example.com", IsAdmin: true}})
		if r.Status != tt.status {
			t.Fatal(tt, r)
		}
	}
}
