import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Absensi Digital | Inspektorat Sumba Barat",
  description:
    "Sistem Absensi Digital dengan Face Recognition, Geofencing, dan Server Clock — Inspektorat Sumba Barat",
  // Ikon layar utama iPhone (Safari memakai apple-touch-icon; tanpa ini yang muncul cuplikan layar).
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Absensi", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
