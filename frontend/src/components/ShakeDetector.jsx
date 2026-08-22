import React, { useState, useEffect, useRef } from "react";
import { triggerSOS } from "../api";

export default function ShakeDetector({ userInfo, currentPos }) {
  const [alertTriggered, setAlertTriggered] = useState(false);
  const shakeCountRef = useRef(0);
  const lastShakeTimeRef = useRef(0);
  
  const SHAKE_THRESHOLD = 25; // m/s^2 threshold for a strong shake
  const REQUIRED_SHAKES = 3;  // Number of strong shakes required to trigger
  const SHAKE_TIMEOUT = 2000; // Time window (ms) to accumulate shakes

  useEffect(() => {
    const handleMotion = (event) => {
      if (alertTriggered) return;

      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc) return;

      const { x, y, z } = acc;
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      if (magnitude > SHAKE_THRESHOLD) {
        const now = Date.now();
        
        // Reset shake count if too much time has passed since the last shake
        if (now - lastShakeTimeRef.current > SHAKE_TIMEOUT) {
          shakeCountRef.current = 0;
        }

        lastShakeTimeRef.current = now;
        shakeCountRef.current += 1;

        if (shakeCountRef.current >= REQUIRED_SHAKES) {
          setAlertTriggered(true);
          handleSOS();
        }
      }
    };

    // Passive listener, no button required
    window.addEventListener("devicemotion", handleMotion);

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [alertTriggered, userInfo, currentPos]);

  const handleSOS = () => {
    // Intense continuous vibration pattern
    if (navigator.vibrate) {
      navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 1000]);
    }
    
    if (!userInfo || !currentPos) {
      alert("Shake Threat Detected! But profile/location is missing.");
      return;
    }
    
    triggerSOS(
      currentPos[0],
      currentPos[1],
      userInfo.user_id,
      userInfo.name,
      "Automated Alert: Violent device shaking detected.",
      userInfo.emergency_contact,
      userInfo.medical_details
    ).catch(() => {
      // Fallback SMS if backend fails
      const mapsLink = `https://maps.google.com/?q=${currentPos[0]},${currentPos[1]}`;
      const smsBody = encodeURIComponent(`SOS! Shake Threat Detected! My live location: ${mapsLink}`);
      window.location.href = `sms:${userInfo.emergency_contact || ""}?body=${smsBody}`;
    });
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
          <p className="text-xs text-slate-400">Monitoring accelerometer in the background. Shake violently to trigger.</p>
        </div>
      </div>
      
      {alertTriggered && (
        <div className="bg-red-900/50 border border-red-500/50 text-red-200 text-sm p-4 rounded-lg flex items-center justify-between gap-3 animate-pulse-fast shadow-[0_0_20px_rgba(220,38,38,0.4)]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚨</span> 
            <div>
              <p className="font-bold">Threat detected!</p>
              <p className="text-xs text-red-300">Automated SOS dispatched.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
