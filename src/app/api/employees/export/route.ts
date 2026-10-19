import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrPimpinan } from "@/lib/admin/auth";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { buildEmployeeWorkbook, EMPLOYEE_EXPORT_COLUMNS, type EmployeeExportRow } from "@/lib/reports/attendanceWorkbook";
import { witaDateKey } from "@/lib/geo";

// Selalu ambil data terbaru dari Supabase saat export diklik — jangan di-cache Next.js.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Export data pegawai terbaru (Excel). Hanya MEMBACA data, sehingga Admin maupun Pimpinan
 * boleh mengunduh (sama seperti export laporan absensi).
 */
export async function GET() {
  const viewer = await requireAdminOrPimpinan();
  if (!viewer) {
    return NextResponse.json({ error: "Anda tidak memiliki akses untuk mengekspor data pegawai." }, { status: 403 });
  }

  const supabase = createClient();
  const { data: employees, error } = await fetchAllRows<EmployeeExportRow>((a, b) =>
    supabase.from("employees").select(EMPLOYEE_EXPORT_COLUMNS).order("full_name").order("id").range(a, b)
  );
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const workbook = buildEmployeeWorkbook(employees);
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Data-Pegawai-Inspektorat-Sumba-Barat_${witaDateKey(new Date())}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
