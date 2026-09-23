"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet";

// Perbaikan default: Leaflet mencari asset icon lewat path relatif yang rusak saat dibundle Webpack,
// jadi kita pakai gambar yang sudah di-bundle Next.js sendiri (offline-safe, tanpa CDN eksternal).
const markerIconInstance = L.icon({
  iconUrl: markerIcon.src,
  iconRetinaUrl: markerIcon2x.src,
  shadowUrl: markerShadow.src,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface LocationPickerProps {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onChange: (lat: number, lng: number) => void;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Menggeser peta secara halus tiap kali lat/lng berubah dari luar (mis. tombol "Gunakan Lokasi Saat Ini")
function RecenterOnChange({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    map.flyTo([latitude, longitude], map.getZoom(), { duration: 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);
  return null;
}

export default function LocationPicker({ latitude, longitude, radiusMeters, onChange }: LocationPickerProps) {
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  const center: [number, number] = hasCoords ? [latitude, longitude] : [-9.6572, 119.4131]; // fallback: Waikabubak

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <MapContainer center={center} zoom={17} scrollWheelZoom style={{ height: "320px", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasCoords && (
          <>
            <Marker
              position={center}
              icon={markerIconInstance}
              draggable
              eventHandlers={{
                dragend(e) {
                  const marker = e.target as L.Marker;
                  const pos = marker.getLatLng();
                  onChange(pos.lat, pos.lng);
                },
              }}
            />
            <Circle
              center={center}
              radius={Number.isFinite(radiusMeters) ? radiusMeters : 0}
              pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.15 }}
            />
          </>
        )}
        <ClickHandler onChange={onChange} />
        <RecenterOnChange latitude={latitude} longitude={longitude} />
      </MapContainer>
    </div>
  );
}
