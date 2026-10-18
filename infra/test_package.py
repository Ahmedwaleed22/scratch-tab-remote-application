import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from package import build_package


class PackageTests(unittest.TestCase):
    def test_runtime_zip_and_license(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            archive = build_package(root, Path(temp), 'v' + json.loads((root / 'application.json').read_text())['version'])
            with zipfile.ZipFile(archive) as package:
                self.assertIsNone(package.testzip())
                names = package.namelist()
                self.assertIn('LICENSE', names)
                self.assertIn('backend/container/main.go', names)
                self.assertTrue(all(not name.endswith(('_test.go', '.mjs', '.py')) for name in names))

    def test_wrong_tag_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, 'tag must match'):
                build_package(Path(__file__).resolve().parents[1], Path(temp), 'v0.0.0')


if __name__ == '__main__':
    unittest.main()
