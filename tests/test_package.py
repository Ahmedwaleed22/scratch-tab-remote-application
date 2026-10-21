import json
import posixpath
import re
import tempfile
import unittest
import zipfile
from pathlib import Path
from infra.package import build_package


class PackageTests(unittest.TestCase):
    def test_runtime_zip_and_license(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            archive = build_package(root, Path(temp), 'v' + json.loads((root / 'application.json').read_text())['version'])
            with zipfile.ZipFile(archive) as package:
                self.assertIsNone(package.testzip())
                names = package.namelist()
                self.assertIn('LICENSE', names)
                self.assertIn('ui/licenses/THIRD-PARTY.txt', names)
                self.assertIn(b'BSD 3-Clause', package.read('ui/licenses/THIRD-PARTY.txt'))
                self.assertIn(b'preact', package.read('ui/licenses/THIRD-PARTY.txt'))
                manifest = json.loads(package.read('application.json'))
                self.assertIn('ui/' + manifest['ui']['entry'], names)
                self.assertEqual([name for name in names if name.endswith('.js')], ['ui/scripts/main.js'])
                self.assertEqual(package.read('ui/scripts/main.js'), (root / 'dist/main.js').read_bytes())
                self.assertEqual(package.read('ui/style/scratch.css'), (root / 'dist/style/scratch.css').read_bytes())
                self.assertLess(len(package.read('ui/style/scratch.css')),
                                (root / 'dev/frontend/ui/style/scratch.css').stat().st_size * 0.9)
                self.assertEqual([name for name in names if name.endswith('.css')], ['ui/style/scratch.css'])
                self.assertLess(archive.stat().st_size, 2 * 1024 * 1024)
                self.assertIn(b'mermaid', package.read('ui/licenses/THIRD-PARTY.txt'))
                self.assertIn('backend/container/main.go', names)
                self.assertIn('backend/container/storage.go', names)
                self.assertNotIn('docs/maintenance.md', names)
                for name in names:
                    if name.endswith('.js'):
                        for relative in re.findall(r"(?:from\s*|import\s*)['\"](\.[^'\"]+)['\"]", package.read(name).decode()):
                            dependency = posixpath.normpath(posixpath.join(posixpath.dirname(name), relative))
                            self.assertIn(dependency, names)
                for image in re.findall(r'!\[[^]]*\]\(([^)]+)\)', package.read('README.md').decode()):
                    self.assertIn(image, names)
                self.assertTrue(all(not name.endswith(('_test.go', '.mjs', '.py', '.ts', '.tsx')) for name in names))

    def test_missing_bundle_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'dev/frontend/ui/licenses').mkdir(parents=True)
            for name, content in [('application.json', '{"version":"1.0.0"}'),
                                  ('README.md', 'readme'), ('LICENSE', 'license'),
                                  ('dev/frontend/ui/licenses/THIRD-PARTY.txt', 'notices')]:
                (root / name).write_text(content)
            with self.assertRaisesRegex(ValueError, 'run npm run build first'):
                build_package(root, root / 'output', 'v1.0.0')

    def test_wrong_tag_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, 'tag must match'):
                build_package(Path(__file__).resolve().parents[1], Path(temp), 'v0.0.0')


if __name__ == '__main__':
    unittest.main()
