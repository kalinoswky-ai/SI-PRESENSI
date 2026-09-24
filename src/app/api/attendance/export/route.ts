import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { buildAttendanceWorkbook, EMPLOYEE_EXPORT_COLUMNS, type EmployeeExportRow } from "@/lib/reports/attendanceWorkbook";
import { buildAttendanceGrid, rangeDays } from "@/lib/reports/attendanceGrid";
import type { AttendanceRecord } from "@/types";

// Selalu ambil data terbaru dari Supabase saat export diklik — jangan di-cache Next.js.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("employees")
    .select("role, is_active")
    .eq("id", userData.user.id)
    .single();

  // Export laporan (unduh Excel) BUKAN operasi tulis/hapus data, sehingga Admin maupun
  // Pimpinan (Inspektur/Sekretaris — mode lihat statistik) sama-sama boleh mengunduhnya.
  if (!requester || !requester.is_active || (requester.role !== "admin" && requester.role !== "pimpinan")) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk mengekspor laporan." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const employeeId = searchParams.get("employee_id");
  // view menentukan sheet rekap grid pertama (Rekap Harian/Mingguan/Bulanan) agar Excel
  // yang diunduh mencerminkan tab periode yang sedang dibuka admin di halaman Timesheets.
  const view = searchParams.get("view"); // "day" | "week" | "month" | null
  const PERIOD_LABEL: Record<string, string> = { day: "Harian", week: "Mingguan", month: "Bulanan" };
  const periodLabel = view ? PERIOD_LABEL[view] : undefined;

  // Ambil semua halaman — query tunggal Supabase dibatasi 1000 baris sehingga Excel bisa terpotong.
  const { data: records, error } = await fetchAllRows((a, b) => {
    let query = supabase
      .from("attendance")
      .select("*, employees(full_name, nip, position)")
      .gte("server_time", `${from}T00:00:00+08:00`)
      .lte("server_time", `${to}T23:59:59.999+08:00`)
      .order("server_time", { ascending: true })
      .order("id");
    if (employeeId) query = query.eq("employee_id", employeeId);
    return query.range(a, b);
  });
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  // Data pegawai TERBARU (semua pegawai, termasuk yang belum punya catatan absen pada periode ini).
  // Bila export difilter ke satu pegawai, sheet "Data Pegawai" hanya memuat pegawai tsb.
  const { data: employees, error: empError } = await fetchAllRows<EmployeeExportRow>((a, b) => {
    let query = supabase
      .from("employees")
      .select(EMPLOYEE_EXPORT_COLUMNS)
      .order("full_name")
      .order("id");
    if (employeeId) query = query.eq("id", employeeId);
    return query.range(a, b);
  });
  if (empError) {
    return NextResponse.json({ error: empError }, { status: 500 });
  }

  // Sheet rekap grid pertama (Pegawai x Hari) hanya dibuat bila diminta dari tab Timesheets
  // (view diisi) dan bukan export per satu pegawai (grid dirancang untuk seluruh pegawai aktif).
  let gridInput;
  if (view && PERIOD_LABEL[view] && !employeeId) {
    const { data: activeEmployees } = await supabase
      .from("employees")
      .select("id, full_name, nip")
      .eq("is_active", true)
      .order("full_name");
    const gridRows = (records ?? []).filter((r) => r.status === "valid") as Pick<
      AttendanceRecord,
      "employee_id" | "type" | "server_time" | "is_late"
    >[];
    gridInput = {
      employees: activeEmployees ?? [],
      days: rangeDays(from, to),
      grid: buildAttendanceGrid(gridRows),
      sheetName: `Rekap ${periodLabel}`,
    };
  }

  const workbook = await buildAttendanceWorkbook(records, employees, gridInput);
  const buffer = await workbook.xlsx.writeBuffer();
  const periodSuffix = periodLabel ? `_${periodLabel}` : "";
  const filename = `Rekap-Absensi-Inspektorat-Sumba-Barat${periodSuffix}_${from}_sd_${to}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
