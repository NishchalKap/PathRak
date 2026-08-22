import { useState, useEffect } from "react";
import { registerUser } from "../api";

const USER_INFO_KEY = "pathrak_user_info";

export default function StartPage({ userInfo, setUserInfo, onComplete }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [medical, setMedical] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
        () => {},
      );
    }
  }, []);

  useEffect(() => {
    if (userInfo) {
      setName(userInfo.name || "");
      setContact(userInfo.emergency_contact || "");
      setMedical(userInfo.medical_details || "");
      setSaved(true);
    }
  }, [userInfo]);

  const saveProfile = async () => {
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!contact.trim()) {
      setError("Please enter an emergency contact.");
      return;
    }

    const user_id = userInfo?.user_id || crypto.randomUUID();
    const profile = {
      user_id,
      name: name.trim(),
      emergency_contact: contact.trim(),
      medical_details: medical.trim(),
    };

    localStorage.setItem(USER_INFO_KEY, JSON.stringify(profile));
    localStorage.removeItem("safeher_user_info");
    setUserInfo(profile);
    setError("");
    setSaved(true);

    if (position) {
      try {
        await registerUser(
          profile.user_id,
          profile.name,
          profile.emergency_contact,
          profile.medical_details,
          position[0],
          position[1],
        );
      } catch {
        // ignore registration failures for now
      }
    }

    if (onComplete) onComplete();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Set up your safety profile</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Save your name, emergency contact, and medical details once so SOS can be sent quickly.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
        <div className="bg-white/60 dark:bg-slate-800/60 rounded-2xl p-6 border border-black/10 dark:border-slate-700 space-y-4">
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-2">Full Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              className="w-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-xl px-4 py-3 text-sm border border-black/20 dark:border-slate-600 focus:outline-none focus:border-pink-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-2">Emergency Contact *</label>
            <input
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder="e.g. +91-98765-43210"
              className="w-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-xl px-4 py-3 text-sm border border-black/20 dark:border-slate-600 focus:outline-none focus:border-pink-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400 block mb-2">Medical Details</label>
            <textarea
              value={medical}
              onChange={e => setMedical(e.target.value)}
              placeholder="Allergies, medicines, medical conditions..."
              rows={4}
              className="w-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-xl px-4 py-3 text-sm border border-black/20 dark:border-slate-600 focus:outline-none focus:border-pink-500 resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={saveProfile}
            className="w-full py-4 rounded-xl bg-pink-600 hover:bg-pink-500 text-slate-800 dark:text-white font-semibold text-sm transition"
          >
            {saved ? "Save updates" : "Save profile"}
          </button>
        </div>

        <div className="bg-white/60 dark:bg-slate-800/60 rounded-2xl p-6 border border-black/10 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Your profile will be stored locally on this device and used automatically on the SOS page.</p>

          <div className="space-y-3">
            <div className="rounded-xl bg-white/40 dark:bg-slate-900/50 p-4 border border-black/10 dark:border-slate-700">
              <p className="text-xs uppercase tracking-wide text-slate-500">Saved details</p>
              <p className="mt-3 text-sm text-slate-800 dark:text-white">Name: <span className="text-slate-700 dark:text-slate-300">{name || "Not set yet"}</span></p>
              <p className="text-sm text-slate-800 dark:text-white">Emergency contact: <span className="text-slate-700 dark:text-slate-300">{contact || "Not set yet"}</span></p>
              <p className="text-sm text-slate-800 dark:text-white">Medical details: <span className="text-slate-700 dark:text-slate-300">{medical || "Not set yet"}</span></p>
            </div>

            <div className="rounded-xl bg-emerald-900/20 border border-emerald-500/20 p-4">
              <p className="text-sm font-semibold text-emerald-300">Fast SOS</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Your name will auto-fill on the SOS page and your emergency contact will be included when you send an alert.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
