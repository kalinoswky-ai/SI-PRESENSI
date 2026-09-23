import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { distanceInMeters, faceDistance, FACE_MATCH_THRESHOLD, isLateClockIn } from "@/lib/geo";
import { notifyLateAttendance } from "@/lib/notifications/notify";
import type { Office } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }
  const userId = userData.user.id;

  const formData = await request.formData();
  const type = formData.get("type") as string; // 'in' | 'out'
  const latitude = parseFloat(formData.get("latitude") as string);
  const longitude = parseFloat(formData.get("longitude") as string);
  const descriptorRaw = formData.get("descriptor") as string;
  const selfieFile = formData.get("selfie") as File | null;

  if (
    !["in", "out"].includes(type) ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude) ||
    !descriptorRaw ||
    !selfieFile
  ) {
    return NextResponse.json({ error: "Data absensi tidak lengkap." }, { status: 400 });
  }

  let capturedDescriptor: number[];
  try {
    capturedDescriptor = JSON.parse(descriptorRaw);
  } catch {
    return NextResponse.json({ error: "Data wajah tidak valid." }, { status: 400 });
  }

  // 1. Ambil profil pegawai + descriptor wajah terdaftar
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, full_name, nip, position, phone, face_descriptor, is_active")
    .eq("id", userId)
    .single();

  if (employeeError || !employee) {
    return NextResponse.json({ error: "Profil pegawai tidak ditemukan." }, { status: 404 });
  }
  if (!employee.is_active) {
    return NextResponse.json({ error: "Akun pegawai tidak aktif." }, { status: 403 });
  }
  if (!employee.face_descriptor) {
    return NextResponse.json(
      { error: "Wajah belum didaftarkan. Hubungi Admin untuk pendaftaran wajah." },
      { status: 400 }
    );
  }

  // 2. Ambil konfigurasi kantor (lokasi & radius geofencing)
  const { data: office, error: officeError } = await supabase
    .from("offices")
    .select("*")
    .limit(1)
    .single();

  if (officeError || !office) {
    return NextResponse.json({ error: "Konfigurasi lokasi kantor belum diatur." }, { status: 500 });
  }

  // 3. Validasi geofencing (dihitung ulang di server, tidak percaya klien)
  const distance = distanceInMeters(latitude, longitude, office.latitude, office.longitude);
  const withinGeofence = distance <= office.radius_meters;

  // 4. Validasi wajah (dihitung ulang di server)
  const registeredDescriptor = employee.face_descriptor as number[];
  const fDistance = faceDistance(capturedDescriptor, registeredDescriptor);
  const faceMatch = fDistance <= FACE_MATCH_THRESHOLD;

  // 5. Waktu server — SATU-SATUNYA sumber waktu yang dipercaya (bukan jam HP pegawai)
  const serverTime = new Date();

  let status: "valid" | "rejected" = "valid";
  let rejectReason: string | null = null;

  if (!withinGeofence) {
    status = "rejected";
    rejectReason = `Lokasi di luar radius kantor (jarak ${Math.round(distance)}m, maksimal ${office.radius_meters}m).`;
  } else if (!faceMatch) {
    status = "rejected";
    rejectReason = "Wajah tidak sesuai dengan data terdaftar.";
  }

  // 6. Upload foto selfie ke Supabase Storage
  const fileName = `${userId}/${serverTime.getTime()}.jpg`;
  const arrayBuffer = await selfieFile.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("selfies")
    .upload(fileName, arrayBuffer, { contentType: "image/jpeg" });

  let selfieUrl: string | null = null;
  if (!uploadError) {
    selfieUrl = fileName;
  }

  const isLate = type === "in" ? isLateClockIn(serverTime, office.work_start, office.friday_hybrid) : false;

  // 7. Simpan record absensi (RLS memastikan employee_id = auth.uid())
  const { data: record, error: insertError } = await supabase
    .from("attendance")
    .insert({
      employee_id: userId,
      type,
      server_time: serverTime.toISOString(),
      latitude,
      longitude,
      distance_meters: Math.round(distance * 100) / 100,
      within_geofence: withinGeofence,
      face_match: faceMatch,
      face_distance: Math.round(fDistance * 1000) / 1000,
      selfie_url: selfieUrl,
      status,
      reject_reason: rejectReason,
      is_late: isLate,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Gagal menyimpan data absensi." }, { status: 500 });
  }

  // Notifikasi WhatsApp/Telegram jika pegawai terlambat absen masuk (valid & terlambat).
  // Dijalankan best-effort — kegagalan notifikasi tidak pernah menggagalkan respons absensi.
  if (status === "valid" && isLate) {
    void notifyLateAttendance(employee, office as Office, serverTime);
  }

  return NextResponse.json({
    record,
    status,
    rejectReason,
    distance: Math.round(distance),
    isLate,
  });
}
