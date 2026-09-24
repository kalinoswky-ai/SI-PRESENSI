import "server-only";
import ExcelJS from "exceljs";
import { formatDurationMinutes, mapsUrl, witaDateKey } from "@/lib/geo";
import type { AttendanceRecord } from "@/types";

/**
 * Bangun workbook Excel rekap absensi (.xlsx) — dipakai bersama oleh:
 * - export manual admin (/api/attendance/export)
 * - laporan otomatis terjadwal ke BKPSDM (/api/reports/bkpsdm)
 *
 * Tiga sheet:
 *  1. "Jam Masuk"  — seluruh catatan absen masuk (termasuk yang ditolak, dengan kolom Status).
 *  2. "Jam Pulang" — seluruh catatan absen pulang.
 *  3. "Resume"     — satu baris per pegawai per hari yang menggabungkan jam masuk & jam pulang
 *                    (hanya catatan berstatus Valid; jam masuk = paling awal, jam pulang = paling akhir).
 */

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Makassar",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Makassar",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const fmtDate = (iso: string) => DATE_FMT.format(new Date(iso));
const fmtTime = (iso: string) => TIME_FMT.format(new Date(iso));
const modeLabel = (r: AttendanceRecord) => (r.work_mode === "wfh" ? "WFH" : "WFO");

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
}

/** Sheet detail untuk satu jenis absen ("in" = Jam Masuk, "out" = Jam Pulang). */
function addDetailSheet(workbook: ExcelJS.Workbook, records: AttendanceRecord[], type: "in" | "out") {
  const isIn = type === "in";
  const sheet = workbook.addWorksheet(isIn ? "Jam Masuk" : "Jam Pulang");

  sheet.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "NIP", key: "nip", width: 22 },
    { header: "Nama Pegawai", key: "nama", width: 28 },
    { header: "Jabatan", key: "jabatan", width: 22 },
    { header: "Tanggal", key: "tanggal", width: 14 },
    { header: isIn ? "Jam Masuk (WITA)" : "Jam Pulang (WITA)", key: "jam", width: 18 },
    { header: "Mode Kerja", key: "mode", width: 12 },
    { header: "Jarak dari Kantor (m)", key: "jarak", width: 18 },
    { header: "Lokasi", key: "lokasi", width: 38 },
    { header: "Latitude", key: "lat", width: 13 },
    { header: "Longitude", key: "lng", width: 13 },
    { header: "Peta", key: "peta", width: 14 },
    { header: "Wajah Sesuai", key: "wajah", width: 14 },
    { header: "Status", key: "status", width: 12 },
    ...(isIn ? [{ header: "Terlambat", key: "terlambat", width: 12 }] : []),
    { header: "Keterangan", key: "keterangan", width: 32 },
  ];

  records
    .filter((r) => r.type === type)
    .forEach((r, i) => {
      sheet.addRow({
        no: i + 1,
        nip: r.employees?.nip ?? "-",
        nama: r.employees?.full_name ?? "-",
        jabatan: r.employees?.position ?? "-",
        tanggal: fmtDate(r.server_time),
        jam: fmtTime(r.server_time),
        mode: modeLabel(r),
        jarak: r.work_mode === "wfh" ? "-" : Math.round(r.distance_meters),
        lokasi: r.location_label ?? "-",
        lat: r.latitude,
        lng: r.longitude,
        peta: { text: "Buka peta", hyperlink: mapsUrl(r.latitude, r.longitude) },
        wajah: r.face_match ? "Sesuai" : "Tidak Sesuai",
        status: r.status === "valid" ? "Valid" : "Ditolak",
        terlambat: r.is_late ? "Ya" : "-",
        keterangan: r.reject_reason ?? "-",
      });
    });

  styleHeader(sheet);
}

/** Sheet Resume: jam masuk + jam pulang digabung per pegawai per hari (WITA). */
function addResumeSheet(workbook: ExcelJS.Workbook, records: AttendanceRecord[]) {
  const sheet = workbook.addWorksheet("Resume");
  sheet.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "NIP", key: "nip", width: 22 },
    { header: "Nama Pegawai", key: "nama", width: 28 },
    { header: "Jabatan", key: "jabatan", width: 22 },
    { header: "Tanggal", key: "tanggal", width: 14 },
    { header: "Jam Masuk (WITA)", key: "masuk", width: 18 },
    { header: "Jam Pulang (WITA)", key: "pulang", width: 18 },
    { header: "Durasi Kerja", key: "durasi", width: 13 },
    { header: "Status Masuk", key: "status", width: 14 },
    { header: "Mode Kerja", key: "mode", width: 12 },
    { header: "Lokasi Masuk", key: "lokMasuk", width: 34 },
    { header: "Lokasi Pulang", key: "lokPulang", width: 34 },
    { header: "Keterangan", key: "keterangan", width: 26 },
  ];

  interface Day {
    sortKey: string; // nama + tanggal, untuk pengurutan
    date: string; // YYYY-MM-DD (WITA)
    first: AttendanceRecord | null; // absen masuk paling awal
    last: AttendanceRecord | null; // absen pulang paling akhir
    any: AttendanceRecord;
  }
  const days = new Map<string, Day>();

  for (const r of records) {
    if (r.status !== "valid") continue; // resume hanya memakai absensi yang sah
    const date = witaDateKey(new Date(r.server_time));
    const key = `${r.employee_id}|${date}`;
    let d = days.get(key);
    if (!d) {
      d = { sortKey: `${(r.employees?.full_name ?? "").toLowerCase()}|${date}`, date, first: null, last: null, any: r };
      days.set(key, d);
    }
    const t = new Date(r.server_time).getTime();
    if (r.type === "in") {
      if (!d.first || t < new Date(d.first.server_time).getTime()) d.first = r;
    } else if (!d.last || t > new Date(d.last.server_time).getTime()) {
      d.last = r;
    }
  }

  Array.from(days.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .forEach((d, i) => {
      const { first, last, any } = d;
      const minutes = first && last ? Math.round((new Date(last.server_time).getTime() - new Date(first.server_time).getTime()) / 60000) : 0;
      const note = !first ? "Tidak ada absen masuk" : !last ? "Belum/tidak absen pulang" : "-";

      sheet.addRow({
        no: i + 1,
        nip: any.employees?.nip ?? "-",
        nama: any.employees?.full_name ?? "-",
        jabatan: any.employees?.position ?? "-",
        tanggal: fmtDate((first ?? last ?? any).server_time),
        masuk: first ? fmtTime(first.server_time) : "-",
        pulang: last ? fmtTime(last.server_time) : "-",
        durasi: formatDurationMinutes(minutes),
        status: first ? (first.is_late ? "Terlambat" : "Tepat Waktu") : "-",
        mode: modeLabel(first ?? last ?? any),
        lokMasuk: first?.location_label ?? "-",
        lokPulang: last?.location_label ?? "-",
        keterangan: note,
      });
    });

  styleHeader(sheet);
}

export async function buildAttendanceWorkbook(records: AttendanceRecord[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Absensi Digital - Inspektorat Sumba Barat";

  addDetailSheet(workbook, records, "in");
  addDetailSheet(workbook, records, "out");
  addResumeSheet(workbook, records);

  return workbook;
}
