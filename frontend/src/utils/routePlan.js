export const getRouteRiskLabel = (averageRisk) => {
  if (!Number.isFinite(averageRisk)) return "Unavailable";
  if (averageRisk <= 5 / 3) return "Low";
  if (averageRisk <= 10 / 3) return "Moderate";
  return "High";
};

export const createRoutePlan = ({ route, destination, provider }) => ({
  destination: destination?.name || "",
  destinationCoordinates: destination
    ? { lat: destination.lat, lng: destination.lng }
    : null,
  coordinates: Array.isArray(route?.coordinates) ? route.coordinates : [],
  distanceM: Number.isFinite(route?.distance_m) ? route.distance_m : null,
  durationSeconds: Number.isFinite(route?.duration_s) ? route.duration_s : null,
  safetyScore: Number.isFinite(route?.score) ? route.score : null,
  averageRisk: Number.isFinite(route?.avg_risk) ? route.avg_risk : null,
  label: route?.label || "",
  provider: provider || null,
});

export const getRoutePlanMinutes = (routePlan) => {
  if (!Number.isFinite(routePlan?.durationSeconds)) return null;
  return Math.max(1, Math.round(routePlan.durationSeconds / 60));
};

const getGeometryFingerprint = (coordinates) => coordinates
  .map(([lat, lng]) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`)
  .join(";");

export const getDistinctRoutes = (routes, limit = 3) => {
  const fingerprints = new Set();
  const distinct = [];

  for (const route of routes || []) {
    if (!Array.isArray(route?.coordinates) || route.coordinates.length < 2) continue;
    const fingerprint = getGeometryFingerprint(route.coordinates);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    distinct.push(route);
    if (distinct.length === limit) break;
  }

  return distinct;
};
