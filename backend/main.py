from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

from data_config import DATA_DIR, data_metadata
from auth import require_clerk_user
from demo_config import DEMO_MODE, OSRM_BASE_URL, ROUTING_PROVIDER, capability_config

from model import (
    generate_heatmap,
    predict_zone_risk,
    get_hotspot_clusters,
    score_route,
)
from lighting import (
    get_zone_lighting,
    generate_lighting_map,
    generate_demo_street_grid,
    calculate_city_savings,
)
from sos import trigger_sos, get_sos_log, find_nearest_station, find_all_stations, send_risk_warning_sms, send_battery_warning_sms
from users import deactivate_user, register_user, find_nearest_user
from safewalk import SafeWalkStartRequest, start_safe_walk, cancel_safe_walk, extend_safe_walk, expire_safe_walk, check_active_walks
from safespots import get_safe_spots
import asyncio

app = FastAPI(
    title="PathRak API",
    version="1.0.0",
    description="Women Safety & Intelligent Street Lighting Platform",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ───────────────────────────────────────────────────────────────────────
# FIX: Restrict origins in production via environment variable instead of allow_origins=["*"]
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(check_active_walks())


# ── Request Models ─────────────────────────────────────────────────────────────

class ZoneRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    hour: Optional[int] = Field(None, ge=0, le=23)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    lighting: Optional[str] = "dim"

    @validator("lighting")
    def validate_lighting(cls, v):
        allowed = {"none", "dim", "good"}
        if v not in allowed:
            raise ValueError(f"lighting must be one of {allowed}")
        return v

class HeatmapRequest(BaseModel):
    center_lat: float = Field(..., ge=-90, le=90)
    center_lng: float = Field(..., ge=-180, le=180)
    hour: Optional[int] = Field(None, ge=0, le=23)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)

class Waypoint(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)

class RouteRequest(BaseModel):
    waypoints: List[Waypoint] = Field(..., min_items=2)  # FIX: Require at least 2 waypoints
    hour: Optional[int] = Field(None, ge=0, le=23)
    day_of_week: Optional[int] = Field(None, ge=0, le=6)

class LightingRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    hour: Optional[int] = Field(None, ge=0, le=23)
    is_emergency: Optional[bool] = False

class SOSRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    user_id: Optional[str] = None
    user_name: Optional[str] = "Anonymous"
    message: Optional[str] = ""
    emergency_contact: Optional[str] = None
    medical_details: Optional[str] = None

class UserRegisterRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    emergency_contact: str = Field(..., min_length=1)
    medical_details: str = ""
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)

class DangerPinRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    type: str
    description: Optional[str] = ""


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "PathRak API running",
        "version": "1.0.0",
        "docs": "/docs",
    }

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat(), **data_metadata()}

@app.get("/api/config")
def api_config():
    return capability_config()

# ── Heatmap & Risk ─────────────────────────────────────────────────────────────

@app.post("/api/heatmap")
def heatmap(req: HeatmapRequest):
    now = datetime.now()
    hour = req.hour if req.hour is not None else now.hour
    dow  = req.day_of_week if req.day_of_week is not None else now.weekday()
    try:
        points = generate_heatmap(req.center_lat, req.center_lng, hour, dow)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap generation failed: {str(e)}")
    return {"points": points, "total": len(points), "hour": hour, **data_metadata()}

@app.post("/api/zone/risk")
def zone_risk(req: ZoneRequest):
    now = datetime.now()
    hour = req.hour if req.hour is not None else now.hour
    dow  = req.day_of_week if req.day_of_week is not None else now.weekday()
    try:
        return predict_zone_risk(req.lat, req.lng, hour, dow, req.lighting or "dim")
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk prediction failed: {str(e)}")

@app.get("/api/hotspots")
def hotspots():
    try:
        clusters = get_hotspot_clusters()
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hotspot clustering failed: {str(e)}")
    return {"clusters": clusters, "total": len(clusters), **data_metadata()}

