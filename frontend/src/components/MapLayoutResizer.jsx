import { useEffect } from "react";
import { useMap } from "react-leaflet";

export default function MapLayoutResizer() {
  const map = useMap();
  useEffect(() => {
    const resize = () => map.invalidateSize({ animate: false });
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [map]);
  return null;
}
