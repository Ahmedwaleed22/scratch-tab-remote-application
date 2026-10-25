"""Test the independent container module using Remote's generated module identity."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
root = Path(__file__).resolve().parents[2]
go = shutil.which('go') or '/usr/local/go/bin/go'
with tempfile.TemporaryDirectory(prefix='scratch-container-tests-') as temporary:
    target = Path(temporary)
    shutil.copytree(root / 'backend/container', target, dirs_exist_ok=True)
    (target / 'go.mod').write_text('module futrx.local/catalog/applications/scratch-tab/backend/container\n\ngo 1.24\n')
    for command in ([go, 'test', './...'], [go, 'vet', './...'], [go, 'build', '-o', str(target / 'scratch-tab'), '.']):
        subprocess.run(command, cwd=target, env=dict(os.environ, GOFLAGS='-mod=mod'), check=True)
