import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import {
  MAX_IMPORT_FILE_BYTES,
  parseEmployeeWorkbook,
  type ParsedRow,
} from "@/lib/employees/importExcel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // membuat ratusan akun butuh waktu; batas default Vercel terlalu pendek

type RowStatus = "ok" | "error" | "created" | "failed";

interface RowResult {
  rowNumber: number;
  full_name: string;
  nip: string | null;
  position: string | null;
  role: string | null;
  email: string;
  phone: string | null;
  status: RowStatus;
  message: string | null;
}

function translateCreateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already") || m.includes("registered") || m.includes("exists")) {
    return "Email sudah terdaftar sebagai akun login";
  }
  if (m.includes("password")) return "Password ditolak sistem: " + message;
  return message;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

/**
 * POST multipart: file (.xlsx) + mode ("preview" | "import").
 *  - preview: hanya memeriksa file & mengembalikan hasil validasi per baris (tidak ada data ditulis).
 *  - import : membuat akun untuk semua baris yang valid; baris bermasalah dilewati & dilaporkan.
 * Password TIDAK PERNAH dikembalikan ke browser maupun ditulis ke audit log.
 */
export async function POST(request: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "Hanya Admin yang dapat mengimpor pegawai." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "import" ? "import" : "preview";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File Excel belum dipilih." }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json({ error: "Ukuran file terlalu besar (maksimal 2 MB)." }, { status: 400 });
  }

  const parsed = await parseEmployeeWorkbook(Buffer.from(await file.arrayBuffer()));
  if (parsed.fatal) {
    return NextResponse.json({ error: parsed.fatal }, { status: 400 });
  }

  const admin = createAdminClient();

  // Pastikan migrasi SQL sudah dijalankan SEBELUM ada akun yang dibuat.
  const probe = await admin.from("employees").select("must_change_password").limit(1);
  if (probe.error) {
    return NextResponse.json(
      {
        error:
          "Kolom must_change_password belum ada. Jalankan supabase/update-import-pegawai-excel.sql di Supabase SQL Editor terlebih dahulu.",
      },
      { status: 500 }
    );
  }

  // Data yang sudah ada — untuk deteksi duplikat NIP / email sebelum membuat akun.
  const existing = await fetchAllRows<{ nip: string | null; email: string | null }>((a, b) =>
    admin.from("employees").select("nip, email").order("id").range(a, b)
  );
  if (existing.error) {
    return NextResponse.json({ error: "Gagal membaca data pegawai: " + existing.error }, { status: 500 });
  }
  const dbEmails = new Set(existing.data.map((e) => (e.email ?? "").toLowerCase()).filter(Boolean));
  const dbNips = new Set(existing.data.map((e) => e.nip ?? "").filter(Boolean));

  // Validasi silang: duplikat terhadap database & antar-baris dalam file yang sama.
  const seenEmail = new Map<string, number>();
  const seenNip = new Map<string, number>();
  for (const row of parsed.rows) {
    if (row.email) {
      if (dbEmails.has(row.email)) row.errors.push("EMAIL sudah terdaftar di data pegawai");
      const first = seenEmail.get(row.email);
      if (first !== undefined) row.errors.push(`EMAIL sama dengan baris ${first}`);
      else seenEmail.set(row.email, row.rowNumber);
    }
    if (row.nip) {
      if (dbNips.has(row.nip)) row.errors.push("NIP sudah terdaftar di data pegawai");
      const first = seenNip.get(row.nip);
      if (first !== undefined) row.errors.push(`NIP sama dengan baris ${first}`);
      else seenNip.set(row.nip, row.rowNumber);
    }
  }

  const toResult = (r: ParsedRow, status: RowStatus, message: string | null): RowResult => ({
    rowNumber: r.rowNumber,
    full_name: r.full_name,
    nip: r.nip,
    position: r.position,
    role: r.role,
    email: r.email,
    phone: r.phone,
    status,
    message,
  });

  const valid = parsed.rows.filter((r) => r.errors.length === 0);
  const invalid = parsed.rows.filter((r) => r.errors.length > 0);

  if (mode === "preview") {
    const results = parsed.rows.map((r) =>
      r.errors.length ? toResult(r, "error", r.errors.join("; ")) : toResult(r, "ok", null)
    );
    return NextResponse.json({
      mode,
      total: parsed.rows.length,
      valid: valid.length,
      invalid: invalid.length,
      rows: results,
    });
  }

  // ---- mode import ----
  const created = await mapLimit(valid, 5, async (row): Promise<RowResult> => {
    const { data, error } = await admin.auth.admin.createUser({
      email: row.email,
      password: row.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      return toResult(row, "failed", translateCreateError(error?.message ?? "Gagal membuat akun."));
    }

    const { error: insertError } = await admin.from("employees").insert({
      id: data.user.id,
      nip: row.nip,
      full_name: row.full_name,
      position: row.position,
      email: row.email,
      phone: row.phone,
      role: row.role,
      is_active: true,
      must_change_password: true, // wajib ganti password saat login pertama
    });
    if (insertError) {
      await admin.auth.admin.deleteUser(data.user.id); // rollback: jangan tinggalkan akun yatim
      return toResult(row, "failed", insertError.message);
    }
    return toResult(row, "created", null);
  });

  const createdOk = created.filter((r) => r.status === "created");
  const failed = created.filter((r) => r.status === "failed");

  let auditWarning: string | null = null;
  if (createdOk.length > 0) {
    auditWarning = await writeAudit(admin, actor, {
      action: "employee.import",
      target_type: "employee",
      target_label: `Import Excel: ${createdOk.length} pegawai (${file.name})`,
      new_data: {
        file: file.name,
        created: createdOk.map((r) => ({ nip: r.nip, full_name: r.full_name, role: r.role, email: r.email })),
        skipped: invalid.length,
        failed: failed.length,
      },
    });
  }

  const results = [
    ...invalid.map((r) => toResult(r, "error", r.errors.join("; "))),
    ...created,
  ].sort((a, b) => a.rowNumber - b.rowNumber);

  return NextResponse.json({
    mode,
    total: parsed.rows.length,
    created: createdOk.length,
    skipped: invalid.length,
    failed: failed.length,
    rows: results,
    auditWarning,
  });
}
