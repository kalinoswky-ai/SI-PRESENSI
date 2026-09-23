/** Jarak antar dua koordinat GPS dalam meter (formula Haversine). */
export function distanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // radius bumi dalam meter
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Euclidean distance antar dua face descriptor (128-d) dari face-api.js. */
export function faceDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/** Threshold jarak wajah face-api.js — di bawah nilai ini dianggap wajah yang sama. */
export const FACE_MATCH_THRESHOLD = 0.5;

/** Format waktu ke zona WITA (Asia/Makassar, UTC+8). */
export function formatWita(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date) + " WITA";
}

/**
 * Menentukan apakah waktu clock-in dianggap terlambat, berdasarkan jam kerja
 * kantor (work_start) dan aturan Jumat hybrid.
 */
export function isLateClockIn(
  serverTime: Date,
  workStartHHMM: string,
  fridayHybrid: boolean
): boolean {
  const wita = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Makassar",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(serverTime);

  const weekday = wita.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(wita.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(wita.find((p) => p.type === "minute")?.value ?? "0");

  if (fridayHybrid && weekday === "Fri") return false; // Jumat: kebijakan hybrid, tidak dihitung terlambat

  const [wsH, wsM] = workStartHHMM.split(":").map(Number);
  const minutesNow = hour * 60 + minute;
  const minutesStart = wsH * 60 + wsM;

  return minutesNow > minutesStart;
}
