from datetime import datetime, timezone
import random
import csv
import math
from pathlib import Path
import os
import sys
from twilio.rest import Client
from data_config import DATA_DIR, data_metadata

# ── Load full police station dataset from CSV ─────────────────────────────────
POLICE_STATIONS_FILE = DATA_DIR / "police_stations.csv"

def log_runtime(message: str) -> None:
    """Write console output without assuming a Unicode-capable terminal."""
    text = str(message)
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        sys.stdout.write(text.encode(encoding, errors="replace").decode(encoding) + "\n")
    except Exception:
        print(text.encode("ascii", errors="replace").decode("ascii"))


def format_phone_number(phone: str) -> str | None:
    normalized = "".join(c for c in phone if c.isdigit() or c == "+")
    digits = normalized[1:] if normalized.startswith("+") else ""
    if not digits.isdigit() or not 8 <= len(digits) <= 15:
        return None
    return f"+{digits}"

def load_police_stations() -> list:
    stations = []
    if not POLICE_STATIONS_FILE.exists():
        # FIX: Warn clearly instead of silently returning empty list — SOS with no
        # stations would produce a misleading crash in find_nearest_station()
        log_runtime(
            f"[WARNING] police_stations.csv not found at {POLICE_STATIONS_FILE}. "
            "SOS dispatch will be unavailable until this file is provided."
        )
        return stations

    with POLICE_STATIONS_FILE.open(newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            try:
                stations.append({
                    "id": int(row["id"]),
                    "name": row["name"],
                    "lat": float(row["lat"]),
                    "lng": float(row["lng"]),
                    "contact": row.get("contact", ""),
                })
            except (KeyError, ValueError) as e:
                log_runtime(f"[WARNING] Skipping malformed police station row: {row} - {e}")
    return stations

POLICE_STATIONS = load_police_stations()

# In-memory SOS log (use a database in production)
SOS_LOG: list = []

# ── Distance helpers ──────────────────────────────────────────────────────────

def haversine_dist(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ── Station finders ───────────────────────────────────────────────────────────

def find_nearest_station(lat: float, lng: float) -> dict:
    # FIX: Guard against empty station list — previously would crash with ValueError
    if not POLICE_STATIONS:
        raise ValueError(
            f"No police stations loaded. Please provide {POLICE_STATIONS_FILE}."
        )
    nearest = min(POLICE_STATIONS, key=lambda s: haversine_dist(lat, lng, s["lat"], s["lng"]))
    dist = haversine_dist(lat, lng, nearest["lat"], nearest["lng"])
    if dist > 50:
        raise ValueError(
            f"No police-station reference data within 50 km of ({lat}, {lng}); "
            f"nearest row is {dist:.1f} km away."
        )
    return {**nearest, "distance_km": round(dist, 2)}

def find_all_stations(lat: float, lng: float) -> list:
    if not POLICE_STATIONS:
        raise ValueError(
            f"No police stations loaded. Please provide {POLICE_STATIONS_FILE}."
        )
    stations = [
        {**s, "distance_km": round(haversine_dist(lat, lng, s["lat"], s["lng"]), 2)}
        for s in POLICE_STATIONS
    ]
    nearby = [station for station in stations if station["distance_km"] <= 50]
    if not nearby:
        raise ValueError(f"No police-station reference data within 50 km of ({lat}, {lng}).")
    return sorted(nearby, key=lambda s: s["distance_km"])

# ── SOS trigger ───────────────────────────────────────────────────────────────

def trigger_sos(
    lat: float,
    lng: float,
    user_id: str = None,
    user_name: str = "Anonymous",
    message: str = "",
    emergency_contact: str = "",
    medical_details: str = "",
) -> dict:
    from users import find_users_within_radius
    station   = find_nearest_station(lat, lng)   # raises ValueError if no stations
    alert_id  = f"SOS-{random.randint(10000, 99999)}"
    timestamp = datetime.now(timezone.utc).isoformat()

    nearby_helpers = find_users_within_radius(lat, lng, exclude_user_id=user_id, radius_km=0.5)

    alert = {
        "alert_id": alert_id,
        "timestamp": timestamp,
        "user_id": user_id,
        "user": user_name,
        "location": {"lat": lat, "lng": lng},
        "message": message or "Emergency SOS triggered",
        "emergency_contact": emergency_contact,
        "medical_details": medical_details,
        "nearest_station": station,
        "nearby_helpers": nearby_helpers,
        "status": "RECORDED",
        "police_dispatch": "NOT_CONFIGURED",
        "station_match_only": True,
        "emergency_contact_notification": "NOT_REQUESTED" if not emergency_contact else "PROVIDER_NOT_CONFIGURED",
        "live_location_url": f"https://maps.google.com/?q={lat},{lng}",
        **data_metadata(),
    }

    SOS_LOG.append(alert)

    log_runtime(
        f"[SOS RECORDED] {alert_id} | nearest station reference: {station['name']} | "
        f"User: {user_name} | Loc: {lat},{lng}"
    )
    
    if nearby_helpers:
        log_runtime(f"[COMMUNITY LOOKUP] Matched {len(nearby_helpers)} nearby app users within 500m of {user_name}; no push provider is configured.")
        for h in nearby_helpers:
            log_runtime(f"  -> Matched {h['name']} ({h['distance_km']*1000:.0f}m away)")

    # Send Real SMS via Twilio
    if emergency_contact:
        formatted_contact = format_phone_number(emergency_contact)
        twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
        twilio_auth = os.getenv("TWILIO_AUTH_TOKEN")
        twilio_phone = os.getenv("TWILIO_PHONE_NUMBER")
        
        if not formatted_contact:
            alert["emergency_contact_notification"] = "INVALID_CONTACT"
        elif twilio_sid and twilio_auth and twilio_phone:
            try:
                client = Client(twilio_sid, twilio_auth)
                sms_body = f"URGENT: {user_name} triggered an SOS! Message: {message}. Live Location: https://maps.google.com/?q={lat},{lng}"
                msg = client.messages.create(
                    body=sms_body,
                    from_=twilio_phone,
                    to=formatted_contact
                )
                log_runtime(f"[TWILIO] Provider accepted SOS SMS request for {formatted_contact}. SID: {msg.sid}")
                alert["emergency_contact_notification"] = "PROVIDER_ACCEPTED"
                alert["notification_provider"] = "TWILIO"
                alert["notification_id"] = msg.sid
                alert["notification_provider_status"] = str(getattr(msg, "status", "accepted")).upper()
            except Exception as e:
                log_runtime(f"[TWILIO ERROR] Failed to send SOS SMS: {e}")
                alert["emergency_contact_notification"] = "FAILED"
                alert["notification_provider"] = "TWILIO"

    return alert

def send_risk_warning_sms(user_name: str, emergency_contact: str, lat: float, lng: float) -> bool:
    if not emergency_contact:
        return False
        
    formatted_contact = format_phone_number(emergency_contact)
    if not formatted_contact:
        log_runtime("[TWILIO ERROR] Emergency contact must be in E.164 format.")
        return False
        
    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
    twilio_auth = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_phone = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not (twilio_sid and twilio_auth and twilio_phone):
        log_runtime("[TWILIO ERROR] Missing Twilio credentials in environment.")
        return False
        
    try:
        client = Client(twilio_sid, twilio_auth)
        sms_body = f"PathRak Alert: {user_name} has just entered a High-Risk Zone. They are currently at: https://maps.google.com/?q={lat},{lng}"
        msg = client.messages.create(
            body=sms_body,
            from_=twilio_phone,
            to=formatted_contact
        )
        log_runtime(f"[TWILIO] Provider accepted High-Risk Warning SMS request for {formatted_contact}. SID: {msg.sid}")
        return True
    except Exception as e:
        log_runtime(f"[TWILIO ERROR] Failed to send High-Risk Warning SMS: {e}")
        return False

def send_battery_warning_sms(user_name: str, emergency_contact: str, lat: float, lng: float, battery_level: int) -> bool:
    if not emergency_contact:
        return False
        
    formatted_contact = format_phone_number(emergency_contact)
    if not formatted_contact:
        log_runtime("[TWILIO ERROR] Emergency contact must be in E.164 format.")
        return False
        
    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
    twilio_auth = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_phone = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not (twilio_sid and twilio_auth and twilio_phone):
        log_runtime("[TWILIO ERROR] Missing Twilio credentials in environment.")
        return False
        
    try:
        client = Client(twilio_sid, twilio_auth)
        sms_body = f"PathRak Alert: {user_name}'s phone battery is critically low ({battery_level}%). Last known location: https://maps.google.com/?q={lat},{lng}"
        msg = client.messages.create(
            body=sms_body,
            from_=twilio_phone,
            to=formatted_contact
        )
        log_runtime(f"[TWILIO] Provider accepted Low Battery Warning SMS request for {formatted_contact}. SID: {msg.sid}")
        return True
    except Exception as e:
        log_runtime(f"[TWILIO ERROR] Failed to send Low Battery Warning SMS: {e}")
        return False

def get_sos_log() -> list:
    return SOS_LOG
