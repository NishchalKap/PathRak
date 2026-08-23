import { useEffect, useState } from "react";
import { Circle, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { getNearestHelper, getNearestStation, getSOSLog, triggerSOS } from "../api";
import Icon from "../components/Icon";
import { LocationStatus, Notice, PageHeader, StatusPill } from "../components/UI";
import "leaflet/dist/leaflet.css";

const MAP_PLACEHOLDER = [20, 0];

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => { map.setView(position, map.getZoom()); }, [map, position]);
  return null;
}

export default function SOSPage({ userInfo, onEditProfile, currentPos, locationError }) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [station, setStation] = useState(null);
  const [stations, setStations] = useState([]);
  const [helper, setHelper] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!currentPos) {
      setStation(null);
      setStations([]);
      setHelper(null);
      return;
    }
    getNearestStation(currentPos[0], currentPos[1]).then((data) => { setStation(data.nearest_station || null); setStations(data.stations || []); }).catch(() => { setStation(null); setStations([]); });
    getNearestHelper(currentPos[0], currentPos[1], userInfo?.user_id).then((data) => setHelper(data.nearest_helper || null)).catch(() => setHelper(null));
  }, [currentPos, userInfo?.user_id]);

  useEffect(() => {
    getSOSLog().then((data) => setRecentAlerts(data.alerts || [])).catch(() => setRecentAlerts([]));
  }, [result]);

  const openConfirmation = () => {
    if (!userInfo?.name?.trim()) {
      setError("Complete your emergency profile before recording an SOS alert.");
      return;
    }
    if (!currentPos) {
      setError("Live location is required. PathRak will not submit a fallback location.");
      return;
    }
    setError("");
    setConfirming(true);
  };

  const recordAlert = async () => {
    setConfirming(false);
    setSending(true);
    setError("");
    setResult(null);
    try {
      if (!navigator.onLine) throw new Error("The device is offline");
      const alert = await triggerSOS(currentPos[0], currentPos[1], userInfo.user_id, userInfo.name, message.trim(), userInfo.emergency_contact, userInfo.medical_details);
      setResult(alert);
      navigator.vibrate?.([200, 100, 200, 100, 500]);
      if (alert.nearest_helper && "Notification" in window && Notification.permission === "granted") {
        new Notification("Nearby emergency alert", { body: `A PathRak user near ${alert.nearest_helper.name} needs help.`, icon: "/favicon.ico" });
      }
    } catch (recordError) {
      setError(`${recordError.message}. No external message was sent. You can open a device SMS draft below.`);
      navigator.vibrate?.([500, 200, 500]);
    } finally {
      setSending(false);
    }
  };

  const dispatchConfigured = result?.police_dispatch && !["NOT_CONFIGURED", "Unavailable"].includes(result.police_dispatch);
  const mapsLink = currentPos ? `https://maps.google.com/?q=${currentPos[0]},${currentPos[1]}` : "";
  const smsHref = `sms:${userInfo?.emergency_contact || ""}?body=${encodeURIComponent(`SOS! I need help. My location: ${mapsLink}`)}`;

  return (
    <div className="page-stack sos-page">
      <PageHeader eyebrow="Emergency action" title="SOS" description="Record an emergency alert with your current location and saved profile. Review readiness before activating." actions={<StatusPill tone={result ? "danger" : currentPos && userInfo ? "success" : "warning"} icon={result ? "sos" : currentPos && userInfo ? "check" : "warning"}>{result ? "Alert recorded" : currentPos && userInfo ? "Ready to activate" : "Setup incomplete"}</StatusPill>} />

      {error && <Notice tone="danger" title="SOS could not complete" role="alert">{error}</Notice>}
      {result && <Notice tone={dispatchConfigured ? "success" : "warning"} title="Emergency alert recorded">{dispatchConfigured ? "The configured dispatch provider accepted this alert." : "External dispatch is not configured. The alert is recorded in PathRak; review contact notification status below."}</Notice>}

      <section className="sos-hero">
        <div className="sos-copy"><span className="sos-symbol"><Icon name="sos" size={29} /></span><div><h2>{result ? "Alert recorded" : "Need immediate help?"}</h2><p>{result ? `Reference ${result.alert_id}` : "This action sends your saved emergency context and exact live coordinates to the PathRak backend."}</p></div></div>
        <button className="sos-trigger" disabled={sending || !currentPos || !userInfo || Boolean(result)} onClick={openConfirmation}><Icon name="sos" size={23} />{sending ? "Recording alert..." : result ? "SOS recorded" : "Prepare SOS alert"}</button>
      </section>

      <div className="sos-layout">
        <div className="sos-primary">
          <section className="panel sos-readiness">
            <div className="section-heading compact"><div><p className="eyebrow">Before activation</p><h2>Emergency readiness</h2></div></div>
            <LocationStatus currentPos={currentPos} error={locationError} />
            <div className="readiness-row"><span className={userInfo ? "ready-dot" : "warning-dot"} /><span><strong>{userInfo ? "Emergency profile ready" : "Emergency profile missing"}</strong><small>{userInfo ? `${userInfo.name} · ${userInfo.emergency_contact}` : "Name and contact are required"}</small></span><button className="text-button" onClick={onEditProfile}>{userInfo ? "Edit" : "Set up"}<Icon name="chevron" size={14} /></button></div>
            {userInfo?.emergency_contact && <div className="journey-controls"><a className="btn btn-secondary" href={`tel:${userInfo.emergency_contact}`}><Icon name="phone" />Call emergency contact</a><a className="btn btn-secondary" href={smsHref}>Open SMS draft</a></div>}
            {userInfo?.emergency_contact && <small>Your device decides whether `tel:` and `sms:` links are supported. PathRak does not claim a call or message was completed.</small>}
            <div className="field"><label htmlFor="sos-message">Situation note <span className="optional-label">Optional</span></label><textarea id="sos-message" className="input" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Briefly describe what is happening" rows="3" /></div>
          </section>

          {result && <section className="panel result-panel" aria-live="polite"><div className="panel-heading"><span className="panel-icon danger-icon"><Icon name="sos" /></span><div><h2>Recorded alert details</h2><p>These values come directly from the backend response.</p></div></div><dl className="result-list"><div><dt>Alert ID</dt><dd>{result.alert_id}</dd></div><div><dt>Station reference</dt><dd>{result.nearest_station?.name || "Unavailable"}</dd></div><div><dt>External dispatch</dt><dd>{result.police_dispatch || "Not configured"}</dd></div><div><dt>Contact notification</dt><dd>{result.emergency_contact_notification || "Not configured"}</dd></div><div><dt>Data mode</dt><dd>{result.data_mode || "Unknown"}</dd></div></dl>{result.live_location_url && <a className="btn btn-secondary" href={result.live_location_url} target="_blank" rel="noreferrer">Open location link</a>}</section>}

          <section className="panel response-context"><div><p className="eyebrow">Reference only</p><h2>Nearby response context</h2><p>Station entries are dataset references. They do not mean police were contacted.</p></div><div className="context-list"><div><span className="context-badge"><Icon name="shield" size={18} /></span><span><strong>{station?.name || "Station reference unavailable"}</strong><small>{station ? `${station.distance_km} km away · ${station.contact}` : "No station data returned"}</small></span></div><div><span className="context-badge"><Icon name="profile" size={18} /></span><span><strong>{helper?.name || "No nearby helper found"}</strong><small>{helper ? `${helper.distance_km} km away` : "Nearby helper data is optional"}</small></span></div></div></section>
        </div>

        <aside className="sos-secondary">
          <div className="map-frame sos-map"><MapContainer center={currentPos || MAP_PLACEHOLDER} zoom={15} style={{ height: "100%", width: "100%" }}><TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap &copy; CARTO" />{currentPos && <RecenterMap position={currentPos} />}{currentPos && <Circle center={currentPos} radius={100} pathOptions={{ color: "#c9363e", fillColor: "#c9363e", fillOpacity: .2 }}><Popup><strong>Your live location</strong><br />{currentPos[0].toFixed(5)}, {currentPos[1].toFixed(5)}</Popup></Circle>}{stations.map((item, index) => item.lat == null || item.lng == null ? null : <Circle key={item.id || index} center={[item.lat, item.lng]} radius={75} pathOptions={{ color: item.id === station?.id ? "#246b91" : "#74b5d7", fillOpacity: item.id === station?.id ? .45 : .18 }}><Popup><strong>{item.name}</strong><br />Reference only · {item.distance_km} km</Popup></Circle>)}</MapContainer>{!currentPos && <div className="map-unavailable"><Icon name="location" size={28} /><strong>Map waiting for location</strong><p>No fallback coordinates are displayed.</p></div>}</div>
          {recentAlerts.length > 0 && <section className="panel recent-alerts"><h2>Recent recorded alerts</h2><div>{recentAlerts.slice(-4).reverse().map((alert, index) => <div key={alert.alert_id || index}><span><strong>{alert.alert_id}</strong><small>{alert.user || "PathRak user"}</small></span><StatusPill tone="neutral">{alert.status || "Recorded"}</StatusPill></div>)}</div></section>}
        </aside>
      </div>

      {confirming && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirming(false); }}><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-sos-title"><span className="confirm-icon"><Icon name="sos" size={28} /></span><h2 id="confirm-sos-title">Record an emergency alert?</h2><p>PathRak will submit your live coordinates, name, emergency contact, and medical context to the configured backend. External dispatch may not be configured.</p><div className="confirm-summary"><LocationStatus currentPos={currentPos} compact /><span>{userInfo?.emergency_contact}</span></div><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirming(false)}>Cancel</button><button className="btn btn-danger" onClick={recordAlert}><Icon name="sos" />Record emergency alert</button></div></div></div>}
    </div>
  );
}
