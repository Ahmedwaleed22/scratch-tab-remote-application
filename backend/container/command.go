package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"syscall"
)

func serve(input io.Reader, output, diagnostics io.Writer) {
	lock, err := os.OpenFile(commandLockPath, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		json.NewEncoder(output).Encode(Result{Status: 503, Error: "Save lock unavailable."})
		return
	}
	defer lock.Close()
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		json.NewEncoder(output).Encode(Result{Status: 503, Error: "Save lock unavailable."})
		return
	}
	var request Request
	decoder := json.NewDecoder(io.LimitReader(input, maxCommandInputBytes))
	if err = decoder.Decode(&request); err != nil {
		json.NewEncoder(output).Encode(Result{Status: 400, Error: "Invalid file request."})
		return
	}
	if err = json.NewEncoder(output).Encode(operate(workspaceRoot, request)); err != nil {
		fmt.Fprintln(diagnostics, "Cannot encode result")
	}
}
