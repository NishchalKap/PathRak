import Icon from "../components/Icon";
import { LocationStatus, Notice, StatusPill } from "../components/UI";

export default function HomePage({ userInfo, currentPos, locationError, monitor, onNavigate }) {
  const safeWalkActive = Boolean(monitor?.sw?.active);
  const smartCheckActive = monitor?.sc?.status === "pending";
  const emergencyRecorded = Boolean(monitor?.sw?.alertResult || monitor?.sc?.result);
  const firstName = userInfo?.name?.split(" ")[0] || "there";

  return (
    <div className="home-page page-stack">
      <header className="home-intro">
        <div>
          <p className="eyebrow">Personal safety overview</p>
          <h1>Good to see you, {firstName}.</h1>
          <p>Check your readiness before you head out.</p>
        </div>
        <StatusPill tone={currentPos ? "success" : "warning"} icon={currentPos ? "check" : "warning"}>
          {currentPos ? "Safety tools ready" : "Limited without GPS"}
        </StatusPill>
      </header>

      {emergencyRecorded && (
        <Notice tone="danger" title="Emergency alert recorded">
          Review the latest alert status. External dispatch is only available when a provider is configured.
        </Notice>
      )}

      <section className="safety-overview" aria-labelledby="safety-heading">
        <div className="safety-summary">
          <div className={`safety-emblem ${currentPos ? "is-ready" : "is-limited"}`}><Icon name="shield" size={30} /></div>
          <div>
            <p className="eyebrow">Current readiness</p>
            <h2 id="safety-heading">{currentPos ? "Ready for your journey" : "Location access needed"}</h2>
            <p>{currentPos ? "Live location is available to SafeWalk, routes, monitoring, and SOS." : "You can explore the app, but location-based safety actions will remain unavailable."}</p>
          </div>
        </div>
        <LocationStatus currentPos={currentPos} error={locationError} />
      </section>

      <section aria-labelledby="actions-heading">
        <div className="section-heading"><div><p className="eyebrow">Start here</p><h2 id="actions-heading">What do you need right now?</h2></div></div>
        <div className="action-grid">
          <button className="action-tile action-primary" onClick={() => onNavigate("walk")}>
            <span className="action-icon"><Icon name="walk" size={25} /></span>
            <span><strong>{safeWalkActive ? "View active SafeWalk" : "Start a SafeWalk"}</strong><small>{safeWalkActive ? monitor.sw.destination : "Monitor a journey against your ETA"}</small></span>
            <Icon name="chevron" size={18} />
          </button>
          <button className="action-tile" onClick={() => onNavigate("route")}>
            <span className="action-icon"><Icon name="route" size={25} /></span>
            <span><strong>Find a safer route</strong><small>Compare real road alternatives by risk</small></span>
            <Icon name="chevron" size={18} />
          </button>
          <button className="action-tile action-emergency" onClick={() => onNavigate("sos")}>
            <span className="action-icon"><Icon name="sos" size={25} /></span>
            <span><strong>Emergency SOS</strong><small>Review readiness before recording an alert</small></span>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </section>

      <section className="home-lower-grid">
        <div className="panel monitoring-card">
          <div className="section-heading compact"><div><p className="eyebrow">Monitoring</p><h2>Protection status</h2></div><button className="text-button" onClick={() => onNavigate("monitor")}>Manage <Icon name="chevron" size={15} /></button></div>
          <div className="monitor-list">
            <div><span className={`status-marker ${safeWalkActive ? "active" : "idle"}`} /><span><strong>SafeWalk</strong><small>{safeWalkActive ? `${monitor.sw.destination} · active` : "No journey active"}</small></span></div>
            <div><span className={`status-marker ${smartCheckActive ? "active" : "idle"}`} /><span><strong>Smart Check</strong><small>{smartCheckActive ? "Countdown running" : "Routine monitoring off"}</small></span></div>
            <div><span className={`status-marker ${currentPos ? "active" : "warning"}`} /><span><strong>Emergency detection</strong><small>{currentPos ? "Location signal available" : "Waiting for location"}</small></span></div>
          </div>
        </div>

        <div className="panel tools-card">
          <div className="section-heading compact"><div><p className="eyebrow">Explore</p><h2>Safety intelligence</h2></div></div>
          <div className="tool-links">
            <button onClick={() => onNavigate("heatmap")}><Icon name="map" /><span><strong>Safety map</strong><small>Risk, incidents, and safe spots</small></span><Icon name="chevron" size={16} /></button>
            <button onClick={() => onNavigate("lighting")}><Icon name="light" /><span><strong>Street lighting</strong><small>Working and unavailable coverage</small></span><Icon name="chevron" size={16} /></button>
            <button onClick={() => onNavigate("fakecall")}><Icon name="phone" /><span><strong>Exit call</strong><small>Schedule a discreet incoming call</small></span><Icon name="chevron" size={16} /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
