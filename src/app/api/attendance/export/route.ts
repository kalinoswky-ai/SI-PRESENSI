import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAttendanceWorkbook } from "@/lib/reports/attendanceWorkbook";

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

  let query = supabase
    .from("attendance")
    .select("*, employees(full_name, nip, position)")
    .gte("server_time", `${from}T00:00:00.000Z`)
    .lte("server_time", `${to}T23:59:59.999Z`)
    .order("server_time", { ascending: true });

  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data: records, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workbook = await buildAttendanceWorkbook(records ?? []);
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Rekap-Absensi-Inspektorat-Sumba-Barat_${from}_sd_${to}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
