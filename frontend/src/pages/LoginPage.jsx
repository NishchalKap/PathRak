import { SignInButton, SignUpButton } from "@clerk/react";
import Icon from "../components/Icon";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-product">
        <div className="login-brand"><span><Icon name="shield" size={24} /></span><strong>PathRak</strong></div>
        <div className="login-message"><p className="eyebrow">Personal safety, clearly connected</p><h1>Move with confidence.<br />Stay ready when it matters.</h1><p>Plan safer routes, monitor journeys, and keep emergency support within reach without turning every moment into an alarm.</p></div>
        <div className="login-capabilities"><div><Icon name="route" /><span><strong>Safer routes</strong><small>Compare real road alternatives</small></span></div><div><Icon name="monitor" /><span><strong>Journey monitoring</strong><small>ETA and timed check-ins</small></span></div><div><Icon name="sos" /><span><strong>Honest emergency status</strong><small>Know exactly what was recorded</small></span></div></div>
        <p className="login-footnote">PathRak · Personal safety platform</p>
      </section>
      <section className="login-access">
        <div className="login-access-card"><span className="access-icon"><Icon name="profile" size={24} /></span><p className="eyebrow">Secure account access</p><h2>Your safety space is private.</h2><p>Sign in to continue or create an account. Authentication is securely managed by Clerk.</p><div className="login-actions"><SignUpButton mode="modal"><button className="btn btn-primary">Create account</button></SignUpButton><SignInButton mode="modal"><button className="btn btn-secondary">Sign in</button></SignInButton></div><small>Your emergency profile remains scoped to your signed-in account on this device.</small></div>
      </section>
    </main>
  );
}
