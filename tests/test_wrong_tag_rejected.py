import tempfile
import unittest
from pathlib import Path
from infra.package import build_package


class PackageTests(unittest.TestCase):
    def test_wrong_tag_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, 'tag must match'):
                build_package(Path(__file__).resolve().parents[1], Path(temp), 'v0.0.0')


if __name__ == '__main__':
    unittest.main()
