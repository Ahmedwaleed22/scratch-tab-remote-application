#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 2 || "$1" != --remote-root ]]; then
  printf 'Usage: bash backend/tests/host.sh --remote-root /path/to/remote.futrx\n' >&2
  exit 2
fi
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
remote="$(cd -- "$2/backend" && pwd)"
go_version="$(awk '$1 == "go" {print $2; exit}' "$remote/go.mod")"
go="$(command -v go || printf '%s' /usr/local/go/bin/go)"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/scratch-host-tests.XXXXXX")"
helper=''
trap 'rm -rf -- "$temporary"; if [[ -n "$helper" ]]; then rm -rf -- "$helper"; fi' EXIT
helper="$(mktemp -d "$remote/scratch-validation-XXXXXX")"
version="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version' "$root/application.json")"
archive="$(bash "$root/infra/package.sh" --tag "v$version" --output-dir "$temporary/package")"
cp "$root/infra/host-validation/main.go" "$helper/main.go"
(cd "$remote" && GO111MODULE=on "$go" run "$helper/main.go" "$archive" "$temporary/cache" "$go")
mkdir "$temporary/backend"
for entry in "$root/backend/"*; do
  if [[ "${entry##*/}" != container ]]; then cp -R "$entry" "$temporary/backend/"; fi
done
cat > "$temporary/backend/go.mod" <<EOF
module futrx.local/catalog/applications/scratch-tab/backend

go $go_version

require github.com/futrx-com/remote.futrx.com v0.0.0
replace github.com/futrx-com/remote.futrx.com => "$remote"
EOF
cd "$temporary/backend"
export GO111MODULE=on GOFLAGS=-mod=mod
"$go" test ./...
"$go" vet ./...
