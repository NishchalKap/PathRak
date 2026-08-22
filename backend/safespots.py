import requests

def get_safe_spots(lat: float, lng: float, radius: int = 2000):
    """
    Fetches police stations, hospitals, and 24/7 convenience stores
    using the OpenStreetMap Overpass API.
    """
    overpass_url = "http://overpass-api.de/api/interpreter"
    
    # Query for police, hospital, and 24/7 shops
    overpass_query = f"""
    [out:json];
    (
      node["amenity"="police"](around:{radius},{lat},{lng});
      node["amenity"="hospital"](around:{radius},{lat},{lng});
      node["shop"="convenience"]["opening_hours"="24/7"](around:{radius},{lat},{lng});
    );
    out body;
    """
    headers = {
        "User-Agent": "PathRak/1.0 (https://github.com/NishchalKap/PathRak)"
    }
    try:
        response = requests.post(overpass_url, data={"data": overpass_query}, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        spots = []
        for element in data.get("elements", []):
            tags = element.get("tags", {})
            
            spot_type = "unknown"
            if tags.get("amenity") == "police":
                spot_type = "police"
            elif tags.get("amenity") == "hospital":
                spot_type = "hospital"
            elif tags.get("shop") == "convenience":
                spot_type = "24/7 shop"
                
            spots.append({
                "id": element["id"],
                "lat": element["lat"],
                "lng": element["lon"],
                "name": tags.get("name", f"Unnamed {spot_type}"),
                "type": spot_type
            })
        return {"status": "success", "spots": spots}
        
    except requests.exceptions.RequestException as e:
        return {"status": "error", "message": str(e), "spots": []}
