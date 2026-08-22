import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import LabelEncoder
from scipy.spatial import cKDTree
import os
import threading
from functools import lru_cache
from data_config import DATA_DIR, DATA_MODE, data_metadata

DATA_PATH = str(DATA_DIR / "incidents.csv")
MODEL = None
DF = None
INCIDENT_LE = None
LIGHTING_LE = None
KDTREE_COORDS = None
_MODEL_LOCK = threading.Lock()

# ── Load & train ──────────────────────────────────────────────────────────────

def load_and_train():
    # FIX: Raise a clear error if the CSV is missing instead of a cryptic crash
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"Training data not found at: {DATA_PATH}\n"
            f"Please provide incidents.csv in the configured data directory: {DATA_DIR}."
        )

    df = pd.read_csv(DATA_PATH)

    required_cols = {"incident_type", "lighting", "hour", "day_of_week", "risk_level", "lat", "lng"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"incidents.csv is missing required columns: {missing}")

    if len(df) < 5:
        raise ValueError("incidents.csv must contain at least 5 valid rows.")

    numeric_cols = ["hour", "day_of_week", "risk_level", "lat", "lng"]
    for column in numeric_cols:
        df[column] = pd.to_numeric(df[column], errors="raise")
    if not df["hour"].between(0, 23).all():
        raise ValueError("incidents.csv contains hour values outside 0..23.")
    if not df["day_of_week"].between(0, 6).all():
        raise ValueError("incidents.csv contains day_of_week values outside 0..6.")
    if not df["risk_level"].between(1, 5).all():
        raise ValueError("incidents.csv contains risk_level values outside 1..5.")
    if not df["lat"].between(-90, 90).all() or not df["lng"].between(-180, 180).all():
        raise ValueError("incidents.csv contains invalid coordinates.")

    # FIX: Use separate LabelEncoders so one does not overwrite the other
    incident_le = LabelEncoder()
    lighting_le = LabelEncoder()

    df["incident_enc"] = incident_le.fit_transform(df["incident_type"])
    df["lighting_enc"] = lighting_le.fit_transform(df["lighting"])

    features = ["incident_enc", "hour", "day_of_week", "lighting_enc"]
    X = df[features]
    y = df["risk_level"]

    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X, y)

    return model, df, incident_le, lighting_le


def ensure_model_ready():
    global MODEL, DF, INCIDENT_LE, LIGHTING_LE, KDTREE_COORDS
    if MODEL is not None:
        return MODEL, DF, INCIDENT_LE, LIGHTING_LE, KDTREE_COORDS

    with _MODEL_LOCK:
        if MODEL is not None:
            return MODEL, DF, INCIDENT_LE, LIGHTING_LE, KDTREE_COORDS
        MODEL, DF, INCIDENT_LE, LIGHTING_LE = load_and_train()
        KDTREE_COORDS = cKDTree(DF[["lat", "lng"]].values)
    return MODEL, DF, INCIDENT_LE, LIGHTING_LE, KDTREE_COORDS

RISK_LABELS = ["Very Low", "Low", "Moderate", "High", "Critical"]

# ── DBSCAN hotspot clustering ─────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_hotspot_clusters():
    _, df, _, _, _ = ensure_model_ready()
    coords = df[["lat", "lng"]].values
    coords_rad = np.radians(coords)
    db = DBSCAN(eps=0.5 / 6371, min_samples=2, algorithm="ball_tree", metric="haversine")
    labels = db.fit_predict(coords_rad)

    clusters = []
    for label in set(labels):
        if label == -1:
            continue
        mask = labels == label
        cluster_points = df[mask]
        clusters.append({
            "cluster_id": int(label),
            "center_lat": float(cluster_points["lat"].mean()),
            "center_lng": float(cluster_points["lng"].mean()),
            "incident_count": int(mask.sum()),
            "avg_risk": float(cluster_points["risk_level"].mean()),
            "dominant_type": cluster_points["incident_type"].mode()[0],
        })
    return clusters

