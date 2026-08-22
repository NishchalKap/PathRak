import { useState, useEffect, useRef } from "react";
import { triggerSOS, predictZoneRisk, notifyRisk, notifyBattery } from "../api";

export function useSafetyMonitor(userInfo, currentPos) {
  // SafeWalk State
  const [swActive, setSwActive] = useState(false);
  const [swEtaTime, setSwEtaTime] = useState(null);
  const [swDestination, setSwDestination] = useState("");
  const [swTimeLeft, setSwTimeLeft] = useState(0);

  // SmartCheck State
  const [scStatus, setScStatus] = useState("idle");
  const [scCountdown, setScCountdown] = useState(15 * 60);
  const [scTimerMinutes, setScTimerMinutes] = useState(15);
  const [scResult, setScResult] = useState(null);
  const [scMessage, setScMessage] = useState("");

  const handledSosRef = useRef({ sw: false, sc: false });
  const intervalRef = useRef(null);

  useEffect(() => {
    // Clear any existing interval first
    if (intervalRef.current) clearInterval(intervalRef.current);

    // Only run if either SafeWalk is active OR SmartCheck is pending
    if (!swActive && scStatus !== "pending") return;

    intervalRef.current = setInterval(() => {
      const now = new Date();

      // ── SafeWalk countdown ──
      if (swActive && swEtaTime) {
        const diff = Math.max(0, Math.floor((swEtaTime - now) / 1000));
        setSwTimeLeft(diff);

        if (diff === 0 && !handledSosRef.current.sw) {
          handledSosRef.current.sw = true;
          if (userInfo && currentPos) {
            triggerSOS(
              currentPos[0], currentPos[1],
              userInfo.user_id, userInfo.name,
              "SafeWalk ETA expired without confirmation.",
              userInfo.emergency_contact, userInfo.medical_details
            ).catch(() => {});
          }
        }
      }

      // ── SmartCheck countdown ──
      if (scStatus === "pending") {
        setScCountdown((prev) => {
          if (prev <= 1 && !handledSosRef.current.sc) {
            handledSosRef.current.sc = true;
            setScStatus("alerted");
            setScMessage(`No response within ${scTimerMinutes} minutes. Alert triggered.`);
            if (userInfo && currentPos) {
              triggerSOS(
                currentPos[0], currentPos[1],
                userInfo.user_id, userInfo.name,
                "Smart Check failed: user did not confirm safe.",
                userInfo.emergency_contact, userInfo.medical_details
              ).then((res) => setScResult(res)).catch(() => {});
            }
            return 0;
          }
          return Math.max(prev - 1, 0);
        });
      }
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [swActive, swEtaTime, scStatus, userInfo, currentPos, scTimerMinutes]);

  // ── High-Risk Zone Polling ──
  const lastNotifiedRef = useRef(0);
  useEffect(() => {
    if (!currentPos || !userInfo) return;

    const checkRisk = async () => {
      try {
        const now = new Date();
        const data = await predictZoneRisk(currentPos[0], currentPos[1], now.getHours(), now.getDay(), "dim");
        
        // If risk is High and we haven't notified in the last 5 minutes (300,000 ms)
        if (data.risk_level === "High" && (now.getTime() - lastNotifiedRef.current > 300000)) {
          lastNotifiedRef.current = now.getTime();
          
          if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
          
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("⚠️ High Risk Zone Alert", {
              body: "You have entered a high-risk area. Stay alert and keep your SOS ready.",
              icon: "/favicon.ico",
            });
          }

          // Send automated Twilio SMS warning to emergency contact
          notifyRisk(currentPos[0], currentPos[1], userInfo.user_id, userInfo.name, userInfo.emergency_contact).catch(() => {});
        }
      } catch (err) {
        // Ignore API errors during background polling
      }
    };

    const checkBattery = async () => {
      try {
        if ("getBattery" in navigator) {
          const battery = await navigator.getBattery();
          const level = Math.round(battery.level * 100);
          
          // If battery <= 10% and not charging
          if (level <= 10 && !battery.charging) {
            // Check if we already sent a low battery warning recently (e.g. within 1 hour)
            const lastBatteryWarning = parseInt(localStorage.getItem('last_battery_warning') || '0');
            const now = Date.now();
            
            if (now - lastBatteryWarning > 3600000) { // 1 hour cooldown
              localStorage.setItem('last_battery_warning', now.toString());
              
              if (navigator.vibrate) navigator.vibrate([200, 200, 200]);
              
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("🔋 Low Battery Alert", {
                  body: "Your battery is critically low. We've notified your emergency contact.",
                  icon: "/favicon.ico",
                });
              }
              
              notifyBattery(currentPos[0], currentPos[1], userInfo.name, userInfo.emergency_contact, level).catch(() => {});
            }
          }
        }
      } catch (err) {
        // Ignore battery API errors
      }
    };

    // Check immediately, then periodically
    checkRisk();
    checkBattery();
    
    const riskInterval = setInterval(checkRisk, 30000);
    const batteryInterval = setInterval(checkBattery, 60000); // Check battery every minute
    
    return () => {
      clearInterval(riskInterval);
      clearInterval(batteryInterval);
    };
  }, [currentPos, userInfo]);
  useEffect(() => {
  if (swEtaTime && swActive) {
    const diff = Math.max(0, Math.floor((swEtaTime - new Date()) / 1000));
    setSwTimeLeft(diff);
  }
}, [swEtaTime]);

  const globalConfirmSafe = () => {
    setSwActive(false);
    setSwEtaTime(null);
    setSwTimeLeft(0);
    setSwDestination("");

    setScStatus("safe");
    setScMessage("You are marked safe. No alert was sent.");
    setScCountdown(scTimerMinutes * 60);

    handledSosRef.current = { sw: false, sc: false };
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  return {
    sw: {
      active: swActive,
      setActive: setSwActive,
      etaTime: swEtaTime,
      setEtaTime: setSwEtaTime,
      destination: swDestination,
      setDestination: setSwDestination,
      timeLeft: swTimeLeft,
      setTimeLeft: setSwTimeLeft,   // ← exposed so SafeWalkPage can set initial value
    },
    sc: {
      status: scStatus,
      setStatus: (st) => {
        setScStatus(st);
        if (st === "pending") handledSosRef.current.sc = false;
      },
      countdown: scCountdown,
      setCountdown: setScCountdown,
      timerMinutes: scTimerMinutes,
      setTimerMinutes: setScTimerMinutes,
      result: scResult,
      setResult: setScResult,
      message: scMessage,
      setMessage: setScMessage,
    },
    globalConfirmSafe,
  };
}
