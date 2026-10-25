#!/usr/bin/env bash
set -euo pipefail
go="$(command -v go || printf '%s' /usr/local/go/bin/go)"
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
GO111MODULE=off "$go" test ./infra/package
GO111MODULE=off "$go" vet ./infra/package
