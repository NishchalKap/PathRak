import ShakeDetector from "../components/ShakeDetector";
import { LocationStatus, PageHeader, StatusPill } from "../components/UI";
import SafeWalkPage from "./SafeWalkPage";
import SmartCheckPage from "./SmartCheckPage";

export default function SafeMonitoringPage(props) {
  const anyActive = props.monitor?.sw?.active || props.monitor?.sc?.status === "pending";

  return (
    <div className="page-stack monitoring-page">
      <PageHeader eyebrow="Continuous protection" title="Safety monitoring" description="Manage journey tracking, timed check-ins, and device-motion emergency detection from one place." actions={<StatusPill tone={anyActive ? "success" : "neutral"} icon={anyActive ? "check" : "monitor"}>{anyActive ? "Protection active" : "No active session"}</StatusPill>} />
      <div className="monitoring-readiness"><LocationStatus currentPos={props.currentPos} error={props.locationError} compact /><span className="monitor-divider" /><p><strong>Emergency profile</strong><span>{props.userInfo?.emergency_contact ? "Contact ready" : "Contact missing"}</span></p></div>
      <ShakeDetector userInfo={props.userInfo} currentPos={props.currentPos} />
      <div className="monitoring-grid">
        <section className="monitoring-column monitoring-walk"><SafeWalkPage {...props} isSubComponent /></section>
        <section className="monitoring-column monitoring-check"><SmartCheckPage {...props} isSubComponent /></section>
      </div>
    </div>
  );
}
