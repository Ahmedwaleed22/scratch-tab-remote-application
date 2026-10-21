// Package updates reads only Scratch Tab's public stable GitHub releases.
package updates

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const releaseURL = "https://api.github.com/repos/Ahmedwaleed22/scratch-tab-remote-application/releases/latest"

// Bound in-memory downloads; larger packages remain available by manual upload.
const maxArchiveBytes = 2 * 1024 * 1024

var versionPattern = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

type Release struct {
	Version string `json:"version"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	Digest  string `json:"digest"`
	Size    int64  `json:"size"`
}
type Client struct {
	http    *http.Client
	mu      sync.Mutex
	cached  Release
	expires time.Time
}

func New() *Client {
	return &Client{http: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		host := req.URL.Hostname()
		if len(via) > 5 || req.URL.Scheme != "https" || (host != "github.com" && host != "release-assets.githubusercontent.com" && host != "api.github.com") {
			return errors.New("unexpected GitHub redirect")
		}
		return nil
	}}}
}
func (c *Client) get(ctx context.Context, url string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Scratch-Tab-Updater")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, errors.New("GitHub is unavailable; try again later")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub returned HTTP %d; try again later", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("GitHub response exceeds update size limit")
	}
	return data, nil
}
func (c *Client) Latest(ctx context.Context) (Release, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Now().Before(c.expires) {
		return c.cached, nil
	}
	data, err := c.get(ctx, releaseURL, 256*1024)
	if err != nil {
		return Release{}, err
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
		return Release{}, errors.New("GitHub returned an invalid stable release")
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
			return Release{}, errors.New("Release ZIP has invalid metadata or exceeds the 2 MiB automatic update limit")
		}
		c.cached = Release{version, name, expected, a.Digest, a.Size}
		c.expires = time.Now().Add(time.Hour)
		return c.cached, nil
	}
	return Release{}, errors.New("Latest release has no installable Scratch Tab ZIP")
}
func (c *Client) Archive(ctx context.Context, version string) ([]byte, error) {
	r, err := c.Latest(ctx)
	if err != nil {
		return nil, err
	}
	if version != r.Version {
		return nil, errors.New("Release changed; check for updates again")
	}
	data, err := c.get(ctx, r.URL, maxArchiveBytes)
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
