// This validation program is copied into the Remote checkout so it can use
// Remote's internal catalog and generated-module builder packages.
package main

import (
	"archive/zip"
	"context"
	"io"
	"log"
	"os"
	"testing/fstest"

	host "github.com/futrx-com/remote.futrx.com/internal/integration/applications"
	catalog "github.com/futrx-com/remote.futrx.com/internal/integration/containers/applications"
)

func main() {
	archive, err := zip.OpenReader(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	defer archive.Close()
	files := fstest.MapFS{}
	for _, file := range archive.File {
		reader, err := file.Open()
		if err != nil {
			log.Fatal(err)
		}
		data, err := io.ReadAll(reader)
		reader.Close()
		if err != nil {
			log.Fatal(err)
		}
		files["applications/scratch-tab/"+file.Name] = &fstest.MapFile{Data: data, Mode: 0644}
	}
	registry, err := catalog.NewRegistry(files, nil)
	if err != nil {
		log.Fatal(err)
	}
	source, ok := registry.BackendSource("scratch-tab")
	if !ok {
		log.Fatal("missing backend")
	}
	builder := host.NewBuilder(os.Args[2], os.Args[3])
	if _, err = builder.Build(context.Background(), "scratch-tab", source); err != nil {
		log.Fatal(err)
	}
	log.Print("Catalog validation and generated-module backend build passed")
}
