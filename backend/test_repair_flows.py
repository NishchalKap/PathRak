import unittest
from datetime import datetime, timedelta, timezone

from data_config import DATA_MODE
from model import ensure_model_ready, predict_zone_risk
from safewalk import ACTIVE_WALKS, ACTIVE_WALKS_LOCK, SafeWalkStartRequest, expire_safe_walk, start_safe_walk
from sos import SOS_LOG, trigger_sos


class RepairFlowTests(unittest.TestCase):
    def test_model_initializes_once_and_discloses_demo_mode(self):
        first = ensure_model_ready()[0]
        second = ensure_model_ready()[0]
        prediction = predict_zone_risk(12.9716, 77.5946, 21, 6, "dim")
        self.assertIs(first, second)
        self.assertEqual(DATA_MODE, "demo")
        self.assertEqual(prediction["data_mode"], "DEMO")

    def test_sos_records_without_claiming_police_dispatch(self):
        alert = trigger_sos(12.9716, 77.5946, user_id="test-sos", user_name="Test")
        self.assertEqual(alert["status"], "RECORDED")
        self.assertEqual(alert["police_dispatch"], "NOT_CONFIGURED")
        self.assertTrue(alert["station_match_only"])

    def test_safewalk_expiry_is_idempotent(self):
        user_id = "test-expiry"
        start_safe_walk(SafeWalkStartRequest(
            user_id=user_id,
            user_name="Test",
            destination="Demo destination",
            eta_minutes=1,
            lat=12.9716,
            lng=77.5946,
        ))
        with ACTIVE_WALKS_LOCK:
            ACTIVE_WALKS[user_id]["eta"] = datetime.now(timezone.utc) - timedelta(seconds=1)

        before = len(SOS_LOG)
        first = expire_safe_walk(user_id)
        second = expire_safe_walk(user_id)
        self.assertEqual(first["status"], "alerted")
        self.assertEqual(second["status"], "already_alerted")
        self.assertEqual(first["alert"]["alert_id"], second["alert"]["alert_id"])
        self.assertEqual(len(SOS_LOG), before + 1)


if __name__ == "__main__":
    unittest.main()
