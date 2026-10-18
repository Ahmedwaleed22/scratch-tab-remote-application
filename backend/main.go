package main

import (
	"futrx.local/catalog/applications/scratch-tab/backend/api"
	"github.com/futrx-com/remote.futrx.com/pkg/applications/rpc"
)

func main() { rpc.Serve(api.New(api.Execute)) }
