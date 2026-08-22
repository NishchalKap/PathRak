import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { Notice, PageHeader, StatusPill } from "../components/UI";

export default function FakeCallPage() {
  const [timer, setTimer] = useState(0);
  const [scheduled, setScheduled] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [duration, setDuration] = useState(0);
  const [callerName, setCallerName] = useState("Dad");
  const [interactiveReplies, setInteractiveReplies] = useState(false);
  const timeoutsRef = useRef([]);

  useEffect(() => {
    if (!scheduled) return undefined;
    if (timer <= 0) {
      setScheduled(false);
      setRinging(true);
      return undefined;
    }
    const interval = setInterval(() => setTimer((value) => value - 1), 1000);
    return () => clearInterval(interval);
  }, [scheduled, timer]);

  useEffect(() => {
    if (!answered) return undefined;
    const durationInterval = setInterval(() => setDuration((value) => value + 1), 1000);
    let recognition;
    let stopped = false;
    let step = 0;
    const script = [
      `Hey, it's ${callerName}. Are you almost home?`,
      "Okay. I am going to stay on the line with you. Keep your phone nearby.",
      "You are doing well. I will be waiting for you.",
    ];

    const schedule = (callback, delay) => {
      const id = window.setTimeout(callback, delay);
      timeoutsRef.current.push(id);
    };
    const run = () => {
      if (stopped || step >= script.length) return;
      const utterance = new SpeechSynthesisUtterance(script[step]);
      utterance.rate = .92;
      utterance.onend = () => {
        step += 1;
        if (step >= script.length || stopped) return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!interactiveReplies || !SpeechRecognition) return schedule(run, 2600);
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.onresult = () => { recognition.stop(); schedule(run, 900); };
        recognition.onerror = () => schedule(run, 1800);
        try { recognition.start(); } catch { schedule(run, 1800); }
      };
      window.speechSynthesis.speak(utterance);
    };
    run();
    return () => {
      stopped = true;
      clearInterval(durationInterval);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      window.speechSynthesis.cancel();
      try { recognition?.stop(); } catch { /* already stopped */ }
    };
  }, [answered, callerName, interactiveReplies]);

  const scheduleCall = (seconds) => {
    setTimer(seconds);
    setScheduled(true);
    setRinging(false);
    setAnswered(false);
    setDuration(0);
  };

  const endCall = () => {
    setScheduled(false);
    setRinging(false);
    setAnswered(false);
    setTimer(0);
    setDuration(0);
  };

  const formatDuration = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  if (ringing || answered) {
    return (
      <section className="call-screen" aria-live="assertive">
        <div className="call-status"><p>{answered ? formatDuration(duration) : "Incoming call"}</p><h1>{callerName || "Incoming caller"}</h1><span>{answered ? "Call in progress" : "PathRak exit call"}</span></div>
        <div className="caller-avatar"><Icon name="profile" size={52} /></div>
        <div className="call-actions">{!answered && <button className="call-action accept" onClick={() => setAnswered(true)}><span><Icon name="phone" size={29} /></span>Accept</button>}<button className="call-action decline" onClick={endCall}><span><Icon name="close" size={29} /></span>{answered ? "End call" : "Decline"}</button></div>
      </section>
    );
  }

  return (
    <div className="page-stack exit-call-page">
      <PageHeader eyebrow="Discreet support" title="Exit Call" description="Schedule a realistic incoming call to help you leave an uncomfortable situation without drawing attention." actions={<StatusPill tone={scheduled ? "warning" : "neutral"} icon="phone">{scheduled ? `Calling in ${timer}s` : "Not scheduled"}</StatusPill>} />
      <Notice tone="info" title="This is a simulated call">PathRak does not contact another person. Audio uses your device speech service and stays within the browser.</Notice>
      <div className="exit-call-layout">
        <section className="panel call-setup">
          <div className="panel-heading"><span className="panel-icon"><Icon name="phone" /></span><div><h2>Schedule your call</h2><p>Choose a familiar caller name and a delay.</p></div></div>
          <div className="field"><label htmlFor="caller-name">Caller name</label><input id="caller-name" className="input" value={callerName} onChange={(event) => setCallerName(event.target.value)} placeholder="Dad, friend, roommate..." autoComplete="off" /></div>
          <fieldset className="delay-options"><legend>Call delay</legend>{[{ label: "Now", seconds: 0 }, { label: "10 sec", seconds: 10 }, { label: "30 sec", seconds: 30 }, { label: "1 min", seconds: 60 }].map((option) => <button type="button" key={option.seconds} onClick={() => scheduleCall(option.seconds)}>{option.label}</button>)}</fieldset>
          <label className="toggle-row"><input type="checkbox" checked={interactiveReplies} onChange={(event) => setInteractiveReplies(event.target.checked)} /><span><strong>Pause for spoken replies</strong><small>May request microphone access after you answer.</small></span></label>
          {scheduled && <Notice tone="warning" title={`Incoming call in ${timer} seconds`} action={<button className="btn btn-secondary" onClick={endCall}>Cancel</button>}>Keep this page open. The call screen will appear automatically.</Notice>}
        </section>
        <aside className="panel call-preview"><span className="preview-avatar"><Icon name="profile" size={36} /></span><p>Incoming call preview</p><h2>{callerName || "Caller name"}</h2><small>PathRak exit call</small><div><span className="preview-call accept"><Icon name="phone" /></span><span className="preview-call decline"><Icon name="close" /></span></div></aside>
      </div>
    </div>
  );
}
