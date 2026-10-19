import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrPimpinan } from "@/lib/admin/auth";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { witaDateKey } from "@/lib/geo";
import type { OvertimeRequest } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function hours(mins: number) {
  return Math.round((mins / 60) * 100) / 100;
}

/** Export rekap lembur yang DISETUJUI pada satu bulan (Excel). Hanya membaca data → Admin & Pimpinan boleh. */
export async function GET(request: NextRequest) {
  const viewer = await requireAdminOrPimpinan();
  if (!viewer) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk mengekspor data lembur." }, { status: 403 });
  }

  const month = request.nextUrl.searchParams.get("month") ?? witaDateKey(new Date()).slice(0, 7);
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "Format bulan harus YYYY-MM." }, { status: 400 });
  }
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const supabase = createClient();
  const { data: rows, error } = await fetchAllRows<OvertimeRequest>((a, b) =>
    supabase
      .from("overtime_requests")
      .select("*")
      .eq("status", "approved")
      .gte("work_date", from)
      .lt("work_date", next)
      .order("work_date")
      .order("id")
      .range(a, b)
  );
  if (error) return NextResponse.json({ error }, { status: 500 });

  const ids = Array.from(new Set(rows.map((r) => r.employee_id)));
  const empMap = new Map<string, { full_name: string; nip: string | null; position: string | null }>();
  if (ids.length > 0) {
    const { data: emps } = await supabase.from("employees").select("id, full_name, nip, position").in("id", ids);
    (emps ?? []).forEach((e) => empMap.set(e.id, e));
  }

  const wb = new ExcelJS.Workbook();

  // Sheet 1: rekap per pegawai
  const rekap = wb.addWorksheet("Rekap");
  rekap.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Nama", key: "name", width: 32 },
    { header: "NIP", key: "nip", width: 22 },
    { header: "Jabatan", key: "pos", width: 30 },
    { header: "Jumlah Lembur (kali)", key: "count", width: 20 },
    { header: "Total Jam", key: "hours", width: 12 },
  ];
  const perEmp = new Map<string, { count: number; mins: number }>();
  rows.forEach((r) => {
    const cur = perEmp.get(r.employee_id) ?? { count: 0, mins: 0 };
    cur.count += 1;
    cur.mins += r.duration_minutes;
    perEmp.set(r.employee_id, cur);
  });
  Array.from(perEmp.entries())
    .sort((a, b) => (empMap.get(a[0])?.full_name ?? "").localeCompare(empMap.get(b[0])?.full_name ?? ""))
    .forEach(([id, v], i) => {
      const e = empMap.get(id);
      rekap.addRow({
        no: i + 1,
        name: e?.full_name ?? "-",
        nip: e?.nip ?? "-",
        pos: e?.position ?? "-",
        count: v.count,
        hours: hours(v.mins),
      });
    });
  rekap.getRow(1).font = { bold: true };

  // Sheet 2: detail
  const detail = wb.addWorksheet("Detail");
  detail.columns = [
    { header: "Tanggal", key: "date", width: 14 },
    { header: "Nama", key: "name", width: 32 },
    { header: "NIP", key: "nip", width: 22 },
    { header: "Mulai", key: "start", width: 9 },
    { header: "Selesai", key: "end", width: 9 },
    { header: "Durasi (jam)", key: "dur", width: 14 },
    { header: "Uraian Pekerjaan", key: "desc", width: 50 },
  ];
  rows.forEach((r) => {
    const e = empMap.get(r.employee_id);
    detail.addRow({
      date: r.work_date,
      name: e?.full_name ?? "-",
      nip: e?.nip ?? "-",
      start: r.start_time.slice(0, 5),
      end: r.end_time.slice(0, 5),
      dur: hours(r.duration_minutes),
      desc: r.description,
    });
  });
  detail.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Rekap-Lembur-Inspektorat-Sumba-Barat_${month}.xlsx"`,
    },
  });
}
