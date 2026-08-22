import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { findSafeRoute, searchLocation } from "../api";
import { getBackendWeekday } from "../utils/safetyLogic";
import Icon from "../components/Icon";
import { Notice, PageHeader, StatusPill } from "../components/UI";
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

  useEffect(() => {
    // Sync query if value changes externally
    if (value && value.name !== query && !isOpen) {
      setQuery(value.name);
    }
  }, [value, isOpen]);

  useEffect(() => {
    if (!query || query === value?.name) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchLocation(query);
        const mapped = data.map(item => {
          const parts = item.display_name.split(",");
          const name = parts.slice(0, 2).join(",").trim();
          return { name, lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
        });
        setResults(mapped);
        setIsOpen(true);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
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

export default function RoutePage({ currentPos, theme }) {
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [hour, setHour] = useState(new Date().getHours());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [isVoiceOn, setIsVoiceOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStepIndex, setVoiceStepIndex] = useState(0);
  const [startEdited, setStartEdited] = useState(false);
  const [dataMode, setDataMode] = useState(null);

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
        getBackendWeekday()
      );
      if (data.routes?.length === 0) throw new Error("No routes found");

      // Filter out practically identical routes using a midpoint heuristic
      const areRoutesSimilar = (r1, r2) => {
        if (!r1.coordinates.length || !r2.coordinates.length) return false;
        const mid1 = r1.coordinates[Math.floor(r1.coordinates.length / 2)];
        const mid2 = r2.coordinates[Math.floor(r2.coordinates.length / 2)];
        const dist = Math.sqrt(Math.pow(mid1[0] - mid2[0], 2) + Math.pow(mid1[1] - mid2[1], 2));
        return dist < 0.005; // Requires ~500m separation at the midpoint
      };

      const unique = [];
      for (const r of data.routes || []) {
        if (!unique.some(existing => areRoutesSimilar(existing, r))) {
          unique.push(r);
        }
      }

      setRoutes(unique);
      setDataMode(data.data_mode || null);
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

  // --- Voice helpers (simple TTS turn steps based on coordinates) ---
  const haversineMeters = (a, b) => {
    const toRad = v => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const sinDlat = Math.sin(dLat / 2);
    const sinDlon = Math.sin(dLon / 2);
    const aa = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c;
  };

  const bearingToCardinal = (a, b) => {
    const toRad = v => (v * Math.PI) / 180;
    const toDeg = v => (v * 180) / Math.PI;
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const dLon = toRad(b[1] - a[1]);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
    const dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
    return dirs[Math.round(brng / 45) % 8];
  };

  const buildSteps = (route) => {
    if (!route || !route.coordinates || route.coordinates.length < 2) return [];
    const coords = route.coordinates;
    const steps = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const meters = Math.round(haversineMeters(a, b));
      const dir = bearingToCardinal(a, b);
      steps.push({ text: `Head ${dir} for ${meters} meters.`, coords: b, distance: meters });
    }
    steps.push({ text: `You have arrived at your destination.`, coords: coords[coords.length - 1], distance: 0 });
    return steps;
  };

  const speak = (text, onend) => {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.onend = onend;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setIsSpeaking(true);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const startVoiceNavigation = () => {
    if (!safest) return;
    const steps = buildSteps(safest);
    if (!steps.length) return;
    setIsVoiceOn(true);
    setVoiceStepIndex(0);
    // speak initial summary then start steps
    const summary = `Starting voice navigation. Recommended safety score ${safest.score} out of 100. ${safest.label}.`;
    speak(summary, () => {
      // after summary, speak step 0
      speak(steps[0].text, () => {
        setIsSpeaking(false);
        setVoiceStepIndex(0);
      });
    });
  };

  const speakNextStep = () => {
    if (!safest) return;
    const steps = buildSteps(safest);
    const next = Math.min(voiceStepIndex + 1, steps.length - 1);
    setVoiceStepIndex(next);
    speak(steps[next].text, () => setIsSpeaking(false));
  };

  const speakPrevStep = () => {
    if (!safest) return;
    const steps = buildSteps(safest);
    const prev = Math.max(0, voiceStepIndex - 1);
    setVoiceStepIndex(prev);
    speak(steps[prev].text, () => setIsSpeaking(false));
  };

  const stopVoiceNavigation = () => {
    stopSpeaking();
    setIsVoiceOn(false);
    setVoiceStepIndex(0);
  };

  return (
    <div className="page-stack route-page">
      <PageHeader eyebrow="Safer navigation" title="Safe Route" description="Compare real road alternatives using route risk scores. PathRak never substitutes a straight line when routing is unavailable." actions={<StatusPill tone={routes.length ? "success" : "neutral"} icon="route">{routes.length ? `${routes.length} route${routes.length === 1 ? "" : "s"} found` : "Ready to plan"}</StatusPill>} />

      <section className="panel route-planner">
        <div className="route-fields"><LocationSearch label="Start location" value={start} onChange={(value) => { setStartEdited(true); setStart(value); }} /><span className="route-connector" /><LocationSearch label="Destination" value={end} onChange={setEnd} /></div>
        <div className="departure-field"><div><label htmlFor="departure-hour">Departure hour</label><strong>{String(hour).padStart(2, "0")}:00</strong></div><input id="departure-hour" type="range" min="0" max="23" value={hour} onChange={(event) => setHour(Number(event.target.value))} /><small>Current time {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>
        <button className="btn btn-primary route-submit" onClick={handleFind} disabled={loading || !start || !end}><Icon name="route" />{loading ? "Calculating real routes..." : "Find safer routes"}</button>
      </section>

      {error && <Notice tone="warning" title="Route service unavailable" action={<button className="btn btn-secondary" onClick={handleFind} disabled={loading}>Try again</button>}>{error} No route has been fabricated.</Notice>}
      {dataMode === "DEMO" && <Notice tone="warning" title="Demonstration risk data">Route geometry is real when returned by the provider, but safety scores use synthetic incidents and are not real-world safety guidance.</Notice>}

      <div className={`route-workspace ${routes.length ? "has-routes" : ""}`}>
        <div className="map-frame route-map">
          <MapContainer center={start ? [start.lat, start.lng] : end ? [end.lat, end.lng] : [20, 0]} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url={theme === "dark" ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
            attribution="&copy; OpenStreetMap &copy; CARTO"
          />
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
            <div className="route-result-heading"><p className="eyebrow">Route alternatives</p><h2>Choose your route</h2></div>
            <div className="route-options">{routes.map((route, index) => { const selected = selectedRoute === index; const style = scoreStyle(route.score); return <button key={index} className={`route-option tone-${style.tone} ${selected ? "is-selected" : ""}`} onClick={() => setSelectedRoute(index)}><span className="route-index">{index + 1}</span><span className="route-copy"><strong>{route.is_safest ? "Recommended route" : `Alternative ${index + 1}`}</strong><small>{route.label} · Average risk {route.avg_risk}/5</small>{route.distance_m && <small>{(route.distance_m / 1000).toFixed(1)} km · {Math.round(route.duration_s / 60)} min</small>}</span><span className="route-score"><strong>{route.score}</strong><small>/100</small></span></button>; })}</div>
            {safest && <section className="voice-panel"><div><p className="eyebrow">Recommended</p><h3>{start?.name?.split(",")[0]} to {end?.name?.split(",")[0]}</h3><p>{safest.label} · Safety score {safest.score}/100</p></div><div className="voice-actions"><button className="btn btn-secondary" onClick={isVoiceOn ? stopVoiceNavigation : startVoiceNavigation}>{isVoiceOn ? "Stop voice" : "Start voice guidance"}</button><button className="btn btn-quiet" onClick={() => speak(`Summary: ${safest.label}. Safety ${safest.score} out of 100.`)}>Speak summary</button>{isVoiceOn && <><button className="btn btn-quiet" onClick={speakPrevStep}>Previous</button><button className="btn btn-quiet" onClick={speakNextStep}>Next</button></>}</div></section>}
          </>}
        </aside>
      </div>
    </div>
  );
}
