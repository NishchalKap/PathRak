import { TileLayer } from "react-leaflet";

// CARTO Basemaps now requires an API key. PathRak uses the documented OSM
// Standard endpoint for low-volume local development, with attribution visible.
const OSM_STANDARD_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

export default function MapTiles({ onError }) {
  return <TileLayer
    url={OSM_STANDARD_URL}
    attribution={OSM_ATTRIBUTION}
    maxZoom={19}
    eventHandlers={{ tileerror: () => onError?.("Map tiles could not be loaded. Check your connection and try again.") }}
  />;
}
