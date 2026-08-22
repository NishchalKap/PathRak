import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { LocationStatus, Notice, PageHeader, StatusPill } from "../components/UI";

const HOME_RADIUS_METERS = 200;

function distanceMeters(first, second) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(second[0] - first[0]);
  const dLng = toRad(second[1] - first[1]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(first[0])) * Math.cos(toRad(second[0])) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function SmartCheckPage({ userInfo, onEditProfile, currentPos, locationError, monitor, isSubComponent }) {
  const [homePos, setHomePos] = useState(null);
  const [editingHome, setEditingHome] = useState(false);
  const homeStorageKey = userInfo?.user_id ? `pathrak_home_location:${userInfo.user_id}` : null;
  const sc = monitor?.sc;

  useEffect(() => {
    setHomePos(null);
    if (!homeStorageKey) return;
    const stored = localStorage.getItem(homeStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length === 2) setHomePos(parsed);
    } catch {
      localStorage.removeItem(homeStorageKey);
    }
  }, [homeStorageKey]);

  if (!monitor) return null;

  const homeDistance = homePos && currentPos ? distanceMeters(currentPos, homePos) : null;
  const atHome = homeDistance !== null && homeDistance <= HOME_RADIUS_METERS;
  const active = sc.status === "pending";

  const saveHome = () => {
    if (!currentPos || !homeStorageKey) {
      sc.setMessage(!currentPos ? "Live location is required before saving home." : "Complete your profile before saving home.");
      return;
    }
    localStorage.setItem(homeStorageKey, JSON.stringify(currentPos));
    setHomePos(currentPos);
    setEditingHome(false);
    sc.setMessage("Home location saved for this account on this device.");
  };

  const clearHome = () => {
    if (homeStorageKey) localStorage.removeItem(homeStorageKey);
    setHomePos(null);
    setEditingHome(false);
    sc.setMessage("Home location cleared.");
  };

  const startCheck = () => {
    if (!userInfo?.name || !userInfo?.emergency_contact) return sc.setMessage("Complete your emergency profile before starting Smart Check.");
    if (!homePos) return sc.setMessage("Save your home location before starting Smart Check.");
    if (!currentPos) return sc.setMessage("Live location is required before starting Smart Check.");
    sc.setStatus("pending");
    sc.setMessage("Smart Check is active. Confirm that you are safe before the timer expires.");
    sc.setResult(null);
    sc.setCountdown(sc.timerMinutes * 60);
  };

  const stopCheck = () => {
    sc.setStatus("idle");
    sc.setCountdown(sc.timerMinutes * 60);
    sc.setMessage("Smart Check stopped. No alert was sent.");
  };

  return (
    <div className={`page-stack smartcheck-page ${isSubComponent ? "embedded-page" : ""}`}>
      {!isSubComponent && <PageHeader eyebrow="Timed check-in" title="Smart Check" description="Start a countdown and confirm you are safe before it expires. A missed check-in records an emergency alert." actions={<StatusPill tone={active ? "success" : sc.status === "alerted" ? "danger" : "neutral"} icon={active ? "check" : "clock"}>{active ? "Countdown active" : sc.status === "alerted" ? "Alert recorded" : "Not active"}</StatusPill>} />}
      {isSubComponent && <div className="embedded-heading"><div><p className="eyebrow">Timed check-in</p><h2>Smart Check</h2></div><StatusPill tone={active ? "success" : "neutral"}>{active ? "Active" : "Off"}</StatusPill></div>}

      <div className={`check-status panel ${active ? "is-active" : ""}`}>
        <div className="check-countdown"><span>{active ? "Time to check in" : "Selected countdown"}</span><strong>{formatTime(active ? sc.countdown : sc.timerMinutes * 60)}</strong><small>{active ? "Confirm before zero to prevent an alert." : "Choose how long PathRak should wait."}</small></div>
        <div className="check-readiness"><LocationStatus currentPos={currentPos} error={locationError} /><div className="home-state"><span className={homePos ? "ready-dot" : "warning-dot"} /><span><strong>{homePos ? "Home saved" : "Home not set"}</strong><small>{homePos && homeDistance !== null ? `${Math.round(homeDistance)} m away · ${atHome ? "currently at home" : "currently away"}` : "Required for Smart Check"}</small></span></div></div>
      </div>

      <div className="check-grid">
        <section className="panel check-controls">
          <div className="panel-heading"><span className="panel-icon"><Icon name="clock" /></span><div><h2>Check-in controls</h2><p>Set the timer and manage the current monitoring session.</p></div></div>
          <div className="field"><label htmlFor={`check-duration-${isSubComponent ? "embedded" : "page"}`}>Countdown duration</label><div className="number-field"><input id={`check-duration-${isSubComponent ? "embedded" : "page"}`} className="input" type="number" min="1" max="60" value={sc.timerMinutes} disabled={active} onChange={(event) => { const value = Math.max(1, Math.min(60, Number.parseInt(event.target.value, 10) || 1)); sc.setTimerMinutes(value); if (sc.status === "idle") sc.setCountdown(value * 60); }} /><span>minutes</span></div></div>
          <div className="check-buttons">{!active ? <button className="btn btn-primary" disabled={!currentPos || !homePos} onClick={startCheck}><Icon name="shield" />Start Smart Check</button> : <><button className="btn btn-primary" onClick={monitor.globalConfirmSafe}><Icon name="check" />I am safe</button><button className="btn btn-secondary" onClick={stopCheck}>Stop monitoring</button></>}</div>
          {sc.message && <Notice tone={sc.status === "alerted" ? "danger" : sc.status === "safe" ? "success" : "info"} title="Smart Check update">{sc.message}</Notice>}
          {!userInfo && <Notice tone="warning" title="Emergency profile required" action={<button className="btn btn-secondary" onClick={onEditProfile}>Open profile</button>}>Add a contact before using timed monitoring.</Notice>}
        </section>

        <aside className="panel home-settings">
          <div className="panel-heading"><span className="panel-icon"><Icon name="home" /></span><div><h2>Home location</h2><p>Stored only for this signed-in account on this device.</p></div></div>
          {homePos && !editingHome ? <><div className="saved-coordinate"><span>Saved coordinates</span><strong>{homePos[0].toFixed(5)}, {homePos[1].toFixed(5)}</strong></div><button className="btn btn-secondary" onClick={() => setEditingHome(true)}>Update home location</button></> : <><LocationStatus currentPos={currentPos} error={locationError} /><button className="btn btn-secondary" disabled={!currentPos} onClick={saveHome}>{homePos ? "Save new location" : "Save current location as home"}</button>{homePos && <div className="inline-actions"><button className="btn btn-quiet" onClick={() => setEditingHome(false)}>Cancel</button><button className="btn btn-quiet danger-text" onClick={clearHome}>Clear saved home</button></div>}</>}
        </aside>
      </div>

      {sc.result && <div className="dispatch-summary"><h3>Emergency alert recorded</h3><dl><div><dt>Alert ID</dt><dd>{sc.result.alert_id}</dd></div><div><dt>Station reference</dt><dd>{sc.result.nearest_station?.name || "Unavailable"}</dd></div><div><dt>External dispatch</dt><dd>{sc.result.police_dispatch || "Not configured"}</dd></div></dl></div>}
    </div>
  );
}
