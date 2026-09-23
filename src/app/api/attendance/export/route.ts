import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import ExcelJS from "exceljs";
import { formatWita } from "@/lib/geo";

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
    { header: "Jarak dari Kantor (m)", key: "jarak", width: 18 },
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

  (records ?? []).forEach((r, i) => {
    sheet.addRow({
      no: i + 1,
      nip: r.employees?.nip ?? "-",
      nama: r.employees?.full_name ?? "-",
      jabatan: r.employees?.position ?? "-",
      jenis: r.type === "in" ? "Masuk" : "Pulang",
      waktu: formatWita(new Date(r.server_time)),
      jarak: Math.round(r.distance_meters),
      wajah: r.face_match ? "Sesuai" : "Tidak Sesuai",
      status: r.status === "valid" ? "Valid" : "Ditolak",
      terlambat: r.is_late ? "Ya" : "-",
      keterangan: r.reject_reason ?? "-",
    });
  });

  sheet.autoFilter = { from: "A1", to: "K1" };

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Rekap-Absensi-Inspektorat-Sumba-Barat_${from}_sd_${to}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
