import asyncio
import threading
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
from pydantic import BaseModel, Field
from demo_config import DEMO_MODE

# In-memory store for active walks
# Key: user_id (str), Value: dict with walk details
ACTIVE_WALKS: Dict[str, dict] = {}
ACTIVE_WALKS_LOCK = threading.Lock()

class SafeWalkStartRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    user_name: str = Field(..., min_length=1)
    destination: str = Field(..., min_length=1)
    eta_minutes: int = Field(..., gt=0, le=300)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    emergency_contact: str = ""
    demo_expiry_seconds: Optional[int] = Field(default=None, ge=5, le=120)

def start_safe_walk(req: SafeWalkStartRequest):
    demo_expiry = req.demo_expiry_seconds if DEMO_MODE else None
    eta_time = datetime.now(timezone.utc) + (
        timedelta(seconds=demo_expiry) if demo_expiry else timedelta(minutes=req.eta_minutes)
    )
    with ACTIVE_WALKS_LOCK:
        ACTIVE_WALKS[req.user_id] = {
            "user_name": req.user_name,
            "destination": req.destination,
            "eta": eta_time,
            "lat": req.lat,
            "lng": req.lng,
            "emergency_contact": req.emergency_contact,
            "alert_triggered": False,
            "alert": None,
        }
    return {"status": "started", "eta": eta_time.isoformat(), "demo_expiry": bool(demo_expiry)}

def cancel_safe_walk(user_id: str):
    with ACTIVE_WALKS_LOCK:
        if user_id in ACTIVE_WALKS:
            del ACTIVE_WALKS[user_id]
            return {"status": "cancelled"}
    return {"status": "not_found"}

def extend_safe_walk(user_id: str, minutes: int = 15):
    with ACTIVE_WALKS_LOCK:
        if user_id in ACTIVE_WALKS:
            ACTIVE_WALKS[user_id]["eta"] += timedelta(minutes=minutes)
            return {"status": "extended", "new_eta": ACTIVE_WALKS[user_id]["eta"].isoformat()}
    return {"status": "not_found"}


def expire_safe_walk(user_id: str, now: datetime = None) -> dict:
    """Atomically claim and process an expired walk at most once."""
    from sos import trigger_sos

    check_time = now or datetime.now(timezone.utc)
    with ACTIVE_WALKS_LOCK:
        walk = ACTIVE_WALKS.get(user_id)
        if not walk:
            return {"status": "not_found"}
        if walk["alert_triggered"]:
            return {"status": "already_alerted", "alert": walk["alert"]}
        if check_time < walk["eta"]:
            return {"status": "not_due", "eta": walk["eta"].isoformat()}
        walk["alert_triggered"] = True

    try:
        alert = trigger_sos(
            lat=walk["lat"],
            lng=walk["lng"],
            user_id=user_id,
            user_name=walk["user_name"],
            message=f"SafeWalk ETA expired. Destination: {walk['destination']}",
            emergency_contact=walk["emergency_contact"],
            medical_details="",
        )
    except Exception as exc:
        with ACTIVE_WALKS_LOCK:
            walk["alert"] = {"error": str(exc)}
        return {"status": "alert_failed", "detail": str(exc)}

    with ACTIVE_WALKS_LOCK:
        walk["alert"] = alert
    return {"status": "alerted", "alert": alert}

async def check_active_walks():
    """Background task to monitor active walks and trigger SOS if ETA is breached."""
    while True:
        now = datetime.now(timezone.utc)
        with ACTIVE_WALKS_LOCK:
            user_ids = list(ACTIVE_WALKS)
        for user_id in user_ids:
            expire_safe_walk(user_id, now)
        await asyncio.sleep(1)
