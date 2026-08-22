import { SignInButton, SignUpButton } from "@clerk/react";

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-rose-50 to-amber-50 dark:from-[#050510] dark:via-[#181026] dark:to-[#0a0a1a] px-4 py-10 font-['Outfit'] transition-colors duration-500">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-pink-400/25 blur-[100px] dark:bg-pink-600/20" />
        <div className="absolute -right-24 bottom-[-12rem] h-[32rem] w-[32rem] rounded-full bg-amber-300/30 blur-[110px] dark:bg-violet-600/20" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(15,23,42,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,.35)_1px,transparent_1px)] [background-size:40px_40px] dark:opacity-[0.06]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-black/10 bg-white/65 shadow-2xl shadow-rose-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-black/25 dark:shadow-black/40 lg:grid-cols-[1.15fr_.85fr]">
          <div className="flex flex-col justify-between gap-12 p-8 sm:p-12 lg:p-16">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-2xl text-white shadow-lg shadow-pink-500/25">🛡️</div>
              <div>
                <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">PathRak</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Predict. Alert. Protect.</p>
              </div>
            </div>

            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-pink-600 dark:text-pink-400">Personal safety, always within reach</p>
              <h1 className="max-w-2xl text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl dark:text-white">
                Move through your city with more confidence.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
                Explore safer routes, monitor journeys, and keep emergency details ready when every second matters.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3 dark:text-slate-300">
              <p className="rounded-2xl border border-black/5 bg-white/50 p-4 dark:border-white/10 dark:bg-white/5">Live safety insights</p>
              <p className="rounded-2xl border border-black/5 bg-white/50 p-4 dark:border-white/10 dark:bg-white/5">Journey monitoring</p>
              <p className="rounded-2xl border border-black/5 bg-white/50 p-4 dark:border-white/10 dark:bg-white/5">Fast SOS support</p>
            </div>
          </div>

          <div className="flex items-center border-t border-black/10 bg-slate-950 p-8 text-white dark:border-white/10 lg:border-l lg:border-t-0 lg:p-12">
            <div className="w-full">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-pink-300">Secure access</p>
              <h2 className="mt-3 text-3xl font-bold">Your safety space is private.</h2>
              <p className="mt-4 leading-7 text-slate-300">Sign in to continue, or create your PathRak account in a few steps.</p>

              <div className="mt-9 space-y-3">
                <SignUpButton mode="modal">
                  <button className="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-pink-500/20 transition hover:-translate-y-0.5 hover:shadow-pink-500/35 focus:outline-none focus:ring-2 focus:ring-pink-300">
                    Create account
                  </button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button className="w-full rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40">
                    Sign in
                  </button>
                </SignInButton>
              </div>

              <p className="mt-6 text-xs leading-5 text-slate-400">Authentication is securely managed by Clerk. Your emergency profile stays scoped to your signed-in account on this device.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
