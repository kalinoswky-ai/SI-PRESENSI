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
  apel_location_id: string | null; // lokasi apel Senin/Rabu yang dipakai (jika ada)
  location_label: string | null; // nama lokasi apel, utk jejak audit di riwayat/laporan
  created_at: string;
  edited_at?: string | null; // terisi bila data dikoreksi Admin
  edit_note?: string | null; // alasan koreksi
  employees?: Pick<Employee, "full_name" | "nip" | "position">;
}

// Lokasi apel pagi Senin (Kantor Bupati, berlaku semua pegawai) & Rabu (per kelompok OPD)
export interface ApelLocation {
  id: string;
  name: string;
  weekday: 1 | 3; // 1 = Senin, 3 = Rabu
  group_name: string | null; // null = berlaku utk semua pegawai (khusus Senin)
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
}

export type LeaveType = "cuti" | "izin" | "sakit";
export type LeaveStatus = "pending" | "approved" | "rejected";

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
  employees?: Pick<Employee, "full_name" | "nip" | "position">;
}

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
};
