"""Check the host backend against a Remote checkout, including its generated builder."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--remote-root', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
remote = args.remote_root.resolve() / 'backend'
go_version = next(line.split()[1] for line in (remote / 'go.mod').read_text().splitlines() if line.startswith('go '))
go = shutil.which('go') or '/usr/local/go/bin/go'
with tempfile.TemporaryDirectory(prefix='scratch-validation-', dir=remote) as temporary:
    helper = Path(temporary)
    (helper / 'main.go').write_text(r'''package main
import (
 "context"
 "io/fs"
 "log"
 "os"
 "testing/fstest"
 catalog "github.com/futrx-com/remote.futrx.com/internal/integration/containers/applications"
 host "github.com/futrx-com/remote.futrx.com/internal/integration/applications"
)
func main() {
 files:=fstest.MapFS{}; root:=os.DirFS(os.Args[1])
 err:=fs.WalkDir(root,".",func(path string,d fs.DirEntry,err error)error {
  if err!=nil{return err}; if d.IsDir(){if d.Name()==".git" {return fs.SkipDir};return nil}
  data,err:=fs.ReadFile(root,path);if err!=nil{return err};files["applications/scratch-tab/"+path]=&fstest.MapFile{Data:data,Mode:0644};return nil
 });if err!=nil{log.Fatal(err)}
 registry,err:=catalog.NewRegistry(files,nil);if err!=nil{log.Fatal(err)}
 source,ok:=registry.BackendSource("scratch-tab");if !ok{log.Fatal("missing backend")}
 builder:=host.NewBuilder(os.Args[2],os.Args[3]);if _,err=builder.Build(context.Background(),"scratch-tab",source);err!=nil{log.Fatal(err)}
 log.Print("Catalog validation and generated-module backend build passed")
}
''')
    with tempfile.TemporaryDirectory(prefix='scratch-build-') as cache:
        subprocess.run([go, 'run', str(helper / 'main.go'), str(root), cache, go], cwd=remote, check=True)
with tempfile.TemporaryDirectory(prefix='scratch-host-tests-') as temporary:
    target = Path(temporary)
    shutil.copytree(root / 'backend', target, dirs_exist_ok=True, ignore=shutil.ignore_patterns('container'))
    (target / 'go.mod').write_text(f'module futrx.local/catalog/applications/scratch-tab/backend\n\ngo {go_version}\n\nrequire github.com/futrx-com/remote.futrx.com v0.0.0\nreplace github.com/futrx-com/remote.futrx.com => {remote}\n')
    environment = dict(os.environ, GOFLAGS='-mod=mod')
    subprocess.run([go, 'test', './...'], cwd=target, env=environment, check=True)
    subprocess.run([go, 'vet', './...'], cwd=target, env=environment, check=True)
