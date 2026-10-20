import { witaDateKey } from "@/lib/geo";
import type { LeaveType } from "@/types";

/**
 * Rekap & statistik pengajuan Time Off (cuti / izin / sakit / dinas) — dipakai bersama oleh halaman
 * /admin/leave/rekap dan export Excel /api/leave/export agar angkanya selalu sama.
 */

/** Jenis yang dihitung sbg "pengajuan ketidakhadiran". Pengecualian apel tidak termasuk di "Semua". */
export const REKAP_TYPES: LeaveType[] = ["cuti", "izin", "sakit", "dinas_dalam", "dinas_luar"];
export const REKAP_TYPE_OPTIONS: LeaveType[] = [...REKAP_TYPES, "pengecualian_apel"];
export const REKAP_STATUS_OPTIONS = [
  { key: "all", label: "Semua status" },
  { key: "approved", label: "Disetujui" },
  { key: "pending", label: "Menunggu" },
  { key: "rejected", label: "Ditolak" },
  { key: "cancelled", label: "Dibatalkan" },
] as const;

export interface LeaveRekapParams {
  from: string; // YYYY-MM-DD — filter berdasarkan TANGGAL MULAI pengajuan
  to: string;
  type: "all" | LeaveType;
  status: (typeof REKAP_STATUS_OPTIONS)[number]["key"];
  /** Pegawai dengan jumlah pengajuan >= nilai ini ditandai "sering mengajukan". */
  min: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string | null | undefined): s is string {
  if (!s || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Baca & validasi parameter filter dari query string (default: 1 Januari tahun ini s/d hari ini WITA). */
export function parseRekapParams(get: (k: string) => string | null | undefined): LeaveRekapParams {
  const today = witaDateKey(new Date());
  let from = get("from");
  let to = get("to");
  if (!validDate(from)) from = `${today.slice(0, 4)}-01-01`;
  if (!validDate(to)) to = today;
  if (from > to) [from, to] = [to, from];

  const t = get("type");
  const type = (REKAP_TYPE_OPTIONS as string[]).includes(t ?? "") ? (t as LeaveType) : "all";
  const s = get("status");
  const status = REKAP_STATUS_OPTIONS.some((o) => o.key === s) ? (s as LeaveRekapParams["status"]) : "all";
  const minN = Math.round(Number(get("min")));
  const min = Number.isFinite(minN) && minN >= 2 && minN <= 50 ? minN : 3;
  return { from, to, type, status, min };
}

export function typesForFilter(type: LeaveRekapParams["type"]): LeaveType[] {
  return type === "all" ? REKAP_TYPES : [type];
}

export interface RekapLeaveRow {
  id: string;
  employee_id: string;
  type: LeaveType;
  status: string;
  start_date: string;
  end_date: string;
  reason: string;
  destination?: string | null;
  created_at: string;
}

export interface RekapEmployee {
  id: string;
  full_name: string;
  nip: string | null;
  position: string | null;
  is_active: boolean;
  role: string;
}

/** Jumlah hari kerja (Senin–Jumat) pada rentang inklusif; libur nasional tidak diperhitungkan. */
export function workdaysBetween(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  let n = 0;
  for (let t = s; t <= e; t += 86400000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/** Hari kerja yang benar-benar dipakai: hanya pengajuan DISETUJUI (dibatalkan/ditolak/menunggu = 0). */
export function effectiveWorkdays(r: Pick<RekapLeaveRow, "status" | "start_date" | "end_date">): number {
  return r.status === "approved" ? workdaysBetween(r.start_date, r.end_date) : 0;
}

type TypeCounts = Record<LeaveType, number>;
const emptyCounts = (): TypeCounts => ({
  cuti: 0,
  izin: 0,
  sakit: 0,
  dinas_dalam: 0,
  dinas_luar: 0,
  pengecualian_apel: 0,
});

export interface EmployeeRekap {
  employee: RekapEmployee;
  counts: TypeCounts;
  total: number;
  workdays: number;
  lastStart: string;
  frequent: boolean;
}

export interface LeaveStats {
  totalRequests: number;
  distinctEmployees: number;
  eligibleEmployees: number;
  participationPct: number | null; // % pegawai wajib absen yang pernah mengajukan
  totalWorkdays: number;
  frequentCount: number;
  byType: { type: LeaveType; requests: number; employees: number; workdays: number }[];
  byMonth: { key: string; counts: TypeCounts; total: number }[];
  perEmployee: EmployeeRekap[];
  frequency: { label: string; employees: number }[];
}

function monthsBetween(from: string, to: string, cap = 36): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.slice(-cap);
}

export function computeLeaveStats(
  rows: RekapLeaveRow[],
  employees: RekapEmployee[],
  params: Pick<LeaveRekapParams, "from" | "to" | "min">
): LeaveStats {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const eligibleEmployees = employees.filter((e) => e.is_active && e.role !== "admin").length;

  const per = new Map<string, EmployeeRekap>();
  const typeAgg = new Map<LeaveType, { requests: number; emps: Set<string>; workdays: number }>();
  const monthAgg = new Map<string, TypeCounts>();
  for (const k of monthsBetween(params.from, params.to)) monthAgg.set(k, emptyCounts());

  let totalWorkdays = 0;
  for (const r of rows) {
    const emp =
      empMap.get(r.employee_id) ??
      ({ id: r.employee_id, full_name: "Pegawai tidak dikenal", nip: null, position: null, is_active: false, role: "employee" } as RekapEmployee);
    const days = effectiveWorkdays(r);
    totalWorkdays += days;

    let e = per.get(emp.id);
    if (!e) {
      e = { employee: emp, counts: emptyCounts(), total: 0, workdays: 0, lastStart: r.start_date, frequent: false };
      per.set(emp.id, e);
    }
    e.counts[r.type]++;
    e.total++;
    e.workdays += days;
    if (r.start_date > e.lastStart) e.lastStart = r.start_date;

    const t = typeAgg.get(r.type) ?? { requests: 0, emps: new Set<string>(), workdays: 0 };
    t.requests++;
    t.emps.add(emp.id);
    t.workdays += days;
    typeAgg.set(r.type, t);

    const mk = r.start_date.slice(0, 7);
    const mc = monthAgg.get(mk);
    if (mc) mc[r.type]++;
  }

  const perEmployee = Array.from(per.values()).sort(
    (a, b) => b.total - a.total || b.workdays - a.workdays || a.employee.full_name.localeCompare(b.employee.full_name, "id")
  );
  perEmployee.forEach((e) => (e.frequent = e.total >= params.min));

  const distinctEmployees = perEmployee.length;
  const bucket = (n: number) => perEmployee.filter((e) => e.total === n).length;
  const frequency = [
    { label: "Tidak pernah", employees: Math.max(0, eligibleEmployees - perEmployee.filter((e) => e.employee.is_active && e.employee.role !== "admin").length) },
    { label: "1x", employees: bucket(1) },
    { label: "2x", employees: bucket(2) },
    { label: "3x", employees: bucket(3) },
    { label: "4–5x", employees: perEmployee.filter((e) => e.total >= 4 && e.total <= 5).length },
    { label: "6x atau lebih", employees: perEmployee.filter((e) => e.total >= 6).length },
  ];

  return {
    totalRequests: rows.length,
    distinctEmployees,
    eligibleEmployees,
    participationPct: eligibleEmployees > 0 ? Math.round((distinctEmployees / eligibleEmployees) * 100) : null,
    totalWorkdays,
    frequentCount: perEmployee.filter((e) => e.frequent).length,
    byType: Array.from(typeAgg.entries())
      .map(([type, v]) => ({ type, requests: v.requests, employees: v.emps.size, workdays: v.workdays }))
      .sort((a, b) => b.requests - a.requests),
    byMonth: Array.from(monthAgg.entries()).map(([key, counts]) => ({
      key,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    })),
    perEmployee,
    frequency,
  };
}
