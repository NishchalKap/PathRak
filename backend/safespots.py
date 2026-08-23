import requests

def get_safe_spots(lat: float, lng: float, radius: int = 2000):
    """
    Fetches police stations, hospitals, and 24/7 convenience stores
    using the OpenStreetMap Overpass API.
    """
    overpass_urls = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    
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
    last_error = None
    for overpass_url in overpass_urls:
        try:
            response = requests.post(overpass_url, data={"data": overpass_query}, headers=headers, timeout=18)
            response.raise_for_status()
            break
        except requests.exceptions.RequestException as exc:
            last_error = exc
    else:
        raise RuntimeError(f"OpenStreetMap safe-spot lookup is unavailable: {last_error}")

    try:
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
        return {"status": "success", "spots": spots, "source": "OpenStreetMap Overpass", "live": True}
    except (ValueError, KeyError) as exc:
        raise RuntimeError("OpenStreetMap returned an unreadable safe-spot response.") from exc