@app.get("/api/geocode")
def geocode(q: str):
    import requests as req_lib
    try:
        res = req_lib.get(
            f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=5",
            headers={"User-Agent": "PathRak/1.0 (https://github.com/NishchalKap/PathRak)"},
            timeout=5
        )
        res.raise_for_status()
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Route Scoring ──────────────────────────────────────────────────────────────

@app.post("/api/route/score")
def route_score(req: RouteRequest):
    now = datetime.now()
    hour = req.hour if req.hour is not None else now.hour
    dow  = req.day_of_week if req.day_of_week is not None else now.weekday()
    wps  = [{"lat": w.lat, "lng": w.lng} for w in req.waypoints]
    try:
        return score_route(wps, hour, dow)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route scoring failed: {str(e)}")

@app.post("/api/route/find-safe")
def find_safe_route(req: RouteRequest):
    import requests as req_lib

    start = req.waypoints[0]
    end   = req.waypoints[-1]
    now   = datetime.now()
    hour  = req.hour if req.hour is not None else now.hour
    dow   = req.day_of_week if req.day_of_week is not None else now.weekday()

    try:
        if ROUTING_PROVIDER == "ors":
            ors_key = os.getenv("ORS_API_KEY", "")
            if not ors_key:
                raise HTTPException(
                    status_code=503,
                    detail="ORS_API_KEY is not configured; real road-route alternatives are unavailable.",
                )
            res = req_lib.post(
                "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
                headers={"Authorization": ors_key, "Content-Type": "application/json"},
                json={
                    "coordinates": [[start.lng, start.lat], [end.lng, end.lat]],
                    "alternative_routes": {
                        "share_factor": 0.3,
                        "target_count": 3,
                        "weight_factor": 2.0,
                    },
                },
                timeout=15,
            )
            res.raise_for_status()
            features = res.json().get("features", [])
        elif ROUTING_PROVIDER == "osrm_demo" and DEMO_MODE:
            coordinates = f"{start.lng},{start.lat};{end.lng},{end.lat}"
            res = req_lib.get(
                f"{OSRM_BASE_URL}/route/v1/driving/{coordinates}",
                params={"alternatives": 3, "steps": "false", "geometries": "geojson", "overview": "full"},
                headers={"User-Agent": "PathRak/1.0 hackathon demo"},
                timeout=20,
            )
            res.raise_for_status()
            payload = res.json()
            if payload.get("code") != "Ok":
                raise HTTPException(status_code=502, detail=payload.get("message", "OSRM returned no route."))
            features = [
                {
                    "geometry": route["geometry"],
                    "properties": {"summary": {"distance": route["distance"], "duration": route["duration"]}},
                }
                for route in payload.get("routes", [])
            ]
        else:
            raise HTTPException(status_code=503, detail="No supported routing provider is configured.")
    except HTTPException:
        raise
    except req_lib.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Route service timed out.")
    except req_lib.exceptions.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Route service error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    if not features:
        raise HTTPException(status_code=502, detail="Route service returned no route candidates.")

    scored_routes = []
    for i, feature in enumerate(features):
        coords = feature["geometry"]["coordinates"]
        step = max(1, len(coords) // 50)
        waypoints = [{"lat": c[1], "lng": c[0]} for c in coords[::step]][:50]
        try:
            score_result = score_route(waypoints, hour, dow)
        except (FileNotFoundError, ValueError) as e:
            raise HTTPException(status_code=503, detail=str(e))
        summary = feature["properties"]["summary"]
        scored_routes.append({
            "route_index": i,
            "coordinates": [[c[1], c[0]] for c in coords],
            "score": score_result["score"],
            "label": score_result["label"],
            "avg_risk": score_result["avg_risk"],
            "distance_m": summary["distance"],
            "duration_s": summary["duration"],
            "is_safest": False,
        })

    scored_routes.sort(key=lambda x: x["score"], reverse=True)
    if scored_routes:
        scored_routes[0]["is_safest"] = True

    return {
        "routes": scored_routes,
        "total": len(scored_routes),
        "routing_provider": "OPENROUTESERVICE" if ROUTING_PROVIDER == "ors" else "OSRM_DEMO",
        "routing_profile": "driving-car",
        "route_alternatives_note": "The provider may return fewer alternatives when no sufficiently distinct route exists.",
        **data_metadata(),
    }

# ── Lighting ───────────────────────────────────────────────────────────────────

@app.post("/api/lighting/zone")
def lighting_zone(req: LightingRequest):
    try:
        return get_zone_lighting(req.lat, req.lng, req.hour, req.is_emergency or False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/lighting/map")
def lighting_map(req: HeatmapRequest):
    now  = datetime.now()
    hour = req.hour if req.hour is not None else now.hour
    if DEMO_MODE:
        zones = generate_demo_street_grid(req.center_lat, req.center_lng, hour)
        return {
            "zones": zones,
            "total": len(zones),
            "hour": hour,
            "source": "SIMULATED_DEMO_GRID",
            "source_note": "Geometry, lighting, and traffic are explicit demo simulations centered on the selected location.",
            "lighting_status": "SIMULATED",
        }
    try:
        zones = generate_lighting_map(req.center_lat, req.center_lng, hour)
        source = "OPENSTREETMAP_ROAD_GEOMETRY"
        source_note = "Road geometry came from OpenStreetMap Overpass. Lighting and traffic states are simulated."
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Lighting geometry provider unavailable: {exc}") from exc
    return {
        "zones": zones,
        "total": len(zones),
        "hour": hour,
        "source": source,
        "source_note": source_note,
        "lighting_status": "SIMULATED",
    }

@app.get("/api/lighting/savings")
def lighting_savings(num_zones: int = 100):
    if num_zones < 1 or num_zones > 10000:
        raise HTTPException(status_code=400, detail="num_zones must be between 1 and 10000")
    try:
        return calculate_city_savings(num_zones)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Users ──────────────────────────────────────────────────────────────────────

@app.post("/api/users/register")
def user_register(req: UserRegisterRequest, claims: dict = Depends(require_clerk_user)):
    try:
        user_id = claims["sub"]
        user   = register_user(user_id, req.name, req.emergency_contact, req.medical_details, req.lat, req.lng)
        helper = find_nearest_user(req.lat, req.lng, exclude_user_id=user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"user": user, "nearest_helper": helper}

@app.get("/api/users/nearest-helper")
def nearest_helper(lat: float, lng: float, claims: dict = Depends(require_clerk_user)):
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    helper = find_nearest_user(lat, lng, claims["sub"])
    return {"nearest_helper": helper}

@app.delete("/api/users/profile")
def delete_user_profile(claims: dict = Depends(require_clerk_user)):
    removed = deactivate_user(claims["sub"])
    return {"status": "deleted" if removed else "not_found"}

# ── SOS ────────────────────────────────────────────────────────────────────────

@app.post("/api/sos/trigger")
def sos_trigger(req: SOSRequest, claims: dict = Depends(require_clerk_user)):
    try:
        alert = trigger_sos(
            lat=req.lat,
            lng=req.lng,
            user_id=claims["sub"],
            user_name=req.user_name or "Anonymous",
            message=req.message or "",
            emergency_contact=req.emergency_contact or "",
            medical_details=req.medical_details or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    helper = find_nearest_user(req.lat, req.lng, exclude_user_id=claims["sub"])
    if helper:
        alert["nearest_helper"] = helper
    return alert

@app.post("/api/sos/notify-risk")
def notify_risk_zone(req: SOSRequest, claims: dict = Depends(require_clerk_user)):
    try:
        success = send_risk_warning_sms(
            req.user_name or "Anonymous",
            req.emergency_contact or "",
            req.lat,
            req.lng
        )
        return {"success": success, "message": "Twilio accepted the risk-warning SMS request" if success else "No SMS request was accepted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class BatteryRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    user_name: Optional[str] = "Anonymous"
    emergency_contact: Optional[str] = None
    battery_level: int = Field(..., ge=0, le=100)

@app.post("/api/sos/notify-battery")
def notify_battery_low(req: BatteryRequest, claims: dict = Depends(require_clerk_user)):
    try:
        success = send_battery_warning_sms(
            req.user_name or "Anonymous",
            req.emergency_contact or "",
            req.lat,
            req.lng,
            req.battery_level
        )
        return {"success": success, "message": "Twilio accepted the battery-warning SMS request" if success else "No SMS request was accepted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sos/log")
def sos_log(claims: dict = Depends(require_clerk_user)):
    log = [alert for alert in get_sos_log() if alert.get("user_id") == claims["sub"]]
    return {"alerts": log, "total": len(log)}

@app.get("/api/sos/nearest-station")
def nearest_station(lat: float, lng: float):
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    try:
        stations = find_all_stations(lat, lng)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {
        "nearest_station": stations[0] if stations else None,
        "stations": stations,
        **data_metadata(),
    }

# ── Crowd-Sourced Pins ─────────────────────────────────────────────────────────

@app.post("/api/pins/report")
def report_danger_pin(req: DangerPinRequest, claims: dict = Depends(require_clerk_user)):
    import json
    pins_file = os.path.join(os.path.dirname(__file__), "data", "danger_pins.json")
    pins = []
    if os.path.exists(pins_file):
        with open(pins_file, "r") as f:
            try:
                pins = json.load(f)
            except json.JSONDecodeError:
                pass
    new_pin = req.dict()
    new_pin["reported_by"] = claims["sub"]
    new_pin["timestamp"] = datetime.now().isoformat()
    pins.append(new_pin)
    with open(pins_file, "w") as f:
        json.dump(pins, f, indent=2)
    return {"status": "success", "pin": new_pin}

@app.get("/api/pins")
def get_danger_pins():
    import json
    pins_file = os.path.join(os.path.dirname(__file__), "data", "danger_pins.json")
    if os.path.exists(pins_file):
        with open(pins_file, "r") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []

# ── Safe Walk Mode ─────────────────────────────────────────────────────────────

@app.post("/api/safewalk/start")
def api_start_safe_walk(req: SafeWalkStartRequest, claims: dict = Depends(require_clerk_user)):
    return start_safe_walk(req.model_copy(update={"user_id": claims["sub"]}))

@app.post("/api/safewalk/cancel")
def api_cancel_safe_walk(claims: dict = Depends(require_clerk_user)):
    return cancel_safe_walk(claims["sub"])

@app.post("/api/safewalk/extend")
def api_extend_safe_walk(minutes: int = 15, claims: dict = Depends(require_clerk_user)):
    if minutes < 1 or minutes > 300:
        raise HTTPException(status_code=422, detail="minutes must be between 1 and 300")
    return extend_safe_walk(claims["sub"], minutes)

@app.post("/api/safewalk/expire")
def api_expire_safe_walk(claims: dict = Depends(require_clerk_user)):
    return expire_safe_walk(claims["sub"])

# ── Safe Spots Layer ───────────────────────────────────────────────────────────

@app.get("/api/safe-spots")
def api_get_safe_spots(lat: float, lng: float, radius: int = 2000):
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    if radius < 100 or radius > 10000:
        raise HTTPException(status_code=422, detail="radius must be between 100 and 10000 metres")
    try:
        return get_safe_spots(lat, lng, radius)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

# ── Incident History Feed ───────────────────────────────────────────────────────

_RECENT_INCIDENTS_CACHE = None

@app.get("/api/incidents/history")
def api_get_incident_history():
    from datetime import datetime, timedelta
    global _RECENT_INCIDENTS_CACHE
    
    if _RECENT_INCIDENTS_CACHE is None:
        import pandas as pd
        data_path = str(DATA_DIR / "incidents.csv")
        if not os.path.exists(data_path):
            return {"incidents": []}
        df = pd.read_csv(data_path)
        _RECENT_INCIDENTS_CACHE = df.tail(15).to_dict('records')
        
    incidents = []
    now = datetime.now()
    for i, row in enumerate(_RECENT_INCIDENTS_CACHE):
        incidents.append({
            "id": row.get("id", i),
            "type": row.get("incident_type", "Unknown").title(),
            "lat": row.get("lat", 0),
            "lng": row.get("lng", 0),
            "area": row.get("area", "Unknown Area"),
            "time": None,
            "relative_time": "Demo record - occurrence time unavailable",
        })
    
    return {"incidents": incidents[::-1], **data_metadata()}
