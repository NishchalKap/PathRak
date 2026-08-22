import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import LabelEncoder
from scipy.spatial import cKDTree
import os
from functools import lru_cache

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "incidents.csv")

# ── Load & train ──────────────────────────────────────────────────────────────

def load_and_train():
    # FIX: Raise a clear error if the CSV is missing instead of a cryptic crash
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"Training data not found at: {DATA_PATH}\n"
            "Please place incidents.csv inside the backend/data/ directory."
        )

    df = pd.read_csv(DATA_PATH)

    required_cols = {"incident_type", "lighting", "hour", "day_of_week", "risk_level", "lat", "lng"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"incidents.csv is missing required columns: {missing}")

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


MODEL, DF, INCIDENT_LE, LIGHTING_LE = load_and_train()

RISK_LABELS = ["Very Low", "Low", "Moderate", "High", "Critical"]

# ── Build KDTree for fast spatial queries ──────────────────────────────────────
KDTREE_COORDS = cKDTree(DF[["lat", "lng"]].values)

# ── DBSCAN hotspot clustering ─────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_hotspot_clusters():
    coords = DF[["lat", "lng"]].values
    coords_rad = np.radians(coords)
    db = DBSCAN(eps=0.5 / 6371, min_samples=2, algorithm="ball_tree", metric="haversine")
    labels = db.fit_predict(coords_rad)

    clusters = []
    for label in set(labels):
        if label == -1:
            continue
        mask = labels == label
        cluster_points = DF[mask]
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
    # FIX: Use LIGHTING_LE (not INCIDENT_LE) for lighting encoding; fall back gracefully
    known_lightings = list(LIGHTING_LE.classes_)
    if lighting not in known_lightings:
        lighting_enc = known_lightings.index("dim") if "dim" in known_lightings else 0
    else:
        lighting_enc = int(LIGHTING_LE.transform([lighting])[0])

    # OPTIMIZED: Use KDTree for O(log n) nearest-neighbor lookup instead of O(n)
    k = 5
    dists, indices = KDTREE_COORDS.query([lat, lng], k=k)
    nearest_incident_encs = DF.iloc[indices]["incident_enc"].values

    features = pd.DataFrame({
        "incident_enc": nearest_incident_encs,
        "hour": [hour] * k,
        "day_of_week": [day_of_week] * k,
        "lighting_enc": [lighting_enc] * k
    })
    
    predicted_risks = MODEL.predict(features)
    predicted_probas = MODEL.predict_proba(features)
    
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
    }

# ── Generate heatmap grid ─────────────────────────────────────────────────────

_HEATMAP_CACHE = {}  # Cache by (hour, day_of_week) tuple

def generate_heatmap(center_lat: float, center_lng: float, hour: int, day_of_week: int) -> list:
    # OPTIMIZED: Check cache first (heatmap doesn't change within same hour)
    cache_key = (hour, day_of_week)
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

    BANGALORE_BOUNDS = {"lat_min": 12.73, "lat_max": 13.15, "lng_min": 77.45, "lng_max": 77.80}
    MYSORE_BOUNDS = {"lat_min": 12.23, "lat_max": 12.38, "lng_min": 76.55, "lng_max": 76.73}
    
    cities = [BANGALORE_BOUNDS, MYSORE_BOUNDS]
    
    # OPTIMIZED: Increased grid step from 0.015 to 0.025 (~2.5km) for ~60% fewer points
    GRID_STEP = 0.025
    
    coords = []
    for bounds in cities:
        for lat_val in np.arange(bounds["lat_min"], bounds["lat_max"], GRID_STEP):
            for lng_val in np.arange(bounds["lng_min"], bounds["lng_max"], GRID_STEP):
                coords.append([round(float(lat_val), 5), round(float(lng_val), 5)])
                
    if not coords:
        return []
        
    coords_np = np.array(coords)
    k = 5
    dists, indices = KDTREE_COORDS.query(coords_np, k=k)
    
    if hour >= 21 or hour <= 5:
        lighting = "none"
    elif hour >= 18:
        lighting = "dim"
    else:
        lighting = "good"
        
    known_lightings = list(LIGHTING_LE.classes_)
    if lighting not in known_lightings:
        lighting_enc = known_lightings.index("dim") if "dim" in known_lightings else 0
    else:
        lighting_enc = int(LIGHTING_LE.transform([lighting])[0])

    nearest_incident_encs = DF.iloc[indices.flatten()]["incident_enc"].values
    
    features = pd.DataFrame({
        "incident_enc": nearest_incident_encs,
        "hour": [hour] * (len(coords) * k),
        "day_of_week": [day_of_week] * (len(coords) * k),
        "lighting_enc": [lighting_enc] * (len(coords) * k)
    })
    
    predicted_risks = MODEL.predict(features).reshape(-1, k)
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
    }
