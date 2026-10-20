export type EmployeeRole = "employee" | "admin" | "pimpinan";
export type FaceEnrollmentStatus = "none" | "pending" | "approved" | "rejected";
// Sub-jabatan WAJIB diisi untuk role 'pimpinan', menentukan wewenang persetujuan secara
// EKSPLISIT (tidak lagi ditebak dari teks kolom Jabatan):
//   - "inspektur"  -> can_approve_leave otomatis true.
//   - "sekretaris" -> can_approve_leave tetap false (kolom ini KHUSUS penanda Inspektur),
//                     TAPI tetap diberi wewenang PENUH yang sama seperti Inspektur untuk
//                     menyetujui SEMUA jenis pengajuan (cuti/izin/sakit/dinas dalam/dinas
//                     luar/pengecualian apel/lembur) — lihat getLeaveApprover,
//                     getLeaveTypeApprover, dan is_leave_approver() di database.
export type PimpinanType = "inspektur" | "sekretaris";

// Label tampilan untuk tiap role. "pimpinan" = akses lihat statistik/rekap
// kehadiran seluruh pegawai (mis. Inspektur, Sekretaris Inspektorat) — tanpa
// bisa menambah/mengedit/menghapus data apa pun.
export const ROLE_LABEL: Record<EmployeeRole, string> = {
  employee: "Pegawai",
  pimpinan: "Pimpinan",
  admin: "Admin",
};

export const PIMPINAN_TYPE_LABEL: Record<PimpinanType, string> = {
  inspektur: "Inspektur",
  sekretaris: "Sekretaris",
};

export interface Employee {
  id: string;
  nip: string | null;
  full_name: string;
  position: string | null;
  email: string;
  phone: string | null;
  role: EmployeeRole;
  pimpinan_type: PimpinanType | null;
  can_approve_leave: boolean;
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
  /** Batas akhir apel pagi, "HH:MM" WITA (default "08:30"). Setelah jam ini, pada hari apel pegawai
   *  tidak lagi diarahkan ke lokasi apel — absen masuk dilakukan dari Kantor Inspektorat seperti biasa. */
  apel_end_time?: string | null;
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
  activity_id?: string | null; // kegiatan lapangan (terkunci) yang dipakai utk absen masuk, bila ada
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
  weekday: 1 | 2 | 3 | 4 | 5 | null; // 1 = Senin ... 5 = Jumat; null bila jadwal bulanan / sekali (lihat di bawah)
  day_of_month: number | null; // 1-31; terisi utk apel bulanan pada tanggal tetap tiap bulan, selain weekday
  event_date?: string | null; // "YYYY-MM-DD"; terisi utk apel SEWAKTU-WAKTU (sekali, pada tanggal tertentu, hari apa pun)
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
//
// "pengecualian_apel" BERBEDA dari jenis lain di atas: pegawai yang disetujui TETAP WAJIB
// absen masuk/pulang seperti biasa (berketerangan Hadir) — hanya dibebaskan dari kewajiban
// hadir FISIK di lokasi apel pagi (Senin/Rabu/tanggal 17), mis. karena sakit, hamil, atau
// alasan khusus lain (tidak bisa berdiri lama). Karena itu jenis ini SENGAJA dikecualikan
// dari buildLeaveDayMap (lib/reports/absenceStatus.ts) — bila pegawai ybs tetap tidak absen
// sama sekali pada hari itu, harinya tetap tercatat "Tanpa Berita", bukan dianggap cuti.
export type LeaveType = "cuti" | "izin" | "sakit" | "dinas_dalam" | "dinas_luar" | "pengecualian_apel";
export type LeaveStatus = "pending" | "approved" | "rejected";

/** Alasan pengecualian apel — dipilih pegawai saat mengajukan (khusus type = "pengecualian_apel"). */
export type ApelExemptionReason = "sakit" | "hamil" | "alasan_khusus";

export const APEL_EXEMPTION_REASON_LABEL: Record<ApelExemptionReason, string> = {
  sakit: "Sakit",
  hamil: "Hamil",
  alasan_khusus: "Alasan Khusus Lainnya",
};

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
  // Khusus type = dinas_dalam / dinas_luar (null utk cuti/izin/sakit/pengecualian_apel).
  destination?: string | null; // tujuan/lokasi penugasan
  letter_number?: string | null; // nomor Surat Perintah Tugas (SPT), opsional
  // Khusus type = pengecualian_apel (null utk jenis lain).
  apel_exemption_reason?: ApelExemptionReason | null;
  employees?: Pick<Employee, "full_name" | "nip" | "position">;
}

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  dinas_dalam: "Perjalanan Dinas Dalam Daerah",
  dinas_luar: "Perjalanan Dinas Luar Daerah",
  pengecualian_apel: "Pengecualian Apel (Sakit/Hamil/Alasan Khusus)",
};

/** Label ringkas — dipakai di tempat sempit (legenda grafik, badge, dsb). */
export const LEAVE_TYPE_SHORT_LABEL: Record<LeaveType, string> = {
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  dinas_dalam: "Dinas Dalam Daerah",
  dinas_luar: "Dinas Luar Daerah",
  pengecualian_apel: "Pengecualian Apel",
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

// Pengajuan koreksi absensi oleh pegawai (Tahap 2). Pengajuan TIDAK mengubah tabel attendance;
// data resmi hanya berubah setelah disetujui pihak berwenang (Tahap 3).
export type CorrectionType = "in" | "out";

export const CORRECTION_TYPE_LABEL: Record<CorrectionType, string> = {
  in: "Absen Masuk",
  out: "Absen Pulang",
};

export interface AttendanceCorrection {
  id: string;
  employee_id: string;
  work_date: string; // "YYYY-MM-DD" (WITA)
  type: CorrectionType;
  requested_time: string; // "HH:MM:SS" (WITA)
  reason: string;
  attachment_url: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
};

/**
 * Kegiatan lapangan yang MENGUNCI lokasi absen masuk: hanya pegawai yang ditugaskan (peserta),
 * pada tanggal kegiatan, dalam jendela waktu tertentu, dan di dalam radius lokasi kegiatan yang
 * bisa absen dari lokasi tsb. Dibuat/dikelola oleh Admin utama / Inspektur / Sekretaris.
 */
export interface Kegiatan {
  id: string;
  name: string;
  description: string | null;
  activity_date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM" WITA — absen baru dibuka mulai jam ini
  end_time: string; // "HH:MM" WITA — absen ditutup setelah jam ini
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}
