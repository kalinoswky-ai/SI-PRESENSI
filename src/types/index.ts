export type EmployeeRole = "employee" | "admin" | "pimpinan";
export type FaceEnrollmentStatus = "none" | "pending" | "approved" | "rejected";

// Label tampilan untuk tiap role. "pimpinan" = akses lihat statistik/rekap
// kehadiran seluruh pegawai (mis. Inspektur, Sekretaris Inspektorat) — tanpa
// bisa menambah/mengedit/menghapus data apa pun.
export const ROLE_LABEL: Record<EmployeeRole, string> = {
  employee: "Pegawai",
  pimpinan: "Pimpinan",
  admin: "Admin",
};

export interface Employee {
  id: string;
  nip: string | null;
  full_name: string;
  position: string | null;
  email: string;
  phone: string | null;
  role: EmployeeRole;
  face_descriptor: number[] | null;
  photo_url: string | null;
  face_enrollment_status: FaceEnrollmentStatus;
  pending_face_descriptor: number[] | null;
  pending_photo_url: string | null;
  face_rejection_reason: string | null;
  apel_group: string | null; // kelompok perangkat daerah/OPD utk menentukan lokasi apel Rabu
  is_active: boolean;
  must_change_password?: boolean; // true = wajib ganti password saat login pertama (akun hasil import Excel)
  created_at: string;
  updated_at: string;
}

export type WaProvider = "fonnte" | "wablas" | "other";
export type ReportSchedule = "daily" | "weekly" | "monthly";

export interface Office {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  work_start: string; // "07:00"
  work_end: string; // "14:30"
  friday_hybrid: boolean;
  updated_at: string;

  // Notifikasi keterlambatan
  wa_notify_enabled: boolean;
  wa_provider: WaProvider;
  wa_api_token: string | null;
  wa_admin_numbers: string | null; // dipisahkan koma, format 62xxxxxxxxxx
  wa_notify_employee: boolean;

  telegram_notify_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;

  // Integrasi laporan otomatis BKPSDM
  bkpsdm_report_enabled: boolean;
  bkpsdm_report_email: string | null;
  bkpsdm_webhook_url: string | null;
  bkpsdm_report_schedule: ReportSchedule;
  bkpsdm_last_sent_at: string | null;
}

export type AttendanceType = "in" | "out";
export type AttendanceStatus = "valid" | "rejected";
export type WorkMode = "wfo" | "wfh";

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  type: AttendanceType;
  server_time: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  within_geofence: boolean;
  face_match: boolean;
  face_distance: number | null;
  selfie_url: string | null;
  status: AttendanceStatus;
  reject_reason: string | null;
  is_late: boolean;
  work_mode: WorkMode; // 'wfh' hanya mungkin pada hari Jumat (kebijakan hybrid)
  apel_location_id: string | null; // lokasi apel (mingguan Senin/Rabu atau bulanan) yang dipakai (jika ada)
  location_label: string | null; // nama lokasi apel, utk jejak audit di riwayat/laporan
  created_at: string;
  edited_at?: string | null; // terisi bila data dikoreksi Admin
  edit_note?: string | null; // alasan koreksi
  employees?: Pick<Employee, "full_name" | "nip" | "position">;
}

// Lokasi apel pagi Senin (Kantor Bupati, berlaku semua pegawai) & Rabu (per kelompok OPD),
// serta apel BULANAN pada tanggal tetap (mis. tanggal 17 — Apel Kesadaran Nasional, semua pegawai).
export interface ApelLocation {
  id: string;
  name: string;
  weekday: 1 | 3 | null; // 1 = Senin, 3 = Rabu; null bila jadwal bulanan (lihat day_of_month)
  day_of_month: number | null; // 1-31; terisi utk apel bulanan pada tanggal tetap tiap bulan, selain weekday
  group_name: string | null; // null = berlaku utk semua pegawai (khusus Senin & apel bulanan)
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  cancelled_date: string | null; // "YYYY-MM-DD" — bila diisi & sama dgn tanggal hari ini (WITA),
  // apel di lokasi ini dianggap DITIADAKAN pada tanggal tsb saja (sekali pakai, bukan permanen);
  // presensi masuk pada hari itu kembali wajib di radius kantor. is_active tetap true (utk jadwal berikutnya).
  created_at: string;
}

// "dinas_dalam" = Perjalanan Dinas Dalam Daerah, "dinas_luar" = Perjalanan Dinas Luar Daerah.
// Keduanya memakai tabel & alur yang sama dengan Cuti/Izin/Sakit (pengajuan → persetujuan
// Inspektur → otomatis membebaskan pegawai dari absensi masuk/pulang pada tanggal terkait).
export type LeaveType = "cuti" | "izin" | "sakit" | "dinas_dalam" | "dinas_luar";
export type LeaveStatus = "pending" | "approved" | "rejected";

/** Jenis yang tergolong perjalanan dinas (dipakai utk menampilkan field tujuan/no. SPT). */
export const PERJADIN_TYPES: LeaveType[] = ["dinas_dalam", "dinas_luar"];
export function isPerjadinType(type: LeaveType): boolean {
  return PERJADIN_TYPES.includes(type);
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string; // "YYYY-MM-DD"
  end_date: string;
  reason: string;
  attachment_url: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  // Khusus type = dinas_dalam / dinas_luar (null utk cuti/izin/sakit).
  destination?: string | null; // tujuan/lokasi penugasan
  letter_number?: string | null; // nomor Surat Perintah Tugas (SPT), opsional
  employees?: Pick<Employee, "full_name" | "nip" | "position">;
}

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  dinas_dalam: "Perjalanan Dinas Dalam Daerah",
  dinas_luar: "Perjalanan Dinas Luar Daerah",
};

/** Label ringkas — dipakai di tempat sempit (legenda grafik, badge, dsb). */
export const LEAVE_TYPE_SHORT_LABEL: Record<LeaveType, string> = {
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  dinas_dalam: "Dinas Dalam Daerah",
  dinas_luar: "Dinas Luar Daerah",
};

// Pengajuan lembur pegawai. Status memakai LeaveStatus yang sama (pending/approved/rejected)
// dan disetujui oleh penyetuju yang sama dengan cuti/izin (Inspektur).
export interface OvertimeRequest {
  id: string;
  employee_id: string;
  work_date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM:SS" (WITA)
  end_time: string; // "HH:MM:SS" (WITA)
  duration_minutes: number; // dihitung otomatis oleh database
  description: string;
  attachment_url: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}
