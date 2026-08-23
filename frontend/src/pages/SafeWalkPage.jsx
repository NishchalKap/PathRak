import { useEffect, useRef, useState } from "react";
import { cancelSafeWalk, extendSafeWalk, startSafeWalk, triggerSOS } from "../api";
import Icon from "../components/Icon";
import { LocationStatus, Notice, PageHeader, StatusPill } from "../components/UI";
import { getRoutePlanMinutes, getRouteRiskLabel } from "../utils/routePlan";

const EXTENSION_MINUTES = 10;

const formatApiStatus = (value) => value
  ? String(value).toLowerCase().replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase())
  : "Unavailable";

export default function SafeWalkPage({ userInfo, currentPos, locationError, monitor, isSubComponent, routePlan, appConfig, onNavigate }) {
  const { sw } = monitor || {};
  const [etaMinutes, setEtaMinutes] = useState(15);
  const [destination, setDestination] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [completedJourney, setCompletedJourney] = useState(null);
  const [confirmManualSOS, setConfirmManualSOS] = useState(false);
  const [demoExpiry, setDemoExpiry] = useState(false);
  const voiceIntervalRef = useRef(null);

  useEffect(() => () => {
    clearInterval(voiceIntervalRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!routePlan || sw?.active) return;
    setDestination(routePlan.destination || "");
    const routeMinutes = getRoutePlanMinutes(routePlan);
    if (routeMinutes) setEtaMinutes(routeMinutes);
  }, [routePlan, sw?.active]);

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
      const response = await startSafeWalk(userInfo.user_id, userInfo.name, destination.trim(), etaMinutes, currentPos[0], currentPos[1], userInfo.emergency_contact || "", demoExpiry ? 15 : null);
      if (response?.status !== "started" || !response?.eta) throw new Error("The server did not confirm that SafeWalk started.");
      sw.setDestination(destination.trim());
      sw.setRouteLabel(routePlan?.label || "");
      sw.setEtaTime(new Date(response.eta));
      sw.setEmergencyEvent(null);
      sw.setActive(true);
      setCompletedJourney(null);
      setActionMessage("");
    } catch (startError) {
      setError(startError.message || "SafeWalk could not start. Check the service and try again.");
    } finally {
      setWorking(false);
    }
  };

  const markSafe = async () => {
    if (!userInfo?.user_id) return;
    setWorking(true);
    setError("");
    setActionMessage("");
    const completed = {
      destination: sw.destination,
      route: sw.routeLabel || routePlan?.label || "",
      timestamp: new Date().toISOString(),
    };
    try {
      const response = await cancelSafeWalk(userInfo.user_id);
      if (response?.status !== "cancelled") throw new Error("The server could not find the active SafeWalk journey.");
      setCompletedJourney(completed);
      sw.reset();
    } catch (completionError) {
      setError(completionError.message || "SafeWalk could not be completed right now.");
    } finally {
      setWorking(false);
    }
    clearInterval(voiceIntervalRef.current);
    setVoiceEnabled(false);
    window.speechSynthesis?.cancel();
  };

  const extendJourney = async () => {
    if (!userInfo?.user_id || !sw.etaTime) return;
    setWorking(true);
    setError("");
    setActionMessage("");
    try {
      const response = await extendSafeWalk(userInfo.user_id, EXTENSION_MINUTES);
      if (response?.status !== "extended" || !response?.new_eta) throw new Error("The server did not confirm the extension.");
      sw.setEtaTime(new Date(response.new_eta));
      setActionMessage(`Journey extended by ${EXTENSION_MINUTES} minutes.`);
    } catch (extendError) {
      setError(extendError.message || "SafeWalk could not be extended right now.");
    } finally {
      setWorking(false);
    }
  };

  const beginManualSOS = async () => {
    setConfirmManualSOS(false);
    if (!currentPos || !userInfo?.user_id) {
      setError("Live location and a signed-in safety profile are required for SOS.");
      return;
    }

    const emergencyEvent = {
      trigger: "Manual SOS during SafeWalk",
      timestamp: new Date().toISOString(),
      location: { lat: currentPos[0], lng: currentPos[1] },
      destination: sw.destination || destination,
      route: sw.routeLabel || routePlan?.label || "",
      journeyStatus: "EMERGENCY",
      status: "RECORDING",
      sosResponse: null,
      notificationState: "PENDING",
    };
    sw.claimEmergency(emergencyEvent);
    setWorking(true);
    setError("");
    setActionMessage("");
    try {
      const cancelResponse = await cancelSafeWalk(userInfo.user_id);
      if (!cancelResponse || !["cancelled", "not_found"].includes(cancelResponse.status)) {
        throw new Error("SafeWalk monitoring could not be stopped before SOS.");
      }
      const response = await triggerSOS(
        currentPos[0], currentPos[1], userInfo.user_id, userInfo.name,
        `Manual SOS during SafeWalk. Destination: ${sw.destination || destination}`,
        userInfo.emergency_contact || "", userInfo.medical_details || "",
      );
      sw.setAlertResult(response);
      sw.setEmergencyEvent({
        ...emergencyEvent,
        timestamp: response?.timestamp || emergencyEvent.timestamp,
        status: response?.status || "RECORDED",
        sosResponse: response,
        notificationState: response?.emergency_contact_notification || "NOT_AVAILABLE",
      });
    } catch (sosError) {
      sw.setEmergencyEvent({
        ...emergencyEvent,
        status: "REQUEST_FAILED",
        notificationState: "NOT_AVAILABLE",
        error: sosError.message,
      });
    } finally {
      setWorking(false);
    }
  };

  const exitEmergencyMode = async () => {
    if (userInfo?.user_id) await cancelSafeWalk(userInfo.user_id).catch(() => null);
    sw.reset();
    setError("");
    setActionMessage("");
    onNavigate?.("home");
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
  const routeMinutes = getRoutePlanMinutes(routePlan);
  const routeDistance = Number.isFinite(routePlan?.distanceM) ? `${(routePlan.distanceM / 1000).toFixed(1)} km` : null;
  const arrivalTime = sw.etaTime ? new Date(sw.etaTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const emergencyEvent = sw.emergencyEvent;
  const emergencyResponse = emergencyEvent?.sosResponse;
  const emergencyLocation = emergencyEvent?.location;
  const emergencyRecorded = emergencyResponse?.status === "RECORDED";
  const headerTone = emergencyEvent ? "danger" : sw.active ? "success" : completedJourney ? "success" : "neutral";
  const headerLabel = emergencyEvent ? "Emergency mode" : sw.active ? "Monitoring active" : completedJourney ? "Journey complete" : "Not active";

  return (
    <div className={`page-stack safewalk-page ${isSubComponent ? "embedded-page" : ""}`}>
      {!isSubComponent && <PageHeader eyebrow="Journey protection" title="SafeWalk" description="Journey protection using your selected route, live browser location, and expected arrival time." actions={<StatusPill tone={headerTone} icon={emergencyEvent ? "warning" : sw.active || completedJourney ? "check" : "clock"}>{headerLabel}</StatusPill>} />}
      {isSubComponent && <div className="embedded-heading"><div><p className="eyebrow">Journey protection</p><h2>SafeWalk</h2><p className="embedded-description">Set a destination and expected arrival time for a monitored journey.</p></div><StatusPill tone={headerTone}>{headerLabel}</StatusPill></div>}

      {completedJourney ? (
        <section className="journey-complete" aria-live="polite">
          <span className="completion-icon"><Icon name="check" size={28} /></span>
          <div><p className="eyebrow">SafeWalk complete</p><h2>Journey completed safely.</h2><p>SafeWalk monitoring stopped after the backend confirmed completion.</p></div>
          <dl className="completion-summary"><div><dt>Destination</dt><dd>{completedJourney.destination}</dd></div>{completedJourney.route && <div><dt>Route</dt><dd>{completedJourney.route}</dd></div>}<div><dt>Journey</dt><dd>Completed</dd></div><div><dt>Monitoring</dt><dd>Stopped</dd></div></dl>
          <button className="btn btn-primary" onClick={() => onNavigate?.("home")}><Icon name="home" />Return to safety home</button>
        </section>
      ) : emergencyEvent ? (
        <section className="emergency-mode" aria-live="assertive">
          <div className="emergency-mode-heading"><span className="emergency-icon"><Icon name="warning" size={27} /></span><div><p className="eyebrow">Emergency alert</p><h2>{emergencyEvent.trigger}</h2><p>{emergencyEvent.trigger === "Missed SafeWalk check-in" ? "Your expected journey window ended without a safety check-in." : "A manual SOS was requested during the active journey."}</p></div></div>
          <dl className="emergency-context"><div><dt>Trigger</dt><dd>{emergencyEvent.trigger}</dd></div><div><dt>Time</dt><dd>{new Date(emergencyEvent.timestamp).toLocaleString()}</dd></div><div><dt>Location</dt><dd>{emergencyLocation ? `${emergencyLocation.lat.toFixed(5)}, ${emergencyLocation.lng.toFixed(5)}` : "Unavailable"}</dd></div><div><dt>Journey</dt><dd>{emergencyEvent.destination || "Unavailable"}</dd></div><div><dt>Route</dt><dd>{emergencyEvent.route || "Not route-linked"}</dd></div><div><dt>Journey status</dt><dd>{formatApiStatus(emergencyEvent.journeyStatus)}</dd></div></dl>
          <div className="emergency-status"><h3>Emergency status</h3><ul><li className={emergencyLocation ? "is-confirmed" : "is-unavailable"}><Icon name={emergencyLocation ? "check" : "warning"} />{emergencyLocation ? "Current browser location captured" : "Current browser location unavailable"}</li><li className="is-confirmed"><Icon name="check" />SafeWalk emergency condition detected</li><li className={emergencyRecorded ? "is-confirmed" : "is-pending"}><Icon name={emergencyRecorded ? "check" : "clock"} />{emergencyRecorded ? "SOS event recorded" : `SOS request: ${formatApiStatus(emergencyEvent.status)}`}</li></ul></div>
          <dl className="emergency-response"><div><dt>Emergency contact</dt><dd>{userInfo?.emergency_contact ? "Configured" : "Not configured"}</dd></div><div><dt>Notification</dt><dd>{formatApiStatus(emergencyEvent.notificationState)}</dd></div><div><dt>External dispatch</dt><dd>{formatApiStatus(emergencyResponse?.police_dispatch)}</dd></div>{emergencyResponse?.alert_id && <div><dt>Alert ID</dt><dd>{emergencyResponse.alert_id}</dd></div>}</dl>
          {emergencyEvent.error && <Notice tone="danger" title="SOS request unsuccessful">{emergencyEvent.error}</Notice>}
          <div className="emergency-actions">{userInfo?.emergency_contact && <a className="btn btn-secondary" href={`tel:${userInfo.emergency_contact}`}><Icon name="phone" />Call emergency contact</a>}<button className="btn btn-danger" disabled={working || emergencyRecorded} onClick={() => setConfirmManualSOS(true)}><Icon name="sos" />{emergencyRecorded ? "SOS recorded" : "Retry SOS"}</button><button className="btn btn-quiet" onClick={exitEmergencyMode}>Exit emergency mode</button></div>
        </section>
      ) : !sw.active ? (
        <div className="journey-setup-grid">
          <section className="panel journey-form">
            <div className="panel-heading"><span className="panel-icon"><Icon name="walk" /></span><div><p className="eyebrow">SafeWalk</p><h2>{routePlan ? "Your selected journey is ready" : "Start a monitored journey"}</h2><p>{routePlan ? "The route you selected in Safe Route is ready for monitoring." : "Tell PathRak where you are going and when you expect to arrive."}</p></div></div>
            {routePlan ? <dl className="safewalk-route-summary">
              <div><dt>Destination</dt><dd>{routePlan.destination}</dd></div>
              <div><dt>Route</dt><dd>{routePlan.label || "Unavailable"}</dd></div>
              <div><dt>Distance</dt><dd>{routeDistance || "Unavailable"}</dd></div>
              <div><dt>Estimated journey</dt><dd>{routeMinutes ? `${routeMinutes} min` : "Unavailable"}</dd></div>
              <div><dt>Safety score</dt><dd>{Number.isFinite(routePlan.safetyScore) ? `${routePlan.safetyScore} / 100` : "Unavailable"}</dd></div>
              <div><dt>Risk</dt><dd>{getRouteRiskLabel(routePlan.averageRisk)}</dd></div>
              <div><dt>Monitoring</dt><dd>Ready to start</dd></div>
              <div><dt>Location</dt><dd className={currentPos ? "live-value" : "unavailable-value"}>{currentPos ? "Live" : "Unavailable"}</dd></div>
            </dl> : <>
              <div className="field"><label htmlFor={`destination-${isSubComponent ? "embedded" : "page"}`}>Destination</label><input id={`destination-${isSubComponent ? "embedded" : "page"}`} className="input" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Home, station, campus..." autoComplete="street-address" /></div>
              <div className="field"><div className="range-label"><label htmlFor={`eta-${isSubComponent ? "embedded" : "page"}`}>Expected journey time</label><strong>{etaMinutes} min</strong></div><input id={`eta-${isSubComponent ? "embedded" : "page"}`} type="range" min="1" max="120" value={etaMinutes} onChange={(event) => setEtaMinutes(Number(event.target.value))} className="range-input" /><div className="range-hints"><span>1 min</span><span>2 hours</span></div></div>
            </>}
            {appConfig?.demo_mode && <label className="readiness-row"><input type="checkbox" checked={demoExpiry} onChange={(event) => setDemoExpiry(event.target.checked)} /><span><strong>15-second expiry demonstration</strong><small>Explicit demo control. It records an SOS event but never claims police dispatch.</small></span></label>}
            {error && <Notice tone="warning" title="SafeWalk unavailable">{error}</Notice>}
            <button className="btn btn-primary journey-start" disabled={working || !currentPos || !userInfo?.user_id} onClick={startJourney}><Icon name="shield" />{working ? "Starting SafeWalk..." : "Start SafeWalk"}</button>
          </section>
          {!isSubComponent && <aside className="journey-readiness"><div className="panel"><h3>Journey readiness</h3><LocationStatus currentPos={currentPos} error={locationError} /><div className="readiness-row"><span className={userInfo ? "ready-dot" : "warning-dot"} /><span><strong>Emergency profile</strong><small>{userInfo ? `${userInfo.name} · contact saved` : "Profile required"}</small></span></div></div><Notice tone="info" title="What happens at zero">PathRak asks the backend to record an SOS alert. Contact delivery and external dispatch depend on configured providers.</Notice></aside>}
        </div>
      ) : (
        <section className={`active-journey ${nearingDeadline ? "is-warning" : ""}`} aria-live="polite">
          <div className="active-journey-heading"><div><p className="eyebrow">SafeWalk active</p><h2>{sw.destination}</h2></div><StatusPill tone={nearingDeadline ? "warning" : "success"} icon={nearingDeadline ? "warning" : "check"}>{nearingDeadline ? "Check-in due soon" : "Monitoring active"}</StatusPill></div>
          <dl className="active-journey-summary"><div><dt>Destination</dt><dd>{sw.destination}</dd></div><div><dt>Route</dt><dd>{sw.routeLabel || routePlan?.label || "Not route-linked"}</dd></div><div><dt>ETA</dt><dd>{arrivalTime || "Unavailable"}</dd></div>{routeDistance && <div><dt>Journey</dt><dd>{routeDistance}</dd></div>}{Number.isFinite(routePlan?.safetyScore) && <div><dt>Safety score</dt><dd>{routePlan.safetyScore} / 100</dd></div>}<div><dt>Location</dt><dd className={currentPos ? "live-value" : "unavailable-value"}>{currentPos ? "Location active" : "Location unavailable"}</dd></div><div><dt>Monitoring</dt><dd className="live-value">Active</dd></div></dl>
          <div className="countdown-block"><p>Time remaining</p><strong>{formatTime(sw.timeLeft)}</strong><small>SafeWalk will record an alert if the timer expires before you check in.</small></div>
          {error && <Notice tone="warning" title="Action unsuccessful">{error}</Notice>}
          {actionMessage && <Notice tone="success" title="SafeWalk updated">{actionMessage}</Notice>}
          {sw.message && <Notice tone={sw.alertResult ? "danger" : "warning"} title={sw.alertResult ? "Emergency state" : "SafeWalk update"}>{sw.message}</Notice>}
          {sw.alertResult && <div className="dispatch-summary"><h3>Emergency alert recorded</h3><dl><div><dt>Alert ID</dt><dd>{sw.alertResult.alert_id}</dd></div><div><dt>Station reference</dt><dd>{sw.alertResult.nearest_station?.name || "Unavailable"}</dd></div><div><dt>External dispatch</dt><dd>{sw.alertResult.police_dispatch || "Not configured"}</dd></div></dl></div>}
          <div className="journey-controls"><button className="btn btn-primary" disabled={working} onClick={markSafe}><Icon name="check" />I'm Safe</button><button className="btn btn-secondary" disabled={working} onClick={extendJourney}><Icon name="clock" />Extend Journey</button><button className="btn btn-danger" disabled={working || !currentPos} onClick={() => setConfirmManualSOS(true)}><Icon name="sos" />SOS</button><button className="btn btn-quiet" onClick={toggleVoice}>{voiceEnabled ? "Disable voice" : "Enable voice reminders"}</button></div>
        </section>
      )}
      {confirmManualSOS && <div className="modal-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="safewalk-sos-title"><span className="confirm-icon"><Icon name="sos" size={26} /></span><h2 id="safewalk-sos-title">Trigger emergency SOS?</h2><p>This stops SafeWalk monitoring and asks the existing SOS service to record an emergency event using your current location.</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmManualSOS(false)}>Keep monitoring</button><button className="btn btn-danger" onClick={beginManualSOS}>Trigger SOS</button></div></div></div>}
    </div>
  );
}
