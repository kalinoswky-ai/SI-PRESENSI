import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { witaDateKey, witaTimeHHMM } from "@/lib/geo";
import { addDays, toDateStr } from "@/lib/reports/attendanceGrid";
import { groupByDay } from "@/lib/employee/history";
import type { AttendanceRecord } from "@/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_BACKDATE_DAYS = 30; // batas wajar, sama dengan pengajuan lembur; mudah diubah di sini
const MIN_REASON = 5;
const MAX_REASON = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
// Jenis lampiran yang diterima -> ekstensi yang dipakai (diturunkan dari tipe, bukan nama file).
const ALLOWED_FILES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Pegawai mengajukan koreksi absensi. Endpoint ini HANYA menyimpan pengajuan berstatus
 * "pending" — tidak pernah menyentuh tabel attendance. Semua validasi dilakukan di server
 * (jam server WITA), RLS memastikan pegawai hanya bisa membuat pengajuan untuk dirinya.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: me } = await supabase.from("employees").select("is_active").eq("id", userId).single();
  if (!me || !me.is_active) {
    return NextResponse.json({ error: "Akun tidak aktif." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });

  const workDate = String(formData.get("work_date") ?? "");
  const type = String(formData.get("type") ?? "");
  const requestedTime = String(formData.get("requested_time") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const attachment = formData.get("attachment");

  if (!DATE_RE.test(workDate) || !TIME_RE.test(requestedTime) || (type !== "in" && type !== "out")) {
    return NextResponse.json({ error: "Tanggal, jenis koreksi, atau jam tidak valid." }, { status: 400 });
  }
  if (reason.length < MIN_REASON) {
    return NextResponse.json({ error: `Alasan wajib diisi (minimal ${MIN_REASON} karakter).` }, { status: 400 });
  }
  if (reason.length > MAX_REASON) {
    return NextResponse.json({ error: `Alasan terlalu panjang (maksimal ${MAX_REASON} karakter).` }, { status: 400 });
  }

  // Validasi tanggal terhadap jam SERVER (WITA), bukan jam perangkat.
  const now = new Date();
  const today = witaDateKey(now);
  const earliest = witaDateKey(new Date(now.getTime() - MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000));
  if (Number.isNaN(new Date(`${workDate}T00:00:00Z`).getTime())) {
    return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  }
  if (workDate > today) {
    return NextResponse.json({ error: "Koreksi tidak dapat diajukan untuk tanggal yang belum terjadi." }, { status: 400 });
  }
  if (workDate < earliest) {
    return NextResponse.json(
      { error: `Koreksi hanya dapat diajukan maksimal ${MAX_BACKDATE_DAYS} hari ke belakang.` },
      { status: 400 }
    );
  }
  if (workDate === today && toMin(requestedTime) > toMin(witaTimeHHMM(now))) {
    return NextResponse.json({ error: "Jam yang diajukan belum terjadi." }, { status: 400 });
  }

  // Konsistensi dengan absensi valid pada hari itu: masuk harus sebelum pulang.
  const nextDay = toDateStr(addDays(new Date(`${workDate}T00:00:00Z`), 1));
  const { data: dayRows } = await supabase
    .from("attendance")
    .select("*")
    .eq("employee_id", userId)
    .gte("server_time", `${workDate}T00:00:00+08:00`)
    .lt("server_time", `${nextDay}T00:00:00+08:00`);
  const day = groupByDay((dayRows ?? []) as AttendanceRecord[])[0];
  if (type === "in" && day?.lastOut) {
    const outMin = toMin(witaTimeHHMM(new Date(day.lastOut.server_time)));
    if (toMin(requestedTime) >= outMin) {
      return NextResponse.json({ error: "Jam masuk yang diajukan harus sebelum jam pulang yang tercatat." }, { status: 400 });
    }
  }
  if (type === "out" && day?.firstIn) {
    const inMin = toMin(witaTimeHHMM(new Date(day.firstIn.server_time)));
    if (toMin(requestedTime) <= inMin) {
      return NextResponse.json({ error: "Jam pulang yang diajukan harus setelah jam masuk yang tercatat." }, { status: 400 });
    }
  }

  // Cegah pengajuan ganda (juga dijaga unique index di database).
  const { data: dup } = await supabase
    .from("attendance_corrections")
    .select("id")
    .eq("employee_id", userId)
    .eq("work_date", workDate)
    .eq("type", type)
    .eq("status", "pending")
    .limit(1);
  if (dup && dup.length > 0) {
    return NextResponse.json(
      { error: "Sudah ada pengajuan koreksi yang menunggu persetujuan untuk tanggal dan jenis yang sama." },
      { status: 409 }
    );
  }

  // Lampiran (opsional): validasi tipe & ukuran, ekstensi dari tipe. Gagal unggah = pengajuan dibatalkan.
  let attachmentPath: string | null = null;
  if (attachment instanceof File && attachment.size > 0) {
    const ext = ALLOWED_FILES[attachment.type];
    if (!ext) {
      return NextResponse.json({ error: "Lampiran harus berupa PDF atau gambar (JPG/PNG/WEBP)." }, { status: 400 });
    }
    if (attachment.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Ukuran lampiran maksimal 5 MB." }, { status: 400 });
    }
    const path = `${userId}/koreksi-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("leave-attachments")
      .upload(path, await attachment.arrayBuffer(), { contentType: attachment.type });
    if (uploadError) {
      return NextResponse.json({ error: "Lampiran gagal diunggah. Coba lagi atau kirim tanpa lampiran." }, { status: 500 });
    }
    attachmentPath = path;
  }

  const { data: record, error } = await supabase
    .from("attendance_corrections")
    .insert({
      employee_id: userId,
      work_date: workDate,
      type,
      requested_time: requestedTime,
      reason,
      attachment_url: attachmentPath,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    if (attachmentPath) await supabase.storage.from("leave-attachments").remove([attachmentPath]);
    const missing = /attendance_corrections/.test(error.message) && /(relation|schema cache|does not exist)/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "Fitur belum aktif: jalankan supabase/update-koreksi-absensi.sql di Supabase SQL Editor."
          : error.code === "23505"
          ? "Sudah ada pengajuan koreksi yang menunggu persetujuan untuk tanggal dan jenis yang sama."
          : error.message,
      },
      { status: error.code === "23505" ? 409 : 400 }
    );
  }

  return NextResponse.json({ success: true, record });
}
