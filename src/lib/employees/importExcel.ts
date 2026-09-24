import "server-only";
import ExcelJS from "exceljs";
import type { EmployeeRole } from "@/types";

/** Urutan kolom pada template resmi. Saat dibaca, kolom dicari lewat NAMA HEADER (urutan bebas). */
export const IMPORT_HEADERS = ["NAMA", "NIP", "JABATAN", "ROLE", "EMAIL", "NO HP", "PASSWORD"] as const;
export const MAX_IMPORT_ROWS = 300;
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
export const MIN_IMPORT_PASSWORD = 6;
export const IMPORT_SHEET_NAME = "Data Pegawai";

type Field = "full_name" | "nip" | "position" | "role" | "email" | "phone" | "password";

// Header dinormalisasi (huruf besar, tanpa spasi/tanda baca) lalu dicocokkan dengan alias berikut.
const HEADER_ALIASES: Record<Field, string[]> = {
  full_name: ["NAMA", "NAMALENGKAP"],
  nip: ["NIP"],
  position: ["JABATAN"],
  role: ["ROLE", "PERAN", "HAKAKSES"],
  email: ["EMAIL", "ALAMATEMAIL"],
  phone: ["NOHP", "NOHANDPHONE", "NOTELP", "NOTELEPON", "NOWA", "NOWHATSAPP", "HP", "WHATSAPP"],
  password: ["PASSWORD", "PASWORD", "KATASANDI"], // "PASWORD" = salah ketik yang umum
};
const FIELD_LABEL: Record<Field, string> = {
  full_name: "NAMA",
  nip: "NIP",
  position: "JABATAN",
  role: "ROLE",
  email: "EMAIL",
  phone: "NO HP",
  password: "PASSWORD",
};

export interface ParsedRow {
  rowNumber: number; // nomor baris di Excel (agar admin mudah mencari)
  full_name: string;
  nip: string | null;
  position: string | null;
  role: EmployeeRole | null;
  email: string;
  phone: string | null;
  password: string;
  errors: string[];
}

export interface ParseResult {
  fatal: string | null; // kesalahan level file (bukan per baris)
  rows: ParsedRow[];
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Raw {
  text: string;
  isNumber: boolean;
}

function readCell(cell: ExcelJS.Cell): Raw {
  let v: unknown = cell.value;
  if (v && typeof v === "object" && "result" in (v as object)) v = (v as { result: unknown }).result; // sel rumus
  if (v === null || v === undefined) return { text: "", isNumber: false };
  if (typeof v === "number") return { text: Number.isFinite(v) ? String(v) : "", isNumber: true };
  if (typeof v === "string") return { text: v.trim(), isNumber: false };
  if (typeof v === "object" && "error" in (v as object)) return { text: "", isNumber: false };
  return { text: (cell.text ?? "").trim(), isNumber: false }; // hyperlink / rich text
}

function parseRole(raw: string): EmployeeRole | null {
  const r = raw.trim().toLowerCase();
  if (["pegawai", "employee", "staff", "staf"].includes(r)) return "employee";
  if (r === "pimpinan") return "pimpinan";
  if (["admin", "administrator"].includes(r)) return "admin";
  return null;
}

/** 0812… / 812… / +62812… → 62812… (format yang dipakai notifikasi WhatsApp). */
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  if (!d.startsWith("62") || d.length < 10 || d.length > 15) return null;
  return d;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function parseEmployeeWorkbook(buffer: Buffer): Promise<ParseResult> {
  // .xlsx adalah arsip ZIP ("PK"). File .xls lama / CSV / dokumen lain ditolak dengan pesan jelas.
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return { fatal: "File harus berformat .xlsx. Jika file Anda .xls atau .csv, buka di Excel lalu Save As → Excel Workbook (.xlsx).", rows: [] };
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return { fatal: "File Excel tidak dapat dibaca. Pastikan file tidak rusak / tidak diberi password.", rows: [] };
  }
  const ws = wb.getWorksheet(IMPORT_SHEET_NAME) ?? wb.worksheets[0];
  if (!ws) return { fatal: "File Excel tidak memiliki sheet.", rows: [] };

