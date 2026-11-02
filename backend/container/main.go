package main

import (
	"io"
	"os"

	"futrx.local/catalog/applications/scratch-tab/backend/container/config"
	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
	"futrx.local/catalog/applications/scratch-tab/backend/container/repositories"
	"futrx.local/catalog/applications/scratch-tab/backend/container/services"
	"futrx.local/catalog/applications/scratch-tab/backend/container/transport"
)

func main() {
	files := services.Files{Open: repositories.OpenWorkspace}
	git := services.Git{Run: repositories.RunGit, Discover: repositories.DiscoverGit}
	command := transport.Command{
		Operate: func(request model.Request) model.Result {
			if request.Git != nil {
				return git.Operate(config.WorkspaceRoot, *request.Git)
			}
			return files.Operate(config.WorkspaceRoot, request)
		},
		Lock: func() (io.Closer, error) { return repositories.Lock(config.CommandLockPath) },
	}
	command.Serve(os.Stdin, os.Stdout, os.Stderr)
}
