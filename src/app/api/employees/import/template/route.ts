import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/admin/auth";
import { IMPORT_HEADERS, IMPORT_SHEET_NAME, MAX_IMPORT_ROWS } from "@/lib/employees/importExcel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Template Excel resmi untuk Import Pegawai (khusus Admin). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Hanya Admin yang dapat mengunduh template." }, { status: 403 });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(IMPORT_SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { header: IMPORT_HEADERS[0], key: "nama", width: 34 },
    { header: IMPORT_HEADERS[1], key: "nip", width: 24 },
    { header: IMPORT_HEADERS[2], key: "jabatan", width: 32 },
    { header: IMPORT_HEADERS[3], key: "role", width: 12 },
    { header: IMPORT_HEADERS[4], key: "email", width: 34 },
    { header: IMPORT_HEADERS[5], key: "hp", width: 18 },
    { header: IMPORT_HEADERS[6], key: "password", width: 18 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle" };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
  });

  // NIP (18 digit), NO HP & PASSWORD wajib berformat Teks agar Excel tidak memotong/mengubah angka.
  for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
    for (const col of ["B", "F", "G"]) ws.getCell(`${col}${r}`).numFmt = "@";
    ws.getCell(`D${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"pegawai,pimpinan,admin"'],
      showErrorMessage: true,
      errorTitle: "ROLE tidak valid",
      error: "Pilih: pegawai, pimpinan, atau admin.",
    };
  }

  const guide = wb.addWorksheet("Petunjuk");
  guide.getColumn(1).width = 110;
  const lines = [
    "PETUNJUK IMPORT PEGAWAI",
    "",
    "1. Isi sheet \"Data Pegawai\" mulai baris ke-2. Jangan mengubah/menghapus baris header (baris 1).",
    "2. Kolom: NAMA | NIP | JABATAN | ROLE | EMAIL | NO HP | PASSWORD.",
    "3. ROLE hanya boleh: pegawai, pimpinan, atau admin.",
    "4. NIP wajib untuk pegawai & pimpinan (boleh kosong untuk admin). Kolom NIP sudah berformat Teks — jangan diubah ke Angka.",
    "5. EMAIL harus unik & dipakai pegawai untuk login. NIP juga harus unik.",
    "6. NO HP (opsional): boleh 0812xxxx atau 62812xxxx — otomatis diseragamkan ke format 62.",
    "7. PASSWORD: password awal (boleh sama untuk semua pegawai), minimal 6 karakter.",
    "   Setiap pegawai WAJIB mengganti password ini sendiri saat login pertama.",
    "8. Maksimal " + MAX_IMPORT_ROWS + " pegawai per file. Simpan sebagai .xlsx.",
    "",
    "Contoh isi baris:",
    "Budi Santoso, S.E. | 198501012010011001 | Auditor Muda | pegawai | budi@sumbabaratkab.go.id | 081234567890 | Inspektorat2026",
  ];
  lines.forEach((t, i) => {
    const cell = guide.getCell(`A${i + 1}`);
    cell.value = t;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Template-Import-Pegawai.xlsx"',
    },
  });
}
