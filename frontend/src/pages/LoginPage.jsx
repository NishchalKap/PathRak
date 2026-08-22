import { useState } from "react";
import { requestOTP, verifyOTP } from "../api";

export default function LoginPage({ onLoginSuccess }) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (phone.length < 10) {
      setError("Please enter a valid phone number.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await requestOTP(phone);
      setStep(2);
    } catch (err) {
      setError("Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (otp.length !== 4) {
      setError("Please enter the 4-digit OTP.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await verifyOTP(phone, otp);
      if (res.success) {
        onLoginSuccess();
      } else {
        setError("Invalid OTP.");
      }
    } catch (err) {
      setError("Invalid or expired OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pink-50 to-purple-50 dark:from-[#050510] dark:via-indigo-950 dark:to-[#0a0a1a] flex flex-col items-center justify-center p-4 font-['Outfit'] transition-colors duration-500">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none flex justify-center items-center">
        <div className="w-[800px] h-[800px] bg-pink-400/30 dark:bg-pink-600/20 rounded-full blur-[120px] opacity-60 translate-y-[-20%]" />
        <div className="absolute w-[600px] h-[600px] bg-violet-400/30 dark:bg-violet-600/20 rounded-full blur-[100px] opacity-50 translate-x-[20%] translate-y-[20%]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)] dark:drop-shadow-[0_0_15px_rgba(236,72,153,0.8)] animate-pulse-slow">🛡️</div>
          <h1 className="text-4xl font-bold text-slate-800 dark:text-white tracking-tight">PathRak</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 tracking-widest uppercase text-xs font-semibold">Predict. Alert. Protect.</p>
        </div>

        <div className="glass-panel rounded-3xl p-8">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6 tracking-wide">
            {step === 1 ? "Welcome Back" : "Verify Phone Number"}
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-500/30 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">📞</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 9876543210"
                      className="w-full bg-slate-100/50 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-800 dark:text-white rounded-xl py-3.5 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-pink-400/50 dark:focus:ring-pink-500/50 focus:bg-white dark:focus:bg-white/10 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
                    />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full glass-button text-white font-bold tracking-wide py-3.5 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Sending OTP..." : "Get OTP"}
              </button>
              <p className="text-center text-xs text-slate-500 mt-4">
                For demo purposes, a mock OTP of <span className="font-mono text-pink-500 dark:text-pink-400">1432</span> will be generated.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  We've sent a 4-digit verification code to <span className="text-slate-900 dark:text-white">{phone}</span>.
                </p>
                <div className="mb-8">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 text-center">
                  Enter 4-digit code
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="1432"
                  className="w-full bg-slate-100/50 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-800 dark:text-white rounded-xl py-4 px-4 text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-pink-400/50 dark:focus:ring-pink-500/50 focus:bg-white dark:focus:bg-white/10 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                />
              </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full glass-button text-white font-bold tracking-wide py-3.5 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Verifying..." : "Verify & Login"}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-slate-400 text-sm hover:text-white transition-colors py-2"
              >
                Use a different number
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
