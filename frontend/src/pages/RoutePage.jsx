import { useState, useEffect, useRef } from "react";
import { MapContainer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { findSafeRoute, searchLocation } from "../api";
import { getBackendWeekday } from "../utils/safetyLogic";
import { createRoutePlan, getDistinctRoutes, getRouteRiskLabel } from "../utils/routePlan";
import Icon from "../components/Icon";
import { Notice, PageHeader, StatusPill } from "../components/UI";
import MapTiles from "../components/MapTiles";
import MapLayoutResizer from "../components/MapLayoutResizer";
import "leaflet/dist/leaflet.css";

const scoreStyle = (score) => {
  if (score >= 80) return { tone: "safe", line: "#11875d" };
  if (score >= 60) return { tone: "caution", line: "#b47712" };
  return { tone: "danger", line: "#c9363e" };
};

function FitBounds({ routes }) {
  const map = useMap();
  useEffect(() => {
    if (!routes?.length || !routes[0].coordinates?.length) return;
    const allCoords = routes.flatMap(r => r.coordinates);
    const lats = allCoords.map(c => c[0]);
    const lngs = allCoords.map(c => c[1]);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ], { padding: [40, 40] });
  }, [map, routes]);
  return null;
}

function LocationSearch({ label, value, onChange }) {
  const [query, setQuery] = useState(value ? value.name : "");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const requestVersion = useRef(0);

  useEffect(() => {
    // Sync query if value changes externally
    if (value && value.name !== query && !isOpen) {
      setQuery(value.name);
    }
  }, [value, isOpen]);

  useEffect(() => {
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
        const mapped = data.map(item => {
          const parts = item.display_name.split(",");
          const name = parts.slice(0, 2).join(",").trim();
          return { name, lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
        }).filter(item => item.name && Number.isFinite(item.lat) && Number.isFinite(item.lng));
        if (version !== requestVersion.current) return;
        setResults(mapped);
        setIsOpen(true);
      } catch (e) {
        if (version !== requestVersion.current) return;
        setResults([]);
        setSearchError(e.message || "Place search is unavailable.");
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    }, 600);
    return () => { clearTimeout(timer); requestVersion.current += 1; };
  }, [query]);

  return (
    <div className="route-search field">
      <label>{label}</label>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
        onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        placeholder="Search location..."
        className="input"
      />
      {loading && <span className="search-loading">Searching...</span>}
      {searchError && <small className="search-error">{searchError}</small>}
      {isOpen && !loading && !searchError && query.trim().length >= 2 && results.length === 0 && <small className="search-error">No matching places found.</small>}
      
      {isOpen && results.length > 0 && (
        <div className="search-results">
          {results.map((r, i) => (
            <button type="button"
              key={i}
              onClick={() => {
                setQuery(r.name);
                onChange(r);
                setIsOpen(false);
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
  const [objective, setObjective] = useState("risk");
  const [tileError, setTileError] = useState("");

  useEffect(() => {
    if (!currentPos || startEdited) return;
    setStart({
      name: "Current location",
      lat: currentPos[0],
      lng: currentPos[1],
    });
  }, [currentPos, startEdited]);

  const handleFind = async () => {
    if (!start || !end) {
      setError("Set both a start and destination before finding a route.");
      return;
    }
    if (start.lat === end.lat && start.lng === end.lng) {
      setError("Start and end must be different locations.");
      return;
    }
    setLoading(true);
    setError("");
    setRoutes([]);
    try {
      const data = await findSafeRoute(
        [{ lat: start.lat, lng: start.lng }, { lat: end.lat, lng: end.lng }],
        hour,
        getBackendWeekday(),
        objective,
      );
      if (data.routes?.length === 0) throw new Error("No routes found");

      const unique = getDistinctRoutes(data.routes, 3);
      if (!unique.length) throw new Error("No routes with usable road geometry were returned");

      setRoutes(unique);
      setDataMode(data.data_mode || null);
      setRoutingProvider(data.routing_provider || null);
      setSelectedRoute(0);
    } catch (err) {
      console.error("Error finding safe route:", err);
      setError(err.message || "Could not find a real road route.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const safest = routes.find(r => r.is_safest) || routes[0];
  const chosenRoute = routes[selectedRoute] || safest;
  const chosenRisk = getRouteRiskLabel(chosenRoute?.avg_risk);
  const chosenDistance = Number.isFinite(chosenRoute?.distance_m) ? `${(chosenRoute.distance_m / 1000).toFixed(1)} km` : "Unavailable";
  const chosenDuration = Number.isFinite(chosenRoute?.duration_s) ? `${Math.max(1, Math.round(chosenRoute.duration_s / 60))} min` : "Unavailable";
  const recommendedRoute = routes.find(route => route.is_safest) || routes[0];
  const shortestDistance = routes.length ? Math.min(...routes.map(route => route.distance_m)) : null;
  const fastestDuration = routes.length ? Math.min(...routes.map(route => route.duration_s)) : null;

  const getRouteReasons = (route) => {
    const reasons = [];
    if (route.is_safest) reasons.push("Highest PathRak safety score");
    if (route.distance_m === shortestDistance) reasons.push("Shortest available route");
    if (route.duration_s === fastestDuration) reasons.push("Fastest available route");
    if (!route.is_safest && Number.isFinite(recommendedRoute?.avg_risk) && Number.isFinite(route.avg_risk)) {
      if (route.avg_risk < recommendedRoute.avg_risk) reasons.push("Lower average risk than the recommended route");
      if (route.avg_risk > recommendedRoute.avg_risk) reasons.push("Higher average risk than the recommended route");
    }
    if (!route.is_safest && Number.isFinite(recommendedRoute?.distance_m) && Number.isFinite(route.distance_m)) {
      if (route.distance_m + 25 < recommendedRoute.distance_m) reasons.push("Shorter than the recommended route");
      if (route.distance_m > recommendedRoute.distance_m + 25) reasons.push("Longer than the recommended route");
    }
    return reasons;
  };

  const startSelectedRoute = () => {
    if (!chosenRoute || !end) return;
    onStartSafeWalk?.(createRoutePlan({ route: chosenRoute, destination: end, provider: routingProvider }));
  };

  const speak = (text, onend) => {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.onend = onend;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="page-stack route-page">
      <PageHeader eyebrow="Safer navigation" title="Safe Route" description="Compare real road alternatives using route risk scores. PathRak never substitutes a straight line when routing is unavailable." actions={<StatusPill tone={routes.length ? "success" : "neutral"} icon="route">{routes.length ? `${routes.length} route${routes.length === 1 ? "" : "s"} found` : "Ready to plan"}</StatusPill>} />

      <section className="panel route-planner">
        <div className="route-fields"><LocationSearch label="Start location" value={start} onChange={(value) => { setStartEdited(true); setStart(value); }} /><span className="route-connector" /><LocationSearch label="Destination" value={end} onChange={setEnd} /></div>
        <div className="departure-field"><div><label htmlFor="departure-hour">Departure hour</label><strong>{String(hour).padStart(2, "0")}:00</strong></div><input id="departure-hour" type="range" min="0" max="23" value={hour} onChange={(event) => setHour(Number(event.target.value))} /><small>Current time {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>
        <div className="field route-objective"><label htmlFor="route-objective">Optimize for</label><select id="route-objective" className="input" value={objective} onChange={event => setObjective(event.target.value)}><option value="risk">Lowest observed risk</option><option value="distance">Shortest distance</option><option value="time">Fastest ETA</option><option value="cost">Lowest planning cost</option></select></div>
        <div className="journey-controls"><button className="btn btn-primary route-submit" onClick={handleFind} disabled={loading || !start || !end}><Icon name="route" />{loading ? "Calculating real routes..." : "Find safer routes"}</button>{appConfig?.demo_mode && <button className="btn btn-secondary" onClick={() => { setStartEdited(true); setStart(appConfig.demo.start); setEnd(appConfig.demo.destination); setRoutes([]); setError(""); }}>Load Bengaluru demo route</button>}</div>
      </section>

      {error && <Notice tone="warning" title="Route service unavailable" action={<button className="btn btn-secondary" onClick={handleFind} disabled={loading}>Try again</button>}>{error} No route has been fabricated.</Notice>}
      {tileError && <Notice tone="warning" title="Map tiles unavailable" action={<button className="btn btn-secondary" onClick={() => { setTileError(""); window.location.reload(); }}>Reload map</button>}>{tileError}</Notice>}
      {dataMode === "DEMO" && <Notice tone="warning" title="Demonstration risk data">Route geometry is real when returned by the provider, but safety scores use synthetic incidents and are not real-world safety guidance.</Notice>}
      {routingProvider === "OSRM_DEMO" && <Notice tone="info" title="Public demo routing">This is a real road route from the public OSRM demo server using a driving-road profile. It is not pedestrian navigation, and alternatives are not guaranteed.</Notice>}

      <div className={`route-workspace ${routes.length ? "has-routes" : ""}`}>
        <div className="map-frame route-map">
          <MapContainer center={start ? [start.lat, start.lng] : end ? [end.lat, end.lng] : [20, 0]} zoom={13} style={{ height: "100%", width: "100%" }}>
          <MapTiles onError={setTileError} />
          <MapLayoutResizer />
          {routes.length > 0 && <FitBounds routes={routes} />}
          {routes.map((route, i) => {
            if (selectedRoute === i) return null;
            if (!route.coordinates || route.coordinates.length === 0) return null;
            return <Polyline key={`bg-${i}`} positions={route.coordinates} pathOptions={{ color: scoreStyle(route.score).line, weight: 4, opacity: .48, dashArray: "8 6" }} eventHandlers={{ click: () => setSelectedRoute(i) }} />;
          })}
          {routes.map((route, i) => {
            if (selectedRoute !== i) return null;
            if (!route.coordinates || route.coordinates.length === 0) return null;
            return <Polyline key={`fg-${i}`} positions={route.coordinates} pathOptions={{ color: scoreStyle(route.score).line, weight: 7, opacity: 1 }} />;
          })}
          {start && <CircleMarker center={[start.lat, start.lng]} radius={9} pathOptions={{ color: "#087f6d", fillColor: "#087f6d", fillOpacity: 1 }}><Popup><strong>Start</strong><br />{start.name}</Popup></CircleMarker>}
          {end && <CircleMarker center={[end.lat, end.lng]} radius={9} pathOptions={{ color: "#c9363e", fillColor: "#c9363e", fillOpacity: 1 }}><Popup><strong>Destination</strong><br />{end.name}</Popup></CircleMarker>}
        </MapContainer>
          {!start && !end && <div className="map-unavailable"><Icon name="route" size={28} /><strong>Plan a route to begin</strong><p>Your live location will be used as the default start when available.</p></div>}
        </div>

        <aside className="route-results">
          {!routes.length ? <div className="panel route-empty"><span><Icon name="route" size={26} /></span><h2>No route calculated yet</h2><p>Choose a destination to compare available road routes, travel time, distance, and risk score.</p></div> : <>
            <div className="route-result-heading"><p className="eyebrow">PathRak route ranking</p><h2>Compare and select</h2><p>{routes.length === 1 ? "The routing provider returned one distinct road route for this journey." : `${routes.length} distinct road routes were returned and ranked with PathRak Merge Sort.`}</p></div>
            <div className="route-options">{routes.map((route, index) => {
              const selected = selectedRoute === index;
              const style = scoreStyle(route.score);
              const alternativeNumber = routes.slice(0, index + 1).filter(item => !item.is_safest).length;
              const title = route.is_safest ? "Recommended route" : `Alternative route ${alternativeNumber}`;
              const reasons = getRouteReasons(route);
              return <article key={route.route_index ?? index} className={`route-option tone-${style.tone} ${selected ? "is-selected" : ""}`} onClick={() => setSelectedRoute(index)}>
                <span className="route-option-top"><span><small>{route.is_safest ? "Recommended" : "Available route"}</small><strong>{title}</strong></span>{selected && <span className="selected-badge"><Icon name="check" size={13} />Selected</span>}</span>
                <dl className="route-option-metrics"><div><dt>Route label</dt><dd>{route.label}</dd></div><div><dt>Safety score</dt><dd>{route.score} / 100</dd></div><div><dt>Risk</dt><dd>{getRouteRiskLabel(route.avg_risk)}</dd></div><div><dt>Average risk</dt><dd>{route.avg_risk} / 5</dd></div><div><dt>Distance</dt><dd>{(route.distance_m / 1000).toFixed(1)} km</dd></div><div><dt>ETA</dt><dd>{Math.max(1, Math.round(route.duration_s / 60))} min</dd></div><div><dt>Planning cost</dt><dd>₹{route.cost_estimate_inr?.toFixed(0) ?? "—"}</dd></div><div className="route-provider"><dt>Provider</dt><dd>{routingProvider === "OSRM_DEMO" ? "OSRM" : "OpenRouteService"}</dd></div></dl>
                {reasons.length > 0 && <span className="route-tradeoffs">{reasons.map(reason => <small key={reason}><Icon name={reason.includes("Higher") || reason.includes("Longer") ? "warning" : "check"} size={13} />{reason}</small>)}</span>}
                <button type="button" aria-pressed={selected} className={`route-select-action ${selected ? "is-selected" : ""}`} onClick={() => setSelectedRoute(index)}>{selected ? "Selected route" : "Select route"}</button>
              </article>;
            })}</div>
            {chosenRoute && <section className="route-analysis" aria-label="PathRak safety analysis">
              <div className="route-analysis-heading"><div><p className="eyebrow">PathRak safety analysis</p><h3>{start?.name?.split(",")[0]} to {end?.name?.split(",")[0]}</h3></div>{chosenRoute.is_safest && <StatusPill tone="success">Recommended</StatusPill>}</div>
              <dl className="route-analysis-metrics">
                <div><dt>Safety score</dt><dd>{chosenRoute.score}<small>/ 100</small></dd></div>
                <div><dt>Distance</dt><dd>{chosenDistance}</dd></div>
                <div><dt>Estimated time</dt><dd>{chosenDuration}</dd></div>
                <div><dt>Risk</dt><dd>{chosenRisk}</dd></div>
              </dl>
              <div className="route-reasons"><strong>Why this route</strong><ul>{chosenRoute.is_safest && <li>Best safety score among the available routes</li>}<li>Average spatial risk {chosenRoute.avg_risk}/5</li>{routingProvider && <li>Road-network route returned by {routingProvider === "OSRM_DEMO" ? "OSRM" : "OpenRouteService"}</li>}</ul></div>
              <div className="route-analysis-actions"><button className="btn btn-primary" onClick={startSelectedRoute}><Icon name="walk" />Start SafeWalk</button><button className="btn btn-quiet" onClick={() => speak(`Route summary: ${chosenRoute.label}. Safety score ${chosenRoute.score} out of 100. Distance ${(chosenRoute.distance_m / 1000).toFixed(1)} kilometers. Estimated time ${Math.max(1, Math.round(chosenRoute.duration_s / 60))} minutes.`)}>Speak route summary</button></div>
            </section>}
          </>}
        </aside>
      </div>
    </div>
  );
}
