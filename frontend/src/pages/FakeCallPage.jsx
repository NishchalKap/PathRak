import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Notice, PageHeader, StatusPill } from "../components/UI";

const CALL_STATES = {
  IDLE: "IDLE",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  SPEAKING: "SPEAKING",
  WAITING: "WAITING_FOR_RESPONSE",
  ENDING: "ENDING",
  ENDED: "ENDED",
};

const getPreferredVoice = (voices) => {
  const englishVoices = voices.filter(voice => voice.lang?.toLowerCase().startsWith("en"));
  const candidates = englishVoices.length ? englishVoices : voices;
  return [...candidates].sort((a, b) => {
    const score = voice => {
      const name = voice.name?.toLowerCase() || "";
      const lang = voice.lang?.toLowerCase() || "";
      return (/(natural|neural|google|microsoft)/.test(name) ? 4 : 0)
        + (/en-(in|gb|us)/.test(lang) ? 2 : 0)
        + (voice.default ? 1 : 0);
    };
    return score(b) - score(a);
  })[0] || null;
};

export default function FakeCallPage({ userInfo, defaultName, monitor, routePlan, onNavigate }) {
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [scheduled, setScheduled] = useState(false);
  const [timer, setTimer] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [voice, setVoice] = useState(null);
  const [voiceAvailable, setVoiceAvailable] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [showSOSAction, setShowSOSAction] = useState(false);
  const speechRunRef = useRef(0);
  const utteranceRef = useRef(null);
  const speechTimerRef = useRef(null);
  const transcriptRef = useRef(null);

  const firstName = useMemo(() => {
    const fullName = String(userInfo?.name || defaultName || "").trim();
    return fullName ? fullName.split(/\s+/)[0] : "";
  }, [userInfo?.name, defaultName]);

  const safeWalkActive = Boolean(monitor?.sw?.active);
  const destination = monitor?.sw?.destination || routePlan?.destination || "";
  const selectedRoute = monitor?.sw?.routeLabel || routePlan?.label || "";
  const greeting = `${firstName ? `Hey ${firstName},` : "Hey,"} it's PathRak. ${safeWalkActive ? "I'm checking in while you're on your journey." : "I'm checking in with you."} Are you doing okay?`;

  const stopSpeech = useCallback(() => {
    speechRunRef.current += 1;
    utteranceRef.current = null;
    window.clearTimeout(speechTimerRef.current);
    speechTimerRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* text-only fallback */ }
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setVoiceAvailable(false);
      setVoiceMessage("Voice is unavailable in this browser. The companion will continue as a text conversation.");
      return undefined;
    }

    const loadVoices = () => setVoice(getPreferredVoice(window.speechSynthesis.getVoices()));
    loadVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices);
  }, []);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const speakAssistant = useCallback((text) => {
    setTranscript(current => [...current, { role: "companion", text }]);
    setCallState(CALL_STATES.SPEAKING);
    setVoiceMessage("");
    const speechRun = speechRunRef.current + 1;
    speechRunRef.current = speechRun;

    if (!voiceAvailable) {
      setVoiceMessage("Voice is unavailable in this browser. The companion is continuing as a text conversation.");
      speechTimerRef.current = window.setTimeout(() => {
        if (speechRunRef.current === speechRun) setCallState(CALL_STATES.WAITING);
      }, 250);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || "en-IN";
      utterance.rate = 0.94;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => {
        if (speechRunRef.current !== speechRun) return;
        window.clearTimeout(speechTimerRef.current);
        speechTimerRef.current = null;
        utteranceRef.current = null;
        setCallState(CALL_STATES.WAITING);
      };
      utterance.onerror = (event) => {
        if (speechRunRef.current !== speechRun) return;
        window.clearTimeout(speechTimerRef.current);
        speechTimerRef.current = null;
        utteranceRef.current = null;
        if (!["canceled", "interrupted"].includes(event.error)) {
          setVoiceMessage("Voice playback was blocked or unavailable. The conversation is still available as text.");
        }
        setCallState(CALL_STATES.WAITING);
      };
      window.speechSynthesis.speak(utterance);
      speechTimerRef.current = window.setTimeout(() => {
        if (speechRunRef.current !== speechRun) return;
        stopSpeech();
        setVoiceMessage("Voice playback did not complete. The conversation is still available as text.");
        setCallState(CALL_STATES.WAITING);
      }, Math.min(30000, Math.max(12000, text.split(/\s+/).length * 650)));
    } catch {
      setVoiceMessage("Voice playback could not start. The conversation is still available as text.");
      setCallState(CALL_STATES.WAITING);
    }
  }, [stopSpeech, voice, voiceAvailable]);

  useEffect(() => {
    if (!scheduled) return undefined;
    if (timer <= 0) {
      setScheduled(false);
      setCallState(CALL_STATES.CONNECTING);
      return undefined;
    }
    const interval = window.setInterval(() => setTimer(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [scheduled, timer]);

  useEffect(() => {
    if (callState !== CALL_STATES.CONNECTING) return undefined;
    stopSpeech();
    setTranscript([]);
    setDuration(0);
    setShowSOSAction(false);
    const connectionTimer = window.setTimeout(() => setCallState(CALL_STATES.CONNECTED), 650);
    return () => window.clearTimeout(connectionTimer);
  }, [callState, stopSpeech]);

  useEffect(() => {
    if (callState !== CALL_STATES.CONNECTED) return undefined;
    const greetingTimer = window.setTimeout(() => speakAssistant(greeting), 220);
    return () => window.clearTimeout(greetingTimer);
  }, [callState, greeting, speakAssistant]);

  useEffect(() => {
    if (![CALL_STATES.CONNECTED, CALL_STATES.SPEAKING, CALL_STATES.WAITING].includes(callState)) return undefined;
    const durationTimer = window.setInterval(() => setDuration(value => value + 1), 1000);
    return () => window.clearInterval(durationTimer);
  }, [callState]);

  const startCall = (seconds) => {
    stopSpeech();
    setVoiceMessage("");
    setShowSOSAction(false);
    setTranscript([]);
    setDuration(0);
    if (seconds === 0) {
      setScheduled(false);
      setCallState(CALL_STATES.CONNECTING);
      return;
    }
    setTimer(seconds);
    setScheduled(true);
    setCallState(CALL_STATES.IDLE);
  };

  const cancelScheduledCall = () => {
    setScheduled(false);
    setTimer(0);
  };

  const respond = (response) => {
    if (callState !== CALL_STATES.WAITING) return;
    const userMessages = { okay: "I'm okay", notOkay: "I'm not okay", talking: "Keep talking" };
    setTranscript(current => [...current, { role: "user", text: userMessages[response] }]);

    if (response === "okay") {
      setShowSOSAction(false);
      const context = safeWalkActive
        ? `Your journey${destination ? ` to ${destination}` : ""} is still being monitored. I'll stay with you for a little longer.${selectedRoute ? ` You're on your selected ${selectedRoute} route.` : ""}`
        : "I'm glad you're okay. I'll stay with you for a little longer.";
      speakAssistant(`Good to hear. ${context} If you need help at any point, you can open SOS.`);
      return;
    }

    if (response === "notOkay") {
      setShowSOSAction(true);
      const context = safeWalkActive
        ? `Your PathRak safety session is active${destination ? ` for your journey to ${destination}` : ""}. Your current journey information is available.`
        : routePlan
          ? "Your selected journey information is available in PathRak."
          : "The PathRak SOS control is available if you need immediate help.";
      speakAssistant(`Understood. Stay calm. ${context}`);
      return;
    }

    setShowSOSAction(false);
    speakAssistant(`Sure. I'm here with you. ${safeWalkActive ? "Your journey is still being monitored." : "We can keep talking here."} If anything feels unsafe, you can use the SOS control at any time.`);
  };

  const endCall = useCallback(() => {
    setScheduled(false);
    setTimer(0);
    stopSpeech();
    setCallState(CALL_STATES.ENDING);
  }, [stopSpeech]);

  useEffect(() => {
    if (callState !== CALL_STATES.ENDING) return undefined;
    const endingTimer = window.setTimeout(() => setCallState(CALL_STATES.ENDED), 350);
    return () => window.clearTimeout(endingTimer);
  }, [callState]);

  const openSOS = () => {
    stopSpeech();
    setCallState(CALL_STATES.ENDING);
    onNavigate?.("sos");
  };

  const resetCall = () => {
    stopSpeech();
    setCallState(CALL_STATES.IDLE);
    setTranscript([]);
    setDuration(0);
    setShowSOSAction(false);
    setVoiceMessage("");
  };

  const formatDuration = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  if (callState !== CALL_STATES.IDLE) {
    const isConnected = [CALL_STATES.CONNECTED, CALL_STATES.SPEAKING, CALL_STATES.WAITING].includes(callState);
    return (
      <section className={`call-screen companion-call state-${callState.toLowerCase()}`}>
        <header className="companion-call-header"><span className="companion-avatar"><Icon name="shield" size={32} /></span><div><p>PathRak</p><h1>Safety Companion</h1><span className={isConnected ? "is-connected" : ""}>{callState === CALL_STATES.CONNECTING ? "Connecting…" : callState === CALL_STATES.ENDING ? "Ending call…" : callState === CALL_STATES.ENDED ? "Call ended" : "Connected"}</span></div><strong>{formatDuration(duration)}</strong></header>

        {callState === CALL_STATES.CONNECTING ? <div className="call-transition"><span className="connecting-ring"><Icon name="phone" size={30} /></span><h2>Connecting to your browser companion</h2><p>No real phone call is being placed.</p></div> : callState === CALL_STATES.ENDING ? <div className="call-transition"><h2>Ending safety call…</h2></div> : callState === CALL_STATES.ENDED ? <div className="call-transition ended"><span className="ended-icon"><Icon name="check" size={28} /></span><h2>Safety call ended</h2><p>Voice playback has stopped.</p><button className="btn btn-primary" onClick={resetCall}>Return to Exit Call</button></div> : <>
          <div className={`speaking-indicator ${callState === CALL_STATES.SPEAKING ? "is-speaking" : ""}`}><span /><span /><span /><strong>{callState === CALL_STATES.SPEAKING ? "PathRak is speaking" : "Waiting for your response"}</strong></div>
          <div className="companion-transcript" ref={transcriptRef} aria-live="polite">{transcript.map((message, index) => <div key={`${message.role}-${index}`} className={`transcript-message ${message.role}`}><small>{message.role === "companion" ? "PathRak" : "You"}</small><p>{message.text}</p></div>)}</div>
          {voiceMessage && <div className="voice-fallback" role="status"><Icon name="warning" size={17} />{voiceMessage}</div>}
          <div className="companion-responses"><button disabled={callState !== CALL_STATES.WAITING} onClick={() => respond("okay")}><Icon name="check" />I'm okay</button><button disabled={callState !== CALL_STATES.WAITING} onClick={() => respond("notOkay")}><Icon name="warning" />I'm not okay</button><button disabled={callState !== CALL_STATES.WAITING} onClick={() => respond("talking")}><Icon name="phone" />Keep talking</button>{showSOSAction && <button className="open-sos" onClick={openSOS}><Icon name="sos" />Open SOS</button>}</div>
        </>}

        {callState !== CALL_STATES.ENDED && <button className="companion-end-call" onClick={endCall}><span><Icon name="close" size={23} /></span>End call</button>}
      </section>
    );
  }

  return (
    <div className="page-stack exit-call-page">
      <PageHeader eyebrow="Discreet support" title="AI Safety Companion" description="Start a browser-based voice conversation for calm, discreet support during an uncomfortable journey." actions={<StatusPill tone={scheduled ? "warning" : "neutral"} icon="phone">{scheduled ? `Starting in ${timer}s` : "Ready"}</StatusPill>} />
      <Notice tone="info" title="Browser-based simulation">This does not place a real phone call or connect another person. Voice uses your browser's speech service; response choices are explicit buttons.</Notice>
      <div className="exit-call-layout companion-setup-layout">
        <section className="panel call-setup companion-setup">
          <div className="panel-heading"><span className="panel-icon"><Icon name="shield" /></span><div><h2>Start a safety conversation</h2><p>PathRak will speak aloud when browser speech is available and continue as text if it is not.</p></div></div>
          <div className="companion-context"><div><span className={safeWalkActive ? "ready-dot" : "warning-dot"} /><p><strong>SafeWalk monitoring</strong><small>{safeWalkActive ? "Active" : "Not active"}</small></p></div><div><Icon name="route" /><p><strong>Journey context</strong><small>{destination || "No selected destination"}</small></p></div></div>
          <fieldset className="delay-options"><legend>Start companion</legend>{[{ label: "Start now", seconds: 0 }, { label: "In 10 sec", seconds: 10 }, { label: "In 30 sec", seconds: 30 }, { label: "In 1 min", seconds: 60 }].map(option => <button type="button" key={option.seconds} onClick={() => startCall(option.seconds)}>{option.label}</button>)}</fieldset>
          {scheduled && <Notice tone="warning" title={`Safety companion starts in ${timer} seconds`} action={<button className="btn btn-secondary" onClick={cancelScheduledCall}>Cancel</button>}>Keep PathRak open. This remains a browser simulation.</Notice>}
          {!voiceAvailable && <Notice tone="warning" title="Text-only mode">Speech synthesis is unavailable, but every conversation state and response remains usable as text.</Notice>}
        </section>
        <aside className="panel call-preview companion-preview"><span className="preview-avatar"><Icon name="shield" size={36} /></span><p>PathRak</p><h2>Safety Companion</h2><small>Browser voice · deterministic responses</small><div className="preview-status"><span /><strong>Ready to connect</strong></div></aside>
      </div>
    </div>
  );
}
