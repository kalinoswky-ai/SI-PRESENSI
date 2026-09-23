export type EmployeeRole = "employee" | "admin";
export type FaceEnrollmentStatus = "none" | "pending" | "approved" | "rejected";

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
  created_at: string;
  employees?: Pick<Employee, "full_name" | "nip" | "position">;
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
