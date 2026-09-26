import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  distanceInMeters,
  faceDistance,
  FACE_MATCH_THRESHOLD,
  isFridayWita,
  formatDistance,
  isLateClockIn,
  isBeforeWorkEnd,
  witaDateKey,
  witaDayOfMonth,
  witaIsoWeekday,
  witaTimeHHMM,
} from "@/lib/geo";
import { notifyLateAttendance } from "@/lib/notifications/notify";
import type { ApelExemptionReason, ApelLocation, Office, WorkMode } from "@/types";
import { APEL_EXEMPTION_REASON_LABEL } from "@/types";

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
  const requestedMode: WorkMode = formData.get("work_mode") === "wfh" ? "wfh" : "wfo";
  const requestedApelLocationId = (formData.get("apel_location_id") as string | null) || null;

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
    .select("id, full_name, nip, position, phone, face_descriptor, is_active, apel_group")
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

  // 5. Waktu server — SATU-SATUNYA sumber waktu yang dipercaya (bukan jam HP pegawai)
  const serverTime = new Date();

  // 3a. Validasi geofencing kantor (dihitung ulang di server, tidak percaya klien).
  //     Jarak tetap dicatat untuk WFH, tetapi radius kantor hanya diwajibkan untuk WFO.
  const distance = distanceInMeters(latitude, longitude, office.latitude, office.longitude);
  const withinOfficeGeofence = distance <= office.radius_meters;

  // 3b. Lokasi apel pagi: jadwal MINGGUAN Senin (Kantor Bupati, semua pegawai) & Rabu (per
  //     kelompok OPD), maupun jadwal BULANAN pada tanggal tetap (mis. tanggal 17 — Apel
  //     Kesadaran Nasional, biasanya semua pegawai). Absen masuk pada hari tsb boleh
  //     dilakukan dari lokasi apel, bukan hanya kantor. Dihitung ulang di server: kandidat
  //     lokasi ditentukan dari hari/tanggal server (WITA) + kelompok apel pegawai, klien
  //     hanya mengirim ID lokasi mana yang ia hadiri.
  //     Lokasi yang `cancelled_date`-nya = tanggal hari ini dianggap TIDAK TERSEDIA
  //     (apel ditiadakan pada tanggal tsb saja) — presensi otomatis kembali wajib di kantor.
  const weekday = witaIsoWeekday(serverTime);
  const dayOfMonth = witaDayOfMonth(serverTime);
  const todayKey = witaDateKey(serverTime);
  let apelLocation: ApelLocation | null = null;
  let apelDistance: number | null = null;
  let withinApelGeofence = false;
  let apelCancelledToday = false; // apel dijadwalkan hari ini tapi seluruh lokasi yg relevan dibatalkan

  if (type === "in") {
    const { data: apelRows } = await supabase.from("apel_locations").select("*").eq("is_active", true);

    const scheduledToday = ((apelRows ?? []) as ApelLocation[]).filter(
      (loc) => loc.weekday === weekday || loc.day_of_month === dayOfMonth
    );
    const relevant = scheduledToday.filter(
      (loc) => loc.group_name === null || loc.group_name === employee.apel_group
    );
    const candidates = relevant.filter((loc) => loc.cancelled_date !== todayKey);
    apelCancelledToday = relevant.length > 0 && candidates.length === 0;

    if (candidates.length === 1) {
      apelLocation = candidates[0];
    } else if (candidates.length > 1 && requestedApelLocationId) {
      apelLocation = candidates.find((c) => c.id === requestedApelLocationId) ?? null;
    }

    if (apelLocation) {
      apelDistance = distanceInMeters(latitude, longitude, apelLocation.latitude, apelLocation.longitude);
      withinApelGeofence = apelDistance <= apelLocation.radius_meters;
    }
  }

  const withinGeofence = withinOfficeGeofence || withinApelGeofence;

  // 3c. Pengecualian apel (sakit/hamil/alasan khusus) yang sudah disetujui pimpinan/Inspektur
  //     utk tanggal ini — dicek ULANG di server (bukan hanya kiriman klien) agar tidak bisa
  //     dipalsukan. Pegawai yang dikecualikan BOLEH absen masuk & pulang dari rumahnya
  //     masing-masing (tidak wajib ke kantor) — lihat penentuan workMode di bawah. Hanya
  //     relevan bila hari ini memang ada jadwal apel (apelLocation ada).
  let apelExemptionReason: ApelExemptionReason | null = null;
  if (type === "in" && apelLocation) {
    const { data: exemptionRow } = await supabase
      .from("leave_requests")
      .select("apel_exemption_reason")
      .eq("employee_id", userId)
      .eq("type", "pengecualian_apel")
      .eq("status", "approved")
      .lte("start_date", todayKey)
      .gte("end_date", todayKey)
      .limit(1)
      .maybeSingle();
    apelExemptionReason = (exemptionRow?.apel_exemption_reason as ApelExemptionReason | null) ?? null;
  }
  const apelExempted = Boolean(apelExemptionReason);

  // 3d. Tentukan mode kerja. WFH (bebas radius kantor SEPANJANG HARI) HANYA berlaku bila hari
  //     Jumat & kebijakan Jumat hybrid aktif (sesuai pilihan pegawai). Pengecualian apel BUKAN
  //     WFH — pegawai yang dikecualikan tetap berstatus WFO karena tetap wajib masuk kantor
  //     setelah apel pagi selesai; pengecualian hanya membebaskan validasi radius kantor untuk
  //     momen absen MASUK di jam apel pagi saja (lihat bypass geofence di bawah, bukan di sini).
  //     Di luar Jumat hybrid, selalu WFO (wajib geofencing) berapa pun yang dikirim klien.
  const hybridFriday = Boolean(office.friday_hybrid) && isFridayWita(serverTime);
  let workMode: WorkMode = "wfo";
  if (type === "in") {
    if (hybridFriday) {
      workMode = requestedMode;
    }
  } else {
    // Absen pulang mengikuti mode absen masuk hari ini (tidak bisa ganti mode di tengah hari) —
    // dicek dari record absen masuk yang tersimpan, bukan cuma dugaan hari ini WFH/WFO.
    const dayStart = `${todayKey}T00:00:00+08:00`;
    const { data: todayIn } = await supabase
      .from("attendance")
      .select("work_mode")
      .eq("employee_id", userId)
      .eq("type", "in")
      .eq("status", "valid")
      .gte("server_time", dayStart)
      .order("server_time", { ascending: true })
      .limit(1)
      .maybeSingle();
    workMode = todayIn?.work_mode === "wfh" ? "wfh" : "wfo";
  }

  // 4. Validasi wajah (dihitung ulang di server)
  const registeredDescriptor = employee.face_descriptor as number[];
  const fDistance = faceDistance(capturedDescriptor, registeredDescriptor);
  const faceMatch = fDistance <= FACE_MATCH_THRESHOLD;

  let status: "valid" | "rejected" = "valid";
  let rejectReason: string | null = null;

  // Absen PULANG hanya boleh dilakukan TEPAT pada jam pulang (work_end) kantor atau setelahnya —
  // sebelum jam tsb, clock-out selalu ditolak, apa pun lokasi/mode kerjanya.
  const beforeWorkEnd = type === "out" && isBeforeWorkEnd(serverTime, office.work_end);

  // Radius kantor HANYA diwajibkan untuk absen MASUK mode WFO, KECUALI pegawai yang punya
  // pengecualian apel disetujui hari ini (apelExempted) — mereka TETAP WFO (bukan WFH), hanya
  // dibebaskan dari validasi radius UNTUK ABSEN MASUK di jam apel pagi ini saja, karena setelah
  // apel selesai mereka tetap wajib masuk kantor seperti biasa. Absen PULANG tidak pernah
  // ditolak karena lokasi — pegawai yang audit/tugas lapangan hingga lewat jam kantor tetap bisa
  // absen pulang; titik koordinat sebenarnya tetap direkam untuk jejak audit.
  if (beforeWorkEnd) {
    status = "rejected";
    rejectReason = `Absen pulang belum bisa dilakukan. Jam pulang yang ditentukan adalah pukul ${office.work_end} WITA — saat ini baru pukul ${witaTimeHHMM(
      serverTime
    )} WITA. Absen pulang hanya dapat dilakukan tepat pukul ${office.work_end} WITA atau setelahnya.`;
  } else if (type === "in" && workMode === "wfo" && !apelExempted && !withinGeofence) {
    status = "rejected";
    if (apelCancelledToday) {
      rejectReason = `Apel pagi hari ini ditiadakan, presensi kembali dilakukan di Kantor Inspektorat. Lokasi Anda di luar radius kantor (jarak ${Math.round(
        distance
      )}m, maksimal ${office.radius_meters}m).`;
    } else {
      rejectReason = apelLocation
        ? `Lokasi di luar radius kantor (${Math.round(distance)}m) maupun lokasi apel "${apelLocation.name}" (${Math.round(
            apelDistance ?? 0
          )}m, maksimal ${apelLocation.radius_meters}m).`
        : `Lokasi di luar radius kantor (jarak ${Math.round(distance)}m, maksimal ${office.radius_meters}m).`;
    }
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

  // Label lokasi utk jejak audit. Absen PULANG boleh di mana saja (mis. tugas lapangan/audit yang
  // belum selesai saat jam pulang kantor) — koordinat GPS + label ini selalu tercatat.
  // Absen MASUK: label mengikuti lokasi SEBENARNYA (bukan sekadar jadwal apel hari itu) —
  // hanya disebut "hadir di lokasi apel" bila pegawai benar-benar berada di radiusnya.
  let locationLabel: string | null = null;
  if (type === "in") {
    if (apelCancelledToday && !apelLocation) {
      locationLabel = "Apel ditiadakan — absen di Kantor Inspektorat";
    } else if (apelLocation && withinApelGeofence) {
      locationLabel = apelLocation.name;
    } else if (apelLocation && apelExempted) {
      // Dikecualikan dari apel = boleh absen dari rumah masing-masing (tidak wajib ke kantor).
      // Tetap dibedakan di label bila kebetulan pegawai absen dari radius kantor.
      locationLabel = withinOfficeGeofence
        ? `Absen di Kantor Inspektorat — dikecualikan dari apel (${APEL_EXEMPTION_REASON_LABEL[apelExemptionReason as ApelExemptionReason]})`
        : `Absen dari rumah — dikecualikan dari apel (${APEL_EXEMPTION_REASON_LABEL[apelExemptionReason as ApelExemptionReason]})`;
    } else if (apelLocation && withinOfficeGeofence) {
      locationLabel = "Absen di Kantor Inspektorat";
    } else if (apelLocation) {
      locationLabel = apelLocation.name;
    }
  } else {
    if (workMode === "wfh") locationLabel = "Pulang dari rumah (WFH)";
    else if (withinOfficeGeofence) locationLabel = "Pulang dari kantor";
    else locationLabel = `Pulang di luar kantor / lapangan (${formatDistance(distance)} dari kantor)`;
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
      work_mode: workMode,
      apel_location_id: apelLocation?.id ?? null,
      location_label: locationLabel,
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
    workMode,
    apelLocationName: apelLocation?.name ?? null,
    apelCancelledToday,
    apelExempted,
    apelExemptionReason,
    locationLabel,
  });
}
