import "server-only";
import ExcelJS from "exceljs";
import { formatWita, mapsUrl } from "@/lib/geo";
import type { AttendanceRecord } from "@/types";

/**
 * Bangun workbook Excel rekap absensi (.xlsx) — dipakai bersama oleh:
 * - export manual admin (/api/attendance/export)
 * - laporan otomatis terjadwal ke BKPSDM (/api/reports/bkpsdm)
 */
export async function buildAttendanceWorkbook(records: AttendanceRecord[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistem Absensi Digital - Inspektorat Sumba Barat";
  const sheet = workbook.addWorksheet("Rekap Absensi");

  sheet.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "NIP", key: "nip", width: 22 },
    { header: "Nama Pegawai", key: "nama", width: 28 },
    { header: "Jabatan", key: "jabatan", width: 22 },
    { header: "Jenis", key: "jenis", width: 10 },
    { header: "Waktu (Server Clock, WITA)", key: "waktu", width: 26 },
    { header: "Mode Kerja", key: "mode", width: 12 },
    { header: "Jarak dari Kantor (m)", key: "jarak", width: 18 },
    { header: "Lokasi", key: "lokasi", width: 38 },
    { header: "Latitude", key: "lat", width: 13 },
    { header: "Longitude", key: "lng", width: 13 },
    { header: "Peta", key: "peta", width: 14 },
    { header: "Wajah Sesuai", key: "wajah", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Terlambat", key: "terlambat", width: 12 },
    { header: "Keterangan", key: "keterangan", width: 32 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDBEAFE" },
  };

  records.forEach((r, i) => {
    sheet.addRow({
      no: i + 1,
      nip: r.employees?.nip ?? "-",
      nama: r.employees?.full_name ?? "-",
      jabatan: r.employees?.position ?? "-",
      jenis: r.type === "in" ? "Masuk" : "Pulang",
      waktu: formatWita(new Date(r.server_time)),
      mode: r.work_mode === "wfh" ? "WFH" : "WFO",
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

  sheet.autoFilter = { from: "A1", to: "P1" };

  return workbook;
}
