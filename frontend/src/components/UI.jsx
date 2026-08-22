import Icon from "./Icon";

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatusPill({ tone = "neutral", icon, children }) {
  return <span className={`status-pill status-${tone}`}>{icon && <Icon name={icon} size={15} />}{children}</span>;
}

export function Notice({ tone = "info", title, children, action, role = "status" }) {
  const icon = tone === "danger" || tone === "warning" ? "warning" : tone === "success" ? "check" : "shield";
  return (
    <div className={`notice notice-${tone}`} role={role}>
      <span className="notice-icon"><Icon name={icon} size={19} /></span>
      <div className="notice-copy">
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
      </div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

export function LocationStatus({ currentPos, error, compact = false }) {
  const available = Boolean(currentPos);
  return (
    <div className={`location-status ${compact ? "location-compact" : ""}`}>
      <span className={`location-icon ${available ? "is-ready" : "is-unavailable"}`}><Icon name="location" size={19} /></span>
      <div>
        <strong>{available ? "Location active" : "Location unavailable"}</strong>
        {!compact && <p>{available ? `${currentPos[0].toFixed(5)}, ${currentPos[1].toFixed(5)}` : error || "Enable location access for live safety features."}</p>}
      </div>
    </div>
  );
}

export function Metric({ label, value, detail, tone = "default" }) {
  return <div className={`metric metric-${tone}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
