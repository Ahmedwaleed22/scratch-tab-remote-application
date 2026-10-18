package main

import (
	"futrx.local/catalog/applications/scratch-tab/backend/api"
	"futrx.local/catalog/applications/scratch-tab/backend/clients"
	"github.com/futrx-com/remote.futrx.com/pkg/applications/rpc"
)

func main() { rpc.Serve(api.New(clients.RunFileCommand)) }
