import { useState, useEffect } from "react";
import { UserButton, useUser } from "@clerk/react";
import HeatmapPage  from "./pages/HeatmapPage";
import RoutePage    from "./pages/RoutePage";
import LightingPage from "./pages/LightingPage";
import SOSPage      from "./pages/SOSPage";
import StartPage    from "./pages/StartPage";
import SmartCheckPage from "./pages/SmartCheckPage";
import FakeCallPage from "./pages/FakeCallPage";
import SafeMonitoringPage from "./pages/SafeMonitoringPage";
import LoginPage    from "./pages/LoginPage";
import { registerUser } from "./api";
import { useSafetyMonitor } from "./hooks/useSafetyMonitor";

const NAV = [
  { id: "start",      label: "Profile Setup",      icon: "👤",  desc: "Save your SOS info" },
  { id: "heatmap",    label: "Safety Heatmap",    icon: "🗺️",  desc: "AI-predicted risk zones" },
  { id: "route",      label: "Safe Route Scorer",  icon: "🛣️",  desc: "Score your route" },
  { id: "safewalk",   label: "Safe Monitoring",    icon: "🛡️", desc: "SafeWalk & Smart Check" },
  { id: "lighting",   label: "Smart Lighting",     icon: "💡",  desc: "Working & broken status" },
  { id: "fakecall",   label: "Fake Call",          icon: "📞",  desc: "Simulate an incoming call" },
  { id: "sos",        label: "SOS Alert",          icon: "🆘",  desc: "Record emergency alert" },
];

