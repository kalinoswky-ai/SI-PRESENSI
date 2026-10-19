import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";

const MAX_ROWS = 5000;

function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Hapus banyak data absensi sekaligus (khusus Admin) — dua mode:
 *  - { ids: [...] }                              : baris terpilih di Timesheets > Log Absensi
 *  - { filter: { from, to, employee_id?, status? } } : per rentang tanggal (Reports)
 * Alasan wajib. Satu entri audit_log berisi ringkasan seluruh baris yang dihapus.
 */
export async function POST(request: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "Hanya Admin yang dapat menghapus data absensi." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const reason = cleanText(body?.reason);
  if (!reason || reason.length < 3) {
    return NextResponse.json({ error: "Alasan penghapusan wajib diisi (minimal 3 karakter)." }, { status: 400 });
  }

  const admin = createAdminClient();
  const cols = "id, employee_id, type, server_time, status, selfie_url";
  type Row = {
    id: string;
    employee_id: string;
    type: string;
    server_time: string;
    status: string;
    selfie_url: string | null;
  };
  let rows: Row[] = [];
  let scope = "";

  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((x: unknown) => typeof x === "string") as string[];
    if (ids.length === 0 || ids.length > 1000) {
      return NextResponse.json({ error: "Pilih 1–1000 data untuk dihapus." }, { status: 400 });
    }
    const { data, error } = await admin.from("attendance").select(cols).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows = (data ?? []) as Row[];
    scope = `${ids.length} data terpilih`;
  } else if (body.filter && typeof body.filter === "object") {
    const f = body.filter;
    if (!isDate(f.from) || !isDate(f.to)) {
      return NextResponse.json({ error: "Rentang tanggal tidak valid." }, { status: 400 });
    }
    let q = admin
      .from("attendance")
      .select(cols)
      .gte("server_time", `${f.from}T00:00:00+08:00`)
      .lte("server_time", `${f.to}T23:59:59.999+08:00`)
      .limit(MAX_ROWS + 1);
    if (typeof f.employee_id === "string" && f.employee_id) q = q.eq("employee_id", f.employee_id);
    if (f.status === "rejected" || f.status === "valid") q = q.eq("status", f.status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows = (data ?? []) as Row[];
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Terlalu banyak data (>${MAX_ROWS}). Persempit rentang tanggal lalu ulangi.` },
        { status: 400 }
      );
    }
    scope = `rentang ${f.from} s/d ${f.to}` +
      (f.employee_id ? " (1 pegawai)" : " (semua pegawai)") +
      (f.status ? ` — hanya status ${f.status === "rejected" ? "Ditolak" : "Valid"}` : "");
  } else {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: true, deleted: 0 });
  }

  const auditError = await writeAudit(admin, actor, {
    action: "attendance.bulk_delete",
    target_type: "attendance",
    target_label: `${rows.length} data absensi — ${scope}`,
    reason,
    old_data: {
      count: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        employee_id: r.employee_id,
        type: r.type,
        server_time: r.server_time,
        status: r.status,
      })),
    },
  });
  if (auditError) return NextResponse.json({ error: auditError }, { status: 500 });

  let deleted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => r.id);
    const { error } = await admin.from("attendance").delete().in("id", chunk);
    if (error) {
      return NextResponse.json(
        { error: `Berhenti di tengah proses (terhapus ${deleted} data): ${error.message}` },
        { status: 500 }
      );
    }
    deleted += chunk.length;
  }

  const selfies = rows.map((r) => r.selfie_url).filter((p): p is string => Boolean(p));
  for (let i = 0; i < selfies.length; i += 100) {
    try {
      await admin.storage.from("selfies").remove(selfies.slice(i, i + 100));
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ success: true, deleted });
}
