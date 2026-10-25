package services

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestVerifiedArchive(t *testing.T) {
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	w, _ := z.Create("application.json")
	w.Write([]byte(`{"id":"scratch-tab","version":"0.4.0"}`))
	z.Close()
	archive := buf.Bytes()
	sum := sha256.Sum256(archive)
	metadata := map[string]any{"tag_name": "v0.4.0", "assets": []map[string]any{{"name": "scratch-tab-0.4.0.zip", "size": len(archive), "digest": "sha256:" + hex.EncodeToString(sum[:]), "browser_download_url": "https://github.com/Ahmedwaleed22/scratch-tab-remote-application/releases/download/v0.4.0/scratch-tab-0.4.0.zip"}}}
	raw, _ := json.Marshal(metadata)
	calls := 0
	c := NewUpdates(nil)
	c.fetch = func(_ context.Context, url string, _ int64) ([]byte, error) {
		calls++
		data := archive
		if url == releaseURL {
			data = raw
		}
		return data, nil
	}
	ctx := context.Background()
	for i := 0; i < 2; i++ {
		r, err := c.Latest(ctx)
		if err != nil || r.Version != "0.4.0" {
			t.Fatal(r, err)
		}
	}
	if calls != 1 {
		t.Fatal("release checks not cached", calls)
	}
	if _, err := c.Archive(ctx, "0.3.0"); err == nil {
		t.Fatal("accepted unexpected version")
	}
	if data, err := c.Archive(ctx, "0.4.0"); err != nil || !bytes.Equal(data, archive) {
		t.Fatal(err)
	}
	archive = []byte("tampered")
	if _, err := c.Archive(ctx, "0.4.0"); err == nil {
		t.Fatal("accepted tampered ZIP")
	}
}
func TestRejectsInvalidRelease(t *testing.T) {
	for _, body := range []string{`{}`, `{"tag_name":"v0.4.0-beta","assets":[]}`, `{"tag_name":"v0.4.0","prerelease":true}`, strings.Repeat("x", 256*1024+1)} {
		c := NewUpdates(nil)
		c.fetch = func(context.Context, string, int64) ([]byte, error) {
			return []byte(body), nil
		}
		if _, err := c.Latest(context.Background()); err == nil {
			t.Fatal("accepted invalid metadata")
		}
	}
	c := NewUpdates(nil)
	c.fetch = func(context.Context, string, int64) ([]byte, error) {
		return nil, errors.New("GitHub returned HTTP 403; try again later")
	}
	if _, err := c.Latest(context.Background()); err == nil {
		t.Fatal("ignored rate limit")
	}
}
