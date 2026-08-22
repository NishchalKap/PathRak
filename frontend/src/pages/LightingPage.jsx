import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Popup, useMap } from "react-leaflet";

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}
import { getLightingMap, getLightingSavings } from "../api";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [12.9716, 77.5946];

const STATUS_COLORS = {
  Working:        "#22c55e",
  "Not Working": "#ef4444",
  "No Street Light": "#6b7280",
};

const getStatusColor = (zone) => {
  if (!zone.has_street_light) return STATUS_COLORS["No Street Light"];
  if (!zone.is_working) return STATUS_COLORS["Not Working"];
  return STATUS_COLORS.Working;
};

const getStatusLabel = (zone) => {
  if (zone.status) return zone.status;
  if (!zone.has_street_light) return "No Street Light";
  if (!zone.is_working) return "Not Working";
  return "Working";
};

const getSegmentStatus = (start, end) => {
  const labels = [getStatusLabel(start), getStatusLabel(end)];
  if (labels.includes("No Street Light")) return "No Street Light";
  if (labels.includes("Not Working")) return "Not Working";
  return "Working";
};

const getGridStep = (zones, key) => {
  const values = [...new Set(zones.map((zone) => Number(zone[key].toFixed(5))))].sort((a, b) => a - b);
  const gaps = values
    .slice(1)
    .map((value, i) => Number((value - values[i]).toFixed(5)))
    .filter((gap) => gap > 0);
  return gaps.length ? Math.min(...gaps) : 0.005;
};

const buildLightingSegments = (zones) => {
  if (zones.some((zone) => Array.isArray(zone.coords))) {
    return zones
      .filter((zone) => Array.isArray(zone.coords) && zone.coords.length > 1)
      .map((zone, i) => ({
        id: zone.id || `road-${i}`,
        positions: zone.coords,
        status: zone.status || getStatusLabel(zone),
        brightness: zone.brightness_pct ?? 0,
        density: Math.round((zone.traffic_density || 0) * 100),
        mode: zone.mode_desc || zone.road_type || "Street segment",
        name: zone.name || "Unnamed street",
      }));
  }

  const latStep = getGridStep(zones, "lat");
  const lngStep = getGridStep(zones, "lng");
  const byCoord = new Map(zones.map((zone) => [`${zone.lat.toFixed(5)},${zone.lng.toFixed(5)}`, zone]));
  const segments = [];

  zones.forEach((zone) => {
    [
      [0, lngStep],
      [latStep, 0],
    ].forEach(([dLat, dLng]) => {
      const next = byCoord.get(`${(zone.lat + dLat).toFixed(5)},${(zone.lng + dLng).toFixed(5)}`);
      if (!next) return;

      const status = getSegmentStatus(zone, next);
      segments.push({
        id: `${zone.lat}-${zone.lng}-${next.lat}-${next.lng}`,
        positions: [[zone.lat, zone.lng], [next.lat, next.lng]],
        status,
        brightness: Math.round((zone.brightness_pct + next.brightness_pct) / 2),
        density: Math.round(((zone.traffic_density + next.traffic_density) / 2) * 100),
        mode: status === "Working" ? zone.mode_desc : status,
      });
    });
  });

  return segments;
};

