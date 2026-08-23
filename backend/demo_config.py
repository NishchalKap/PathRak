import os


DEMO_MODE = os.getenv("PATHRAK_DEMO_MODE", "true").lower() in {"1", "true", "yes", "on"}
ROUTING_PROVIDER = os.getenv("ROUTING_PROVIDER", "osrm_demo" if DEMO_MODE else "ors").lower()
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")

DEMO_SCENARIO = {
    "city": "Bengaluru",
    "start": {
        "name": "Mahatma Gandhi Road, Bengaluru",
        "lat": 12.9755,
        "lng": 77.6069,
    },
    "destination": {
        "name": "Cubbon Park, Bengaluru",
        "lat": 12.9763,
        "lng": 77.5929,
    },
    "location_is_simulated": True,
    "incident_dataset": "Synthetic PathRak demo incidents",
    "police_dataset": "Unverified demo station references",
}


def capability_config() -> dict:
    twilio_ready = all(os.getenv(key) for key in (
        "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"
    ))
    ors_ready = bool(os.getenv("ORS_API_KEY"))
    routing_ready = ors_ready if ROUTING_PROVIDER == "ors" else DEMO_MODE and ROUTING_PROVIDER == "osrm_demo"
    return {
        "demo_mode": DEMO_MODE,
        "demo": DEMO_SCENARIO if DEMO_MODE else None,
        "services": {
            "map_tiles": {"provider": "CARTO/OpenStreetMap", "state": "EXTERNAL_SERVICE"},
            "routing": {
                "provider": "OpenRouteService" if ROUTING_PROVIDER == "ors" else "OSRM public demo server",
                "profile": "driving-car",
                "state": "CONFIGURED" if routing_ready else "UNAVAILABLE",
                "demo_only": ROUTING_PROVIDER == "osrm_demo",
            },
            "safety_scores": {"state": "DEMO_DATA" if DEMO_MODE else "REAL_DATA"},
            "sms": {"provider": "Twilio", "state": "CONFIGURED_NOT_VERIFIED" if twilio_ready else "UNAVAILABLE"},
            "police_dispatch": {"state": "NOT_IMPLEMENTED"},
            "browser_notifications": {"state": "DEVICE_DEPENDENT"},
        },
    }
