from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import Any, List, Optional
from datetime import datetime
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

from data_config import DANGER_PINS_FILE, DATA_DIR, IS_VERCEL, data_metadata
from auth import require_clerk_user
from demo_config import DEMO_MODE, OSRM_BASE_URL, ROUTING_PROVIDER, capability_config
from algorithm_engine import (
    benchmark, bfs, binary_search, dfs, dijkstra, kruskal, optimize_projects,
    prim, sort_routes, synthetic_graph, merge_sort,
    record_dijkstra_trace, record_kruskal_trace,
    min_max_dc, fractional_knapsack, lcs, lis, matrix_chain_order,
    graph_coloring, n_queens,
)

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

# Same-origin Vercel requests do not use CORS; these defaults support split local development.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    if not IS_VERCEL:
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
    optimization_objective: str = "safewalk"
 
    @validator("optimization_objective")
    def validate_optimization_objective(cls, value):
        if value not in {"distance", "time", "cost", "risk", "safewalk"}:
            raise ValueError("optimization_objective must be distance, time, cost, risk, or safewalk")
        return value

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


class GraphEdgeRequest(BaseModel):
    source: str
    target: str
    weight: float = Field(1, ge=0)
    distance: Optional[float] = Field(None, ge=0)
    time: Optional[float] = Field(None, ge=0)
    cost: Optional[float] = Field(None, ge=0)
    risk: Optional[float] = Field(None, ge=0)

    def model_dump(self, *args, **kwargs):
        value = super().model_dump(*args, **kwargs)
        # The engine uses a common weight when a criterion was not supplied.
        return {key: item for key, item in value.items() if item is not None}


class GraphRequest(BaseModel):
    nodes: List[str] = Field(default_factory=list, max_length=500)
    edges: List[GraphEdgeRequest] = Field(default_factory=list, max_length=10000)
    directed: bool = False


class TraversalRequest(GraphRequest):
    start: str
    target: Optional[str] = None
    criterion: str = "distance"


class MstRequest(GraphRequest):
    criterion: str = "cost"


class RouteSortRequest(BaseModel):
    routes: List[dict] = Field(default_factory=list, max_length=1000)
    key: str = "distance"
    algorithm: str = "merge"


class SortItemsRequest(BaseModel):
    items: List[Any] = Field(default_factory=list, max_length=10000)
    key: Optional[str] = None
    algorithm: str = "merge"


class SearchRequest(BaseModel):
    items: List[Any] = Field(default_factory=list, max_length=10000)
    key: Optional[str] = None
    value: Any


class ProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    cost: int = Field(ge=0, le=100000)
    benefit: int = Field(ge=0, le=100000)
    category: Optional[str] = None


class ResourceRequest(BaseModel):
    projects: List[ProjectRequest] = Field(default_factory=list, max_length=80)
    budget: int = Field(ge=0, le=100000)
    method: str = "dp"


class SyntheticGraphRequest(BaseModel):
    size: int = Field(12, ge=1, le=500)
    density: float = Field(.3, ge=0, le=1)
    seed: int = 42


class BenchmarkRequest(SyntheticGraphRequest):
    algorithm: str = "dijkstra"
    trials: int = Field(5, ge=1, le=50)


class MinMaxRequest(BaseModel):
    items: List[float] = Field(..., min_length=1, max_length=10000)


class FractionalKnapsackItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    weight: float = Field(gt=0, le=100000)
    value: float = Field(ge=0, le=100000)


class FractionalKnapsackRequest(BaseModel):
    items: List[FractionalKnapsackItem] = Field(..., min_length=1, max_length=100)
    capacity: float = Field(ge=0, le=1000000)


class LcsRequest(BaseModel):
    x: str = Field(..., max_length=500)
    y: str = Field(..., max_length=500)


class LisRequest(BaseModel):
    items: List[float] = Field(..., max_length=1000)


class MatrixChainRequest(BaseModel):
    dimensions: List[int] = Field(..., min_length=2, max_length=50)


class GraphColoringRequest(GraphRequest):
    max_colors: int = Field(..., ge=1, le=20)


class NQueensRequest(BaseModel):
    n: int = Field(..., ge=1, le=16)


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "PathRak API running",
        "version": "1.0.0",
        "docs": "/docs",
    }

@app.get("/api/")
def api_root():
    return {
        "status": "PathRak API running",
        "version": "1.0.0",
        "docs": "/api/docs",
    }

@app.get("/api/health")
@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat(), **data_metadata()}

