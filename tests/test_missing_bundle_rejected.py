import tempfile
import unittest
from pathlib import Path
from infra.package import build_package


class PackageTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