  // Cari baris header (di 10 baris pertama) yang memuat kolom NAMA & EMAIL.
  let headerRowNo = 0;
  const colOf: Partial<Record<Field, number>> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headerRowNo; r++) {
    const found: Partial<Record<Field, number>> = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, colNo) => {
      const key = norm(readCell(cell).text);
      (Object.keys(HEADER_ALIASES) as Field[]).forEach((f) => {
        if (found[f] === undefined && HEADER_ALIASES[f].includes(key)) found[f] = colNo;
      });
    });
    if (found.full_name && found.email) {
      headerRowNo = r;
      Object.assign(colOf, found);
    }
  }
  if (!headerRowNo) {
    return { fatal: `Baris header tidak ditemukan. Gunakan template resmi dengan kolom: ${IMPORT_HEADERS.join(" | ")}.`, rows: [] };
  }
  const missing = (Object.keys(FIELD_LABEL) as Field[]).filter((f) => !colOf[f]).map((f) => FIELD_LABEL[f]);
  if (missing.length) {
    return { fatal: `Kolom berikut tidak ditemukan pada header: ${missing.join(", ")}. Gunakan template resmi.`, rows: [] };
  }

  const rows: ParsedRow[] = [];
  for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (f: Field) => readCell(row.getCell(colOf[f]!));
    const cells = (Object.keys(FIELD_LABEL) as Field[]).map((f) => [f, get(f)] as const);
    if (cells.every(([, c]) => c.text === "")) continue; // baris kosong

    if (rows.length >= MAX_IMPORT_ROWS) {
      return { fatal: `Maksimal ${MAX_IMPORT_ROWS} pegawai per file. Pisahkan file menjadi beberapa bagian.`, rows: [] };
    }

    const raw = Object.fromEntries(cells) as Record<Field, Raw>;
    const errors: string[] = [];

    const full_name = raw.full_name.text.replace(/\s+/g, " ");
    if (!full_name) errors.push("NAMA wajib diisi");

    const role = parseRole(raw.role.text);
    if (!raw.role.text) errors.push("ROLE wajib diisi (pegawai / pimpinan / admin)");
    else if (!role) errors.push(`ROLE "${raw.role.text}" tidak valid (pilih: pegawai / pimpinan / admin)`);

    // NIP 18 digit yang diketik pada sel berformat Umum/Angka dipotong Excel (>15 digit → nol).
    // Kita tolak agar tidak menyimpan NIP yang salah secara diam-diam.
    let nip: string | null = raw.nip.text.replace(/\s+/g, "") || null;
    if (raw.nip.isNumber && raw.nip.text.length >= 15) {
      errors.push("NIP terbaca sebagai angka sehingga bisa terpotong Excel — ubah format kolom NIP menjadi Teks lalu ketik ulang");
      nip = null;
    } else if (!nip && role !== "admin") {
      errors.push("NIP wajib diisi untuk Pegawai/Pimpinan");
    }

    const email = raw.email.text.toLowerCase();
    if (!email) errors.push("EMAIL wajib diisi");
    else if (!EMAIL_RE.test(email)) errors.push(`EMAIL "${raw.email.text}" tidak valid`);

    let phone: string | null = null;
    if (raw.phone.text) {
      phone = normalizePhone(raw.phone.text);
      if (!phone) errors.push(`NO HP "${raw.phone.text}" tidak valid`);
    }

    const password = raw.password.text;
    if (!password) errors.push("PASSWORD wajib diisi");
    else if (password.length < MIN_IMPORT_PASSWORD) errors.push(`PASSWORD minimal ${MIN_IMPORT_PASSWORD} karakter`);

    rows.push({
      rowNumber: r,
      full_name,
      nip,
      position: raw.position.text.replace(/\s+/g, " ") || null,
      role,
      email,
      phone,
      password,
      errors,
    });
  }

  if (rows.length === 0) return { fatal: "Tidak ada baris data pegawai di bawah header.", rows: [] };
  return { fatal: null, rows };
}
