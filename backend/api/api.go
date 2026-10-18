package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"time"

	"github.com/futrx-com/remote.futrx.com/pkg/applications"
)

type Runner func(context.Context, string, []byte) ([]byte, error)
type backend struct {
	instance applications.Instance
	run      Runner
}

func New(run Runner) applications.Backend { return &backend{run: run} }
func Execute(ctx context.Context, container string, body []byte) ([]byte, error) {
	binary, err := exec.LookPath("lxc")
	if err != nil {
		binary = "/snap/bin/lxc"
	}
	command := exec.CommandContext(ctx, binary, "exec", container, "--mode=non-interactive", "--", "/usr/local/bin/scratch-tab")
	command.Stdin = bytes.NewReader(body)
	return command.Output()
}
func (b *backend) Init(instance applications.Instance) error {
	if instance.Scope != "project" || instance.ProjectID == "" || instance.ContainerName == "" {
		return errors.New("Scratch Tab requires a project container; reinstall the application")
	}
	b.instance = instance
	return nil
}
func (b *backend) Describe() (applications.Descriptor, error) {
	return applications.Descriptor{APIVersion: applications.APIVersion, Routes: []applications.Route{{Method: "POST", Path: "file", Description: "Read or save a project workspace text file"}}}, nil
}
func (b *backend) Handle(request applications.Request) (applications.Response, error) {
	if request.Caller.Email == "" {
		return applications.Errorf(401, "Sign in to access files."), nil
	}
	if request.Path != "file" || request.Method != "POST" {
		return applications.Errorf(404, "Route not found."), nil
	}
	if len(request.Body) > 8*1024*1024 {
		return applications.Errorf(413, "File request is too large."), nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
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
