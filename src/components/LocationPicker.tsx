"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon, Satellite } from "lucide-react";

interface LocationPickerProps {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onChange: (lat: number, lng: number) => void;
}

type MapMode = "satellite" | "road";

// Titik Kantor Inspektorat Kabupaten Sumba Barat (Google Maps, Plus Code 9C79+88Q)
const FALLBACK_CENTER: L.LatLngTuple = [-9.6366749, 119.4183576];

// Peta gratis dari Esri (ArcGIS) — tanpa API key & tanpa kartu kredit.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ROAD_URL = `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`;
const SATELLITE_URL = `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
const LABELS_URL = `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`;
const ATTRIBUTION =
  "Tiles &copy; Esri &mdash; Sumber: Esri, Maxar, Earthstar Geographics, dan GIS User Community";

const PIN_SVG = `
<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.6 16 41 16 41s15-14.4 15-25.2C31 7.6 24.3 1 16 1z"
        fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
  <circle cx="16" cy="16" r="6" fill="#ffffff"/>
</svg>`;

const pinIcon = () =>
  L.divIcon({
    className: "", // hilangkan style bawaan Leaflet agar tidak ada kotak putih
    html: PIN_SVG,
    iconSize: [32, 42],
    iconAnchor: [16, 41],
  });

export default function LocationPicker({ latitude, longitude, radiusMeters, onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const layersRef = useRef<{ road: L.TileLayer; satellite: L.TileLayer; labels: L.TileLayer } | null>(null);

  // Simpan callback terbaru di ref agar event Leaflet selalu memanggil versi terkini
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [mode, setMode] = useState<MapMode>("satellite");

  // 1) Inisialisasi peta (sekali)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
    const map = L.map(containerRef.current, {
      center: hasCoords ? [latitude, longitude] : FALLBACK_CENTER,
      zoom: 17,
      maxZoom: 20,
    });

    layersRef.current = {
      road: L.tileLayer(ROAD_URL, { attribution: ATTRIBUTION, maxNativeZoom: 19, maxZoom: 20 }),
      satellite: L.tileLayer(SATELLITE_URL, { attribution: ATTRIBUTION, maxNativeZoom: 18, maxZoom: 20 }),
      labels: L.tileLayer(LABELS_URL, { maxNativeZoom: 18, maxZoom: 20, zIndex: 5 }),
    };

    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      layersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Ganti lapisan Jalan / Satelit
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    if (mode === "satellite") {
      map.removeLayer(layers.road);
      layers.satellite.addTo(map);
      layers.labels.addTo(map); // nama jalan & tempat di atas citra satelit
    } else {
      map.removeLayer(layers.satellite);
      map.removeLayer(layers.labels);
      layers.road.addTo(map);
    }
  }, [mode]);

  // 3) Sinkronkan pin + lingkaran radius dengan nilai lat/lng/radius
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const valid = Number.isFinite(latitude) && Number.isFinite(longitude);
    if (!valid) {
      markerRef.current?.remove();
      circleRef.current?.remove();
      markerRef.current = null;
      circleRef.current = null;
      return;
    }

    const pos: L.LatLngTuple = [latitude, longitude];
    const radius = Number.isFinite(radiusMeters) ? Math.max(radiusMeters, 0) : 0;

    if (!markerRef.current) {
      const marker = L.marker(pos, { icon: pinIcon(), draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current(p.lat, p.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(pos);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(pos, {
        radius,
        color: "#3b82f6",
        weight: 2.5,
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(pos);
      circleRef.current.setRadius(radius);
    }

    // Geser peta hanya bila titik keluar dari area pandang (mis. koordinat diketik / tombol "Lokasi Saat Ini")
    if (!map.getBounds().contains(pos)) map.panTo(pos);
  }, [latitude, longitude, radiusMeters]);

  return (
    <div className="relative isolate overflow-hidden rounded-lg border border-slate-200">
      <div ref={containerRef} className="h-[320px] w-full" />

      {/* Pilihan lapisan seperti Google Maps */}
      <div className="absolute right-3 top-3 z-[1000] flex overflow-hidden rounded-lg border border-white/70 bg-white/90 text-xs font-medium shadow-md backdrop-blur">
        <button
          type="button"
          onClick={() => setMode("road")}
          aria-pressed={mode === "road"}
          className={`flex items-center gap-1.5 px-3 py-1.5 transition ${
            mode === "road" ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          <MapIcon className="h-3.5 w-3.5" /> Jalan
        </button>
        <button
          type="button"
          onClick={() => setMode("satellite")}
          aria-pressed={mode === "satellite"}
          className={`flex items-center gap-1.5 px-3 py-1.5 transition ${
            mode === "satellite" ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          <Satellite className="h-3.5 w-3.5" /> Satelit
        </button>
      </div>
    </div>
  );
}
