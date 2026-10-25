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
	command := transport.Command{
		Operate: func(request model.Request) model.Result { return files.Operate(config.WorkspaceRoot, request) },
		Lock:    func() (io.Closer, error) { return repositories.Lock(config.CommandLockPath) },
	}
	command.Serve(os.Stdin, os.Stdout, os.Stderr)
}