# ── Predict risk for a zone ───────────────────────────────────────────────────

@lru_cache(maxsize=2048)
def predict_zone_risk(lat: float, lng: float, hour: int, day_of_week: int, lighting: str = "dim") -> dict:
    model, df, _, lighting_le, kdtree_coords = ensure_model_ready()
    # FIX: Use LIGHTING_LE (not INCIDENT_LE) for lighting encoding; fall back gracefully
    known_lightings = list(lighting_le.classes_)
    if lighting not in known_lightings:
        lighting_enc = known_lightings.index("dim") if "dim" in known_lightings else 0
    else:
        lighting_enc = int(lighting_le.transform([lighting])[0])

    # OPTIMIZED: Use KDTree for O(log n) nearest-neighbor lookup instead of O(n)
    k = 5
    dists, indices = kdtree_coords.query([lat, lng], k=k)
    nearest_distance_km = float(dists[0]) * 111.0
    if nearest_distance_km > 25:
        raise ValueError(
            f"No incident-data coverage within 25 km of ({lat}, {lng}); "
            f"nearest record is approximately {nearest_distance_km:.1f} km away."
        )
    nearest_incident_encs = df.iloc[indices]["incident_enc"].values

    features = pd.DataFrame({
        "incident_enc": nearest_incident_encs,
        "hour": [hour] * k,
        "day_of_week": [day_of_week] * k,
        "lighting_enc": [lighting_enc] * k
    })
    
    predicted_risks = model.predict(features)
    predicted_probas = model.predict_proba(features)
    
    # Apply Inverse Distance Weighting (IDW)
    d_i = dists
    w_i = 1.0 / (d_i**2 + 1e-6)
    interpolated_risk = np.sum(w_i * predicted_risks) / np.sum(w_i)
    
    risk = int(round(interpolated_risk))
    
    # Calculate a weighted average confidence (optional but good for the UI)
    max_probas = np.max(predicted_probas, axis=1)
    proba = np.sum(w_i * max_probas) / np.sum(w_i)

    risk_idx = min(risk - 1, len(RISK_LABELS) - 1)
    risk_idx = max(risk_idx, 0)  # Guard against risk_level = 0 causing index -1

    return {
        "lat": lat,
        "lng": lng,
        "risk_level": risk,
        "risk_label": RISK_LABELS[risk_idx],
        "confidence": round(float(proba), 4),
        "hour": hour,
        "day_of_week": day_of_week,
        "lighting": lighting,
        "coverage_distance_km": round(nearest_distance_km, 2),
        **data_metadata(),
    }

# ── Generate heatmap grid ─────────────────────────────────────────────────────

_HEATMAP_CACHE = {}  # Cache by (hour, day_of_week) tuple

