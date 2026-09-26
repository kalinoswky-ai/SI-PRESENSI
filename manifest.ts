import type { MetadataRoute } from "next";

// Web App Manifest — membuat aplikasi bisa di-"Instal" / "Tambahkan ke layar utama"
// di Android (Chrome) dan iPhone (Safari), tampil layar penuh seperti aplikasi.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Absensi Digital — Inspektorat Sumba Barat",
    short_name: "Absensi",
    description: "Absensi Digital dengan Face Recognition, Geofencing, dan Server Clock",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "id",
    background_color: "#ffffff",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
