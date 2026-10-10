import { useEffect, useState } from "react";
import { UserButton, useAuth, useUser } from "@clerk/react";
import Icon from "./components/Icon";
import HomePage from "./pages/HomePage";
import HeatmapPage from "./pages/HeatmapPage";
import RoutePage from "./pages/RoutePage";
import LightingPage from "./pages/LightingPage";
import SOSPage from "./pages/SOSPage";
import StartPage from "./pages/StartPage";
import SafeWalkPage from "./pages/SafeWalkPage";
import SmartCheckPage from "./pages/SmartCheckPage";
import FakeCallPage from "./pages/FakeCallPage";
import SafeMonitoringPage from "./pages/SafeMonitoringPage";
import LoginPage from "./pages/LoginPage";
import NetworkDesignerPage from "./pages/NetworkDesignerPage";
import ResourceOptimizerPage from "./pages/ResourceOptimizerPage";
import AlgorithmAnalyzerPage from "./pages/AlgorithmAnalyzerPage";
import { getAppConfig, registerUser, setAuthTokenProvider } from "./api";
import { useSafetyMonitor } from "./hooks/useSafetyMonitor";

const PRIMARY_NAV = [
  { id: "home", label: "Home", icon: "home" },
  { id: "walk", label: "SafeWalk", icon: "walk" },
  { id: "route", label: "Safe Route", icon: "route" },
  { id: "monitor", label: "Monitor", icon: "monitor" },
  { id: "sos", label: "SOS", icon: "sos", emergency: true },
];

const SECONDARY_NAV = [
  { id: "smartcheck", label: "Smart Check", icon: "clock" },
  { id: "heatmap", label: "Safety Map", icon: "map" },
  { id: "lighting", label: "Street Lighting", icon: "light" },
  { id: "fakecall", label: "Exit Call", icon: "phone" },
  { id: "network", label: "Network Design", icon: "network" },
  { id: "resources", label: "Budget Optimizer", icon: "budget" },
  { id: "analyzer", label: "Algorithm Analyzer", icon: "chart" },
  { id: "profile", label: "Safety Profile", icon: "profile" },
];

const PAGE_COMPONENTS = {
  home: HomePage,
  walk: SafeWalkPage,
  route: RoutePage,
  monitor: SafeMonitoringPage,
  sos: SOSPage,
  smartcheck: SmartCheckPage,
  heatmap: HeatmapPage,
  lighting: LightingPage,
  fakecall: FakeCallPage,
  network: NetworkDesignerPage,
  resources: ResourceOptimizerPage,
  analyzer: AlgorithmAnalyzerPage,
  profile: StartPage,
};

