import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Popup, Circle, useMap } from "react-leaflet";
import { triggerSOS, getSOSLog, getNearestStation, getNearestHelper } from "../api";
import "leaflet/dist/leaflet.css";

const DEFAULT_POS = [12.9716, 77.5946];

// ── This component re-centers the map whenever `pos` changes ─────────────────
function RecenterMap({ pos }) {
  const map = useMap();
  useEffect(() => {
    map.setView(pos, map.getZoom());
  }, [pos]);
  return null;
}

export default function SOSPage({ userInfo, onEditProfile, theme }) {
  const [pos,           setPos]           = useState(DEFAULT_POS);
  const [locationLabel, setLocationLabel] = useState("Detecting location…");
  const [locError,      setLocError]      = useState("");
  const [msg,           setMsg]           = useState("");
  const [result,        setResult]        = useState(null);
  const [log,           setLog]           = useState([]);
  const [station,       setStation]       = useState(null);
  const [stations,      setStations]      = useState([]);
  const [sending,       setSending]       = useState(false);
  const [error,         setError]         = useState("");
  const [helpers,       setHelpers]       = useState([]);
  const watchIdRef = useRef(null);

  // ── Live location tracking (watchPosition instead of getCurrentPosition) ──
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationLabel("GPS not supported by this browser");
      setLocError("Your browser does not support geolocation.");
      return;
    }

    // Ask for location and keep watching for updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const newPos = [p.coords.latitude, p.coords.longitude];
        setPos(newPos);
        setLocError("");
        setLocationLabel(`Live GPS · ±${Math.round(p.coords.accuracy)}m accuracy`);
      },
      (err) => {
        // Show a clear message depending on the error type
        if (err.code === 1) {
          setLocError("Location permission denied. Please allow location access in your browser settings, then reload the page.");
          setLocationLabel("Permission denied — using default location");
        } else if (err.code === 2) {
          setLocError("Could not detect your location. Make sure your device GPS is on.");
          setLocationLabel("GPS unavailable — using default location");
        } else {
          setLocError("Location request timed out. Showing default location.");
          setLocationLabel("Timed out — using default location");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    // Stop watching when component unmounts
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // ── Load nearest station whenever position changes ────────────────────────
  useEffect(() => {
    getNearestStation(pos[0], pos[1])
      .then((data) => {
        setStation(data.nearest_station || null);
        setStations(data.stations || []);
      })
      .catch(() => {});
  }, [pos]);

  // ── Load nearest helpers ──────────────────────────────────────────────────
  useEffect(() => {
    getNearestHelper(pos[0], pos[1], userInfo?.user_id)
      .then((data) => setHelpers(data.nearest_helper ? [data.nearest_helper] : []))
      .catch(() => setHelpers([]));
  }, [pos, userInfo]);

  // ── Load SOS log ──────────────────────────────────────────────────────────
  const fetchLog = async () => {
    try {
      const d = await getSOSLog();
      setLog(d.alerts || []);
    } catch {}
  };
  useEffect(() => { fetchLog(); }, [result]);

  const handleSOS = async () => {
    if (!userInfo?.name?.trim()) {
      setError("Please complete your profile first.");
      return;
    }
    setSending(true);
    setError("");
    setResult(null);
    try {
      if (!navigator.onLine) throw new Error("Offline");
      const data = await triggerSOS(
        pos[0],
        pos[1],
        userInfo.user_id,
        userInfo.name,
        msg,
        userInfo.emergency_contact,
        userInfo.medical_details,
      );
      setResult(data);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);

      // Automatically notify the nearest helper for the demo
      if (data.nearest_helper) {
        const sendNotif = () => {
          new Notification("🚨 Emergency Alert Received!", {
            body: `Someone near you needs help! (Demo notification to ${data.nearest_helper.name})`,
            icon: "/favicon.ico",
          });
        };
        if ("Notification" in window && Notification.permission === "granted") {
          sendNotif();
        } else if ("Notification" in window && Notification.permission !== "denied") {
          Notification.requestPermission().then(p => p === "granted" && sendNotif());
        }
      }

    } catch {
      setError("Network error. Falling back to offline SMS...");
      if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
      
      const mapsLink = `https://maps.google.com/?q=${pos[0]},${pos[1]}`;
      const smsBody = encodeURIComponent(`SOS! I am in danger. My live location: ${mapsLink}`);
      const phone = userInfo.emergency_contact || "";
      window.location.href = `sms:${phone}?body=${smsBody}`;
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">SOS Emergency Alert</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">One tap — your location reaches the nearest police station instantly</p>
      </div>

      {/* Location status banner */}
      <div className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${
        locError
          ? "bg-yellow-900/40 border border-yellow-500/40 text-yellow-300"
          : "bg-emerald-900/30 border border-emerald-500/30 text-emerald-300"
      }`}>
        <span>{locError ? "⚠️" : "📍"}</span>
        <span>{locError || locationLabel}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
        {/* Left — SOS form */}
        <div className="flex flex-col gap-4">
          {station && (
            <div className="bg-blue-900/30 border border-blue-500/40 rounded-xl p-4">
              <p className="text-xs text-blue-400 font-semibold mb-1">NEAREST POLICE STATION</p>
              <p className="text-slate-800 dark:text-white font-semibold">{station.name}</p>
              <p className="text-slate-600 dark:text-slate-400 text-sm">{station.distance_km} km away · {station.contact}</p>
            </div>
          )}

          {stations.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
              <p className="text-xs text-blue-300 font-semibold mb-3">ALL NEARBY POLICE STATIONS</p>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {stations.map((s, i) => (
                  <div key={s.id || i} className="rounded-xl bg-white/40 dark:bg-slate-900/60 p-3 border border-black/10 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">{s.name}</p>
                      <span className="text-xs text-slate-600 dark:text-slate-400">{s.distance_km} km</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">{s.contact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {helpers.length > 0 && (
            <div className="bg-green-900/30 border border-green-500/40 rounded-xl p-4">
              <p className="text-xs text-green-400 font-semibold mb-1">NEARBY HELPERS ({helpers.length})</p>
              {helpers.map((helper, i) => (
                <div key={i} className="text-slate-800 dark:text-white text-sm">
                  <p className="font-semibold">{helper.name}</p>
                  <p className="text-slate-600 dark:text-slate-400">{helper.distance_km} km away</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-5 border border-black/10 dark:border-slate-700 flex flex-col gap-4">
            {userInfo ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-white/40 dark:bg-slate-900/50 p-4 border border-black/10 dark:border-slate-700">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Using saved profile</p>
                  <p className="text-sm text-slate-800 dark:text-white mt-3">Name: <span className="text-slate-700 dark:text-slate-300">{userInfo.name}</span></p>
                  <p className="text-sm text-slate-800 dark:text-white">Emergency contact: <span className="text-slate-700 dark:text-slate-300">{userInfo.emergency_contact}</span></p>
                  <p className="text-sm text-slate-800 dark:text-white">Medical details: <span className="text-slate-700 dark:text-slate-300">{userInfo.medical_details || "None"}</span></p>
                </div>
                <button
                  type="button"
                  onClick={onEditProfile}
                  className="w-full py-3 rounded-xl border border-black/20 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-sm hover:bg-slate-200 dark:bg-slate-700 transition"
                >
                  Edit saved profile
                </button>
              </div>
            ) : (
              <div className="rounded-xl bg-yellow-900/30 border border-yellow-500/30 p-4 text-sm text-slate-800 dark:text-slate-200">
                <p className="font-semibold text-yellow-200">No saved profile found.</p>
                <p className="mt-2">Please set up your profile on the Profile Setup page before sending an SOS.</p>
                <button
                  onClick={onEditProfile}
                  className="mt-3 px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-slate-800 dark:text-white text-sm"
                >
                  Go to Profile Setup
                </button>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Message (optional)</label>
              <textarea
                value={msg}
                onChange={e => setMsg(e.target.value)}
                placeholder="Describe your situation..."
                rows={3}
                className="w-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-lg px-3 py-2.5 text-sm border border-black/20 dark:border-slate-600 focus:outline-none focus:border-pink-500 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400 block mb-1">Your Location</label>
              <p className="text-slate-800 dark:text-white font-mono text-sm">{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</p>
              <p className="text-xs text-slate-500 mt-1">{locationLabel}</p>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleSOS}
              disabled={sending || !userInfo}
              className={`w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-slate-800 dark:text-white text-lg font-bold disabled:opacity-50 transition transform flex items-center justify-center gap-2 ${sending ? 'animate-pulse-fast ring-pulse' : 'hover:ring-pulse'}`}
            >
              {sending ? "Sending…" : "🆘  SEND SOS ALERT"}
            </button>
          </div>

          {result && (
            <div className="bg-green-900/30 border border-green-500/40 rounded-xl p-5">
              <p className="text-green-400 font-bold text-lg mb-2">✅ Alert Dispatched!</p>
              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                <p><span className="text-slate-600 dark:text-slate-400">Alert ID:</span> {result.alert_id}</p>
                <p><span className="text-slate-600 dark:text-slate-400">Station:</span> {result.nearest_station?.name}</p>
                <p><span className="text-slate-600 dark:text-slate-400">Distance:</span> {result.nearest_station?.distance_km} km</p>
                <p><span className="text-slate-600 dark:text-slate-400">Emergency contact:</span> {result.emergency_contact || "N/A"}</p>
                <p><span className="text-slate-600 dark:text-slate-400">Medical details:</span> {result.medical_details || "N/A"}</p>
                {result.nearest_helper && (
                  <p><span className="text-slate-600 dark:text-slate-400">Nearest helper:</span> {result.nearest_helper.name} ({result.nearest_helper.distance_km} km)</p>
                )}
                <p><span className="text-slate-600 dark:text-slate-400">Est. Response:</span> ~{result.estimated_response_min} min</p>
                <a
                  href={result.live_location_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline text-xs"
                >
                  Share live location link
                </a>
              </div>
            </div>
          )}

          {log.length > 0 && (
            <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-4 border border-black/10 dark:border-slate-700">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold mb-3">RECENT ALERTS ({log.length})</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {log.slice().reverse().map((a, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-600 dark:text-slate-400 border-b border-black/10 dark:border-slate-700 pb-1">
                    <span>{a.alert_id} — {a.user}</span>
                    <span className="text-green-400">{a.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — Map */}
        <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-slate-700 h-[400px]">
          <MapContainer
            center={pos}
            zoom={15}
            style={{ height: "400px", width: "100%" }}
          >
            {/* Re-center map when pos updates */}
            <RecenterMap pos={pos} />

            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap &copy; CartoDB'
            />

            {/* User location */}
            <Circle
              center={pos}
              radius={100}
              pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.3 }}
            >
              <Popup><strong>Your Location</strong><br />{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</Popup>
            </Circle>

            {/* Police stations */}
            {stations.map((s, i) => {
              if (s.lat == null || s.lng == null) return null;
              return (
              <Circle
                key={s.id || i}
                center={[s.lat, s.lng]}
                radius={80}
                pathOptions={{
                  color: s.id === station?.id ? "#3b82f6" : "#60a5fa",
                  fillColor: s.id === station?.id ? "#3b82f6" : "#60a5fa",
                  fillOpacity: s.id === station?.id ? 0.6 : 0.25,
                }}
              >
                <Popup>
                  <strong>{s.name}</strong><br />
                  {s.distance_km} km away<br />
                  {s.contact}
                </Popup>
              </Circle>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
