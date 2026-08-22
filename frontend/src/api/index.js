const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_TIMEOUT_MS = 30000;

const api = async (path, method = "GET", body = null) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
};

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
export const findSafeRoute = (waypoints, hour, day_of_week) =>
  api("/api/route/find-safe", "POST", { waypoints, hour, day_of_week });

export const reportDangerPin = (lat, lng, type, description) =>
  api("/api/pins/report", "POST", { lat, lng, type, description });
export const getDangerPins = () => api("/api/pins");

export const startSafeWalk = (user_id, user_name, destination, eta_minutes, lat, lng, emergency_contact) =>
  api("/api/safewalk/start", "POST", { user_id, user_name, destination, eta_minutes, lat, lng, emergency_contact });
export const cancelSafeWalk = (user_id) =>
  api(`/api/safewalk/cancel?user_id=${user_id}`, "POST");
export const extendSafeWalk = (user_id, minutes) =>
  api(`/api/safewalk/extend?user_id=${user_id}&minutes=${minutes}`, "POST");

export const getSafeSpots = (lat, lng, radius = 2000) =>
  api(`/api/safe-spots?lat=${lat}&lng=${lng}&radius=${radius}`);

export const getIncidentHistory = () => api("/api/incidents/history");

export const searchLocation = (query) => api(`/api/geocode?q=${encodeURIComponent(query)}`);

export const requestOTP = (phone) => api("/api/auth/send-otp", "POST", { phone });
export const verifyOTP = (phone, code) => api("/api/auth/verify-otp", "POST", { phone, code });


