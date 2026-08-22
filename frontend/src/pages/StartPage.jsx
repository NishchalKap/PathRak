import { useEffect, useState } from "react";
import { registerUser } from "../api";
import Icon from "../components/Icon";
import { Notice, PageHeader, StatusPill } from "../components/UI";

export default function StartPage({ userInfo, setUserInfo, onComplete, currentPos, clerkUserId, profileStorageKey, defaultName = "", isOnboarding = false }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [medical, setMedical] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(userInfo?.name || defaultName);
    setContact(userInfo?.emergency_contact || "");
    setMedical(userInfo?.medical_details || "");
  }, [defaultName, userInfo]);

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!name.trim()) return setError("Enter your full name.");
    if (!contact.trim()) return setError("Enter the contact PathRak should include with emergency alerts.");
    if (!clerkUserId || !profileStorageKey) return setError("Your account is still loading. Try again in a moment.");

    const profile = { user_id: clerkUserId, name: name.trim(), emergency_contact: contact.trim(), medical_details: medical.trim() };
    setSaving(true);
    setError("");
    setMessage("");
    localStorage.setItem(profileStorageKey, JSON.stringify(profile));
    setUserInfo(profile);

    if (currentPos) {
      try {
        await registerUser(profile.user_id, profile.name, profile.emergency_contact, profile.medical_details, currentPos[0], currentPos[1]);
      } catch {
        setMessage("Profile saved on this device. The backend is currently unavailable, so nearby-helper registration will retry when location updates.");
      }
    }
    setSaving(false);
    onComplete?.();
  };

  return (
    <div className="page-stack profile-page">
      {!isOnboarding && <PageHeader eyebrow="Account safety" title="Emergency profile" description="Keep the information used by SOS, SafeWalk, Smart Check, and nearby-helper features accurate." actions={<StatusPill tone={userInfo ? "success" : "warning"} icon={userInfo ? "check" : "warning"}>{userInfo ? "Profile ready" : "Setup required"}</StatusPill>} />}
      <div className="profile-layout">
        <form className="panel profile-form" onSubmit={saveProfile} noValidate>
          <div className="panel-heading"><span className="panel-icon"><Icon name="profile" /></span><div><h2>{userInfo ? "Update emergency details" : "Add emergency details"}</h2><p>Required fields are marked. Review them before every important journey.</p></div></div>
          <div className="field"><label htmlFor="profile-name">Full name <span aria-hidden="true">*</span></label><input id="profile-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" autoComplete="name" required /></div>
          <div className="field"><label htmlFor="profile-contact">Emergency contact <span aria-hidden="true">*</span></label><input id="profile-contact" className="input" type="tel" value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Phone number with country code" autoComplete="tel" inputMode="tel" required /><small>PathRak includes this contact with supported alerts. Delivery requires a configured provider.</small></div>
          <div className="field"><label htmlFor="profile-medical">Medical details <span className="optional-label">Optional</span></label><textarea id="profile-medical" className="input" value={medical} onChange={(event) => setMedical(event.target.value)} placeholder="Allergies, medicines, or conditions responders should know" rows="4" /></div>
          {error && <Notice tone="danger" title="Check your profile" role="alert">{error}</Notice>}
          {message && <Notice tone="warning" title="Saved locally">{message}</Notice>}
          <button className="btn btn-primary profile-save" type="submit" disabled={saving}>{saving ? "Saving profile..." : userInfo ? "Save profile changes" : "Complete setup"}</button>
        </form>

        <aside className="profile-context">
          <div className="panel privacy-panel"><span className="context-icon"><Icon name="shield" size={24} /></span><h2>Scoped to your account</h2><p>These details are stored on this device under your signed-in Clerk user ID. Another PathRak account on this browser cannot load them.</p></div>
          <div className="panel profile-usage"><h3>Where this information is used</h3><ul><li><Icon name="sos" size={17} /><span><strong>Emergency alerts</strong><small>Name, contact, and medical details</small></span></li><li><Icon name="walk" size={17} /><span><strong>SafeWalk</strong><small>Journey ownership and contact context</small></span></li><li><Icon name="clock" size={17} /><span><strong>Smart Check</strong><small>Missed check-in alert context</small></span></li></ul></div>
        </aside>
      </div>
    </div>
  );
}
