import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Absensi Digital | Inspektorat Sumba Barat",
  description:
    "Sistem Absensi Digital dengan Face Recognition, Geofencing, dan Server Clock — Inspektorat Sumba Barat",
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
