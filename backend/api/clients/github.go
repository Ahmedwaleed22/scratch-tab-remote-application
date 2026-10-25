package clients

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type GitHub struct{ http *http.Client }

func NewGitHub() *GitHub {
	return &GitHub{http: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		host := req.URL.Hostname()
		if len(via) > 5 || req.URL.Scheme != "https" || (host != "github.com" && host != "release-assets.githubusercontent.com" && host != "api.github.com") {
			return errors.New("unexpected GitHub redirect")
		}
		return nil
	}}}
}
func (c *GitHub) Get(ctx context.Context, url string, limit int64) ([]byte, error) {
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
