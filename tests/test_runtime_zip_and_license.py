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


if __name__ == '__main__':
    unittest.main()