export default function LightingPage({ theme }) {
  const [center,   setCenter]   = useState(DEFAULT_CENTER);
  const [zones,    setZones]    = useState([]);
  const [savings,  setSavings]  = useState(null);
  const [hour,     setHour]     = useState(new Date().getHours());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const lightingSegments = buildLightingSegments(zones);

  // Try to get real location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setCenter([p.coords.latitude, p.coords.longitude]),
        () => {}
      );
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const lm = await getLightingMap(center[0], center[1], hour);
      const sv = await getLightingSavings(lm.total || lm.zones?.length || 100);
      setZones(lm.zones || []);
      setSavings(sv);
    } catch {
      setError("Could not load lighting data. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [center]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Smart Street Lighting</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Street light operational status — showing working, broken, and missing lights.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1.6fr_0.9fr] items-center rounded-3xl border border-black/10 dark:border-slate-700/80 bg-white/40 dark:bg-slate-900/70 p-4 shadow-xl shadow-slate-950/20">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 uppercase tracking-[0.18em]">Street lighting time</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-white">Simulate how the city looks at different hours</p>
              </div>
              <div className="rounded-full bg-white/60 dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-white border border-black/10 dark:border-slate-700">
                Selected: {String(hour).padStart(2, "0")}:00
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Early</span>
                <span>Late</span>
              </div>
              <div className="relative flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={e => setHour(Number(e.target.value))}
                  className="h-2 w-full appearance-none rounded-full bg-white/10 accent-amber-400 outline-none transition duration-200 hover:bg-white/20"
                />
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none bg-gradient-to-r from-amber-400/20 via-transparent to-slate-400/10 rounded-full h-2" />
              </div>
              <p className="text-xs text-slate-500">Adjust the view to see how street light coverage changes through the day.</p>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-3 rounded-3xl border border-black/10 dark:border-slate-700/80 bg-white/40 dark:bg-slate-950/60 p-4">
            <div className="rounded-3xl bg-white/40 dark:bg-slate-900/80 p-5 border border-black/10 dark:border-slate-700 text-center">
              <p className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-[0.16em]">Current time</p>
              <p className="text-4xl font-bold text-slate-800 dark:text-white mt-3">{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-xs text-slate-500 mt-3 uppercase tracking-[0.16em]">Selected hour</p>
              <p className="text-xl font-semibold text-amber-200 mt-1">{String(hour).padStart(2, "0")}:00</p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-400 hover:to-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh map"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-900/40 border border-red-500/40 text-red-300 text-sm">{error}</div>
      )}

      {/* Status legend */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-slate-600 dark:text-slate-400">{status}</span>
          </div>
        ))}
      </div>

      {/* Street light status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Working Lights",     value: savings?.working_count ?? "—",      color: "text-emerald-400" },
          { label: "Broken Lights",      value: savings?.not_working_count ?? "—",  color: "text-red-400" },
          { label: "No Street Lights",   value: savings?.no_light_count ?? "—",   color: "text-slate-600 dark:text-slate-400" },
          { label: "Total Zones",        value: savings?.total_zones ?? "—",       color: "text-slate-800 dark:text-white" },
        ].map(s => (
          <div key={s.label} className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-black/10 dark:border-slate-700">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-black/10 dark:border-slate-700 h-[400px]">
        <MapContainer center={center} zoom={14} style={{ height: "400px", width: "100%" }}>
          <RecenterMap center={center} />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap &copy; CartoDB'
          />
          {lightingSegments.map((segment) => {
            if (!segment.positions || segment.positions.length === 0) return null;
            return (
            <Polyline
              key={segment.id}
              positions={segment.positions}
              pathOptions={{
                color: STATUS_COLORS[segment.status],
                opacity: segment.status === "No Street Light" ? 0.72 : 0.9,
                weight: segment.status === "No Street Light" ? 5 : 7,
                lineCap: "round",
              }}
            >
              <Popup>
                <div className="text-sm">
                  <strong>Street segment:</strong> {segment.status}<br />
                  <strong>Road:</strong> {segment.name}<br />
                  <strong>Brightness:</strong> {segment.brightness}%<br />
                  <strong>Traffic:</strong> {segment.density}%<br />
                  <em className="text-xs">{segment.mode}</em>
                </div>
              </Popup>
            </Polyline>
            );
          })}
        </MapContainer>
      </div>

      {/* Saving breakdown */}
      {savings && (
        <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-black/10 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-800 dark:text-white mb-3">City-wide Street Light Status ({savings.total_zones} zones)</p>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(savings.status_breakdown).map(([status, count]) => (
              <div key={status} className="text-center">
                <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-xs font-bold text-black"
                  style={{ backgroundColor: STATUS_COLORS[status] }}>
                  {count}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{status}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
