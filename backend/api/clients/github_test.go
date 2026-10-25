package clients

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestGitHubBoundedResponses(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
		failure    string
	}{
		{"success", "data", 200, ""},
		{"limit", "12345", 200, "GitHub response exceeds update size limit"},
		{"status", "denied", 403, "GitHub returned HTTP 403; try again later"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := NewGitHub()
			client.http.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
				if r.Header.Get("User-Agent") != "Scratch-Tab-Updater" {
					t.Fatal(r.Header)
				}
				return &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})
			data, err := client.Get(context.Background(), "https://api.github.com/test", 4)
			if tc.failure == "" {
				if err != nil || string(data) != tc.body {
					t.Fatal(string(data), err)
				}
			} else if err == nil || err.Error() != tc.failure {
				t.Fatal(err)
			}
		})
	}
	client := NewGitHub()
	client.http.Transport = roundTrip(func(*http.Request) (*http.Response, error) { return nil, errors.New("offline") })
	if _, err := client.Get(context.Background(), "https://api.github.com/test", 4); err == nil || err.Error() != "GitHub is unavailable; try again later" {
		t.Fatal(err)
	}
}

func TestGitHubRedirectPolicy(t *testing.T) {
	client := NewGitHub()
	for _, tc := range []struct {
		url    string
		denied bool
	}{
		{"https://github.com/file", false},
		{"https://release-assets.githubusercontent.com/file", false},
		{"https://api.github.com/file", false},
		{"http://github.com/file", true},
		{"https://example.com/file", true},
	} {
		request, _ := http.NewRequest("GET", tc.url, nil)
		if err := client.http.CheckRedirect(request, nil); (err != nil) != tc.denied {
			t.Fatal(tc, err)
		}
	}
	request, _ := http.NewRequest("GET", "https://github.com/file", nil)
	if err := client.http.CheckRedirect(request, make([]*http.Request, 6)); err == nil {
		t.Fatal("accepted excessive redirects")
	}
}