def generate_heatmap(center_lat: float, center_lng: float, hour: int, day_of_week: int) -> list:
    model, df, _, lighting_le, kdtree_coords = ensure_model_ready()
    # OPTIMIZED: Check cache first (heatmap doesn't change within same hour)
    cache_key = (round(center_lat, 2), round(center_lng, 2), hour, day_of_week, DATA_MODE)
    if cache_key in _HEATMAP_CACHE:
        return _HEATMAP_CACHE[cache_key]
    
    points = []
    
    import json
    pins_file = os.path.join(os.path.dirname(__file__), "data", "danger_pins.json")
    danger_pins = []
    if os.path.exists(pins_file):
        with open(pins_file, "r") as f:
            try:
                danger_pins = json.load(f)
            except json.JSONDecodeError:
                pass

    # Build the heatmap around the requested location rather than a static city.
    bounds = {
        "lat_min": center_lat - 0.15,
        "lat_max": center_lat + 0.15,
        "lng_min": center_lng - 0.15,
        "lng_max": center_lng + 0.15,
    }
    GRID_STEP = 0.025
    
    coords = []
    for lat_val in np.arange(bounds["lat_min"], bounds["lat_max"], GRID_STEP):
        for lng_val in np.arange(bounds["lng_min"], bounds["lng_max"], GRID_STEP):
            coords.append([round(float(lat_val), 5), round(float(lng_val), 5)])
                
    if not coords:
        return []
        
    coords_np = np.array(coords)
    k = 5
    dists, indices = kdtree_coords.query(coords_np, k=k)
    nearest_distance_km = float(np.min(dists)) * 111.0
    if nearest_distance_km > 25:
        raise ValueError(
            f"No incident-data coverage within 25 km of ({center_lat}, {center_lng})."
        )
    
    if hour >= 21 or hour <= 5:
        lighting = "none"
    elif hour >= 18:
        lighting = "dim"
    else:
        lighting = "good"
        
    known_lightings = list(lighting_le.classes_)
    if lighting not in known_lightings:
        lighting_enc = known_lightings.index("dim") if "dim" in known_lightings else 0
    else:
        lighting_enc = int(lighting_le.transform([lighting])[0])

    nearest_incident_encs = df.iloc[indices.flatten()]["incident_enc"].values
    
    features = pd.DataFrame({
        "incident_enc": nearest_incident_encs,
        "hour": [hour] * (len(coords) * k),
        "day_of_week": [day_of_week] * (len(coords) * k),
        "lighting_enc": [lighting_enc] * (len(coords) * k)
    })
    
    predicted_risks = model.predict(features).reshape(-1, k)
    w_i = 1.0 / (dists**2 + 1e-6)
    interpolated_risk = np.sum(w_i * predicted_risks, axis=1) / np.sum(w_i, axis=1)
    risks = np.round(interpolated_risk).astype(int)
    
    for i, (lat, lng) in enumerate(coords):
        risk = risks[i]
        for pin in danger_pins:
            dist = np.sqrt((pin["lat"] - lat)**2 + (pin["lng"] - lng)**2)
            if dist < GRID_STEP:
                risk = min(5, risk + 2)
                
        if risk >= 3:
            risk_idx = min(risk - 1, len(RISK_LABELS) - 1)
            risk_idx = max(risk_idx, 0)
            points.append({
                "lat": lat,
                "lng": lng,
                "risk": int(risk),
                "label": RISK_LABELS[risk_idx],
            })
    
    # Cache the result
    _HEATMAP_CACHE[cache_key] = points
    return points

# ── Route safety score ────────────────────────────────────────────────────────

def score_route(waypoints: list, hour: int, day_of_week: int) -> dict:
    if not waypoints:
        return {"score": 100, "label": "Unknown", "avg_risk": 0.0, "zone_breakdown": []}

    from lighting import get_zone_lighting

    scores = []
    for wp in waypoints:
        # Get real lighting data for this point
        light_data = get_zone_lighting(wp["lat"], wp["lng"], hour)
        mode = light_data.get("mode", "Dim")
        
        # Map lighting mode to ML model input categories
        if mode in ["Full", "Active"]:
            lighting_cat = "good"
        elif mode in ["No Light", "Broken"]:
            lighting_cat = "none"
        else:
            lighting_cat = "dim"
            
        result = predict_zone_risk(wp["lat"], wp["lng"], hour, day_of_week, lighting=lighting_cat)
        scores.append(result["risk_level"])

    avg_risk = float(np.mean(scores))
    # FIX: Use consistent max risk scale (5) to compute safety score
    safety_score = max(0, int(100 - (avg_risk / 5) * 100))

    if safety_score >= 80:
        label = "Safe"
    elif safety_score >= 60:
        label = "Moderate Risk"
    elif safety_score >= 40:
        label = "High Risk"
    else:
        label = "Critical — Avoid"

    return {
        "score": safety_score,
        "label": label,
        "avg_risk": round(avg_risk, 2),
        "zone_breakdown": scores,
        **data_metadata(),
    }