@app.get("/api/openapi.json", include_in_schema=False)
def api_openapi():
    return app.openapi()

@app.get("/api/docs", include_in_schema=False)
def api_docs():
    return get_swagger_ui_html(openapi_url="/api/openapi.json", title=f"{app.title} - Swagger UI")

@app.get("/api/config")
def api_config():
    return capability_config()


# ── PathRak DAA engine ───────────────────────────────────────────────────────
# These endpoints intentionally execute PathRak's own algorithms over explicit
# graphs. Routing providers remain a separate source of road geometry.

def _graph_payload(req: GraphRequest) -> tuple[list[str], list[dict], bool]:
    return req.nodes, [edge.model_dump() for edge in req.edges], req.directed


def _algorithm_error(exc: ValueError):
    raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/algorithms/bfs")
def algorithm_bfs(req: TraversalRequest):
    try:
        nodes, edges, directed = _graph_payload(req)
        return bfs(nodes, edges, req.start, req.target, directed)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/dfs")
def algorithm_dfs(req: TraversalRequest):
    try:
        nodes, edges, directed = _graph_payload(req)
        return dfs(nodes, edges, req.start, directed)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/dijkstra")
def algorithm_dijkstra(req: TraversalRequest):
    try:
        nodes, edges, directed = _graph_payload(req)
        if req.target is None:
            raise ValueError("Dijkstra requires a target vertex.")
        return dijkstra(nodes, edges, req.start, req.target, req.criterion, directed)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/network/prim")
def network_prim(req: MstRequest):
    try:
        nodes, edges, _ = _graph_payload(req)
        return prim(nodes, edges, req.criterion)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/network/kruskal")
def network_kruskal(req: MstRequest):
    try:
        nodes, edges, _ = _graph_payload(req)
        return kruskal(nodes, edges, req.criterion)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/synthetic-graph")
def algorithm_synthetic_graph(req: SyntheticGraphRequest):
    try:
        return synthetic_graph(req.size, req.density, req.seed)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/sort-routes")
def algorithm_sort_routes(req: RouteSortRequest):
    try:
        return sort_routes(req.routes, req.key, req.algorithm)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/sort")
def algorithm_sort(req: SortItemsRequest):
    from time import perf_counter
    from algorithm_engine import quick_sort, heap_sort
    try:
        sorter = {"merge": merge_sort, "quick": quick_sort, "heap": heap_sort}.get(req.algorithm)
        if not sorter:
            raise ValueError("algorithm must be merge, quick, or heap.")
        started = perf_counter()
        sorted_items = sorter(req.items, req.key)
        return {
            "algorithm": req.algorithm,
            "sorted_items": sorted_items,
            "count": len(sorted_items),
            "execution_ms": round((perf_counter() - started) * 1000, 4),
        }
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/binary-search")
def algorithm_binary_search(req: SearchRequest):
    try:
        if req.key and any(isinstance(item, dict) and req.key not in item for item in req.items):
            raise ValueError(f"Every item must contain '{req.key}'.")
        idx = binary_search(req.items, req.key, req.value)
        return {"index": idx, "found": idx >= 0}
    except (TypeError, ValueError) as exc:
        _algorithm_error(ValueError(str(exc)))


@app.post("/api/resources/optimize")
def resource_optimize(req: ResourceRequest):
    try:
        return optimize_projects([project.model_dump() for project in req.projects], req.budget, req.method)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/benchmark")
def algorithm_benchmark(req: BenchmarkRequest):
    try:
        return benchmark(req.algorithm, req.size, req.density, req.trials, req.seed)
    except ValueError as exc:
        _algorithm_error(exc)


# ── Execution Traces (Shared contract with Pygame & Web) ────────────────────

@app.post("/api/algorithms/trace/dijkstra")
def algorithm_trace_dijkstra(req: TraversalRequest):
    try:
        nodes, edges, directed = _graph_payload(req)
        if req.target is None:
            raise ValueError("Dijkstra trace requires a target vertex.")
        return record_dijkstra_trace(nodes, edges, req.start, req.target, req.criterion, directed)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/trace/kruskal")
def algorithm_trace_kruskal(req: MstRequest):
    try:
        nodes, edges, _ = _graph_payload(req)
        return record_kruskal_trace(nodes, edges, req.criterion)
    except ValueError as exc:
        _algorithm_error(exc)


# ── Additional DAA Syllabus Endpoints ────────────────────────────────────────