export default function App() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [demoAuth, setDemoAuth] = useState(() => {
    return localStorage.getItem("pathrak_demo_auth") === "true";
  });
  const effectiveUser = user || (demoAuth ? {
    id: "demo_user_bengaluru",
    fullName: "PathRak Demo User",
    firstName: "Demo",
    primaryEmailAddress: { emailAddress: "demo@pathrak.org" },
  } : null);
  const effectiveSignedIn = isSignedIn || Boolean(demoAuth);
  const [page, setPage] = useState("home");
  const [userInfo, setUserInfo] = useState(null);
  const [livePos, setLivePos] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [appConfig, setAppConfig] = useState(null);
  const [locationMode, setLocationMode] = useState("live");
  const [routePlan, setRoutePlan] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const profileStorageKey = effectiveUser?.id ? `pathrak_user_info:${effectiveUser.id}` : null;
  const demoPos = appConfig?.demo ? [appConfig.demo.start.lat, appConfig.demo.start.lng] : null;
  const currentPos = locationMode === "demo" ? demoPos : livePos;
  const monitor = useSafetyMonitor(userInfo, currentPos);

  useEffect(() => {
    setAuthTokenProvider(async () => {
      if (demoAuth && !isSignedIn) {
        return "demo-token-bengaluru";
      }
      return getToken();
    });
    getAppConfig()
      .then((cfg) => {
        setAppConfig(cfg);
        if (cfg?.demo_mode && !livePos) {
          setLocationMode("demo");
        }
      })
      .catch(() => setAppConfig(null));
    return () => setAuthTokenProvider(null);
  }, [getToken, demoAuth, isSignedIn, livePos]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.removeItem("pathrak_auth_token");
    localStorage.removeItem("safeher_auth_token");

    if (!isLoaded || !effectiveSignedIn || !profileStorageKey) {
      setUserInfo(null);
      return;
    }

    const stored = localStorage.getItem(profileStorageKey);
    if (!stored) {
      if (demoAuth) {
        const demoProfile = {
          user_id: "demo_user_bengaluru",
          name: "PathRak Demo User",
          emergency_contact: "+91 98765 43210",
          medical_details: "Demo mode profile (Bengaluru)",
        };
        localStorage.setItem(profileStorageKey, JSON.stringify(demoProfile));
        setUserInfo(demoProfile);
        return;
      }
      setUserInfo(null);
      return;
    }

    try {
      const profile = { ...JSON.parse(stored), user_id: effectiveUser.id };
      localStorage.setItem(profileStorageKey, JSON.stringify(profile));
      setUserInfo(profile);
    } catch {
      localStorage.removeItem(profileStorageKey);
      setUserInfo(null);
    }
  }, [isLoaded, effectiveSignedIn, profileStorageKey, effectiveUser?.id, demoAuth]);

  useEffect(() => {
    if (!isSignedIn) {
      setLivePos(null);
      setLocationError("");
      return undefined;
    }
    if (!navigator.geolocation) {
      setLocationError("This browser does not support location services.");
      return undefined;
    }
    if (!window.isSecureContext) {
      setLocationError("Location requires HTTPS or localhost. You can still enter route locations manually.");
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setLivePos([coords.latitude, coords.longitude]);
        setLocationError("");
      },
      (error) => {
        const messages = {
          1: "Location permission is blocked. Enable it in browser settings.",
          2: "Your device could not provide a live location.",
          3: "The location request timed out. Try again in an open area.",
        };
        setLocationError(messages[error.code] || "Live location is unavailable.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !userInfo || !currentPos) return;
    registerUser(userInfo.user_id, userInfo.name, userInfo.emergency_contact, userInfo.medical_details, currentPos[0], currentPos[1]).catch(() => {});
  }, [isSignedIn, userInfo, currentPos]);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const navigate = (nextPage) => {
    setPage(nextPage);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  if (!isLoaded) {
    return <div className="auth-loading" role="status"><span className="loading-mark"><Icon name="shield" size={28} /></span><strong>Preparing your safety space</strong><p>Securing your PathRak session...</p></div>;
  }

  if (!effectiveSignedIn) {
    return (
      <LoginPage
        onDemoLogin={() => {
          localStorage.setItem("pathrak_demo_auth", "true");
          setDemoAuth(true);
        }}
      />
    );
  }

  const hasCompletedProfile = Boolean(userInfo?.name && userInfo?.emergency_contact);
  const sharedProps = {
    userInfo,
    setUserInfo,
    currentPos,
    locationError,
    monitor,
    theme,
    clerkUserId: effectiveUser?.id,
    profileStorageKey,
    defaultName: effectiveUser?.fullName || effectiveUser?.firstName || "",
    onNavigate: navigate,
    onComplete: () => navigate("home"),
    onEditProfile: () => navigate("profile"),
    appConfig,
    locationMode,
    routePlan,
    setRoutePlan,
    onStartSafeWalk: (plan) => { setRoutePlan(plan); navigate("walk"); },
  };

  if (!hasCompletedProfile) {
    return (
      <div className="onboarding-shell">
        <header className="onboarding-bar">
          <Brand />
          {user ? (
            <UserButton afterSignOutUrl="/" />
          ) : (
            <button
              type="button"
              className="btn btn-xs btn-secondary"
              onClick={() => {
                localStorage.removeItem("pathrak_demo_auth");
                setDemoAuth(false);
              }}
            >
              Sign out
            </button>
          )}
        </header>
        <main className="onboarding-main">
          <div className="onboarding-intro"><p className="eyebrow">One essential step</p><h1>Prepare your emergency profile.</h1><p>PathRak uses these details only when a safety feature needs them. You can update them at any time.</p></div>
          <StartPage {...sharedProps} isOnboarding />
        </main>
      </div>
    );
  }

  const PageComponent = PAGE_COMPONENTS[page] || HomePage;
  const allNav = [...PRIMARY_NAV, ...SECONDARY_NAV];

  return (
    <div className="app-shell">
      <aside className={`side-rail ${mobileMenuOpen ? "is-open" : ""}`} aria-label="Main navigation">
        <div className="rail-header"><Brand /><button className="icon-button mobile-only" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation"><Icon name="close" /></button></div>
        <nav className="rail-nav">
          <p className="nav-label">Safety</p>
          {PRIMARY_NAV.map((item) => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => navigate(item.id)} />)}
          <p className="nav-label nav-label-spaced">Tools</p>
          {SECONDARY_NAV.map((item) => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => navigate(item.id)} />)}
        </nav>
        <div className="rail-footer">
          {deferredPrompt && <button className="install-button" onClick={installApp}><Icon name="shield" size={18} />{installed ? "App installed" : "Install PathRak"}</button>}
          <div className="rail-account">
            {user ? (
              <UserButton afterSignOutUrl="/" />
            ) : (
              <button
                type="button"
                className="icon-button"
                title="Exit demo session"
                onClick={() => {
                  localStorage.removeItem("pathrak_demo_auth");
                  setDemoAuth(false);
                }}
              >
                <Icon name="profile" size={18} />
              </button>
            )}
            <span>
              <strong>{effectiveUser?.fullName || userInfo?.name || "Demo User"}</strong>
              <small>{effectiveUser?.primaryEmailAddress?.emailAddress || "Demo session"}</small>
            </span>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && <button className="drawer-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}

      <div className="app-main">
        {appConfig?.demo_mode && <div className="demo-environment" role="status"><span><strong>Demo environment</strong><small>{locationMode === "demo" ? `Simulated · ${appConfig.demo.city}` : "Live GPS remains active"}</small></span><button className="text-button" onClick={() => setLocationMode(locationMode === "demo" ? "live" : "demo")}>{locationMode === "demo" ? "Use live GPS" : `Use ${appConfig.demo.city} demo location`}</button></div>}
        <header className="top-bar">
          <button className="icon-button mobile-only" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <div
            className="top-location"
            style={{ cursor: appConfig?.demo ? "pointer" : "default" }}
            onClick={() => {
              if (appConfig?.demo) {
                setLocationMode(locationMode === "demo" ? "live" : "demo");
              }
            }}
            title={appConfig?.demo ? `Click to switch between Live GPS and ${appConfig.demo.city} Demo Location` : undefined}
          >
            <span className={currentPos ? "signal-ready" : "signal-warning"} />
            <span>
              {currentPos
                ? locationMode === "demo"
                  ? `Demo location active (${appConfig?.demo?.city || "Bengaluru"})`
                  : "Live GPS active"
                : locationError
                ? `${locationError} · Click for demo`
                : "Location initializing..."}
            </span>
          </div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
            {user ? (
              <UserButton afterSignOutUrl="/" />
            ) : (
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={() => {
                  localStorage.removeItem("pathrak_demo_auth");
                  setDemoAuth(false);
                }}
              >
                Sign out
              </button>
            )}
          </div>
        </header>

        <main className="page-canvas"><PageComponent {...sharedProps} /></main>

        <nav className="bottom-nav" aria-label="Primary mobile navigation">
          {PRIMARY_NAV.map((item) => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => navigate(item.id)} mobile />)}
        </nav>
      </div>
    </div>
  );
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><Icon name="shield" size={22} /></span><span><strong>PathRak</strong><small>Personal safety</small></span></div>;
}

function NavButton({ item, active, onClick, mobile = false }) {
  return (
    <button className={`${mobile ? "bottom-nav-item" : "nav-item"} ${active ? "is-active" : ""} ${item.emergency ? "is-emergency" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      <Icon name={item.icon} size={mobile ? 21 : 19} />
      <span>{item.label}</span>
    </button>
  );
}
