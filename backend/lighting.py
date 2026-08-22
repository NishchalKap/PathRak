import random
from datetime import datetime
import requests
from functools import lru_cache

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]
ROAD_TYPES = "primary|secondary|tertiary|residential|service|unclassified|living_street"

# ── Traffic density simulation ────────────────────────────────────────────────
# In production: replace with TomTom / Google Maps traffic API

def get_traffic_density(lat: float, lng: float, hour: int = None) -> dict:
    if hour is None:
        hour = datetime.now().hour

    if 7 <= hour <= 9 or 17 <= hour <= 20:
        base_density = random.uniform(0.7, 1.0)
    elif 10 <= hour <= 16:
        base_density = random.uniform(0.4, 0.7)
    elif 21 <= hour <= 23:
        base_density = random.uniform(0.2, 0.5)
    else:
        base_density = random.uniform(0.05, 0.2)

    noise   = random.uniform(-0.05, 0.05)
    density = max(0.0, min(1.0, base_density + noise))

    return {
        "lat": lat,
        "lng": lng,
        "hour": hour,
        "density": round(density, 3),
        "density_label": classify_density(density),
    }

def classify_density(density: float) -> str:
    if density >= 0.75:
        return "High"
    elif density >= 0.45:
        return "Medium"
    elif density >= 0.2:
        return "Low"
    else:
        return "Empty"

# ── Street-light availability (deterministic per coordinate) ──────────────────

def simulate_street_light_status(lat: float, lng: float) -> dict:
    seed = int((round(lat * 1000) * 31 + round(lng * 1000) * 17) % 100)
    has_street_light = seed % 10 != 0
    is_working       = has_street_light and (seed % 7 != 0)
    return {
        "has_street_light": has_street_light,
        "is_working": is_working,
    }

# ── Brightness from density ───────────────────────────────────────────────────

def compute_brightness(density: float, is_emergency: bool = False) -> dict:
    if is_emergency:
        return {
            "brightness_pct": 100,          # FIX: Cap at 100 — 120% is physically meaningless
            "mode": "Emergency",
            "mode_desc": "Emergency detected — full brightness",
            "energy_saved_pct": 0,
        }

    if density >= 0.75:
        brightness, mode, desc = 100, "Full", "High density — full brightness for safety"
    elif density >= 0.45:
        brightness, mode, desc = 70, "Active", "Moderate traffic — 70% brightness"
    elif density >= 0.2:
        brightness, mode, desc = 40, "Dim", "Low traffic — dimmed to conserve energy"
    else:
        brightness, mode, desc = 20, "Moonlight", "Empty road — minimal lighting"

    energy_saved = round((1 - brightness / 100) * 100, 1)

    return {
        "brightness_pct": brightness,
        "mode": mode,
        "mode_desc": desc,
        "energy_saved_pct": energy_saved,
    }

# ── Zone lighting status ──────────────────────────────────────────────────────

def get_zone_lighting(lat: float, lng: float, hour: int = None, is_emergency: bool = False) -> dict:
    traffic    = get_traffic_density(lat, lng, hour)
    status     = simulate_street_light_status(lat, lng)
    brightness = compute_brightness(traffic["density"], is_emergency)

    if not status["has_street_light"]:
        brightness = {
            "brightness_pct": 0,
            "mode": "No Light",
            "mode_desc": "No street light installed in this zone.",
            "energy_saved_pct": 0,
        }
    elif not status["is_working"]:
        brightness = {
            "brightness_pct": 0,
            "mode": "Broken",
            "mode_desc": "Street light exists but is not working.",
            "energy_saved_pct": 0,
        }

    return {
        "lat": lat,
        "lng": lng,
        "hour": traffic["hour"],
        "traffic_density": traffic["density"],
        "density_label": traffic["density_label"],
        **status,
        **brightness,
    }

# ── Lighting map for an area ──────────────────────────────────────────────────

def get_segment_lighting(lat: float, lng: float, hour: int = None) -> dict:
    zone = get_zone_lighting(lat, lng, hour)
    if not zone["has_street_light"]:
        status = "No Street Light"
    elif not zone["is_working"]:
        status = "Not Working"
    else:
        status = "Working"

    return {
        "status": status,
        "brightness_pct": zone["brightness_pct"],
        "traffic_density": zone["traffic_density"],
        "density_label": zone["density_label"],
        "mode_desc": zone["mode_desc"],
    }