@app.post("/api/algorithms/min-max")
def algorithm_min_max(req: MinMaxRequest):
    try:
        min_val, max_val, comps = min_max_dc(req.items)
        return {"minimum": min_val, "maximum": max_val, "comparisons": comps}
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/fractional-knapsack")
def algorithm_fractional_knapsack(req: FractionalKnapsackRequest):
    try:
        return fractional_knapsack([item.model_dump() for item in req.items], req.capacity)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/lcs")
def algorithm_lcs(req: LcsRequest):
    try:
        return lcs(req.x, req.y)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/lis")
def algorithm_lis(req: LisRequest):
    try:
        return lis(req.items)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/matrix-chain")
def algorithm_matrix_chain(req: MatrixChainRequest):
    try:
        return matrix_chain_order(req.dimensions)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/graph-coloring")
def algorithm_graph_coloring(req: GraphColoringRequest):
    try:
        nodes, edges, _ = _graph_payload(req)
        return graph_coloring(nodes, edges, req.max_colors)
    except ValueError as exc:
        _algorithm_error(exc)


@app.post("/api/algorithms/n-queens")
def algorithm_n_queens(req: NQueensRequest):
    try:
        return n_queens(req.n)
    except ValueError as exc:
        _algorithm_error(exc)

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
def geocode(q: str = Query(..., min_length=2, max_length=200)):
    import requests as req_lib
    normalized_query = q.strip()
    if len(normalized_query) < 2:
        raise HTTPException(status_code=422, detail="Place search query must contain at least two non-space characters.")
    try:
        res = req_lib.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": normalized_query, "format": "jsonv2", "limit": 5, "addressdetails": 1},
            headers={"User-Agent": "PathRak/1.0 (https://github.com/NishchalKap/PathRak)"},
            timeout=8,
        )
        res.raise_for_status()
        payload = res.json()
        if not isinstance(payload, list):
            raise HTTPException(status_code=502, detail="Geocoding provider returned an unexpected response.")
        return payload
    except HTTPException:
        raise
    except req_lib.exceptions.Timeout as exc:
        raise HTTPException(status_code=504, detail="Place search timed out. Please try again.") from exc
    except req_lib.exceptions.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Place search provider rejected the request.") from exc
    except (ValueError, req_lib.exceptions.RequestException) as exc:
        raise HTTPException(status_code=502, detail="Place search provider is unavailable.") from exc

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

    if abs(start.lat - end.lat) < 1e-5 and abs(start.lng - end.lng) < 1e-5:
        raise HTTPException(status_code=422, detail="Start and destination must be different locations.")

    try:
        use_ors = ROUTING_PROVIDER == "ors" and bool(os.getenv("ORS_API_KEY"))
        if use_ors:
            ors_key = os.getenv("ORS_API_KEY", "")
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
            provider_used = "OPENROUTESERVICE"
        else:
            coordinates = f"{start.lng},{start.lat};{end.lng},{end.lat}"
            res = req_lib.get(
                f"{OSRM_BASE_URL}/route/v1/driving/{coordinates}",
                params={"alternatives": "true", "steps": "false", "geometries": "geojson", "overview": "full"},
                headers={"User-Agent": "PathRak/1.0 (https://github.com/NishchalKap/PathRak)"},
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
            provider_used = "OSRM_DEMO"
    except HTTPException:
        raise
    except req_lib.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Route service timed out. Please try again.")
    except req_lib.exceptions.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Route service error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    if not features:
        raise HTTPException(status_code=502, detail="Route service returned no route candidates.")

    scored_routes = []
    for i, feature in enumerate(features):
        coords = feature["geometry"]["coordinates"]
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        step = max(1, len(coords) // 50)
        waypoints = [{"lat": c[1], "lng": c[0]} for c in coords[::step]][:50]
        try:
            score_result = score_route(waypoints, hour, dow)
        except (FileNotFoundError, ValueError) as e:
            raise HTTPException(status_code=503, detail=str(e))
        summary = feature["properties"]["summary"]
        # A route API does not expose its complete road network. Build an
        # inspectable, bounded graph from the legally returned route geometry
        # so Dijkstra can be demonstrated without claiming city-wide optimality.
        graph_coords = coords[::max(1, len(coords) // 120)]
        if graph_coords[-1] != coords[-1]:
            graph_coords.append(coords[-1])
        graph_nodes = [f"route_{i}_{index}" for index in range(len(graph_coords))]
        segment_count = max(1, len(graph_nodes) - 1)
        graph_edges = [
            {
                "source": graph_nodes[index], "target": graph_nodes[index + 1],
                "distance": summary["distance"] / segment_count,
                "time": summary["duration"] / segment_count,
                "cost": (summary["distance"] / 1000 * 20) / segment_count,
                "risk": score_result["avg_risk"],
            }
            for index in range(segment_count)
        ]
        scored_routes.append({
            "route_index": i,
            "coordinates": [[c[1], c[0]] for c in coords],
            "score": score_result["score"],
            "label": score_result["label"],
            "avg_risk": score_result["avg_risk"],
            "distance_m": summary["distance"],
            "duration_s": summary["duration"],
            # This is a transparent planning estimate, not provider fare data.
            "cost_estimate_inr": round((summary["distance"] / 1000) * 20, 2),
            "cost_estimate_note": "Rule-based planning estimate at ₹20/km; not a provider fare.",
            "bounded_algorithm_graph": {
                "nodes": graph_nodes,
                "edges": graph_edges,
                "coordinates": [[point[1], point[0]] for point in graph_coords],
                "scope": "A bounded graph extracted from this returned candidate route, not a complete road network.",
            },
            "is_safest": False,
        })

    # Compute SafeWalk multi-objective composite cost:
    # cost(route) = alpha * norm_distance + beta * norm_time + gamma * norm_risk
    # with alpha = 0.2, beta = 0.2, gamma = 0.6 prioritizing safety while balancing transit cost.
    max_d = max((r["distance_m"] for r in scored_routes), default=1) or 1
    max_t = max((r["duration_s"] for r in scored_routes), default=1) or 1
    max_r = max((r["avg_risk"] for r in scored_routes), default=1) or 1

    for route in scored_routes:
        norm_d = route["distance_m"] / max_d
        norm_t = route["duration_s"] / max_t
        norm_r = route["avg_risk"] / max_r
        route["safewalk_cost"] = round(0.20 * norm_d + 0.20 * norm_t + 0.60 * norm_r, 4)

    objective_key = {
        "distance": "distance_m",
        "time": "duration_s",
        "cost": "cost_estimate_inr",
        "risk": "avg_risk",
        "safewalk": "safewalk_cost",
    }[req.optimization_objective]

    # PathRak's stable Merge Sort ranks route candidates. The routing service
    # supplied geometry only; it did not perform this local route ranking.
    for route in scored_routes:
        route["route_rank"] = route[objective_key]
    scored_routes = merge_sort(scored_routes, "route_rank")
    for route in scored_routes:
        route.pop("route_rank", None)
    if scored_routes:
        scored_routes[0]["is_safest"] = True

    return {
        "routes": scored_routes,
        "total": len(scored_routes),
        "routing_provider": provider_used,
        "routing_profile": "driving-car",
        "optimization_objective": req.optimization_objective,
        "route_ranking_algorithm": "PathRak Merge Sort",
        "real_map_graph_note": "Each route includes a bounded graph made from returned provider geometry. Any Dijkstra result is optimal only within that candidate graph, not globally across the city road network.",
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
    pins = []
    if DANGER_PINS_FILE.exists():
        with DANGER_PINS_FILE.open("r", encoding="utf-8") as f:
            try:
                pins = json.load(f)
            except json.JSONDecodeError:
                pass
    new_pin = req.dict()
    new_pin["reported_by"] = claims["sub"]
    new_pin["timestamp"] = datetime.now().isoformat()
    pins.append(new_pin)
    with DANGER_PINS_FILE.open("w", encoding="utf-8") as f:
        json.dump(pins, f, indent=2)
    return {"status": "success", "pin": new_pin}

@app.get("/api/pins")
def get_danger_pins():
    import json
    if DANGER_PINS_FILE.exists():
        with DANGER_PINS_FILE.open("r", encoding="utf-8") as f:
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
def api_expire_safe_walk(lat: float = None, lng: float = None, claims: dict = Depends(require_clerk_user)):
    if (lat is None) != (lng is None):
        raise HTTPException(status_code=422, detail="lat and lng must be provided together")
    if lat is not None and not -90 <= lat <= 90:
        raise HTTPException(status_code=422, detail="lat must be between -90 and 90")
    if lng is not None and not -180 <= lng <= 180:
        raise HTTPException(status_code=422, detail="lng must be between -180 and 180")
    return expire_safe_walk(claims["sub"], lat=lat, lng=lng)

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