export default function App() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [page, setPage] = useState("start");
  const [userInfo, setUserInfo] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const profileStorageKey = user?.id ? `pathrak_user_info:${user.id}` : null;

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  };

  const monitor = useSafetyMonitor(userInfo, currentPos);
  const currentPage = NAV.find((item) => item.id === page) ?? NAV[0];

  useEffect(() => {
    localStorage.removeItem("pathrak_auth_token");
    localStorage.removeItem("safeher_auth_token");

    if (!isLoaded || !isSignedIn || !profileStorageKey) {
      setUserInfo(null);
      setPage("start");
      return;
    }

    const stored = localStorage.getItem(profileStorageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        parsed.user_id = user.id;
        localStorage.setItem(profileStorageKey, JSON.stringify(parsed));
        setUserInfo(parsed);
        setPage("heatmap");
      } catch {
        localStorage.removeItem(profileStorageKey);
        setUserInfo(null);
        setPage("start");
      }
    } else {
      setUserInfo(null);
      setPage("start");
    }
  }, [isLoaded, isSignedIn, profileStorageKey, user?.id]);

  useEffect(() => {
    if (!isSignedIn) {
      setCurrentPos(null);
      setLocationError("");
      return undefined;
    }

    if (!navigator.geolocation) {
      setLocationError("This browser does not support geolocation.");
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos([pos.coords.latitude, pos.coords.longitude]);
        setLocationError("");
      },
      (error) => {
        const messages = {
          1: "Location permission denied. Enable it in browser settings to use safety features.",
          2: "Live GPS is unavailable. Check that device location is enabled.",
          3: "Live GPS request timed out. Please try again.",
        };
        setLocationError(messages[error.code] || "Live GPS is unavailable.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSignedIn]);

  useEffect(() => {
    if (isSignedIn && userInfo && currentPos) {
      registerUser(
        userInfo.user_id,
        userInfo.name,
        userInfo.emergency_contact,
        userInfo.medical_details,
        currentPos[0],
        currentPos[1],
      ).catch(() => {});
    }
  }, [isSignedIn, userInfo, currentPos]);

  useEffect(() => {
    const promptHandler = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const installedHandler = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", promptHandler);
    window.addEventListener("appinstalled", installedHandler);
    
    // Request notification permission for High-Risk Zone alerts
    if (isSignedIn && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", promptHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
      setSidebarCollapsed(false);
    }
  }, [page]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const updateSidebarState = () => {
        setSidebarOpen(window.innerWidth >= 1024);
        if (window.innerWidth < 1024) {
          setSidebarCollapsed(false);
        }
      };

      updateSidebarState();
      window.addEventListener("resize", updateSidebarState);
      return () => window.removeEventListener("resize", updateSidebarState);
    }
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleNavigate = (id) => {
    setPage(id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const sidebarWidthClass = sidebarCollapsed ? "lg:w-20" : "lg:w-72";
  const mainMarginClass = sidebarCollapsed ? "lg:ml-20" : "lg:ml-72";

  const PageComponent = {
    start:      StartPage,
    heatmap:    HeatmapPage,
    route:      RoutePage,
    safewalk:   SafeMonitoringPage,
    lighting:   LightingPage,
    fakecall:   FakeCallPage,
    sos:        SOSPage,
  }[page] || StartPage;

  if (!isLoaded) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 font-['Outfit'] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-pink-400" />
          <p className="text-sm text-slate-300">Securing your PathRak session...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <LoginPage />;
  }

  const hasCompletedProfile = userInfo && userInfo.name && userInfo.emergency_contact;

  if (!hasCompletedProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-pink-50 to-purple-50 dark:from-[#050510] dark:via-indigo-950 dark:to-[#0a0a1a] p-4 lg:p-8 flex items-center justify-center transition-colors duration-500">
        <div className="w-full max-w-5xl glass-panel rounded-3xl p-6 lg:p-10 relative overflow-hidden">
          {/* Subtle glowing orbs behind the glass panel */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-pink-400/30 dark:bg-pink-600/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-400/30 dark:bg-violet-600/20 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />
          
          <div className="relative z-10">
            <StartPage 
              userInfo={userInfo} 
              setUserInfo={(info) => {
                setUserInfo(info);
                setPage("heatmap");
              }} 
              onComplete={() => setPage("heatmap")}
              clerkUserId={user.id}
              profileStorageKey={profileStorageKey}
              defaultName={user.fullName || user.firstName || ""}
              theme={theme}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-[#050510] dark:via-[#0a0a1a] dark:to-[#0f0b1a] text-slate-800 dark:text-white selection:bg-pink-500/30 font-['Outfit'] transition-colors duration-500`}>
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 border-b border-black/5 dark:border-white/10 bg-white/60 dark:bg-[#050510]/60 px-4 py-3 shadow-lg backdrop-blur-xl lg:hidden">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-full bg-gradient-to-r from-pink-500 to-violet-500 dark:from-pink-600 dark:to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 transition active:scale-95"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? "Close" : "Menu"}
        </button>
        <div className="text-sm font-semibold uppercase tracking-wide text-white">PathRak</div>
        <UserButton afterSignOutUrl="/" />
      </header>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 transform glass-panel border-l-0 border-t-0 border-b-0 transition-all duration-300 ease-in-out w-72 flex flex-col ${sidebarWidthClass} ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:fixed lg:top-0 lg:left-0 lg:bottom-0 lg:h-screen`}>
        <div className="flex items-center justify-between gap-3 border-b border-black/5 dark:border-white/10 px-5 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-2xl drop-shadow-[0_0_8px_rgba(236,72,153,0.5)] dark:drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]">🛡️</div>
            {!sidebarCollapsed && (
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">PathRak</h1>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold mt-0.5">Predict. Alert. Protect.</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="rounded-full bg-slate-200/50 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3 py-2 text-sm font-semibold text-slate-500 dark:text-slate-300 transition hover:bg-slate-300/50 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? "➡️" : "⬅️"}
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden rounded-full bg-slate-200/50 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3 py-2 text-sm font-semibold text-slate-500 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              title={item.label}
              className={`group flex w-full ${sidebarCollapsed ? "justify-center" : "items-center"} gap-4 rounded-2xl px-4 py-3.5 text-left transition-all duration-300 ${
                page === item.id
                  ? "bg-gradient-to-r from-pink-500/10 to-violet-500/10 dark:from-pink-500/20 dark:to-violet-500/20 text-slate-800 dark:text-white ring-1 ring-pink-400/50 dark:ring-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.1)] dark:shadow-[0_0_15px_rgba(236,72,153,0.15)]"
                  : "text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              <span className={`text-xl transition-transform duration-300 ${page === item.id ? "scale-110 drop-shadow-[0_0_5px_rgba(236,72,153,0.3)] dark:drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]" : "group-hover:scale-110"}`}>{item.icon}</span>
              {!sidebarCollapsed && (
                <div>
                  <p className={`text-sm font-semibold tracking-wide ${page === item.id ? "text-slate-800 dark:text-white" : "text-slate-600 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-white"}`}>{item.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              )}
            </button>
          ))}
        </nav>

        <div className={`border-t border-black/5 dark:border-white/10 shrink-0 ${sidebarCollapsed ? "px-2 py-4" : "px-5 py-6"} bg-slate-100/50 dark:bg-black/20`}>
          <div className="space-y-4">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-200/80 dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-all"
            >
              {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
            </button>

            <button
              onClick={promptInstall}
              className="w-full glass-button rounded-xl px-4 py-3.5 text-sm font-bold text-white"
            >
              {installed ? "✓ Installed" : "⬇️ Install app"}
            </button>

          </div>
        </div>
      </aside>

      <header className="hidden lg:flex fixed inset-x-0 top-0 z-50 items-center justify-between border-b border-black/5 dark:border-white/5 bg-white/60 dark:bg-[#050510]/40 px-8 py-4 shadow-xl backdrop-blur-xl pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="text-2xl drop-shadow-[0_0_10px_rgba(236,72,153,0.5)] dark:drop-shadow-[0_0_10px_rgba(236,72,153,0.8)] animate-pulse-slow">🛡️</div>
          <div>
            <div className="text-sm font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500 dark:from-pink-400 dark:to-violet-400">PathRak</div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 dark:text-slate-400 mt-0.5">Predict. Alert. Protect.</div>
          </div>
        </div>
        <div className="flex items-center gap-4 pointer-events-auto">
          {userInfo?.name && (
            <div className="flex items-center gap-3 bg-slate-100/80 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-full px-4 py-1.5 backdrop-blur-md">
              <span className="text-xl">👩🏽‍💻</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-white">{userInfo.name}</span>
            </div>
          )}
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className={`relative min-h-screen overflow-x-hidden ${mainMarginClass} pt-16 lg:pt-24`}>
        {/* Main background glow effect */}
        <div className="fixed top-[20%] left-[40%] w-[800px] h-[800px] bg-pink-300/30 dark:bg-pink-600/10 rounded-full blur-[150px] pointer-events-none opacity-50" />
        <div className="fixed top-[50%] left-[60%] w-[600px] h-[600px] bg-violet-300/30 dark:bg-violet-600/10 rounded-full blur-[120px] pointer-events-none opacity-40" />
        
        <div className="relative z-10 p-4 lg:p-8">
          <PageComponent 
            userInfo={userInfo} 
            setUserInfo={setUserInfo}
            currentPos={currentPos}
            locationError={locationError}
            onComplete={() => setPage("heatmap")}
            onEditProfile={() => setPage("start")}
            monitor={monitor}
            clerkUserId={user.id}
            profileStorageKey={profileStorageKey}
            defaultName={user.fullName || user.firstName || ""}
          />
        </div>
        <div className="h-16 lg:hidden" />
      </main>
    </div>
  );
}
