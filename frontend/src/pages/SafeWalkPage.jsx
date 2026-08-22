import { useState, useRef } from "react";
import { startSafeWalk, cancelSafeWalk, extendSafeWalk } from "../api";

export default function SafeWalkPage({ userInfo, currentPos, monitor, isSubComponent }) {
  const { sw } = monitor || {};
  const [etaMinutes, setEtaMinutes] = useState(15);
  const [dest, setDest] = useState("");
  const [isVoiceOn, setIsVoiceOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceAnnounceRef = useRef(null);

  if (!monitor) return null;

  const handleStart = async () => {
    if (!dest.trim()) return alert("Please enter a destination");
    if (!currentPos) {
      return alert("Current GPS location is required to start SafeWalk.");
    }
    if (!userInfo?.user_id || !userInfo?.name) {
      return alert("Complete your profile before starting SafeWalk.");
    }

    try {
      const response = await startSafeWalk(
        userInfo.user_id,
        userInfo.name,
        dest,
        etaMinutes,
        currentPos[0],
        currentPos[1],
        userInfo?.emergency_contact || "",
      );
      if (!response?.eta) throw new Error("SafeWalk response did not include an ETA.");
      const etaTime = new Date(response.eta);
      sw.setDestination(dest);
      sw.setEtaTime(etaTime);
      sw.setActive(true);
    } catch (err) {
      alert("Could not start SafeWalk. Please make sure the backend is running and try again.");
    }
  };

  // --- Voice / TTS helpers for periodic reminders ---
  const speak = (text, onend) => {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.onend = onend;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setIsSpeaking(true);
  };

  const stopSpeaking = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const startVoiceReminders = () => {
    if (!sw.active) return;
    setIsVoiceOn(true);
    speak(`Voice reminders enabled. I'll announce time remaining every two minutes.`, () => setIsSpeaking(false));
    // Announce immediately and then every 2 minutes
    if (voiceAnnounceRef.current) clearInterval(voiceAnnounceRef.current);
    voiceAnnounceRef.current = setInterval(() => {
      if (!sw.active) return;
      const mins = Math.floor((sw.timeLeft || 0) / 60);
      if (mins <= 0) {
        speak(`SafeWalk timer expired. Please confirm you are safe.`, () => setIsSpeaking(false));
        clearInterval(voiceAnnounceRef.current);
        setIsVoiceOn(false);
        return;
      }
      speak(`Time left: ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`, () => setIsSpeaking(false));
    }, 120_000);
  };

  const stopVoiceReminders = () => {
    setIsVoiceOn(false);
    if (voiceAnnounceRef.current) {
      clearInterval(voiceAnnounceRef.current);
      voiceAnnounceRef.current = null;
    }
    stopSpeaking();
  };

  const handleCancel = () => {
    if (userInfo?.user_id) {
      cancelSafeWalk(userInfo.user_id).catch(() => {});
    }
    sw.reset();
  };

  const handleExtend = async () => {
    if (!userInfo?.user_id || !sw.etaTime) return;

    try {
      const response = await extendSafeWalk(userInfo.user_id, 10);
      const newEta = response?.new_eta ? new Date(response.new_eta) : new Date(sw.etaTime.getTime() + 10 * 60 * 1000);
      sw.setEtaTime(newEta);
    } catch (err) {
      alert("Could not extend SafeWalk right now.");
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full gap-4 max-w-md mx-auto w-full">
      {!isSubComponent && (
        <div className="text-center mt-6">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Safe Walk Mode</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Set an ETA and PathRak will record an SOS if you do not check in. Contact delivery requires a configured provider.</p>
        </div>
      )}
      {isSubComponent && (
        <div className="text-center mt-2 mb-2">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">Safe Walk</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Live destination tracking & ETA alerts.</p>
        </div>
      )}

      {!sw.active ? (
        <div className="bg-white/40 dark:bg-slate-900/80 border border-black/10 dark:border-slate-700 rounded-2xl p-6 mt-4 shadow-xl">
          <div className="space-y-5">
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Where are you heading?</label>
              <input type="text" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="e.g. Home, Subway Station" className="w-full bg-white/60 dark:bg-slate-800 border border-black/10 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-white outline-none focus:border-emerald-500 transition-colors" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Expected time to arrive (minutes)</label>
              <div className="flex items-center gap-4">
                <input type="range" min="1" max="120" value={etaMinutes} onChange={(e) => setEtaMinutes(Number(e.target.value))} className="flex-1 accent-emerald-500" />
                <span className="text-xl font-bold text-emerald-400 w-12 text-center">{etaMinutes}m</span>
              </div>
            </div>
            <button disabled={!currentPos || !userInfo?.user_id} onClick={handleStart} className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-800 dark:text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/30 transition-colors mt-4 text-lg disabled:cursor-not-allowed disabled:opacity-50">Start Safe Walk</button>
            {!currentPos && (
              <p className="text-sm text-amber-300">Enable GPS location to start SafeWalk.</p>
            )}
            {!userInfo?.user_id && (
              <p className="text-sm text-amber-300">Complete your profile to start SafeWalk.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white/40 dark:bg-slate-900/80 border border-emerald-500/50 rounded-2xl p-6 mt-4 shadow-2xl text-center flex flex-col items-center">
          <div className="relative w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
            <div className="absolute w-16 h-16 rounded-full bg-emerald-500/40 animate-ping" />
            <span className="relative text-2xl">🛡️</span>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-1">Heading to {sw.destination}</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Tracking active. We're keeping an eye out.</p>
          <div className="text-6xl font-mono font-bold text-slate-800 dark:text-white mb-8 tracking-wider">{formatTime(sw.timeLeft)}</div>
          <div className="grid grid-cols-2 gap-4 w-full">
            <button onClick={handleExtend} className="bg-white/60 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 border border-black/20 dark:border-slate-600 text-slate-800 dark:text-white font-semibold py-3 rounded-xl transition-colors">+10 Mins</button>
            <div className="flex gap-2">
              <button onClick={handleCancel} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-slate-800 dark:text-white font-bold py-3 rounded-xl transition-colors">I'm Safe</button>
              <button
                onClick={() => isVoiceOn ? stopVoiceReminders() : startVoiceReminders()}
                className="px-3 py-3 rounded-xl bg-white/60 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white border border-black/10 dark:border-slate-700 disabled:opacity-50"
              >
                {isVoiceOn ? '🔕 Voice Off' : '🔊 Voice Reminders'}
              </button>
            </div>
          </div>
          {sw.message && (
            <div className="mt-4 w-full rounded-xl border border-amber-500/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-100">
              {sw.message}
            </div>
          )}
          {sw.alertResult && (
            <div className="mt-4 w-full rounded-xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-left text-sm text-red-100">
              <p className="font-semibold">Emergency alert recorded</p>
              <p className="mt-1">Alert ID: {sw.alertResult.alert_id}</p>
              <p>Station reference: {sw.alertResult.nearest_station?.name || "Unavailable"}</p>
              <p>Police dispatch: {sw.alertResult.police_dispatch || "Unavailable"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
