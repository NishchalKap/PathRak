import { useEffect, useState } from "react";
import { MapContainer, Polyline, Popup, useMap } from "react-leaflet";
import { getLightingMap, getLightingSavings } from "../api";
import Icon from "../components/Icon";
import MapTiles from "../components/MapTiles";
import MapLayoutResizer from "../components/MapLayoutResizer";
import { Metric, Notice, PageHeader, StatusPill } from "../components/UI";
import "leaflet/dist/leaflet.css";

const MAP_PLACEHOLDER = [20, 0];
const STATUS_COLORS = { Working: "#11875d", "Not Working": "#c9363e", "No Street Light": "#75847f" };

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => { map.setView(center, 14); }, [center, map]);
  return null;
}

const getStatus = (zone) => zone.status || (!zone.has_street_light ? "No Street Light" : !zone.is_working ? "Not Working" : "Working");
const getStep = (zones, key) => {
  const values = [...new Set(zones.map((zone) => Number(zone[key].toFixed(5))))].sort((a, b) => a - b);
  const gaps = values.slice(1).map((value, index) => Number((value - values[index]).toFixed(5))).filter(Boolean);
  return gaps.length ? Math.min(...gaps) : .005;
};

function buildSegments(zones) {
  if (zones.some((zone) => Array.isArray(zone.coords))) return zones.filter((zone) => zone.coords?.length > 1).map((zone, index) => ({ id: zone.id || `road-${index}`, positions: zone.coords, status: zone.status || getStatus(zone), brightness: zone.brightness_pct ?? 0, density: Math.round((zone.traffic_density || 0) * 100), mode: zone.mode_desc || zone.road_type || "Street segment", name: zone.name || "Unnamed street" }));
  const latStep = getStep(zones, "lat");
  const lngStep = getStep(zones, "lng");
  const byCoordinate = new Map(zones.map((zone) => [`${zone.lat.toFixed(5)},${zone.lng.toFixed(5)}`, zone]));
  const segments = [];
  zones.forEach((zone) => [[0, lngStep], [latStep, 0]].forEach(([dLat, dLng]) => {
    const next = byCoordinate.get(`${(zone.lat + dLat).toFixed(5)},${(zone.lng + dLng).toFixed(5)}`);
    if (!next) return;
    const labels = [getStatus(zone), getStatus(next)];
    const status = labels.includes("No Street Light") ? "No Street Light" : labels.includes("Not Working") ? "Not Working" : "Working";
    segments.push({ id: `${zone.lat}-${zone.lng}-${next.lat}-${next.lng}`, positions: [[zone.lat, zone.lng], [next.lat, next.lng]], status, brightness: Math.round((zone.brightness_pct + next.brightness_pct) / 2), density: Math.round(((zone.traffic_density + next.traffic_density) / 2) * 100), mode: status === "Working" ? zone.mode_desc : status, name: zone.name || "Street segment" });
  }));
  return segments;
}

export default function LightingPage({ currentPos, locationError, theme }) {
  const [zones, setZones] = useState([]);
  const [savings, setSavings] = useState(null);
  const [hour, setHour] = useState(new Date().getHours());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState(null);
  const segments = buildSegments(zones);

  const loadLighting = async () => {
    if (!currentPos) return setError(locationError || "Live location is required to load lighting coverage.");
    setLoading(true);
    setError("");
    try {
      const mapData = await getLightingMap(currentPos[0], currentPos[1], hour);
      const totals = await getLightingSavings(mapData.total || mapData.zones?.length || 100);
      setZones(mapData.zones || []);
      setSavings(totals);
      setSource({ id: mapData.source, note: mapData.source_note });
    } catch (loadError) {
      setError(loadError.message || "Street-lighting data is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLighting(); }, [currentPos]);

  return (
    <div className="page-stack lighting-page">
      <PageHeader eyebrow="Infrastructure awareness" title="Street lighting" description="Explore a clearly disclosed lighting-control simulation around the selected location." actions={<StatusPill tone={segments.length ? "success" : currentPos ? "neutral" : "warning"} icon="light">{segments.length ? `${segments.length} segments` : currentPos ? "Ready to load" : "Location required"}</StatusPill>} />
      <section className="panel map-toolbar"><div className="time-control"><div><label htmlFor="lighting-hour">Displayed hour</label><strong>{String(hour).padStart(2, "0")}:00</strong></div><input id="lighting-hour" type="range" min="0" max="23" value={hour} onChange={(event) => setHour(Number(event.target.value))} /><small>Lighting behavior may change by time of day.</small></div><button className="btn btn-primary" disabled={loading || !currentPos} onClick={loadLighting}><Icon name="refresh" />{loading ? "Refreshing data..." : "Refresh lighting map"}</button></section>
      {error && <Notice tone="warning" title="Lighting service unavailable" action={<button className="btn btn-secondary" onClick={loadLighting}>Try again</button>}>{error}</Notice>}
      {source && <Notice tone="info" title={source.id === "SIMULATED_DEMO_GRID" ? "Demo lighting grid" : "OpenStreetMap geometry"}>{source.note}</Notice>}
      <div className="metric-grid"><Metric label="Working" value={savings?.working_count ?? "—"} tone="safe" /><Metric label="Broken" value={savings?.not_working_count ?? "—"} tone="danger" /><Metric label="No street light" value={savings?.no_light_count ?? "—"} /><Metric label="Zones returned" value={savings?.total_zones ?? "—"} /></div>
      <div className="map-legend" aria-label="Lighting status legend">{Object.entries(STATUS_COLORS).map(([status, color]) => <span key={status}><i style={{ backgroundColor: color }} />{status}</span>)}</div>
      <div className="map-frame lighting-map"><MapContainer center={currentPos || MAP_PLACEHOLDER} zoom={14} style={{ height: "100%", width: "100%" }}>{currentPos && <RecenterMap center={currentPos} />}<MapTiles onError={setError} /><MapLayoutResizer />{segments.map((segment) => <Polyline key={segment.id} positions={segment.positions} pathOptions={{ color: STATUS_COLORS[segment.status], opacity: segment.status === "No Street Light" ? .72 : .92, weight: segment.status === "No Street Light" ? 5 : 7, lineCap: "round" }}><Popup><strong>{segment.name}</strong><br />Status: {segment.status}<br />Brightness: {segment.brightness}%<br />Traffic: {segment.density}%<br /><small>{segment.mode}</small></Popup></Polyline>)}</MapContainer>{!currentPos && <div className="map-unavailable"><Icon name="location" size={28} /><strong>Location required</strong><p>PathRak does not display placeholder lighting data.</p></div>}</div>
      {savings?.status_breakdown && <section className="panel data-disclosure"><div><h2>Simulated scenario summary</h2><p>{savings.method || "These counts are modeled demo values, not measured municipal infrastructure status."}</p></div><div>{Object.entries(savings.status_breakdown).map(([status, count]) => <span key={status}><i style={{ backgroundColor: STATUS_COLORS[status] }} />{status}: <strong>{count}</strong></span>)}</div></section>}
    </div>
  );
}
