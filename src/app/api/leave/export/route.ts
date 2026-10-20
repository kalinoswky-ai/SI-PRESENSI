import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrPimpinan } from "@/lib/admin/auth";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { buildLeaveWorkbook } from "@/lib/reports/leaveWorkbook";
import {
  computeLeaveStats,
  parseRekapParams,
  typesForFilter,
  type RekapEmployee,
  type RekapLeaveRow,
} from "@/lib/reports/leaveStats";

export const dynamic = "force-dynamic";

/** Unduh Excel rekap pengajuan Time Off. Hanya BACA data — Admin maupun Pimpinan boleh mengunduh. */
export async function GET(request: NextRequest) {
  const actor = await requireAdminOrPimpinan();
  if (!actor) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk mengekspor rekap pengajuan." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const params = parseRekapParams((k) => searchParams.get(k));
  const types = typesForFilter(params.type);
  const supabase = createClient();

  const { data: rows, error } = await fetchAllRows<RekapLeaveRow>((a, b) => {
    let q = supabase
      .from("leave_requests")
      .select("id, employee_id, type, status, start_date, end_date, reason, destination, created_at")
      .gte("start_date", params.from)
      .lte("start_date", params.to)
      .in("type", types);
    if (params.status !== "all") q = q.eq("status", params.status);
    return q.order("start_date", { ascending: false }).order("id").range(a, b);
  });
  if (error) return NextResponse.json({ error }, { status: 500 });

  const { data: employees, error: empError } = await fetchAllRows<RekapEmployee>((a, b) =>
    supabase.from("employees").select("id, full_name, nip, position, is_active, role").order("full_name").order("id").range(a, b)
  );
  if (empError) return NextResponse.json({ error: empError }, { status: 500 });

  const stats = computeLeaveStats(rows, employees, params);
  const wb = await buildLeaveWorkbook(rows, employees, stats, params, types);
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `Rekap-Pengajuan-TimeOff_${params.from}_sd_${params.to}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
