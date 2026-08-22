import { useState, useEffect } from "react";
const HOME_RADIUS_METERS = 200;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function SmartCheckPage({ userInfo, onEditProfile, currentPos, monitor, isSubComponent, theme }) {
  const { sc, globalConfirmSafe } = monitor || {};
  const [homePos, setHomePos] = useState(null);
  const [editingHome, setEditingHome] = useState(false);
  const homeStorageKey = userInfo?.user_id ? `pathrak_home_location:${userInfo.user_id}` : null;

  if (!monitor) return null;

  useEffect(() => {
    setHomePos(null);
    if (!homeStorageKey) return;

    const stored = localStorage.getItem(homeStorageKey);
    if (stored) {
      try {
        setHomePos(JSON.parse(stored));
      } catch {
        localStorage.removeItem(homeStorageKey);
      }
    }
  }, [homeStorageKey]);

  const saveHomeLocation = () => {
    if (!currentPos) {
      sc.setMessage("Current GPS location is unavailable. Please enable location access and try again.");
      return;
    }
    if (!homeStorageKey) {
      sc.setMessage("Complete your safety profile before saving a home location.");
      return;
    }
    localStorage.setItem(homeStorageKey, JSON.stringify(currentPos));
    setHomePos(currentPos);
    setEditingHome(false);
    sc.setMessage("Home location saved. You can now start smart monitoring.");
  };

  const clearHomeLocation = () => {
    if (homeStorageKey) localStorage.removeItem(homeStorageKey);
    setHomePos(null);
    setEditingHome(false);
    sc.setMessage("Home location cleared.");
  };

  const stopMonitoring = () => {
    sc.setStatus("idle");
    sc.setCountdown(sc.timerMinutes * 60);
  };

  const startMonitoring = () => {
    if (!userInfo?.name || !userInfo?.emergency_contact) {
      sc.setMessage("Please complete your profile first for Smart Check.");
      return;
    }
    if (!homePos) {
      sc.setMessage("Please save your home location before starting Smart Check.");
      return;
    }
    if (!currentPos) {
      sc.setMessage("Current GPS location is required before starting Smart Check.");
      return;
    }

    const timerSeconds = sc.timerMinutes * 60;
    sc.setStatus("pending");
    sc.setMessage("Smart Check is active. Tap SAFE if you are okay before the timer expires.");
    sc.setResult(null);
    sc.setCountdown(timerSeconds);
  };

  const confirmSafe = () => {
    if (sc.status !== "pending") return;
    globalConfirmSafe(); // This cancels both SafeWalk and SmartCheck
  };

  const homeDistance = homePos && currentPos
    ? haversineDistance(currentPos[0], currentPos[1], homePos[0], homePos[1])
    : null;

  const isAtHome = homeDistance !== null && homeDistance <= HOME_RADIUS_METERS;

  return (
    <div className="flex flex-col gap-4 h-full">
      {!isSubComponent && (
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Smart Check</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Monitor your routine and send an automatic alert if you don’t confirm safety in time.</p>
        </div>
      )}
      {isSubComponent && (
        <div className="text-center mt-2 mb-2">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">Smart Check</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Routine background monitoring.</p>
        </div>
      )}

      <div className={`grid grid-cols-1 ${isSubComponent ? '' : 'lg:grid-cols-2'} gap-4 flex-1`}>
        <div className="bg-white/60 dark:bg-slate-800/60 rounded-2xl p-6 border border-black/10 dark:border-slate-700 space-y-4">
          <div className="rounded-2xl bg-white/40 dark:bg-slate-900/50 p-4 border border-black/10 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-400">Home location</p>
              {homePos && !editingHome && (
                <button
                  onClick={() => setEditingHome(true)}
                  className="text-xs text-pink-400 hover:text-pink-300 border border-pink-500/30 px-2 py-1 rounded-lg transition"
                >
                  ✏️ Edit
                </button>
              )}
            </div>

            {homePos && !editingHome ? (
              <>
                <p className="text-slate-800 dark:text-white font-mono text-sm">{homePos[0].toFixed(5)}, {homePos[1].toFixed(5)}</p>
                <p className="text-xs text-emerald-400">✅ Home location is set</p>
              </>
            ) : (
              <>
                <p className="text-slate-800 dark:text-white font-mono text-sm">
                  {currentPos ? `${currentPos[0].toFixed(5)}, ${currentPos[1].toFixed(5)}` : "Location unavailable"}
                </p>
                <p className="text-xs text-slate-500">
                  {currentPos ? "Your current GPS position will be saved as home" : "Enable location access to save home."}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={saveHomeLocation}
                    disabled={!currentPos}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-slate-800 dark:text-white text-sm transition"
                  >
                    {homePos ? "Update home location" : "Save as home location"}
                  </button>
                  {homePos && editingHome && (
                    <>
                      <button
                        onClick={() => setEditingHome(false)}
                        className="px-4 py-2.5 rounded-xl border border-black/20 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:bg-slate-700 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={clearHomeLocation}
                        className="px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 text-sm hover:bg-red-900/20 transition"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl bg-white/40 dark:bg-slate-900/50 p-4 border border-black/10 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">Current position</p>
            <p className="text-slate-800 dark:text-white mt-2">
              {currentPos ? `${currentPos[0].toFixed(5)}, ${currentPos[1].toFixed(5)}` : "Location unavailable"}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {!currentPos ? "Enable location access so Smart Check can monitor your return." : homePos ? `You are ${Math.round(homeDistance)} meters from home.` : "Set home location first."}
            </p>
            <p className={`text-sm mt-2 ${isAtHome ? "text-emerald-300" : "text-amber-300"}`}>
              {!currentPos ? "Status: location unavailable" : homePos ? (isAtHome ? "Status: at home" : "Status: away from home") : "Home location is required."}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={startMonitoring}
                disabled={!currentPos || !homePos}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-800 dark:text-white font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start Smart Check
              </button>
              <button
                onClick={confirmSafe}
                disabled={sc.status !== "pending"}
                className="flex-1 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-600 text-slate-800 dark:text-white font-semibold disabled:opacity-50"
              >
                I’m Safe
              </button>
            </div>
            <button
              onClick={stopMonitoring}
              className="w-full py-3 rounded-xl border border-black/20 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:bg-slate-700"
            >
              Stop Monitoring
            </button>
          </div>

          <div className="rounded-2xl bg-white/40 dark:bg-slate-900/50 p-4 border border-black/10 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">Timer Duration</p>
            <div className="flex items-center gap-3 mt-3">
              <input
                type="number"
                min="1"
                max="60"
                value={sc.timerMinutes}
                onChange={(e) => {
                  const value = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
                  sc.setTimerMinutes(value);
                  if (sc.status === "idle") {
                    sc.setCountdown(value * 60);
                  }
                }}
                disabled={sc.status === "pending"}
                className="w-20 px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-lg border border-black/20 dark:border-slate-600 focus:outline-none focus:border-pink-500 disabled:opacity-50"
              />
              <span className="text-slate-800 dark:text-white">minutes</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Set how long to wait before triggering an alert if you don't confirm safety.</p>
          </div>

          <div className="rounded-2xl bg-white/40 dark:bg-slate-900/50 p-4 border border-black/10 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">Timer</p>
            <div className="flex items-center justify-center mt-3">
              <div className="relative">
                <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="#374151"
                    strokeWidth="8"
                    fill="none"
                  />
                  {sc.status === "pending" && (
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      stroke={sc.countdown < 300 ? "#ef4444" : sc.countdown < 600 ? "#f59e0b" : "#22c55e"}
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 45}`}
                      strokeDashoffset={`${2 * Math.PI * 45 * (1 - sc.countdown / (sc.timerMinutes * 60))}`}
                      className="transition-all duration-1000 ease-linear"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{sc.status === "pending" ? formatTime(sc.countdown) : formatTime(sc.timerMinutes * 60)}</p>
                    <p className="text-xs text-slate-500">minutes</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">If you don't confirm safety before the timer runs out, the app will trigger an alert.</p>
          </div>

          {sc.message && (
            <div className="rounded-2xl bg-blue-900/30 border border-blue-500/30 p-4 text-sm text-slate-800 dark:text-slate-200">
              {sc.message}
            </div>
          )}

          {!userInfo && (
            <div className="rounded-2xl bg-yellow-900/30 border border-yellow-500/30 p-4 text-sm text-slate-800 dark:text-slate-200">
              <p className="font-semibold">Profile required</p>
              <p className="mt-2">Please save your profile first so Smart Check can notify your emergency contact.</p>
              <button
                onClick={onEditProfile}
                className="mt-3 px-4 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-slate-800 dark:text-white text-sm"
              >
                Go to Profile Setup
              </button>
            </div>
          )}
        </div>

        <div className="bg-white/60 dark:bg-slate-800/60 rounded-2xl p-6 border border-black/10 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400">Smart Check alert history</p>
          {sc.result ? (
            <div className="mt-4 rounded-2xl bg-green-900/30 border border-green-500/30 p-4 text-sm text-slate-800 dark:text-slate-200 space-y-2">
              <p className="font-semibold">Alert recorded</p>
              <p>Alert ID: {sc.result.alert_id}</p>
              <p>Station reference: {sc.result.nearest_station?.name}</p>
              <p>Police dispatch: {sc.result.police_dispatch || "Unavailable"}</p>
              <p>Contact: {sc.result.emergency_contact || "N/A"}</p>
              <p>Medical: {sc.result.medical_details || "N/A"}</p>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-white/40 dark:bg-slate-900/30 border border-black/10 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-400">
              No Smart Check alert has been triggered yet.
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-white/40 dark:bg-slate-900/30 border border-black/10 dark:border-slate-700 p-4 text-sm text-slate-600 dark:text-slate-400">
            <p className="font-semibold">How it works</p>
            <ul className="mt-3 space-y-2 list-disc list-inside text-slate-600 dark:text-slate-400">
              <li>Save your home location.</li>
              <li>Start Smart Check before you leave.</li>
              <li>If you do not confirm safe within the set time, the app triggers an alert.</li>
              <li>The alert includes your emergency contact and medical details.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
