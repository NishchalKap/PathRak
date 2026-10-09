import { useRef } from "react";
import { TileLayer } from "react-leaflet";

// Documented OSM Standard tile endpoint for development with correct attribution.
const OSM_STANDARD_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

export default function MapTiles({ onError }) {
  const errorCountRef = useRef(0);
  const successCountRef = useRef(0);

  const handleTileError = () => {
    errorCountRef.current += 1;
    // Only alert if multiple tiles repeatedly fail and none are succeeding
    if (errorCountRef.current >= 6 && successCountRef.current === 0) {
      onError?.("Map tiles could not be loaded. Please check your internet connection.");
    }
  };

  const handleTileLoad = () => {
    successCountRef.current += 1;
  };

  return (
    <TileLayer
      url={OSM_STANDARD_URL}
      attribution={OSM_ATTRIBUTION}
      maxZoom={19}
      eventHandlers={{
        tileerror: handleTileError,
        tileload: handleTileLoad,
      }}
    />
  );
}
