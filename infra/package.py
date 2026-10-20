"""Build the installable Scratch Tab ZIP from runtime source files."""
import argparse
import json
from pathlib import Path
import re
import zipfile


def build_package(root, output_dir, tag):
    manifest = json.loads((root / 'application.json').read_text())
    version = manifest['version']
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version) or tag != f'v{version}':
        raise ValueError('tag must match application.json version vX.Y.Z')
    files = ['README.md', 'LICENSE', 'application.json', 'dev/frontend/ui/licenses/THIRD-PARTY.txt']
    for directory, extensions in [('backend', ('.go',)), ('dev/frontend/ui', ('.css',))]:
        files.extend(str(path.relative_to(root)) for path in sorted((root / directory).rglob('*'))
                     if path.is_file() and path.suffix in extensions and not path.name.endswith('_test.go'))
    files.extend(str(path.relative_to(root)) for path in sorted((root / 'docs/images').glob('*.png')))
    for name in files:
        if not (root / name).is_file() or (root / name).is_symlink():
            raise ValueError(f'missing regular package file: {name}')
    bundle = root / 'dist/main.js'
    if not bundle.is_file() or bundle.is_symlink():
        raise ValueError('missing JavaScript bundle: run npm run build first')
    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / f'scratch-tab-{version}.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
        for name in files:
            package.write(root / name, name.removeprefix('dev/frontend/'))
        package.write(bundle, 'ui/scripts/main.js')
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(build_package(Path(__file__).resolve().parents[1], args.output_dir, args.tag))
    except ValueError as error:
        parser.exit(1, f'package: {error}\n')
