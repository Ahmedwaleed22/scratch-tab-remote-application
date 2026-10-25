#!/usr/bin/env bash
set -euo pipefail
go="$(command -v go || printf '%s' /usr/local/go/bin/go)"
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/scratch-container-tests.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT
cp -R "$root/backend/container/." "$temporary/"
printf 'module futrx.local/catalog/applications/scratch-tab/backend/container\n\ngo 1.24\n' > "$temporary/go.mod"
cd "$temporary"
export GO111MODULE=on GOFLAGS=-mod=mod
"$go" test ./...
"$go" vet ./...
"$go" build -trimpath -o "$temporary/scratch-tab" .
