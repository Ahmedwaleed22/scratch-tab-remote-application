package api

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"futrx.local/catalog/applications/scratch-tab/backend/config"
	"futrx.local/catalog/applications/scratch-tab/backend/updates"
	"github.com/futrx-com/remote.futrx.com/pkg/applications"
)

type Runner func(context.Context, string, []byte) ([]byte, error)
type backend struct {
	instance applications.Instance
	run      Runner
	updates  *updates.Client
}

func New(run Runner, updater *updates.Client) applications.Backend {
	return &backend{run: run, updates: updater}
}
func (b *backend) Init(instance applications.Instance) error {
	if instance.Scope != "project" || instance.ProjectID == "" || instance.ContainerName == "" {
		return errors.New("Scratch Tab requires a project container; reinstall the application")
	}
	b.instance = instance
	return nil
}
func (b *backend) Describe() (applications.Descriptor, error) {
	return applications.Descriptor{APIVersion: applications.APIVersion, Routes: []applications.Route{{Method: "GET", Path: "updates", Description: "Check stable Scratch Tab releases (admin only)"}, {Method: "POST", Path: "updates/archive", Description: "Download verified Scratch Tab ZIP (admin only)"}, {Method: "POST", Path: "file", Description: "Read or save a project workspace text file"}}}, nil
}
func (b *backend) Handle(request applications.Request) (applications.Response, error) {
	if request.Caller.Email == "" {
		return applications.Errorf(401, "Sign in to access files."), nil
	}
	if request.Path == "updates" || request.Path == "updates/archive" {
		if !request.Caller.IsAdmin {
			return applications.Errorf(403, "Only administrators can manage Scratch Tab updates."), nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if request.Path == "updates" && request.Method == "GET" {
			release, err := b.updates.Latest(ctx)
			if err != nil {
				return applications.Errorf(502, "%s", err.Error()), nil
			}
			body, _ := json.Marshal(release)
			return applications.Response{Status: 200, Headers: map[string][]string{"Content-Type": {"application/json"}}, Body: body}, nil
		}
		if request.Path == "updates/archive" && request.Method == "POST" {
			var input struct {
				Version string `json:"version"`
			}
			if len(request.Body) > 1024 || json.Unmarshal(request.Body, &input) != nil || input.Version == "" {
				return applications.Errorf(400, "A release version is required."), nil
			}
			data, err := b.updates.Archive(ctx, input.Version)
			if err != nil {
				return applications.Errorf(502, "%s", err.Error()), nil
			}
			return applications.Response{Status: 200, Headers: map[string][]string{"Content-Type": {"application/zip"}}, Body: data}, nil
		}
		return applications.Errorf(405, "Method not allowed."), nil
	}
	if request.Path != "file" || request.Method != "POST" {
		return applications.Errorf(404, "Route not found."), nil
	}
	if len(request.Body) > config.MaxBackendRequestBytes {
		return applications.Errorf(413, "File request is too large."), nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), config.FileCommandTimeout)
	defer cancel()
	output, err := b.run(ctx, b.instance.ContainerName, request.Body)
	if err != nil {
		return applications.Errorf(503, "Project file command failed. Check the project container and reinstall Scratch Tab if needed."), nil
	}
	var result struct {
		Status int `json:"status"`
	}
	if json.Unmarshal(output, &result) != nil || result.Status < 200 || result.Status > 599 {
		return applications.Errorf(502, "Invalid file command response."), nil
	}
	return applications.Response{Status: result.Status, Headers: map[string][]string{"Content-Type": {"application/json"}}, Body: output}, nil
}
