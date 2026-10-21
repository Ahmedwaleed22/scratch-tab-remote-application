"""Run container tests with the installed Go toolchain."""
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
go = shutil.which('go') or '/usr/local/go/bin/go'
subprocess.run(
    [go, 'test', './backend/container'],
    cwd=root,
    env=dict(os.environ, GO111MODULE='off'),
    check=True,
)
