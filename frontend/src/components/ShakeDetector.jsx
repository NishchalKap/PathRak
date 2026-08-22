import { useEffect, useRef, useState } from "react";
import { triggerSOS } from "../api";
import { recordShake } from "../utils/safetyLogic";
import Icon from "./Icon";
import { Notice, StatusPill } from "./UI";

const STATE_COPY = {
  checking: ["Checking support", "PathRak is checking whether this device exposes motion detection."],
  "needs-permission": ["Permission required", "Enable motion access to allow three strong shakes to record an SOS."],
  granted: ["Detection active", "Three strong shakes within two seconds will record an emergency alert."],
  denied: ["Permission blocked", "Motion access was denied. You can still use the SOS page manually."],
  unsupported: ["Not supported here", "This browser or desktop device does not provide physical motion events. Use a compatible phone to test shake detection."],
};

export default function ShakeDetector({ userInfo, currentPos }) {
  const [permissionState, setPermissionState] = useState("checking");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const shakeCountRef = useRef(0);
  const lastShakeRef = useRef(0);
  const triggeringRef = useRef(false);

  useEffect(() => {
    if (!("DeviceMotionEvent" in window)) setPermissionState("unsupported");
    else if (typeof window.DeviceMotionEvent.requestPermission === "function") setPermissionState("needs-permission");
    else setPermissionState("granted");
  }, []);

  const recordEmergency = async () => {
    if (triggeringRef.current) return;
    if (!userInfo || !currentPos) {
      setMessage("A shake was detected, but the alert was not recorded because the emergency profile or live location is unavailable.");
      shakeCountRef.current = 0;
      return;
    }

    triggeringRef.current = true;
    setMessage("Strong shaking detected. Recording an emergency alert...");
    navigator.vibrate?.([800, 400, 800]);
    try {
      const alert = await triggerSOS(currentPos[0], currentPos[1], userInfo.user_id, userInfo.name, "Automated alert: strong device shaking detected.", userInfo.emergency_contact, userInfo.medical_details);
      setResult(alert);
      setMessage("Shake alert recorded. Review provider status below.");
    } catch (error) {
      setMessage(`The backend could not record the alert: ${error.message}. Opening an SMS draft for your confirmation.`);
      const mapsLink = `https://maps.google.com/?q=${currentPos[0]},${currentPos[1]}`;
      window.location.href = `sms:${userInfo.emergency_contact || ""}?body=${encodeURIComponent(`SOS! Strong shaking was detected. My location: ${mapsLink}`)}`;
    }
  };

  useEffect(() => {
    if (permissionState !== "granted" || result) return undefined;
    const onMotion = (event) => {
      const acceleration = event.accelerationIncludingGravity || event.acceleration;
      if (!acceleration) return;
      const magnitude = Math.sqrt((acceleration.x || 0) ** 2 + (acceleration.y || 0) ** 2 + (acceleration.z || 0) ** 2);
      const next = recordShake({ count: shakeCountRef.current, lastShakeMs: lastShakeRef.current }, magnitude, Date.now(), { threshold: 25, requiredShakes: 3, timeoutMs: 2000 });
      shakeCountRef.current = next.count;
      lastShakeRef.current = next.lastShakeMs;
      if (next.shouldTrigger) recordEmergency();
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [permissionState, result, userInfo, currentPos]);

  const requestPermission = async () => {
    try {
      const permission = await window.DeviceMotionEvent.requestPermission();
      setPermissionState(permission === "granted" ? "granted" : "denied");
    } catch {
      setPermissionState("denied");
    }
  };

  const [title, detail] = STATE_COPY[permissionState];
  const tone = result ? "danger" : permissionState === "granted" ? "success" : permissionState === "denied" || permissionState === "unsupported" ? "warning" : "neutral";

  return (
    <section className="panel shake-status" aria-live="polite">
      <div className="shake-icon"><Icon name="monitor" size={23} /></div>
      <div className="shake-copy"><div className="shake-title"><h2>Shake detection</h2><StatusPill tone={tone}>{title}</StatusPill></div><p>{detail}</p></div>
      {permissionState === "needs-permission" && <button className="btn btn-secondary" onClick={requestPermission}>Enable motion access</button>}
      {message && <div className="shake-message"><Notice tone={result ? "danger" : "warning"} title={result ? "Alert recorded" : "Shake detector update"}>{message}</Notice></div>}
      {result && <div className="shake-result"><span>Alert {result.alert_id}</span><strong>External dispatch: {result.police_dispatch || "Not configured"}</strong></div>}
    </section>
  );
}
