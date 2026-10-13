import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from auth import require_clerk_user
from main import app
from safewalk import ACTIVE_WALKS, ACTIVE_WALKS_LOCK
from sos import SOS_LOG
from users import USERS


class ApiReadinessTests(unittest.TestCase):
    def setUp(self):
        USERS.clear()
        SOS_LOG.clear()
        with ACTIVE_WALKS_LOCK:
            ACTIVE_WALKS.clear()
        app.dependency_overrides[require_clerk_user] = lambda: {"sub": "clerk-user-a"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def test_capabilities_disclose_demo_and_unavailable_dispatch(self):
        response = self.client.get("/api/config")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["demo_mode"])
        self.assertEqual(payload["demo"]["city"], "Bengaluru")
        self.assertEqual(payload["services"]["police_dispatch"]["state"], "NOT_IMPLEMENTED")
        self.assertEqual(payload["services"]["sms"]["state"], "UNAVAILABLE")

    def test_sensitive_endpoint_rejects_missing_clerk_session(self):
        app.dependency_overrides.clear()
        response = self.client.get("/api/sos/log")
        self.assertEqual(response.status_code, 401)
        self.assertIn("Clerk", response.json()["detail"])
        app.dependency_overrides[require_clerk_user] = lambda: {"sub": "clerk-user-a"}

    def test_authenticated_identity_overrides_spoofed_user_id(self):
        response = self.client.post("/api/users/register", json={
            "user_id": "attacker-chosen-id",
            "name": "A",
            "emergency_contact": "+919876543210",
            "medical_details": "",
            "lat": 12.9755,
            "lng": 77.6069,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["user_id"], "clerk-user-a")

    def test_sos_history_is_scoped_and_dispatch_is_truthful(self):
        response = self.client.post("/api/sos/trigger", json={
            "lat": 12.9755,
            "lng": 77.6069,
            "user_id": "spoofed-user",
            "user_name": "A",
            "message": "API test",
            "emergency_contact": "",
        })
        self.assertEqual(response.status_code, 200)
        alert = response.json()
        self.assertEqual(alert["user_id"], "clerk-user-a")
        self.assertEqual(alert["status"], "RECORDED")
        self.assertEqual(alert["police_dispatch"], "NOT_CONFIGURED")
        SOS_LOG.append({"alert_id": "OTHER", "user_id": "clerk-user-b"})
        history = self.client.get("/api/sos/log").json()["alerts"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["user_id"], "clerk-user-a")

    def test_demo_safewalk_expiry_triggers_exactly_once(self):
        response = self.client.post("/api/safewalk/start", json={
            "user_id": "spoofed-user",
            "user_name": "A",
            "destination": "Cubbon Park",
            "eta_minutes": 20,
            "demo_expiry_seconds": 15,
            "lat": 12.9755,
            "lng": 77.6069,
            "emergency_contact": "",
        })
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["demo_expiry"])
        with ACTIVE_WALKS_LOCK:
            ACTIVE_WALKS["clerk-user-a"]["eta"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        first = self.client.post("/api/safewalk/expire?lat=12.9800&lng=77.6100").json()
        second = self.client.post("/api/safewalk/expire").json()
        self.assertEqual(first["status"], "alerted")
        self.assertEqual(second["status"], "already_alerted")
        self.assertEqual(first["alert"]["alert_id"], second["alert"]["alert_id"])
        self.assertEqual(first["alert"]["location"], {"lat": 12.98, "lng": 77.61})

    def test_manual_sos_after_cancelling_safewalk_does_not_auto_expire(self):
        started = self.client.post("/api/safewalk/start", json={
            "user_id": "spoofed-user",
            "user_name": "A",
            "destination": "Manual emergency destination",
            "eta_minutes": 20,
            "lat": 12.9755,
            "lng": 77.6069,
            "emergency_contact": "",
        })
        self.assertEqual(started.json()["status"], "started")
        self.assertEqual(self.client.post("/api/safewalk/cancel").json()["status"], "cancelled")
        manual = self.client.post("/api/sos/trigger", json={
            "lat": 12.9800,
            "lng": 77.6100,
            "user_id": "spoofed-user",
            "user_name": "A",
            "message": "Manual SOS during SafeWalk",
            "emergency_contact": "",
        }).json()
        self.assertEqual(manual["status"], "RECORDED")
        self.assertEqual(self.client.post("/api/safewalk/expire").json()["status"], "not_found")
        self.assertEqual(len(SOS_LOG), 1)

    @patch("requests.get")
    def test_demo_route_parses_real_provider_shape_and_scores_geometry(self, get_mock):
        provider_response = Mock()
        provider_response.raise_for_status.return_value = None
        provider_response.json.return_value = {
            "code": "Ok",
            "routes": [{
                "distance": 2200.0,
                "duration": 300.0,
                "geometry": {"coordinates": [
                    [77.6069, 12.9755],
                    [77.6000, 12.9760],
                    [77.5929, 12.9763],
                ]},
            }],
        }
        get_mock.return_value = provider_response
        response = self.client.post("/api/route/find-safe", json={
            "waypoints": [
                {"lat": 12.9755, "lng": 77.6069},
                {"lat": 12.9763, "lng": 77.5929},
            ]
        })
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["routing_provider"], "OSRM_DEMO")
        self.assertEqual(payload["routes"][0]["coordinates"][0], [12.9755, 77.6069])
        self.assertGreaterEqual(payload["routes"][0]["score"], 0)

    def test_dijkstra_trace_endpoint_json_serialization(self):
        payload = {
            "nodes": ["A", "B", "C", "D"],
            "edges": [
                {"source": "A", "target": "B", "distance": 2.0},
                {"source": "B", "target": "C", "distance": 3.0},
                {"source": "C", "target": "D", "distance": 1.0},
                {"source": "A", "target": "C", "distance": 6.0},
            ],
            "start": "A",
            "target": "D",
            "criterion": "distance",
            "directed": False,
        }
        response = self.client.post("/api/algorithms/trace/dijkstra", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["algorithm"], "Dijkstra")
        self.assertTrue(data["reachable"])
        self.assertEqual(data["final_path"], ["A", "B", "C", "D"])
        self.assertGreater(data["total_steps"], 0)
        # Verify JSON distances are valid floats/nulls and not crashing with 500 Out of range float
        for event in data["events"]:
            self.assertIn("distances", event)
            for v, dist in event["distances"].items():
                self.assertTrue(dist is None or isinstance(dist, (int, float)))

    def test_kruskal_trace_endpoint(self):
        payload = {
            "nodes": ["A", "B", "C", "D"],
            "edges": [
                {"source": "A", "target": "B", "cost": 1.0},
                {"source": "B", "target": "C", "cost": 2.0},
                {"source": "C", "target": "D", "cost": 3.0},
                {"source": "A", "target": "D", "cost": 5.0},
            ],
            "criterion": "cost",
        }
        response = self.client.post("/api/algorithms/trace/kruskal", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["algorithm"], "Kruskal")
        self.assertEqual(len(data["selected_edges"]), 3)

    def test_sort_trace_endpoint(self):
        payload = {
            "items": [45, 12, 89, -3, 23, 7],
            "algorithm": "quick_sort",
        }
        response = self.client.post("/api/algorithms/trace/sort", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["final_array"], [-3, 7, 12, 23, 45, 89])
        self.assertGreater(data["total_steps"], 1)

    def test_search_trace_endpoint(self):
        payload = {
            "items": [5, 10, 15, 20, 25, 30],
            "value": 20,
            "algorithm": "binary_search",
        }
        response = self.client.post("/api/algorithms/trace/search", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["found"])
        self.assertEqual(data["index"], 3)

    def test_prim_trace_endpoint(self):
        payload = {
            "nodes": ["A", "B", "C", "D"],
            "edges": [
                {"source": "A", "target": "B", "cost": 1.0},
                {"source": "B", "target": "C", "cost": 2.0},
                {"source": "C", "target": "D", "cost": 3.0},
                {"source": "A", "target": "D", "cost": 5.0},
            ],
            "criterion": "cost",
        }
        response = self.client.post("/api/algorithms/trace/prim", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["algorithm"], "Prim")
        self.assertEqual(len(data["selected_edges"]), 3)


if __name__ == "__main__":
    unittest.main()