@lru_cache(maxsize=128)
def fetch_osm_road_segments(center_lat: float, center_lng: float, hour: int = None, radius_m: int = 4200) -> list:
    query = f"""
    [out:json][timeout:12];
    way(around:{radius_m},{center_lat},{center_lng})["highway"~"{ROAD_TYPES}"];
    out geom;
    """
    headers = {"User-Agent": "PathRak/1.0"}
    last_error = None
    response = None
    for url in OVERPASS_URLS:
        try:
            response = requests.post(url, data={"data": query}, headers=headers, timeout=18)
            response.raise_for_status()
            break
        except Exception as exc:
            last_error = exc
            response = None

    if response is None:
        raise last_error

    segments = []
    for way in response.json().get("elements", []):
        geometry = way.get("geometry", [])
        if len(geometry) < 2:
            continue

        coords = [[round(point["lat"], 6), round(point["lon"], 6)] for point in geometry]
        mid = coords[len(coords) // 2]
        lighting = get_segment_lighting(mid[0], mid[1], hour)
        segments.append({
            "id": way.get("id"),
            "name": way.get("tags", {}).get("name") or "Unnamed street",
            "road_type": way.get("tags", {}).get("highway"),
            "coords": coords,
            **lighting,
        })

    return segments[:650]

def generate_demo_street_grid(center_lat: float, center_lng: float, hour: int = None) -> list:
    offsets = [x / 10000 for x in range(-240, 241, 30)]
    segments = []

    def add_segment(start_lat, start_lng, end_lat, end_lng):
        mid_lat = round((start_lat + end_lat) / 2, 6)
        mid_lng = round((start_lng + end_lng) / 2, 6)
        lighting = get_segment_lighting(mid_lat, mid_lng, hour)
        segments.append({
            "id": f"grid-{len(segments)}",
            "name": "Demo lighting corridor",
            "road_type": "demo_grid",
            "coords": [
                [round(start_lat, 6), round(start_lng, 6)],
                [round(end_lat, 6), round(end_lng, 6)],
            ],
            **lighting,
        })

    for dlat in offsets:
      for index, dlng in enumerate(offsets[:-1]):
          add_segment(
              center_lat + dlat,
              center_lng + dlng,
              center_lat + dlat,
              center_lng + offsets[index + 1],
          )

    for dlng in offsets:
      for index, dlat in enumerate(offsets[:-1]):
          add_segment(
              center_lat + dlat,
              center_lng + dlng,
              center_lat + offsets[index + 1],
              center_lng + dlng,
          )

    return segments

def generate_lighting_map(center_lat: float, center_lng: float, hour: int = None) -> list:
    if hour is None:
        hour = datetime.now().hour

    segments = fetch_osm_road_segments(center_lat, center_lng, hour)
    if not segments:
        raise RuntimeError("No street geometry found for this area.")
    return segments

# ── City-wide energy savings estimate ────────────────────────────────────────

def calculate_city_savings(num_zones: int = 100, hour: int = None) -> dict:
    if hour is None:
        hour = datetime.now().hour

    zone_breakdown   = {"Working": 0, "Not Working": 0, "No Street Light": 0}
    total_traditional = num_zones * 100
    total_smart       = 0

    for _ in range(num_zones):
        density = random.uniform(0, 1)
        lat     = random.uniform(12.73, 13.15)
        lng     = random.uniform(77.45, 77.80)
        status  = simulate_street_light_status(lat, lng)

        if not status["has_street_light"]:
            zone_breakdown["No Street Light"] += 1
        elif not status["is_working"]:
            zone_breakdown["Not Working"] += 1
        else:
            zone_breakdown["Working"] += 1
            brightness = compute_brightness(density)
            total_smart += brightness["brightness_pct"]

    # FIX: Only count working zones in the savings calculation for accuracy
    working = zone_breakdown["Working"]
    if working == 0 or total_traditional == 0:
        savings_pct = 0.0
    else:
        # Compare smart usage vs full traditional usage for working zones only
        traditional_working = working * 100
        savings_pct = round((1 - total_smart / traditional_working) * 100, 1)

    return {
        "total_zones": num_zones,
        "working_count": zone_breakdown["Working"],
        "not_working_count": zone_breakdown["Not Working"],
        "no_light_count": zone_breakdown["No Street Light"],
        "status_breakdown": zone_breakdown,
        "energy_saved_pct": savings_pct,
        "hour": hour,
    }
