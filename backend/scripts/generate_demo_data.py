import pandas as pd
import numpy as np
import random
import os
from datetime import datetime, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "demo", "incidents.csv")

# Bounding boxes
BANGALORE_BOUNDS = {"lat_min": 12.73, "lat_max": 13.15, "lng_min": 77.45, "lng_max": 77.80}
MYSORE_BOUNDS = {"lat_min": 12.23, "lat_max": 12.38, "lng_min": 76.55, "lng_max": 76.73}

INCIDENT_TYPES = ["stalking", "assault", "harassment", "eve_teasing", "robbery", "theft"]
LIGHTING_CONDITIONS = ["good", "dim", "poor", "none"]
LIGHT_STATUSES = ["working", "off", "flickering", "broken"]
CITIES = ["Bengaluru", "Mysore"]

def generate_records(city, bounds, num_records, start_id):
    records = []
    
    for i in range(num_records):
        lat = random.uniform(bounds["lat_min"], bounds["lat_max"])
        lng = random.uniform(bounds["lng_min"], bounds["lng_max"])
        incident_type = random.choice(INCIDENT_TYPES)
        hour = random.randint(0, 23)
        day_of_week = random.randint(0, 6)
        
        # Risk logic
        risk_level = random.randint(1, 5)
        if incident_type in ["assault", "robbery"]:
            risk_level = max(risk_level, random.randint(3, 5))
        if hour >= 20 or hour <= 4:
            risk_level = min(5, risk_level + 1)
            
        lighting = random.choice(LIGHTING_CONDITIONS)
        if lighting == "none" or lighting == "poor":
            risk_level = min(5, risk_level + 1)
        if hour >= 6 and hour <= 17:
            lighting = "good"
            
        light_status = random.choice(LIGHT_STATUSES)
        if lighting == "good":
            light_status = "working"
        elif lighting == "none":
            light_status = random.choice(["off", "broken"])
            
        if light_status == "working":
            brightness_pct = random.randint(60, 100)
            light_working = True
        elif light_status == "flickering":
            brightness_pct = random.randint(10, 40)
            light_working = False
        else:
            brightness_pct = random.randint(0, 10)
            light_working = False
            
        area = "Random Area"
        prefix = "BEN" if city == "Bengaluru" else "MYS"
        pole_id = f"{prefix}-RND-{start_id + i:04d}"
        
        last_maintained = (datetime.now() - timedelta(days=random.randint(1, 365))).strftime("%Y-%m-%d")
        
        records.append({
            "id": start_id + i,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "incident_type": incident_type,
            "hour": hour,
            "day_of_week": day_of_week,
            "lighting": lighting,
            "risk_level": risk_level,
            "city": city,
            "area": area,
            "pole_id": pole_id,
            "light_status": light_status,
            "brightness_pct": brightness_pct,
            "light_working": light_working,
            "last_maintained": last_maintained
        })
    return records

def main():
    print("DEMO DATASET - NOT REAL-WORLD INCIDENT DATA")
    if os.path.exists(DATA_PATH):
        df = pd.read_csv(DATA_PATH)
        # Keep non-Bangalore and non-Mysore data (e.g., Delhi)
        df_filtered = df[~df["city"].isin(["Bengaluru", "Mysore"])].copy()
    else:
        df_filtered = pd.DataFrame()
        
    start_id = 1
    if not df_filtered.empty:
        start_id = int(df_filtered["id"].max()) + 1
        
    print(f"Retained {len(df_filtered)} existing records from other cities.")
    
    print("Generating Bengaluru data...")
    ben_records = generate_records("Bengaluru", BANGALORE_BOUNDS, 5000, start_id)
    start_id += 5000
    
    print("Generating Mysore data...")
    mys_records = generate_records("Mysore", MYSORE_BOUNDS, 2000, start_id)
    
    all_new_records = ben_records + mys_records
    df_new = pd.DataFrame(all_new_records)
    
    df_final = pd.concat([df_filtered, df_new], ignore_index=True)
    
    # Save back
    df_final.to_csv(DATA_PATH, index=False)
    print(f"Saved {len(df_final)} total records to {DATA_PATH}.")

if __name__ == "__main__":
    main()
