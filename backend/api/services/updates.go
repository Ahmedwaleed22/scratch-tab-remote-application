// Updates verifies and caches Scratch Tab stable releases.
package services

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strings"
	"sync"
	"time"

	"futrx.local/catalog/applications/scratch-tab/backend/api/model"
)

const releaseURL = "https://api.github.com/repos/Ahmedwaleed22/scratch-tab-remote-application/releases/latest"

// Bound in-memory downloads; larger packages remain available by manual upload.
const maxArchiveBytes = 2 * 1024 * 1024

var versionPattern = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

type Updates struct {
	fetch   Fetch
	mu      sync.Mutex
	cached  model.Release
	expires time.Time
}

type Fetch func(context.Context, string, int64) ([]byte, error)

func NewUpdates(fetch Fetch) *Updates { return &Updates{fetch: fetch} }
func (c *Updates) Latest(ctx context.Context) (model.Release, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Now().Before(c.expires) {
		return c.cached, nil
	}
	data, err := c.fetch(ctx, releaseURL, 256*1024)
	if err != nil {
		return model.Release{}, err
	}
	var r struct {
		Tag        string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name   string `json:"name"`
			URL    string `json:"browser_download_url"`
			Digest string `json:"digest"`
			Size   int64  `json:"size"`
		} `json:"assets"`
	}
	if json.Unmarshal(data, &r) != nil || !versionPattern.MatchString(r.Tag) || r.Draft || r.Prerelease {
		return model.Release{}, errors.New("GitHub returned an invalid stable release")
	}
	version := strings.TrimPrefix(r.Tag, "v")
	name := "scratch-tab-" + version + ".zip"
	expected := "https://github.com/Ahmedwaleed22/scratch-tab-remote-application/releases/download/" + r.Tag + "/" + name
	for _, a := range r.Assets {
		if a.Name != name {
			continue
		}
		digest, err := hex.DecodeString(strings.TrimPrefix(a.Digest, "sha256:"))
		if a.URL != expected || !strings.HasPrefix(a.Digest, "sha256:") || err != nil || len(digest) != 32 || a.Size <= 0 || a.Size > maxArchiveBytes {
			return model.Release{}, errors.New("Release ZIP has invalid metadata or exceeds the 2 MiB automatic update limit")
		}
		c.cached = model.Release{Version: version, Name: name, URL: expected, Digest: a.Digest, Size: a.Size}
		c.expires = time.Now().Add(time.Hour)
		return c.cached, nil
	}
	return model.Release{}, errors.New("Latest release has no installable Scratch Tab ZIP")
}
func (c *Updates) Archive(ctx context.Context, version string) ([]byte, error) {
	r, err := c.Latest(ctx)
	if err != nil {
		return nil, err
	}
	if version != r.Version {
		return nil, errors.New("Release changed; check for updates again")
	}
	data, err := c.fetch(ctx, r.URL, maxArchiveBytes)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(data)
	if int64(len(data)) != r.Size || "sha256:"+hex.EncodeToString(sum[:]) != r.Digest {
		return nil, errors.New("Release ZIP checksum does not match GitHub")
	}
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, errors.New("Release is not a ZIP archive")
	}
	found := false
	for _, f := range archive.File {
		if f.Name == "application.json" {
			if found || f.UncompressedSize64 > 64*1024 {
				return nil, errors.New("Invalid release manifest")
			}
			found = true
			reader, err := f.Open()
			if err != nil {
				return nil, err
			}
			manifest, err := io.ReadAll(io.LimitReader(reader, 64*1024+1))
			reader.Close()
			if err != nil {
				return nil, err
			}
			var app struct {
				ID      string `json:"id"`
				Version string `json:"version"`
			}
			if json.Unmarshal(manifest, &app) != nil || app.ID != "scratch-tab" || app.Version != version {
				return nil, errors.New("Release manifest does not match Scratch Tab version")
			}
		}
	}
	if !found {
		return nil, errors.New("Release ZIP has no manifest")
	}
	return data, nil
}
