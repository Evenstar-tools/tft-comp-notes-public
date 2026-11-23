import json
import runpy
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPDATE = runpy.run_path(str(ROOT / "scripts/prepare-augments.py"))["update_results"]


class AugmentImportTest(unittest.TestCase):
    def test_rounds_versions_idempotence_and_failed_refresh(self):
        with tempfile.TemporaryDirectory() as folder:
            dst = Path(folder, "archive.json")
            source = Path(folder, "input.json")
            history = json.loads((ROOT / "data/augment-results.json").read_text(encoding="utf8"))
            dst.write_text(json.dumps(history), encoding="utf8")
            result = {"season": 19, "realm": "pbe", "patch": "19.1", "date": "2026-11-20",
                      "source": "https://example.test/augment-choices", "scope": "test fixture"}
            base = {"id": "DA_ElectrochargeI", "games": 100, "mean": 4.4}
            rows = [base, {**base, "round": "3-2", "top4": None, "win": 0}]

            def ingest(rows, **metadata):
                source.write_text(json.dumps({**result, "rows": rows, **metadata}), encoding="utf8")
                UPDATE(dst, source)

            for realm, patch in [("pbe", "19.1"), ("live", "19.1"), ("pbe", "19.2")]:
                ingest(rows, realm=realm, patch=patch)
            saved = dst.read_bytes()
            ingest(rows)
            self.assertEqual(dst.read_bytes(), saved)
            data = json.loads(saved)
            self.assertEqual(data["18"], history["18"])
            self.assertTrue({"19:pbe:19.1", "19:live:19.1", "19:pbe:19.2"} <= data.keys())
            record = data["19:pbe:19.1"]["rows"][1]
            self.assertEqual((record["round"], record["win"], record["name"]), ("3-2", 0, "电火花"))
            self.assertNotIn("top4", record)
            for bad in ([], [{"id": base["id"], "grade": "S"}], [{**base, "games": 0}],
                        [base, {**base, "round": "all"}], [{**base, "mean": 10}],
                        [{**base, "id": "DA_CritQuintessence--crit-rune", "round": "3-2"}],
                        [{**base, "id": "DA_CritQuintessence--crit-rune", "name": "暴击符文+"}]):
                with self.subTest(bad=bad), self.assertRaises(ValueError):
                    ingest(bad)
                self.assertEqual(dst.read_bytes(), saved)
            with self.assertRaises(ValueError):
                ingest(rows, date="2026-11-19")
            self.assertEqual(dst.read_bytes(), saved)
            ingest([{"id": "DA_CritQuintessence--crit-rune", "round": "2-1", "mean": 4.2},
                    {"apiName": "DA_CritQuintessence", "rarity": "银色", "name": "暴击符文+", "round": "3-2", "top4": 52}])
            variants = json.loads(dst.read_bytes())["19:pbe:19.1"]["rows"]
            self.assertNotEqual(variants[0]["id"], variants[1]["id"])
            ingest([{"id": "DA_CritQuintessence--crit-rune", "round": "4-2", "mean": 4.6}],
                   roundBasis="pick-order", scope="Third pick during early augment encounters")
            third_pick = json.loads(dst.read_bytes())["19:pbe:19.1"]["rows"][0]
            self.assertEqual((third_pick["round"], third_pick["mean"]), ("4-2", 4.6))


if __name__ == "__main__":
    unittest.main()
