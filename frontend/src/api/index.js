// Production uses the current Vercel origin. The override is only for split local development.
const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_TIMEOUT_MS = 30000;
let authTokenProvider = null;

export const setAuthTokenProvider = (provider) => {
  authTokenProvider = provider;
};

const api = async (path, method = "GET", body = null) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const token = authTokenProvider ? await authTokenProvider() : null;
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: controller.signal,
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      const error = new Error(payload?.detail || `API error: ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
};

export const getAppConfig = () => api("/api/config");

export const getHeatmap = (center_lat, center_lng, hour, day_of_week) =>
  api("/api/heatmap", "POST", { center_lat, center_lng, hour, day_of_week });

export const getHotspots = () => api("/api/hotspots");

export const predictZoneRisk = (lat, lng, hour, day_of_week, lighting) =>
  api("/api/zone/risk", "POST", { lat, lng, hour, day_of_week, lighting });

export const scoreRoute = (waypoints, hour, day_of_week) =>
  api("/api/route/score", "POST", { waypoints, hour, day_of_week });

export const getLightingMap = (center_lat, center_lng, hour) =>
  api("/api/lighting/map", "POST", { center_lat, center_lng, hour });

export const getLightingSavings = (num_zones = 100) =>
  api(`/api/lighting/savings?num_zones=${num_zones}`);

export const registerUser = (user_id, name, emergency_contact, medical_details, lat, lng) =>
  api("/api/users/register", "POST", { user_id, name, emergency_contact, medical_details, lat, lng });

export const deleteUserProfile = () => api("/api/users/profile", "DELETE");

export const getNearestHelper = (lat, lng, exclude_user_id) =>
  api(`/api/users/nearest-helper?lat=${lat}&lng=${lng}${exclude_user_id ? `&exclude_user_id=${exclude_user_id}` : ""}`);

export const triggerSOS = (lat, lng, user_id, user_name, message, emergency_contact, medical_details) =>
  api("/api/sos/trigger", "POST", { lat, lng, user_id, user_name, message, emergency_contact, medical_details });

export const notifyRisk = (lat, lng, user_id, user_name, emergency_contact) =>
  api("/api/sos/notify-risk", "POST", { lat, lng, user_id, user_name, message: "Risk Warning", emergency_contact, medical_details: "" });

export const notifyBattery = (lat, lng, user_name, emergency_contact, battery_level) =>
  api("/api/sos/notify-battery", "POST", { lat, lng, user_name, emergency_contact, battery_level });

export const getSOSLog = () => api("/api/sos/log");

export const getNearestStation = (lat, lng) =>
  api(`/api/sos/nearest-station?lat=${lat}&lng=${lng}`);
export const findSafeRoute = (waypoints, hour, day_of_week, optimization_objective = "risk") =>
  api("/api/route/find-safe", "POST", { waypoints, hour, day_of_week, optimization_objective });

export const reportDangerPin = (lat, lng, type, description) =>
  api("/api/pins/report", "POST", { lat, lng, type, description });
export const getDangerPins = () => api("/api/pins");

export const startSafeWalk = (user_id, user_name, destination, eta_minutes, lat, lng, emergency_contact, demo_expiry_seconds = null) =>
  api("/api/safewalk/start", "POST", { user_id, user_name, destination, eta_minutes, lat, lng, emergency_contact, demo_expiry_seconds });
export const cancelSafeWalk = (user_id) =>
  api("/api/safewalk/cancel", "POST");
export const extendSafeWalk = (user_id, minutes) =>
  api(`/api/safewalk/extend?minutes=${minutes}`, "POST");
export const expireSafeWalk = (user_id, lat = null, lng = null) => {
  const locationQuery = Number.isFinite(lat) && Number.isFinite(lng) ? `?lat=${lat}&lng=${lng}` : "";
  return api(`/api/safewalk/expire${locationQuery}`, "POST");
};

export const getSafeSpots = (lat, lng, radius = 2000) =>
  api(`/api/safe-spots?lat=${lat}&lng=${lng}&radius=${radius}`);

export const getIncidentHistory = () => api("/api/incidents/history");

export const searchLocation = (query) => api(`/api/geocode?q=${encodeURIComponent(query)}`);

export const runDijkstra = (graph) => api("/api/algorithms/dijkstra", "POST", graph);
export const runBfs = (graph) => api("/api/algorithms/bfs", "POST", graph);
export const runDfs = (graph) => api("/api/algorithms/dfs", "POST", graph);
export const runMst = (algorithm, graph) => api(`/api/network/${algorithm}`, "POST", graph);
export const optimizeResources = (payload) => api("/api/resources/optimize", "POST", payload);
export const runBenchmark = (payload) => api("/api/algorithms/benchmark", "POST", payload);
export const generateSyntheticGraph = (payload) => api("/api/algorithms/synthetic-graph", "POST", payload);
export const runSort = (payload) => api("/api/algorithms/sort", "POST", payload);
export const runBinarySearch = (payload) => api("/api/algorithms/binary-search", "POST", payload);

export const getDijkstraTrace = (payload) => api("/api/algorithms/trace/dijkstra", "POST", payload);
export const getKruskalTrace = (payload) => api("/api/algorithms/trace/kruskal", "POST", payload);
export const getPrimTrace = (payload) => api("/api/algorithms/trace/prim", "POST", payload);
export const getBfsTrace = (payload) => api("/api/algorithms/trace/bfs", "POST", payload);
export const getDfsTrace = (payload) => api("/api/algorithms/trace/dfs", "POST", payload);
export const getSortTrace = (payload) => api("/api/algorithms/trace/sort", "POST", payload);
export const getSearchTrace = (payload) => api("/api/algorithms/trace/search", "POST", payload);
export const runMinMax = (payload) => api("/api/algorithms/min-max", "POST", payload);
export const runFractionalKnapsack = (payload) => api("/api/algorithms/fractional-knapsack", "POST", payload);
export const runLcs = (payload) => api("/api/algorithms/lcs", "POST", payload);
export const runLis = (payload) => api("/api/algorithms/lis", "POST", payload);
export const runMatrixChain = (payload) => api("/api/algorithms/matrix-chain", "POST", payload);
export const runGraphColoring = (payload) => api("/api/algorithms/graph-coloring", "POST", payload);
export const runNQueens = (payload) => api("/api/algorithms/n-queens", "POST", payload);
