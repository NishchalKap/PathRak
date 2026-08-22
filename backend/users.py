from datetime import datetime
import math
from typing import Optional

# In-memory user store — replace with a database in production
USERS: list = []

# ── Distance helper ───────────────────────────────────────────────────────────

def haversine_dist(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ── User management ───────────────────────────────────────────────────────────

def register_user(
    user_id: str,
    name: str,
    emergency_contact: str,
    medical_details: str,
    lat: float,
    lng: float,
) -> dict:
    now = datetime.now().isoformat()
    existing = next((u for u in USERS if u["user_id"] == user_id), None)

    if existing:
        existing.update({
            "name": name,
            "emergency_contact": emergency_contact,
            "medical_details": medical_details,
            "lat": lat,
            "lng": lng,
            "last_seen": now,
            "active": True,
        })
        return existing

    user = {
        "user_id": user_id,
        "name": name,
        "emergency_contact": emergency_contact,
        "medical_details": medical_details,
        "lat": lat,
        "lng": lng,
        "registered_at": now,   # FIX: Track original registration time separately
        "last_seen": now,
        "active": True,
    }
    USERS.append(user)
    return user


def find_nearest_user(
    lat: float,
    lng: float,
    exclude_user_id: Optional[str] = None,
    max_km: float = 10.0,
) -> Optional[dict]:
    candidates = [
        u for u in USERS
        if u.get("active") and u["user_id"] != exclude_user_id
    ]
    if not candidates:
        return None

    best      = None
    best_dist = float("inf")

    for user in candidates:
        distance = haversine_dist(lat, lng, user["lat"], user["lng"])
        if distance <= max_km and distance < best_dist:
            best_dist = distance
            # FIX: Don't expose medical_details or emergency_contact in helper response
            best = {
                "user_id": user["user_id"],
                "name": user["name"],
                "lat": user["lat"],
                "lng": user["lng"],
                "last_seen": user["last_seen"],
                "distance_km": round(distance, 2),
            }
    return best

def find_users_within_radius(
    lat: float,
    lng: float,
    exclude_user_id: Optional[str] = None,
    radius_km: float = 0.5,
) -> list:
    """Returns all active users within the given radius (default 500m)."""
    candidates = [
        u for u in USERS
        if u.get("active") and u["user_id"] != exclude_user_id
    ]
    nearby = []
    for user in candidates:
        distance = haversine_dist(lat, lng, user["lat"], user["lng"])
        if distance <= radius_km:
            nearby.append({
                "user_id": user["user_id"],
                "name": user["name"],
                "lat": user["lat"],
                "lng": user["lng"],
                "last_seen": user["last_seen"],
                "distance_km": round(distance, 2),
            })
    return sorted(nearby, key=lambda u: u["distance_km"])


def deactivate_user(user_id: str) -> bool:
    """Mark a user as inactive (soft delete). Returns True if user was found."""
    # FIX: Added missing deactivation endpoint — previously users could never be removed
    user = next((u for u in USERS if u["user_id"] == user_id), None)
    if user:
        user["active"] = False
        user["last_seen"] = datetime.now().isoformat()
        return True
    return False


def get_active_users() -> list:
    return [u for u in USERS if u.get("active")]
