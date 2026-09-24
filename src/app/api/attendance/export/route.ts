import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { buildAttendanceWorkbook } from "@/lib/reports/attendanceWorkbook";

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
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (requester?.role !== "admin") {
    return NextResponse.json({ error: "Hanya Admin yang dapat mengekspor laporan." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const employeeId = searchParams.get("employee_id");

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

  const workbook = await buildAttendanceWorkbook(records);
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Rekap-Absensi-Inspektorat-Sumba-Barat_${from}_sd_${to}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
