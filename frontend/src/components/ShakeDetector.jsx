import React, { useState, useEffect, useRef } from "react";
import { triggerSOS } from "../api";
import { recordShake } from "../utils/safetyLogic";

export default function ShakeDetector({ userInfo, currentPos }) {
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [permissionState, setPermissionState] = useState("checking");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const shakeCountRef = useRef(0);
  const lastShakeTimeRef = useRef(0);
  const triggeringRef = useRef(false);
  
  const SHAKE_THRESHOLD = 25; // m/s^2 threshold for a strong shake
  const REQUIRED_SHAKES = 3;  // Number of strong shakes required to trigger
  const SHAKE_TIMEOUT = 2000; // Time window (ms) to accumulate shakes

  useEffect(() => {
    if (!("DeviceMotionEvent" in window)) {
      setPermissionState("unsupported");
    } else if (typeof window.DeviceMotionEvent.requestPermission === "function") {
      setPermissionState("needs-permission");
    } else {
      setPermissionState("granted");
    }
  }, []);

  const requestMotionPermission = async () => {
    try {
      const permission = await window.DeviceMotionEvent.requestPermission();
      setPermissionState(permission === "granted" ? "granted" : "denied");
    } catch (error) {
      setPermissionState("denied");
      setMessage(`Motion permission failed: ${error.message}`);
    }
  };

  useEffect(() => {
    const handleMotion = (event) => {
      if (alertTriggered) return;

      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc) return;

      const { x, y, z } = acc;
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      const next = recordShake(
        { count: shakeCountRef.current, lastShakeMs: lastShakeTimeRef.current },
        magnitude,
        Date.now(),
        { threshold: SHAKE_THRESHOLD, requiredShakes: REQUIRED_SHAKES, timeoutMs: SHAKE_TIMEOUT },
      );
      shakeCountRef.current = next.count;
      lastShakeTimeRef.current = next.lastShakeMs;
      if (next.shouldTrigger) {
        handleSOS();
      }
    };

    if (permissionState !== "granted") return undefined;
    window.addEventListener("devicemotion", handleMotion);

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [alertTriggered, permissionState, userInfo, currentPos]);

  const handleSOS = async () => {
    if (triggeringRef.current || alertTriggered) return;
    if (!userInfo || !currentPos) {
      setMessage("Shake detected, but SOS was not triggered because profile or live GPS is unavailable.");
      shakeCountRef.current = 0;
      return;
    }

    triggeringRef.current = true;
    setAlertTriggered(true);
    setMessage("Shake threshold reached. Recording SOS alert.");

    // Intense continuous vibration pattern
    if (navigator.vibrate) {
      navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 1000]);
    }
    
    try {
      const alert = await triggerSOS(
        currentPos[0],
        currentPos[1],
        userInfo.user_id,
        userInfo.name,
        "Automated Alert: Violent device shaking detected.",
        userInfo.emergency_contact,
        userInfo.medical_details,
      );
      setResult(alert);
      setMessage("Shake SOS recorded. Check dispatch status below.");
    } catch (error) {
      setMessage(`Backend SOS failed: ${error.message}. Opening the SMS composer; sending still requires confirmation.`);
      const mapsLink = `https://maps.google.com/?q=${currentPos[0]},${currentPos[1]}`;
      const smsBody = encodeURIComponent(`SOS! Shake Threat Detected! My live location: ${mapsLink}`);
      window.location.href = `sms:${userInfo.emergency_contact || ""}?body=${smsBody}`;
    }
  };

  return (
    <div className={`p-4 rounded-xl border transition-all duration-300 ${alertTriggered ? 'bg-red-900/40 border-red-500/50' : 'bg-slate-800/50 border-slate-700'} flex flex-col gap-3`}>
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-white font-semibold flex items-center gap-2">
            📳 Shake to SOS
            {!alertTriggered && <span className="relative flex h-3 w-3 ml-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
            </span>}
          </h3>
          <p className="text-xs text-slate-400">
            {permissionState === "granted" ? "Monitoring device motion. Three strong shakes within two seconds trigger SOS." : "Device-motion access is not active."}
          </p>
        </div>
      </div>

      {permissionState === "needs-permission" && (
        <button onClick={requestMotionPermission} className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white">
          Enable Shake Detection
        </button>
      )}
      {permissionState === "denied" && <p className="text-sm text-amber-300">Motion permission was denied.</p>}
      {permissionState === "unsupported" && <p className="text-sm text-amber-300">Device motion is not supported in this browser.</p>}
      {message && <p className="text-sm text-slate-300">{message}</p>}
      
      {alertTriggered && (
        <div className="bg-red-900/50 border border-red-500/50 text-red-200 text-sm p-4 rounded-lg flex items-center justify-between gap-3 animate-pulse-fast shadow-[0_0_20px_rgba(220,38,38,0.4)]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚨</span> 
            <div>
              <p className="font-bold">Threat detected!</p>
              <p className="text-xs text-red-300">{result ? `Police dispatch: ${result.police_dispatch}` : "SOS processing in progress."}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
