import { useState, useEffect, useRef } from "react";
import { startSafeWalk, cancelSafeWalk, extendSafeWalk } from "../api";

export default function SafeWalkPage({ userInfo, monitor, isSubComponent }) {
  const { sw, sc, globalConfirmSafe } = monitor || {};
  const [etaMinutes, setEtaMinutes] = useState(15);
  const [dest, setDest] = useState("");
  const intervalRef = useRef(null);
  const [isVoiceOn, setIsVoiceOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceAnnounceRef = useRef(null);

  if (!monitor) return null;

  const handleStart = async () => {
    if (!dest.trim()) return alert("Please enter a destination");
    
    const totalSeconds = etaMinutes * 60;
    sw.setDestination(dest);
    sw.setTimeLeft(totalSeconds);
    sw.setActive(true);

    // Start countdown directly here — no dependency on backend or context
    clearInterval(intervalRef.current);
    let remaining = totalSeconds;
    intervalRef.current = setInterval(() => {
      remaining -= 1;
      sw.setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        alert("⚠️ SafeWalk timer expired!");
      }
    }, 1000);

    if (sc.status === "idle" || sc.status === "safe" || sc.status === "alerted") {
      sc.setTimerMinutes(15);
      sc.setCountdown(15 * 60);
      sc.setStatus("pending");
    }

    try {
      await startSafeWalk(userInfo?.user_id || "anonymous", userInfo?.name || "Anonymous", dest, etaMinutes, 12.9716, 77.5946, userInfo?.emergency_contact || "");
    } catch (err) {}
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
    clearInterval(intervalRef.current);
    globalConfirmSafe();
  };

  const handleExtend = () => {
    sw.setTimeLeft(sw.timeLeft + 10 * 60);
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
          <p className="text-sm text-slate-600 dark:text-slate-400">We'll watch your back. Set an ETA and if you don't check in by then, we'll automatically alert your emergency contacts and nearby users.</p>
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
            <button onClick={handleStart} className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-800 dark:text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/30 transition-colors mt-4 text-lg">Start Safe Walk</button>
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
        </div>
      )}
    </div>
  );
}
