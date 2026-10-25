package main

import (
	"futrx.local/catalog/applications/scratch-tab/backend/api/clients"
	"futrx.local/catalog/applications/scratch-tab/backend/api/services"
	"futrx.local/catalog/applications/scratch-tab/backend/api/transport"
	"github.com/futrx-com/remote.futrx.com/pkg/applications/rpc"
)

func main() {
	github := clients.NewGitHub()
	rpc.Serve(transport.New(services.Files{Run: clients.RunFileCommand}, services.NewUpdates(github.Get)))
}
