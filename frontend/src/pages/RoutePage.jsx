import { useState, useEffect, useRef } from "react";
import { MapContainer, Polyline, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import { findSafeRoute, searchLocation, runDijkstra } from "../api";
import { getBackendWeekday } from "../utils/safetyLogic";
import { createRoutePlan, getDistinctRoutes, getRouteRiskLabel } from "../utils/routePlan";
import Icon from "../components/Icon";
import { Notice, PageHeader, StatusPill, Metric } from "../components/UI";
import MapTiles from "../components/MapTiles";
import MapLayoutResizer from "../components/MapLayoutResizer";
import "leaflet/dist/leaflet.css";

const scoreStyle = (score) => {
  if (score >= 80) return { tone: "safe", line: "#11875d" };
  if (score >= 60) return { tone: "caution", line: "#b47712" };
  return { tone: "danger", line: "#c9363e" };
};

function FitBounds({ routes, start, end }) {
  const map = useMap();
  useEffect(() => {
    if (routes?.length && routes[0].coordinates?.length) {
      const allCoords = routes.flatMap((r) => r.coordinates);
      const lats = allCoords.map((c) => c[0]);
      const lngs = allCoords.map((c) => c[1]);
      map.fitBounds(
        [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ],
        { padding: [40, 40] }
      );
    } else if (start && end) {
      map.fitBounds(
        [
          [Math.min(start.lat, end.lat), Math.min(start.lng, end.lng)],
          [Math.max(start.lat, end.lat), Math.max(start.lng, end.lng)],
        ],
        { padding: [50, 50] }
      );
    } else if (start) {
      map.setView([start.lat, start.lng], 14);
    }
  }, [map, routes, start, end]);
  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      onMapClick?.(e.latlng);
    },
  });
  return null;
}

function parseDirectCoordinates(input) {
  const match = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return {
      name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
    };
  }
  return null;
}

