import asyncio
from datetime import datetime, timedelta
from typing import Dict
from pydantic import BaseModel, Field

# In-memory store for active walks
# Key: user_id (str), Value: dict with walk details
ACTIVE_WALKS: Dict[str, dict] = {}

class SafeWalkStartRequest(BaseModel):
    user_id: str
    user_name: str
    destination: str
    eta_minutes: int = Field(..., gt=0, le=300)
    lat: float
    lng: float
    emergency_contact: str = ""

def start_safe_walk(req: SafeWalkStartRequest):
    eta_time = datetime.now() + timedelta(minutes=req.eta_minutes)
    ACTIVE_WALKS[req.user_id] = {
        "user_name": req.user_name,
        "destination": req.destination,
        "eta": eta_time,
        "lat": req.lat,
        "lng": req.lng,
        "emergency_contact": req.emergency_contact,
        "alert_triggered": False
    }
    return {"status": "started", "eta": eta_time.isoformat()}

def cancel_safe_walk(user_id: str):
    if user_id in ACTIVE_WALKS:
        del ACTIVE_WALKS[user_id]
        return {"status": "cancelled"}
    return {"status": "not_found"}

def extend_safe_walk(user_id: str, minutes: int = 15):
    if user_id in ACTIVE_WALKS:
        ACTIVE_WALKS[user_id]["eta"] += timedelta(minutes=minutes)
        return {"status": "extended", "new_eta": ACTIVE_WALKS[user_id]["eta"].isoformat()}
    return {"status": "not_found"}

async def check_active_walks():
    """Background task to monitor active walks and trigger SOS if ETA is breached."""
    from sos import trigger_sos
    while True:
        now = datetime.now()
        for user_id, walk in list(ACTIVE_WALKS.items()):
            if not walk["alert_triggered"] and now > walk["eta"]:
                try:
                    # Trigger SOS alert
                    trigger_sos(
                        lat=walk["lat"],
                        lng=walk["lng"],
                        user_name=walk["user_name"],
                        message=f"Safe Walk ETA expired. Destination: {walk['destination']}",
                        emergency_contact=walk["emergency_contact"],
                        medical_details=""
                    )
                    walk["alert_triggered"] = True
                    # Optional: Remove from active walks after triggering
                    # del ACTIVE_WALKS[user_id]
                except Exception as e:
                    print(f"Error triggering SOS for Safe Walk: {e}")
        await asyncio.sleep(10) # Check every 10 seconds
