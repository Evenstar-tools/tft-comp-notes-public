import importlib.util
from pathlib import Path
import unittest

module_path = Path(__file__).resolve().parents[1] / "scripts/refresh-lobby-sample.py"
spec = importlib.util.spec_from_file_location("lobby_sample", module_path)
sample = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sample)


class LobbySampleTest(unittest.TestCase):
    def test_accepts_only_complete_standard_lobbies_with_an_exact_build(self):
        players = [
            {"placement": rank, "units": [{"character_id": "DA_Jinx19", "tier": 1}],
             "traits": [{"name": "DA_IonicSpark19", "tier_current": 3, "num_units": 7}]}
            for rank in range(8, 0, -1)
        ]
        match_id = "PBE1_123"
        info = {"tft_set_core_name": "TFTSet19", "queue_id": 1090, "tft_game_type": "standard",
                "game_datetime": 100, "participants": players}
        resolution = {"client_version": "rls-19.1.0.5995286.Set19.Shipping.pbe"}
        raw = {"info": info, "metadata": {"match_id": match_id}, "_metatft": {"patch_resolution": resolution}}
        self.assertEqual(sample.normalize(raw, match_id)["seats"][0], ["ionic-jinx"])
        resolution["client_version"] = ""
        self.assertIsNone(sample.normalize(raw, match_id))
        resolution["client_version"] = "rls-19.1.0.5995286.Set19.Shipping.pbe"
        info["queue_id"] = 1100
        self.assertIsNone(sample.normalize(raw, match_id))
        info["queue_id"] = 1090
        players[-1]["placement"] = 2
        self.assertIsNone(sample.normalize(raw, match_id))
