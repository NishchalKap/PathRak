import { useEffect, useRef, useState } from "react";
import { cancelSafeWalk, extendSafeWalk, startSafeWalk } from "../api";
import Icon from "../components/Icon";
import { LocationStatus, Notice, PageHeader, StatusPill } from "../components/UI";

export default function SafeWalkPage({ userInfo, currentPos, locationError, monitor, isSubComponent }) {
  const { sw } = monitor || {};
  const [etaMinutes, setEtaMinutes] = useState(15);
  const [destination, setDestination] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const voiceIntervalRef = useRef(null);

  useEffect(() => () => {
    clearInterval(voiceIntervalRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  if (!monitor) return null;

  const speak = (text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  };

  const startJourney = async () => {
    if (!destination.trim()) {
      setError("Enter the destination you expect to reach.");
      return;
    }
    if (!currentPos) {
      setError("Live location is required to start SafeWalk.");
      return;
    }
    if (!userInfo?.user_id || !userInfo?.name) {
      setError("Complete your safety profile before starting SafeWalk.");
      return;
    }

    setWorking(true);
    setError("");
    try {
      const response = await startSafeWalk(userInfo.user_id, userInfo.name, destination.trim(), etaMinutes, currentPos[0], currentPos[1], userInfo.emergency_contact || "");
      if (!response?.eta) throw new Error("The server did not return an ETA.");
      sw.setDestination(destination.trim());
      sw.setEtaTime(new Date(response.eta));
      sw.setActive(true);
    } catch (startError) {
      setError(startError.message || "SafeWalk could not start. Check the service and try again.");
    } finally {
      setWorking(false);
    }
  };

  const markSafe = () => {
    clearInterval(voiceIntervalRef.current);
    setVoiceEnabled(false);
    window.speechSynthesis?.cancel();
    if (userInfo?.user_id) cancelSafeWalk(userInfo.user_id).catch(() => {});
    sw.reset();
  };

  const extendJourney = async () => {
    if (!userInfo?.user_id || !sw.etaTime) return;
    setWorking(true);
    setError("");
    try {
      const response = await extendSafeWalk(userInfo.user_id, 10);
      sw.setEtaTime(response?.new_eta ? new Date(response.new_eta) : new Date(sw.etaTime.getTime() + 600000));
    } catch (extendError) {
      setError(extendError.message || "SafeWalk could not be extended right now.");
    } finally {
      setWorking(false);
    }
  };

  const toggleVoice = () => {
    if (voiceEnabled) {
      clearInterval(voiceIntervalRef.current);
      window.speechSynthesis?.cancel();
      setVoiceEnabled(false);
      return;
    }
    setVoiceEnabled(true);
    speak("Voice reminders enabled. PathRak will announce the remaining time every two minutes.");
    clearInterval(voiceIntervalRef.current);
    voiceIntervalRef.current = setInterval(() => {
      const minutes = Math.floor((sw.timeLeft || 0) / 60);
      speak(minutes > 0 ? `${minutes} ${minutes === 1 ? "minute" : "minutes"} remaining in SafeWalk.` : "SafeWalk time has expired. Please confirm you are safe.");
    }, 120000);
  };

  const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const nearingDeadline = sw.active && sw.timeLeft > 0 && sw.timeLeft <= 300;

  return (
    <div className={`page-stack safewalk-page ${isSubComponent ? "embedded-page" : ""}`}>
      {!isSubComponent && <PageHeader eyebrow="Journey protection" title="SafeWalk" description="Set an expected arrival time. If you do not check in before it expires, PathRak records an emergency alert." actions={<StatusPill tone={sw.active ? "success" : "neutral"} icon={sw.active ? "check" : "clock"}>{sw.active ? "Monitoring active" : "Not active"}</StatusPill>} />}
      {isSubComponent && <div className="embedded-heading"><div><p className="eyebrow">Journey protection</p><h2>SafeWalk</h2></div><StatusPill tone={sw.active ? "success" : "neutral"}>{sw.active ? "Active" : "Off"}</StatusPill></div>}

      {!sw.active ? (
        <div className="journey-setup-grid">
          <section className="panel journey-form">
            <div className="panel-heading"><span className="panel-icon"><Icon name="walk" /></span><div><h2>Start a monitored journey</h2><p>Tell PathRak where you are going and when you expect to arrive.</p></div></div>
            <div className="field"><label htmlFor={`destination-${isSubComponent ? "embedded" : "page"}`}>Destination</label><input id={`destination-${isSubComponent ? "embedded" : "page"}`} className="input" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Home, station, campus..." autoComplete="street-address" /></div>
            <div className="field"><div className="range-label"><label htmlFor={`eta-${isSubComponent ? "embedded" : "page"}`}>Expected journey time</label><strong>{etaMinutes} min</strong></div><input id={`eta-${isSubComponent ? "embedded" : "page"}`} type="range" min="1" max="120" value={etaMinutes} onChange={(event) => setEtaMinutes(Number(event.target.value))} className="range-input" /><div className="range-hints"><span>1 min</span><span>2 hours</span></div></div>
            {error && <Notice tone="warning" title="SafeWalk unavailable">{error}</Notice>}
            <button className="btn btn-primary journey-start" disabled={working || !currentPos || !userInfo?.user_id} onClick={startJourney}><Icon name="shield" />{working ? "Starting SafeWalk..." : "Start SafeWalk"}</button>
          </section>
          {!isSubComponent && <aside className="journey-readiness"><div className="panel"><h3>Journey readiness</h3><LocationStatus currentPos={currentPos} error={locationError} /><div className="readiness-row"><span className={userInfo ? "ready-dot" : "warning-dot"} /><span><strong>Emergency profile</strong><small>{userInfo ? `${userInfo.name} · contact saved` : "Profile required"}</small></span></div></div><Notice tone="info" title="What happens at zero">PathRak asks the backend to record an SOS alert. Contact delivery and external dispatch depend on configured providers.</Notice></aside>}
        </div>
      ) : (
        <section className={`active-journey ${nearingDeadline ? "is-warning" : ""}`} aria-live="polite">
          <div className="active-journey-top"><StatusPill tone={nearingDeadline ? "warning" : "success"} icon={nearingDeadline ? "warning" : "check"}>{nearingDeadline ? "Check-in due soon" : "Monitoring active"}</StatusPill><span className="journey-destination"><Icon name="location" size={16} />{sw.destination}</span></div>
          <div className="countdown-block"><p>Time remaining</p><strong>{formatTime(sw.timeLeft)}</strong><small>SafeWalk will record an alert if the timer expires before you check in.</small></div>
          {error && <Notice tone="warning" title="Action unsuccessful">{error}</Notice>}
          {sw.message && <Notice tone={sw.alertResult ? "danger" : "warning"} title={sw.alertResult ? "Emergency state" : "SafeWalk update"}>{sw.message}</Notice>}
          {sw.alertResult && <div className="dispatch-summary"><h3>Emergency alert recorded</h3><dl><div><dt>Alert ID</dt><dd>{sw.alertResult.alert_id}</dd></div><div><dt>Station reference</dt><dd>{sw.alertResult.nearest_station?.name || "Unavailable"}</dd></div><div><dt>External dispatch</dt><dd>{sw.alertResult.police_dispatch || "Not configured"}</dd></div></dl></div>}
          <div className="journey-controls"><button className="btn btn-secondary" disabled={working} onClick={extendJourney}><Icon name="clock" />Add 10 minutes</button><button className="btn btn-secondary" onClick={toggleVoice}>{voiceEnabled ? "Disable voice" : "Enable voice reminders"}</button><button className="btn btn-primary" onClick={markSafe}><Icon name="check" />I arrived safely</button></div>
        </section>
      )}
    </div>
  );
}