function LocationSearch({ label, value, onChange, onQuickSetDemo, demoLabel }) {
  const [query, setQuery] = useState(value ? value.name : "");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const requestVersion = useRef(0);

  useEffect(() => {
    if (value && value.name !== query && !isOpen) {
      setQuery(value.name);
    }
  }, [value, isOpen]);

  useEffect(() => {
    const directCoords = parseDirectCoordinates(query);
    if (directCoords) {
      setResults([directCoords]);
      setSearchError("");
      return;
    }

    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || query === value?.name) {
      setResults([]);
      setSearchError("");
      return;
    }
    const version = ++requestVersion.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      try {
        const data = await searchLocation(normalizedQuery);
        if (!Array.isArray(data)) throw new Error("Place search returned an invalid response.");
        const mapped = data
          .map((item) => {
            const parts = (item.display_name || "").split(",");
            const name = parts.slice(0, 2).join(",").trim() || item.name || "Selected location";
            return { name, lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
          })
          .filter((item) => item.name && Number.isFinite(item.lat) && Number.isFinite(item.lng));
        if (version !== requestVersion.current) return;
        setResults(mapped);
        setIsOpen(true);
      } catch (e) {
        if (version !== requestVersion.current) return;
        setResults([]);
        setSearchError(e.message || "Place search is temporarily unavailable.");
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      requestVersion.current += 1;
    };
  }, [query]);

  const handleSelect = (r) => {
    setQuery(r.name);
    onChange(r);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const direct = parseDirectCoordinates(query);
      if (direct) {
        handleSelect(direct);
      } else if (results.length > 0) {
        handleSelect(results[0]);
      }
    }
  };

  return (
    <div className="route-search field">
      <div className="flex items-center justify-between">
        <label>{label}</label>
        {onQuickSetDemo && (
          <button
            type="button"
            className="text-xs text-brand hover:underline"
            onClick={onQuickSetDemo}
          >
            {demoLabel || "Set demo"}
          </button>
        )}
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
        onBlur={() => setTimeout(() => setIsOpen(false), 250)}
        placeholder="Search place or enter lat, lng..."
        className="input"
      />
      {loading && <span className="search-loading">Searching places...</span>}
      {searchError && <small className="search-error">{searchError}</small>}
      {isOpen && !loading && !searchError && query.trim().length >= 2 && results.length === 0 && (
        <small className="search-error">No matching places found. Try entering lat, lng directly.</small>
      )}

      {isOpen && results.length > 0 && (
        <div className="search-results">
          {results.map((r, i) => (
            <button
              type="button"
              key={`${r.name}-${i}`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(r);
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoutePage({ currentPos, theme, onStartSafeWalk, appConfig }) {
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [hour, setHour] = useState(new Date().getHours());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [startEdited, setStartEdited] = useState(false);
  const [dataMode, setDataMode] = useState(null);
  const [routingProvider, setRoutingProvider] = useState(null);
  const [objective, setObjective] = useState("safewalk");
  const [tileError, setTileError] = useState("");
  const [mapPickMode, setMapPickMode] = useState(null); // "start" | "end" | null
  const [dijkstraResult, setDijkstraResult] = useState(null);
  const [dijkstraLoading, setDijkstraLoading] = useState(false);
  const [animIndex, setAnimIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    let timer = null;
    if (isSimulating && routes[selectedRoute]?.coordinates?.length) {
      const coords = routes[selectedRoute].coordinates;
      timer = setInterval(() => {
        setAnimIndex((prev) => {
          if (prev >= coords.length - 1) {
            setIsSimulating(false);
            return coords.length - 1;
          }
          return prev + 1;
        });
      }, 350);
    }
    return () => clearInterval(timer);
  }, [isSimulating, selectedRoute, routes]);

  useEffect(() => {
    if (!currentPos || startEdited) return;
    setStart({
      name: "Current location",
      lat: currentPos[0],
      lng: currentPos[1],
    });
  }, [currentPos, startEdited]);

  const handleFind = async (customStart = null, customEnd = null) => {
    const s = customStart || start;
    const e = customEnd || end;
    if (!s || !e) {
      setError("Set both a start and destination before finding a route.");
      return;
    }
    if (Math.abs(s.lat - e.lat) < 1e-5 && Math.abs(s.lng - e.lng) < 1e-5) {
      setError("Start and destination must be different locations.");
      return;
    }
    setLoading(true);
    setError("");
    setRoutes([]);
    setDijkstraResult(null);
    try {
      const data = await findSafeRoute(
        [{ lat: s.lat, lng: s.lng }, { lat: e.lat, lng: e.lng }],
        hour,
        getBackendWeekday(),
        objective
      );
      if (!data.routes || data.routes.length === 0) {
        throw new Error("No routes found between these locations.");
      }

      const unique = getDistinctRoutes(data.routes, 3);
      if (!unique.length) {
        throw new Error("No routes with usable road geometry were returned.");
      }

      setRoutes(unique);
      setDataMode(data.data_mode || null);
      setRoutingProvider(data.routing_provider || null);
      setSelectedRoute(0);
    } catch (err) {
      console.error("Error finding safe route:", err);
      setError(err.message || "Could not calculate a real road route.");
    } finally {
      setLoading(false);
    }
  };

  const loadDemoRoute = () => {
    if (!appConfig?.demo) return;
    const demoStart = appConfig.demo.start;
    const demoEnd = appConfig.demo.destination;
    setStartEdited(true);
    setStart(demoStart);
    setEnd(demoEnd);
    handleFind(demoStart, demoEnd);
  };

  const handleMapClick = (latlng) => {
    const newLocation = {
      name: `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`,
      lat: latlng.lat,
      lng: latlng.lng,
    };
    if (mapPickMode === "start") {
      setStartEdited(true);
      setStart(newLocation);
      setMapPickMode(null);
    } else if (mapPickMode === "end") {
      setEnd(newLocation);
      setMapPickMode(null);
    } else if (!start) {
      setStartEdited(true);
      setStart(newLocation);
    } else {
      setEnd(newLocation);
    }
  };

  const executeDijkstraOnRoute = async () => {
    const chosen = routes[selectedRoute];
    const graphData = chosen?.bounded_algorithm_graph;
    if (!graphData || !graphData.nodes || graphData.nodes.length < 2) return;

    setDijkstraLoading(true);
    try {
      const result = await runDijkstra({
        nodes: graphData.nodes,
        edges: graphData.edges,
        start: graphData.nodes[0],
        target: graphData.nodes[graphData.nodes.length - 1],
        criterion: "distance",
        directed: false,
      });
      setDijkstraResult(result);
    } catch (err) {
      console.error("Dijkstra error:", err);
    } finally {
      setDijkstraLoading(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const safest = routes.find((r) => r.is_safest) || routes[0];
  const chosenRoute = routes[selectedRoute] || safest;
  const chosenRisk = getRouteRiskLabel(chosenRoute?.avg_risk);
  const chosenDistance = Number.isFinite(chosenRoute?.distance_m)
    ? `${(chosenRoute.distance_m / 1000).toFixed(1)} km`
    : "Unavailable";
  const chosenDuration = Number.isFinite(chosenRoute?.duration_s)
    ? `${Math.max(1, Math.round(chosenRoute.duration_s / 60))} min`
    : "Unavailable";
  const recommendedRoute = routes.find((route) => route.is_safest) || routes[0];
  const shortestDistance = routes.length ? Math.min(...routes.map((route) => route.distance_m)) : null;
  const fastestDuration = routes.length ? Math.min(...routes.map((route) => route.duration_s)) : null;

  const getRouteReasons = (route) => {
    const reasons = [];
    if (route.is_safest) reasons.push("Highest PathRak safety score");
    if (route.distance_m === shortestDistance) reasons.push("Shortest available route");
    if (route.duration_s === fastestDuration) reasons.push("Fastest available route");
    if (!route.is_safest && Number.isFinite(recommendedRoute?.avg_risk) && Number.isFinite(route.avg_risk)) {
      if (route.avg_risk < recommendedRoute.avg_risk) reasons.push("Lower average risk than recommended");
      if (route.avg_risk > recommendedRoute.avg_risk) reasons.push("Higher average risk than recommended");
    }
    if (!route.is_safest && Number.isFinite(recommendedRoute?.distance_m) && Number.isFinite(route.distance_m)) {
      if (route.distance_m + 25 < recommendedRoute.distance_m) reasons.push("Shorter than recommended route");
      if (route.distance_m > recommendedRoute.distance_m + 25) reasons.push("Longer than recommended route");
    }
    return reasons;
  };

  const startSelectedRoute = () => {
    if (!chosenRoute || !end) return;
    onStartSafeWalk?.(createRoutePlan({ route: chosenRoute, destination: end, provider: routingProvider }));
  };

  const defaultCenter = start
    ? [start.lat, start.lng]
    : currentPos
    ? currentPos
    : appConfig?.demo
    ? [appConfig.demo.start.lat, appConfig.demo.start.lng]
    : [12.9716, 77.5946];

  return (
    <div className="page-stack route-page">
      <PageHeader
        eyebrow="Safer navigation"
        title="Safe Route"
        description="Compare real road alternatives using route risk scores. PathRak never substitutes a straight line when routing is unavailable."
        actions={
          <StatusPill tone={routes.length ? "success" : "neutral"} icon="route">
            {routes.length ? `${routes.length} route${routes.length === 1 ? "" : "s"} found` : "Ready to plan"}
          </StatusPill>
        }
      />

      <section className="panel route-planner">
        <div className="route-fields">
          <LocationSearch
            label="Start location"
            value={start}
            onChange={(val) => {
              setStartEdited(true);
              setStart(val);
            }}
            onQuickSetDemo={
              appConfig?.demo
                ? () => {
                    setStartEdited(true);
                    setStart(appConfig.demo.start);
                  }
                : null
            }
            demoLabel="Set MG Road demo"
          />
          <button
            type="button"
            className="route-connector-btn icon-button"
            title="Swap locations"
            onClick={() => {
              setStartEdited(true);
              setStart(end);
              setEnd(start);
            }}
          >
            <Icon name="route" size={16} />
          </button>
          <LocationSearch
            label="Destination"
            value={end}
            onChange={setEnd}
            onQuickSetDemo={appConfig?.demo ? () => setEnd(appConfig.demo.destination) : null}
            demoLabel="Set Cubbon Park demo"
          />
        </div>

        <div className="map-picker-bar">
          <span className="text-xs text-ink-soft">Map click selection:</span>
          <button
            type="button"
            className={`btn btn-xs ${mapPickMode === "start" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMapPickMode(mapPickMode === "start" ? null : "start")}
          >
            {mapPickMode === "start" ? "Click map to set Start" : "Pick Start on map"}
          </button>
          <button
            type="button"
            className={`btn btn-xs ${mapPickMode === "end" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMapPickMode(mapPickMode === "end" ? null : "end")}
          >
            {mapPickMode === "end" ? "Click map to set End" : "Pick Destination on map"}
          </button>
        </div>

        <div className="departure-field">
          <div>
            <label htmlFor="departure-hour">Departure hour</label>
            <strong>{String(hour).padStart(2, "0")}:00</strong>
          </div>
          <input
            id="departure-hour"
            type="range"
            min="0"
            max="23"
            value={hour}
            onChange={(event) => setHour(Number(event.target.value))}
          />
          <small>Current time {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
        </div>

        <div className="field route-objective">
          <label htmlFor="route-objective">Optimize for</label>
          <select
            id="route-objective"
            className="input"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
          >
            <option value="safewalk">SafeWalk (Weighted Multi-Objective Cost)</option>
            <option value="risk">Lowest observed risk</option>
            <option value="distance">Shortest distance</option>
            <option value="time">Fastest ETA</option>
            <option value="cost">Lowest planning cost</option>
          </select>
        </div>

        <div className="journey-controls">
          <button
            className="btn btn-primary route-submit"
            onClick={() => handleFind()}
            disabled={loading || !start || !end}
          >
            <Icon name="route" />
            {loading ? "Calculating real routes..." : "Find safer routes"}
          </button>
          {appConfig?.demo && (
            <button className="btn btn-secondary" onClick={loadDemoRoute} disabled={loading}>
              Load Bengaluru demo route
            </button>
          )}
        </div>
      </section>

      {error && (
        <Notice
          tone="warning"
          title="Route service unavailable"
          action={
            <button className="btn btn-secondary" onClick={() => handleFind()} disabled={loading}>
              Try again
            </button>
          }
        >
          {error} No route has been fabricated.
        </Notice>
      )}
      {tileError && <Notice tone="warning" title="Map tiles notice">{tileError}</Notice>}
      {dataMode === "DEMO" && (
        <Notice tone="warning" title="Demonstration risk data">
          Route geometry is real when returned by the provider, but safety scores use synthetic incidents and are not real-world safety guidance.
        </Notice>
      )}
      {routingProvider === "OSRM_DEMO" && (
        <Notice tone="info" title="Public road routing">
          Real road route from the public OSRM demo server using driving-car network geometry. Alternatives are returned only when distinct routes exist.
        </Notice>
      )}

      <div className={`route-workspace ${routes.length ? "has-routes" : ""}`}>
        <div className="map-frame route-map">
          <MapContainer center={defaultCenter} zoom={13} style={{ height: "100%", width: "100%" }}>
            <MapTiles onError={setTileError} />
            <MapLayoutResizer />
            <MapClickHandler onMapClick={handleMapClick} />
            <FitBounds routes={routes} start={start} end={end} />
            {routes.map((route, i) => {
              if (selectedRoute === i) return null;
              if (!route.coordinates || route.coordinates.length === 0) return null;
              return (
                <Polyline
                  key={`bg-${i}`}
                  positions={route.coordinates}
                  pathOptions={{
                    color: scoreStyle(route.score).line,
                    weight: 4,
                    opacity: 0.48,
                    dashArray: "8 6",
                  }}
                  eventHandlers={{ click: () => setSelectedRoute(i) }}
                />
              );
            })}
            {routes.map((route, i) => {
              if (selectedRoute !== i) return null;
              if (!route.coordinates || route.coordinates.length === 0) return null;
              return (
                <Polyline
                  key={`fg-${i}`}
                  positions={route.coordinates}
                  pathOptions={{
                    color: scoreStyle(route.score).line,
                    weight: 7,
                    opacity: 1,
                  }}
                />
              );
            })}
            {start && (
              <CircleMarker
                center={[start.lat, start.lng]}
                radius={9}
                pathOptions={{ color: "#087f6d", fillColor: "#087f6d", fillOpacity: 1 }}
              >
                <Popup>
                  <strong>Start</strong>
                  <br />
                  {start.name}
                </Popup>
              </CircleMarker>
            )}
            {end && (
              <CircleMarker
                center={[end.lat, end.lng]}
                radius={9}
                pathOptions={{ color: "#c9363e", fillColor: "#c9363e", fillOpacity: 1 }}
              >
                <Popup>
                  <strong>Destination</strong>
                  <br />
                  {end.name}
                </Popup>
              </CircleMarker>
            )}
            {routes[selectedRoute]?.coordinates?.[animIndex] && (
              <CircleMarker
                center={routes[selectedRoute].coordinates[animIndex]}
                radius={7}
                pathOptions={{
                  color: "#ffffff",
                  fillColor: "#0284c7",
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Popup>
                  <strong>Journey Simulation</strong>
                  <br />
                  Waypoints explored: {animIndex + 1} / {routes[selectedRoute].coordinates.length}
                </Popup>
              </CircleMarker>
            )}
          </MapContainer>
        </div>

        <aside className="route-results">
          {!routes.length ? (
            <div className="panel route-empty">
              <span>
                <Icon name="route" size={26} />
              </span>
              <h2>No route calculated yet</h2>
              <p>
                {start && end
                  ? "Click 'Find safer routes' above to calculate road routes, travel time, and risk scores."
                  : "Choose start and destination locations or click 'Load Bengaluru demo route' to compare alternatives."}
              </p>
            </div>
          ) : (
            <>
              <div className="route-result-heading">
                <p className="eyebrow">PathRak route ranking</p>
                <h2>Compare and select</h2>
                <p>
                  {routes.length === 1
                    ? "The routing provider returned one distinct road route for this journey."
                    : `${routes.length} distinct road routes returned and ranked with PathRak Merge Sort.`}
                </p>
              </div>
              <div className="route-options">
                {routes.map((route, index) => {
                  const selected = selectedRoute === index;
                  const style = scoreStyle(route.score);
                  const alternativeNumber = routes.slice(0, index + 1).filter((item) => !item.is_safest).length;
                  const title = route.is_safest ? "Recommended route" : `Alternative route ${alternativeNumber}`;
                  const reasons = getRouteReasons(route);
                  return (
                    <article
                      key={route.route_index ?? index}
                      className={`route-option tone-${style.tone} ${selected ? "is-selected" : ""}`}
                      onClick={() => setSelectedRoute(index)}
                    >
                      <span className="route-option-top">
                        <span>
                          <small>{route.is_safest ? "Recommended" : "Available route"}</small>
                          <strong>{title}</strong>
                        </span>
                        {selected && (
                          <span className="selected-badge">
                            <Icon name="check" size={13} />
                            Selected
                          </span>
                        )}
                      </span>
                      <dl className="route-option-metrics">
                        <div>
                          <dt>Route label</dt>
                          <dd>{route.label}</dd>
                        </div>
                        <div>
                          <dt>Safety score</dt>
                          <dd>{route.score} / 100</dd>
                        </div>
                        <div>
                          <dt>Risk</dt>
                          <dd>{getRouteRiskLabel(route.avg_risk)}</dd>
                        </div>
                        <div>
                          <dt>Average risk</dt>
                          <dd>{route.avg_risk} / 5</dd>
                        </div>
                        <div>
                          <dt>Distance</dt>
                          <dd>{(route.distance_m / 1000).toFixed(1)} km</dd>
                        </div>
                        <div>
                          <dt>ETA</dt>
                          <dd>{Math.max(1, Math.round(route.duration_s / 60))} min</dd>
                        </div>
                        <div>
                          <dt>Planning cost</dt>
                          <dd>₹{route.cost_estimate_inr?.toFixed(0) ?? "—"}</dd>
                        </div>
                        <div className="route-provider">
                          <dt>Provider</dt>
                          <dd>{routingProvider === "OSRM_DEMO" ? "OSRM" : "OpenRouteService"}</dd>
                        </div>
                      </dl>
                      {reasons.length > 0 && (
                        <span className="route-tradeoffs">
                          {reasons.map((reason) => (
                            <small key={reason}>
                              <Icon
                                name={reason.includes("Higher") || reason.includes("Longer") ? "warning" : "check"}
                                size={13}
                              />
                              {reason}
                            </small>
                          ))}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-pressed={selected}
                        className={`route-select-action ${selected ? "is-selected" : ""}`}
                        onClick={() => setSelectedRoute(index)}
                      >
                        {selected ? "Selected route" : "Select route"}
                      </button>
                    </article>
                  );
                })}
              </div>

              {chosenRoute && (
                <section className="route-analysis" aria-label="PathRak safety analysis">
                  <div className="route-analysis-heading">
                    <div>
                      <p className="eyebrow">PathRak safety analysis</p>
                      <h3>
                        {start?.name?.split(",")[0]} to {end?.name?.split(",")[0]}
                      </h3>
                    </div>
                    {chosenRoute.is_safest && <StatusPill tone="success">Recommended</StatusPill>}
                  </div>
                  <dl className="route-analysis-metrics">
                    <div>
                      <dt>Safety score</dt>
                      <dd>
                        {chosenRoute.score}
                        <small>/ 100</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Distance</dt>
                      <dd>{chosenDistance}</dd>
                    </div>
                    <div>
                      <dt>Estimated time</dt>
                      <dd>{chosenDuration}</dd>
                    </div>
                    <div>
                      <dt>Risk</dt>
                      <dd>{chosenRisk}</dd>
                    </div>
                  </dl>

                  {/* DAA Dijkstra integration with bounded route graph */}
                  {chosenRoute.bounded_algorithm_graph && (
                    <div className="panel bg-surface-subtle p-3 my-3 rounded-lg border border-line">
                      <div className="flex items-center justify-between mb-2">
                        <strong className="text-sm">DAA Dijkstra Route Graph Analysis</strong>
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          onClick={executeDijkstraOnRoute}
                          disabled={dijkstraLoading}
                        >
                          {dijkstraLoading ? "Running Dijkstra..." : "Run Dijkstra on Route Graph"}
                        </button>
                      </div>
                      <p className="text-xs text-ink-soft mb-2">
                        {chosenRoute.bounded_algorithm_graph.scope}
                      </p>
                      <div className="text-xs grid grid-cols-2 gap-2">
                        <span>Graph vertices: <strong>{chosenRoute.bounded_algorithm_graph.nodes.length}</strong></span>
                        <span>Graph segments: <strong>{chosenRoute.bounded_algorithm_graph.edges.length}</strong></span>
                      </div>
                      {dijkstraResult && (
                        <div className="mt-2 pt-2 border-t border-line text-xs">
                          <p className="text-safe font-semibold">
                            ✓ Dijkstra verified optimal path along candidate corridor ({dijkstraResult.execution_ms} ms).
                          </p>
                          <p className="text-ink-soft">
                            Vertices processed: {dijkstraResult.nodes_processed} | Total distance: {(dijkstraResult.total_weight / 1000).toFixed(2)} km
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="route-reasons">
                    <strong>Why this route</strong>
                    <ul>
                      {chosenRoute.is_safest && <li>Best safety score among available routes</li>}
                      <li>Average spatial risk {chosenRoute.avg_risk}/5</li>
                      {routingProvider && (
                        <li>
                          Road-network route returned by {routingProvider === "OSRM_DEMO" ? "OSRM" : "OpenRouteService"}
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="route-legend p-3 bg-surface-subtle rounded border border-line text-xs my-2">
                    <strong className="block mb-1">Route & Graph Legend</strong>
                    <div className="flex gap-4 flex-wrap">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-[#11875d]"></span> Selected / Safe Route
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-[#b47712]"></span> Alternative Route
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-[#c9363e]"></span> High Risk Segment
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-[#0284c7]"></span> Journey Progress Marker
                      </span>
                    </div>
                  </div>

                  <div className="route-analysis-actions flex gap-2">
                    <button
                      type="button"
                      className={`btn ${isSimulating ? "btn-secondary" : "btn-secondary"}`}
                      onClick={() => {
                        if (isSimulating) {
                          setIsSimulating(false);
                        } else {
                          setAnimIndex(0);
                          setIsSimulating(true);
                        }
                      }}
                    >
                      <Icon name="route" />
                      {isSimulating ? "Pause Simulation" : "Simulate Journey"}
                    </button>
                    <button className="btn btn-primary" onClick={startSelectedRoute}>
                      <Icon name="walk" />
                      Start SafeWalk
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
