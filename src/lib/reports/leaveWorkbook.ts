import "server-only";
import ExcelJS from "exceljs";
import { LEAVE_TYPE_SHORT_LABEL } from "@/types";
import type { LeaveType } from "@/types";
import {
  REKAP_STATUS_OPTIONS,
  effectiveWorkdays,
  type LeaveRekapParams,
  type LeaveStats,
  type RekapEmployee,
  type RekapLeaveRow,
} from "@/lib/reports/leaveStats";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};
const DT_FMT = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", year: "numeric" });
const MONTH_FMT = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" });
const fmtDate = (d: string) => DT_FMT.format(new Date(`${d}T00:00:00+08:00`));

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    c.border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  });
}

/**
 * Workbook rekap pengajuan Time Off. Sheet: Ringkasan, Per Pegawai, Per Bulan, Detail Pengajuan.
 * Sengaja tidak memuat lampiran / data sensitif pegawai selain NIP, nama, jabatan.
 */
export async function buildLeaveWorkbook(
  rows: RekapLeaveRow[],
  employees: RekapEmployee[],
  stats: LeaveStats,
  params: LeaveRekapParams,
  types: LeaveType[]
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SI Presensi Inspektorat Kab. Sumba Barat";
  wb.created = new Date();
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const statusLabel = REKAP_STATUS_OPTIONS.find((o) => o.key === params.status)?.label ?? "Semua status";
  const typeLabel = params.type === "all" ? "Cuti, Izin, Sakit, Dinas Dalam & Luar Daerah" : LEAVE_TYPE_SHORT_LABEL[params.type];

  // ---- 1. Ringkasan
  const s1 = wb.addWorksheet("Ringkasan");
  s1.columns = [{ width: 38 }, { width: 18 }, { width: 18 }, { width: 18 }];
  s1.addRow(["Rekap Pengajuan Time Off — Inspektorat Kab. Sumba Barat"]).font = { bold: true, size: 14 };
  s1.addRow([`Periode (tanggal mulai pengajuan): ${fmtDate(params.from)} s/d ${fmtDate(params.to)}`]);
  s1.addRow([`Jenis: ${typeLabel} · Status: ${statusLabel} · Ambang "sering mengajukan": ≥ ${params.min}x`]);
  s1.addRow([]);
  const kv: [string, string | number][] = [
    ["Total pengajuan", stats.totalRequests],
    ["Pegawai yang mengajukan", stats.distinctEmployees],
    ["Pegawai wajib absen (aktif, bukan Admin)", stats.eligibleEmployees],
    ["Persentase pegawai yang mengajukan", stats.participationPct === null ? "-" : `${stats.participationPct}%`],
    ["Pegawai sering mengajukan", stats.frequentCount],
    ["Total hari kerja (pengajuan disetujui, Sen–Jum, tanpa libur nasional)", stats.totalWorkdays],
  ];
  kv.forEach(([k, v]) => {
    const r = s1.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  });
  s1.addRow([]);
  styleHeader(s1.addRow(["Jenis", "Pengajuan", "Pegawai", "Hari Kerja"]));
  stats.byType.forEach((t) => s1.addRow([LEAVE_TYPE_SHORT_LABEL[t.type], t.requests, t.employees, t.workdays]));
  s1.addRow([]);
  styleHeader(s1.addRow(["Frekuensi pengajuan per pegawai", "Jumlah Pegawai", "% dari wajib absen"]));
  stats.frequency.forEach((f) =>
    s1.addRow([
      f.label,
      f.employees,
      stats.eligibleEmployees > 0 ? `${Math.round((f.employees / stats.eligibleEmployees) * 100)}%` : "-",
    ])
  );

  // ---- 2. Per Pegawai
  const s2 = wb.addWorksheet("Per Pegawai", { views: [{ state: "frozen", ySplit: 1 }] });
  s2.columns = [
    { header: "No", width: 5 },
    { header: "NIP", width: 22 },
    { header: "Nama", width: 34 },
    { header: "Jabatan", width: 30 },
    ...types.map((t) => ({ header: LEAVE_TYPE_SHORT_LABEL[t], width: 13 })),
    { header: "Total Pengajuan", width: 12 },
    { header: "Hari Kerja (disetujui)", width: 14 },
    { header: "Terakhir Mengajukan", width: 18 },
    { header: "Keterangan", width: 20 },
  ];
  styleHeader(s2.getRow(1));
  stats.perEmployee.forEach((e, i) => {
    const r = s2.addRow([
      i + 1,
      e.employee.nip ?? "",
      e.employee.full_name,
      e.employee.position ?? "",
      ...types.map((t) => e.counts[t]),
      e.total,
      e.workdays,
      fmtDate(e.lastStart),
      e.frequent ? `Sering mengajukan (≥ ${params.min}x)` : "",
    ]);
    if (e.frequent) r.getCell(r.cellCount).font = { bold: true, color: { argb: "FFB45309" } };
  });
  s2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s2.columnCount } };

  // ---- 3. Per Bulan
  const s3 = wb.addWorksheet("Per Bulan", { views: [{ state: "frozen", ySplit: 1 }] });
  s3.columns = [{ header: "Bulan", width: 18 }, ...types.map((t) => ({ header: LEAVE_TYPE_SHORT_LABEL[t], width: 13 })), { header: "Total", width: 10 }];
  styleHeader(s3.getRow(1));
  stats.byMonth.forEach((m) =>
    s3.addRow([MONTH_FMT.format(new Date(`${m.key}-01T00:00:00Z`)), ...types.map((t) => m.counts[t]), m.total])
  );

  // ---- 4. Detail Pengajuan
  const s4 = wb.addWorksheet("Detail Pengajuan", { views: [{ state: "frozen", ySplit: 1 }] });
  s4.columns = [
    { header: "Diajukan", width: 14 },
    { header: "NIP", width: 22 },
    { header: "Nama", width: 32 },
    { header: "Jenis", width: 22 },
    { header: "Mulai", width: 14 },
    { header: "Selesai", width: 14 },
    { header: "Hari Kerja (disetujui)", width: 14 },
    { header: "Status", width: 13 },
    { header: "Tujuan", width: 26 },
    { header: "Alasan", width: 48 },
  ];
  styleHeader(s4.getRow(1));
  [...rows]
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .forEach((r) => {
      const e = empMap.get(r.employee_id);
      s4.addRow([
        DT_FMT.format(new Date(r.created_at)),
        e?.nip ?? "",
        e?.full_name ?? "Pegawai tidak dikenal",
        LEAVE_TYPE_SHORT_LABEL[r.type],
        fmtDate(r.start_date),
        fmtDate(r.end_date),
        effectiveWorkdays(r),
        STATUS_LABEL[r.status] ?? r.status,
        r.destination ?? "",
        r.reason,
      ]);
    });
  s4.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s4.columnCount } };
  s4.getColumn(10).alignment = { wrapText: true, vertical: "top" };

  return wb;
}
