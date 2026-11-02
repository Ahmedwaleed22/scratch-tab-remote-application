package transport

import (
	"encoding/json"
	"fmt"
	"io"

	"futrx.local/catalog/applications/scratch-tab/backend/container/config"
	"futrx.local/catalog/applications/scratch-tab/backend/container/model"
)

type Command struct {
	Operate func(model.Request) model.Result
	Lock    func() (io.Closer, error)
}

func (t Command) Serve(input io.Reader, output, diagnostics io.Writer) {
	var request model.Request
	decoder := json.NewDecoder(io.LimitReader(input, config.MaxCommandInputBytes))
	decodeErr := decoder.Decode(&request)
	// Git reads do not need the save lock: optional index writes are disabled by RunGit.
	readOnly := false
	if decodeErr == nil && request.Git != nil {
		switch request.Git.Action {
		case "repository", "repositories", "status", "log", "diff":
			readOnly = true
		}
	}
	if !readOnly {
		lock, err := t.Lock()
		if err != nil {
			json.NewEncoder(output).Encode(model.Result{Status: 503, Error: "Save lock unavailable."})
			return
		}
		defer lock.Close()
	}
	if decodeErr != nil {
		json.NewEncoder(output).Encode(model.Result{Status: 400, Error: "Invalid file request."})
		return
	}
	if err := json.NewEncoder(output).Encode(t.Operate(request)); err != nil {
		fmt.Fprintln(diagnostics, "Cannot encode result")
	}
}
