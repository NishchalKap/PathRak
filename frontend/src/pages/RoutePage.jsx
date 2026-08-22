import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { scoreRoute, findSafeRoute, searchLocation } from "../api";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [12.9716, 77.5946];

const SCORE_COLOR = (score) => {
  if (score >= 80) return { text: "text-green-400", bg: "bg-green-900/30", border: "border-green-500/40", line: "#22c55e" };
  if (score >= 60) return { text: "text-amber-400", bg: "bg-amber-900/30", border: "border-amber-500/40", line: "#f59e0b" };
  if (score >= 40) return { text: "text-orange-400", bg: "bg-orange-900/30", border: "border-orange-500/40", line: "#f97316" };
  return { text: "text-red-400", bg: "bg-red-900/30", border: "border-red-500/40", line: "#ef4444" };
};

function FitBounds({ routes }) {
  const map = useMap();
  if (routes?.length > 0 && routes[0].coordinates?.length > 0) {
    const allCoords = routes.flatMap(r => r.coordinates);
    const lats = allCoords.map(c => c[0]);
    const lngs = allCoords.map(c => c[1]);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ], { padding: [40, 40] });
  }
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
    <div className="relative">
      <label className="text-xs text-slate-600 dark:text-slate-400 block mb-2">{label}</label>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
        onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        placeholder="Search location..."
        className="w-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm border border-black/20 dark:border-slate-600 focus:outline-none focus:border-pink-500 placeholder-slate-500"
      />
      {loading && <div className="absolute right-3 top-9 text-xs text-slate-600 dark:text-slate-400">...</div>}
      
      {isOpen && results.length > 0 && (
        <div className="absolute z-[1000] top-full left-0 right-0 mt-1 bg-white/60 dark:bg-slate-800 border border-black/20 dark:border-slate-600 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <div
              key={i}
              className="px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:bg-slate-700 cursor-pointer border-b border-black/10 dark:border-slate-700/50 last:border-0 truncate"
              onClick={() => {
                setQuery(r.name);
                onChange(r);
                setIsOpen(false);
              }}
            >
              {r.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoutePage({ theme }) {
  const [start, setStart] = useState({ name: "Koramangala, Bengaluru", lat: 12.9352, lng: 77.6245 });
  const [end, setEnd] = useState({ name: "MG Road, Bengaluru", lat: 12.9758, lng: 77.6065 });
  const [hour, setHour] = useState(new Date().getHours());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [isVoiceOn, setIsVoiceOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStepIndex, setVoiceStepIndex] = useState(0);

  const handleFind = async () => {
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
        new Date().getDay()
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
      setSelectedRoute(0);
    } catch (err) {
      console.error("Error finding safe route:", err);
      setError("OpenRouteService API key missing or invalid. Showing direct straight-line route instead.");
      try {
        const waypoints = [
          { lat: start.lat, lng: start.lng },
          { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 },
          { lat: end.lat, lng: end.lng },
        ];
        const scored = await scoreRoute(waypoints, hour, new Date().getDay());
        setRoutes([{
          route_index: 0,
          coordinates: waypoints.map(w => [w.lat, w.lng]),
          score: scored.score,
          label: scored.label,
          avg_risk: scored.avg_risk,
          is_safest: true,
          distance_m: null,
          duration_s: null,
        }]);
        setSelectedRoute(0);
      } catch {
        setError("Could not reach backend. Is it running?");
      }
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
    <div className="flex flex-col gap-4 h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Safe Route Finder</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Compare routes and find the safest path to your destination</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-black/10 dark:border-slate-700 relative z-50">
          <LocationSearch label="📍 Start" value={start} onChange={setStart} />
        </div>

        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-black/10 dark:border-slate-700 relative z-40">
          <LocationSearch label="🏁 End" value={end} onChange={setEnd} />
        </div>

        <div className="bg-white/60 dark:bg-slate-800/60 rounded-3xl p-4 border border-black/10 dark:border-slate-700/90 relative z-10">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-[0.16em]">Departure time</p>
              <p className="text-sm text-slate-800 dark:text-white">Plan for the safest hour</p>
            </div>
            <span className="rounded-full bg-pink-500/15 px-3 py-1 text-sm font-semibold text-pink-200">Selected: {String(hour).padStart(2, "0")}:00</span>
          </div>
          <div className="space-y-3">
            <div className="rounded-3xl bg-white/40 dark:bg-slate-950/70 border border-black/10 dark:border-slate-700 p-5 text-center">
              <p className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-[0.14em]">Current time</p>
              <p className="text-4xl font-bold text-slate-800 dark:text-white mt-3">{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-xs text-slate-500 mt-3 uppercase tracking-[0.14em]">Selected hour</p>
              <p className="text-xl font-semibold text-pink-300 mt-1">{String(hour).padStart(2, "0")}:00</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Earlier</span>
                <span>Later</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={e => setHour(Number(e.target.value))}
                  className="h-2 w-full appearance-none rounded-full bg-white/10 accent-pink-500 outline-none transition duration-200 hover:bg-white/20"
                />
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none bg-gradient-to-r from-pink-500/15 via-transparent to-slate-400/10 rounded-full h-2" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-black/10 dark:border-slate-700 flex items-end relative z-10">
          <button
            onClick={handleFind}
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-slate-800 dark:text-white font-semibold text-sm disabled:opacity-50 transition"
          >
            {loading ? "Finding Routes…" : "Find Safe Route"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-yellow-900/40 border border-yellow-500/40 text-yellow-300 text-sm">{error}</div>
      )}

      {routes.length > 0 && (
        <div className={`grid grid-cols-1 gap-3 ${routes.length === 1 ? "md:grid-cols-1" : routes.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          {routes.map((route, i) => {
            const c = SCORE_COLOR(route.score);
            const isSelected = selectedRoute === i;
            return (
              <div
                key={i}
                onClick={() => setSelectedRoute(i)}
                className={`rounded-xl p-4 border cursor-pointer transition-all ${c.bg} ${isSelected ? c.border + " ring-2 ring-pink-500" : "border-black/10 dark:border-slate-700"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                    Route {i + 1} {route.is_safest ? "⭐ Safest" : ""}
                  </span>
                  <span className={`text-2xl font-bold ${c.text}`}>{route.score}</span>
                </div>
                <p className={`text-sm font-semibold ${c.text} mb-1`}>{route.label}</p>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>Avg Risk: {route.avg_risk}/5</span>
                  {route.distance_m && (
                    <span>{(route.distance_m / 1000).toFixed(1)} km · {Math.round(route.duration_s / 60)} min</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {safest && (
        <div className={`rounded-xl p-4 border flex items-center gap-4 ${SCORE_COLOR(safest.score).bg} ${SCORE_COLOR(safest.score).border}`}>
          <div className="text-3xl">🛡️</div>
          <div>
            <p className={`text-xl font-bold ${SCORE_COLOR(safest.score).text}`}>
              Route Safety: {safest.score}/100
            </p>
            <p className="text-slate-800 dark:text-white font-semibold mt-1">
              Recommended: Route {routes.indexOf(safest) + 1} — {start.name.split(',')[0]} → {end.name.split(',')[0]}
            </p>
            <p className={`text-sm ${SCORE_COLOR(safest.score).text}`}>
              {safest.label}
              {safest.distance_m ? ` · ${(safest.distance_m / 1000).toFixed(1)} km` : ""}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {!isVoiceOn ? (
                <button
                  onClick={startVoiceNavigation}
                  className="px-3 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-slate-800 dark:text-white text-sm font-semibold"
                >
                  ▶ Start Voice Nav
                </button>
              ) : (
                <button
                  onClick={stopVoiceNavigation}
                  className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-600 text-slate-800 dark:text-white text-sm font-semibold"
                >
                  ■ Stop Voice Nav
                </button>
              )}

              <button
                onClick={() => { const steps = buildSteps(safest); if (steps.length) speak(`Summary: ${safest.label}. Safety ${safest.score} out of 100.`); }}
                className="px-3 py-1 rounded-lg bg-white/60 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white text-sm border border-black/10 dark:border-slate-700"
              >
                🔊 Speak Summary
              </button>

              <button
                onClick={speakPrevStep}
                disabled={!isVoiceOn}
                className="px-2 py-1 rounded-lg bg-white/60 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white text-sm border border-black/10 dark:border-slate-700 disabled:opacity-40"
              >
                ← Prev
              </button>

              <button
                onClick={speakNextStep}
                disabled={!isVoiceOn}
                className="px-2 py-1 rounded-lg bg-white/60 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white text-sm border border-black/10 dark:border-slate-700 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 rounded-2xl overflow-hidden border border-black/10 dark:border-slate-700 h-[400px] relative z-0">
        <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: "400px", width: "100%" }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap &copy; CartoDB'
          />
          {routes.length > 0 && <FitBounds routes={routes} />}

          {/* Render unselected routes first (background) */}
          {routes.map((route, i) => {
            if (selectedRoute === i) return null;
            if (!route.coordinates || route.coordinates.length === 0) return null;
            const isSafest = route.is_safest;
            return (
              <Polyline
                key={`bg-${i}`}
                positions={route.coordinates}
                pathOptions={{
                  color: isSafest ? "#22c55e" : SCORE_COLOR(route.score).line,
                  weight: 4,
                  opacity: 0.5,
                  dashArray: isSafest ? null : "8 6",
                }}
                eventHandlers={{ click: () => setSelectedRoute(i) }}
              />
            );
          })}

          {/* Render selected route last (foreground) */}
          {routes.map((route, i) => {
            if (selectedRoute !== i) return null;
            if (!route.coordinates || route.coordinates.length === 0) return null;
            const isSafest = route.is_safest;
            return (
              <Polyline
                key={`fg-${i}`}
                positions={route.coordinates}
                pathOptions={{
                  color: isSafest ? "#22c55e" : SCORE_COLOR(route.score).line,
                  weight: 7,
                  opacity: 1,
                  dashArray: isSafest ? null : "6 4",
                }}
              />
            );
          })}

          <CircleMarker center={[start.lat, start.lng]} radius={10}
            pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1 }}>
            <Popup><strong>Start:</strong> {start.name}</Popup>
          </CircleMarker>

          <CircleMarker center={[end.lat, end.lng]} radius={10}
            pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }}>
            <Popup><strong>End:</strong> {end.name}</Popup>
          </CircleMarker>
        </MapContainer>
      </div>

      <p className="text-xs text-slate-500 text-center">
        Green = safest route · Solid = selected · Dashed = alternatives · Click a route on map to highlight
      </p>
    </div>
  );
}