package main

import (
	"flag"
	"fmt"
	"os"
)

func main() {
	root := flag.String("root", ".", "application source directory")
	tag := flag.String("tag", "", "release tag vX.Y.Z (required)")
	output := flag.String("output-dir", "", "ZIP output directory (required)")
	flag.Parse()
	if *tag == "" || *output == "" || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "package: --tag and --output-dir are required")
		os.Exit(2)
	}
	archive, err := buildPackage(*root, *output, *tag)
	if err != nil {
		fmt.Fprintln(os.Stderr, "package:", err)
		os.Exit(1)
	}
	fmt.Println(archive)
}
