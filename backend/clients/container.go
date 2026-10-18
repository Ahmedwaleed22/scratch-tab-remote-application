package clients

import (
	"bytes"
	"context"
	"os/exec"
)

func RunFileCommand(ctx context.Context, container string, body []byte) ([]byte, error) {
	binary, err := exec.LookPath("lxc")
	if err != nil {
		binary = "/snap/bin/lxc"
	}
	command := exec.CommandContext(ctx, binary, "exec", container, "--mode=non-interactive", "--", "/usr/local/bin/scratch-tab")
	command.Stdin = bytes.NewReader(body)
	return command.Output()
}
