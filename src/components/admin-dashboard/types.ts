// Tipe data untuk tampilan Dashboard Admin (/admin). Hanya dipakai oleh komponen admin-dashboard.

export interface StatusBreakdown {
  /** Pegawai wajib absen (aktif, bukan akun Admin). Penyebut persentase kehadiran. */
  eligible: number;
  onTime: number;
  late: number;
  /** Cuti/izin/sakit yang sudah disetujui dan berlaku hari ini (dan belum absen). */
  onLeave: number;
  notYet: number;
}

export interface TrendDay {
  /** YYYY-MM-DD (WITA) */
  key: string;
  onTime: number;
  late: number;
}

export type ActivityTone = "ok" | "warn" | "bad" | "info";

export interface ActivityItem {
  id: string;
  at: string; // ISO
  name: string;
  text: string;
  tone: ActivityTone;
  badge?: string;
}

export interface AdminDashboardData {
  adminName: string | null;
  isPimpinan: boolean;
  /** true hanya untuk Inspektur (penyetuju cuti/izin/sakit). Admin & Sekretaris = false. */
  canApproveLeave: boolean;
  positionLabel: string | null;
  todayLabel: string;
  totalEmployees: number;
  activeEmployees: number;
  todayInCount: number;
  todayLateCount: number;
  todayRejectedCount: number;
  pendingLeaveCount: number;
  breakdown: StatusBreakdown;
  trend: TrendDay[];
  activities: ActivityItem[];
}
