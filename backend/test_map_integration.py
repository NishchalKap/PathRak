import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from main import app


class MapIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    @patch("requests.get")
    def test_geocode_returns_provider_locations(self, get_mock):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = [{"display_name": "Cubbon Park, Bengaluru", "lat": "12.9763", "lon": "77.5929"}]
        get_mock.return_value = response
        result = self.client.get("/api/geocode?q=Cubbon%20Park")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()[0]["display_name"], "Cubbon Park, Bengaluru")
        self.assertEqual(get_mock.call_args.kwargs["params"]["format"], "jsonv2")

    def test_geocode_rejects_whitespace_query(self):
        self.assertEqual(self.client.get("/api/geocode?q=%20%20").status_code, 422)

    @patch("requests.get")
    def test_geocode_http_failure_has_provider_error_contract(self, get_mock):
        import requests
        get_mock.return_value.raise_for_status.side_effect = requests.exceptions.HTTPError("429")
        response = self.client.get("/api/geocode?q=Bengaluru")
        self.assertEqual(response.status_code, 502)
        self.assertIn("Place search provider", response.json()["detail"])

    def test_route_rejects_invalid_coordinates(self):
        response = self.client.post("/api/route/find-safe", json={
            "waypoints": [{"lat": 91, "lng": 77.6}, {"lat": 12.9, "lng": 77.5}],
        })
        self.assertEqual(response.status_code, 422)

    @patch("requests.get")
    def test_osrm_no_route_is_not_reported_as_success(self, get_mock):
        provider_response = Mock()
        provider_response.raise_for_status.return_value = None
        provider_response.json.return_value = {"code": "NoRoute", "message": "Impossible route"}
        get_mock.return_value = provider_response
        response = self.client.post("/api/route/find-safe", json={
            "waypoints": [{"lat": 12.9755, "lng": 77.6069}, {"lat": 12.9763, "lng": 77.5929}],
        })
        self.assertEqual(response.status_code, 502)
        self.assertIn("Impossible route", response.json()["detail"])

    @patch("requests.get")
    def test_osrm_geometry_is_converted_to_leaflet_lat_lng(self, get_mock):
        provider_response = Mock()
        provider_response.raise_for_status.return_value = None
        provider_response.json.return_value = {"code": "Ok", "routes": [{
            "distance": 1000, "duration": 120,
            "geometry": {"coordinates": [[77.6, 12.9], [77.61, 12.91]]},
        }]}
        get_mock.return_value = provider_response
        response = self.client.post("/api/route/find-safe", json={
            "waypoints": [{"lat": 12.9, "lng": 77.6}, {"lat": 12.91, "lng": 77.61}],
        })
        route = response.json()["routes"][0]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(route["coordinates"], [[12.9, 77.6], [12.91, 77.61]])
        self.assertEqual(route["distance_m"], 1000)
        self.assertEqual(route["duration_s"], 120)


if __name__ == "__main__":
    unittest.main()
