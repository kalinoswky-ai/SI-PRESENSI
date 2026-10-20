import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeaveApprover } from "@/lib/admin/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Membuat kegiatan lapangan (absen terkunci). Hanya Admin utama / Inspektur / Sekretaris.
 * Wewenang diperiksa DI SERVER; absen sesungguhnya divalidasi ulang di /api/attendance/clock.
 */
export async function POST(request: NextRequest) {
  const actor = await getLeaveApprover();
  if (!actor) {
    return NextResponse.json(
      { error: "Hanya Admin, Inspektur, atau Sekretaris yang berwenang membuat kegiatan." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() || null : null;
  const activityDate = body?.activity_date;
  const startTime = body?.start_time;
  const endTime = body?.end_time;
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const radius = Math.round(Number(body?.radius_meters));
  const allowClockOut = body?.allow_clock_out === true;
  const clockOutTime = body?.clock_out_time;
  const participantIds: string[] = Array.isArray(body?.participant_ids)
    ? Array.from(new Set(body.participant_ids.filter((x: unknown) => typeof x === "string" && UUID_RE.test(x))))
    : [];

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Nama kegiatan wajib diisi (maks. 200 karakter)." }, { status: 400 });
  }
  if (typeof activityDate !== "string" || !DATE_RE.test(activityDate)) {
    return NextResponse.json({ error: "Tanggal kegiatan tidak valid." }, { status: 400 });
  }
  if (typeof startTime !== "string" || typeof endTime !== "string" || !TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return NextResponse.json({ error: "Jam mulai/selesai tidak valid (format HH:MM)." }, { status: 400 });
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: "Jam selesai harus lebih besar dari jam mulai." }, { status: 400 });
  }
  if (allowClockOut) {
    if (typeof clockOutTime !== "string" || !TIME_RE.test(clockOutTime)) {
      return NextResponse.json({ error: "Jam mulai absen pulang di lokasi tugas tidak valid (format HH:MM)." }, { status: 400 });
    }
    if (clockOutTime <= startTime) {
      return NextResponse.json({ error: "Jam absen pulang harus lebih besar dari jam absen dibuka." }, { status: 400 });
    }
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: "Koordinat lokasi kegiatan tidak valid." }, { status: 400 });
  }
  if (!Number.isFinite(radius) || radius < 20 || radius > 2000) {
    return NextResponse.json({ error: "Radius harus 20–2000 meter." }, { status: 400 });
  }
  if (participantIds.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu pegawai peserta kegiatan." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: created, error } = await admin
    .from("kegiatan_absensi")
    .insert({
      name,
      description,
      activity_date: activityDate,
      start_time: startTime,
      end_time: endTime,
      latitude,
      longitude,
      radius_meters: radius,
      is_active: true,
      created_by: actor.id,
      // Kolom opsi pulang hanya dikirim bila dipakai, agar pembuatan kegiatan biasa tetap berjalan
      // walau migrasi update-kegiatan-pulang-lokasi-tugas.sql belum dijalankan.
      ...(allowClockOut ? { allow_clock_out: true, clock_out_time: clockOutTime } : {}),
    })
    .select("id")
    .single();

  if (error || !created) {
    const notReady = /does not exist|schema cache|relation/i.test(error?.message ?? "");
    return NextResponse.json(
      {
        error: notReady
          ? allowClockOut
            ? "Fitur belum aktif: jalankan supabase/update-admin-approval-apel-kegiatan.sql dan supabase/update-kegiatan-pulang-lokasi-tugas.sql di Supabase SQL Editor."
            : "Fitur belum aktif: jalankan supabase/update-admin-approval-apel-kegiatan.sql di Supabase SQL Editor."
          : "Gagal menyimpan kegiatan.",
      },
      { status: 500 }
    );
  }

  const { error: pErr } = await admin
    .from("kegiatan_peserta")
    .insert(participantIds.map((employee_id) => ({ kegiatan_id: created.id, employee_id })));
  if (pErr) {
    await admin.from("kegiatan_absensi").delete().eq("id", created.id); // jangan tinggalkan kegiatan tanpa peserta
    return NextResponse.json({ error: "Gagal menyimpan daftar peserta." }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: created.id });
}
