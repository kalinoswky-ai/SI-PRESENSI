"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useGeolocation } from "@/lib/useGeolocation";
import FaceCamera, { FaceCaptureResult } from "@/components/FaceCamera";
import ServerClock from "@/components/ServerClock";
import { distanceInMeters, isFridayWita, witaDateKey, witaIsoWeekday } from "@/lib/geo";
import { formatTime } from "@/lib/employee/history";
import RecentHistory from "@/components/employee-dashboard/RecentHistory";
import type { ApelLocation, AttendanceRecord, Employee, LeaveRequest, Office, WorkMode } from "@/types";
import { LEAVE_TYPE_LABEL } from "@/types";
import { CheckCircle2, MapPin, XCircle, LogIn, LogOut, CalendarClock, ScanFace, Building2, Home } from "lucide-react";

type Step = "idle" | "locating" | "capturing" | "submitting" | "done";

export default function DashboardPage() {
  const supabase = createClient();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [todayLeave, setTodayLeave] = useState<LeaveRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFriday, setIsFriday] = useState(false); // berdasarkan waktu SERVER (WITA)
  const [chosenMode, setChosenMode] = useState<WorkMode | null>(null); // pilihan WFO/WFH utk absen masuk
  const [apelCandidates, setApelCandidates] = useState<ApelLocation[]>([]); // lokasi apel Senin/Rabu yang berlaku hari ini
  const [chosenApelId, setChosenApelId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("idle");
  const [pendingType, setPendingType] = useState<"in" | "out" | null>(null);
  const [capture, setCapture] = useState<FaceCaptureResult | null>(null);
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const geo = useGeolocation();

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // Hari Senin/Rabu/Jumat & tanggal "hari ini" ditentukan dari jam server (WITA), bukan jam HP
      // pegawai — dan bukan tanggal UTC (pukul 00.00–08.00 WITA tanggal UTC masih kemarin).
      let serverNow = new Date();
      try {
        const st = await fetch(`/api/server-time?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
        serverNow = new Date(st.serverTime);
      } catch {
        // gagal mengambil jam server: pakai jam perangkat hanya untuk tampilan awal
      }
      setIsFriday(isFridayWita(serverNow));
      const weekday = witaIsoWeekday(serverNow);
      const todayStr = witaDateKey(serverNow);

      const [{ data: emp }, { data: off }, { data: att }, { data: leave }, apelRes] = await Promise.all([
        supabase.from("employees").select("*").eq("id", userData.user.id).single(),
        supabase.from("offices").select("*").limit(1).single(),
        supabase
          .from("attendance")
          .select("*")
          .eq("employee_id", userData.user.id)
          .gte("server_time", `${todayStr}T00:00:00+08:00`)
          .order("server_time", { ascending: true }),
        supabase
          .from("leave_requests")
          .select("*")
          .eq("employee_id", userData.user.id)
          .eq("status", "approved")
          .lte("start_date", todayStr)
          .gte("end_date", todayStr)
          .limit(1)
          .maybeSingle(),
        weekday === 1 || weekday === 3
          ? supabase.from("apel_locations").select("*").eq("weekday", weekday).eq("is_active", true)
          : Promise.resolve({ data: [] as ApelLocation[] }),
      ]);

      const employeeData = emp as Employee;
      setEmployee(employeeData);
      setOffice(off as Office);
      setTodayRecords((att ?? []) as AttendanceRecord[]);
      setTodayLeave((leave as LeaveRequest) ?? null);

      // Hanya lokasi apel yang berlaku utk semua pegawai (group_name null, khusus Senin) atau
      // yang sesuai kelompok OPD pegawai ybs (khusus Rabu) yang ditampilkan sbg pilihan.
      const apelRows = ((apelRes?.data ?? []) as ApelLocation[]).filter(
        (loc) => loc.group_name === null || loc.group_name === employeeData?.apel_group
      );
      setApelCandidates(apelRows);
      if (apelRows.length === 1) setChosenApelId(apelRows[0].id);

      setLoading(false);
    }
    load();
  }, [supabase]);

  const validIn = todayRecords.find((r) => r.type === "in" && r.status === "valid");
  const validOut = todayRecords.find((r) => r.type === "out" && r.status === "valid");
  const nextType: "in" | "out" = !validIn ? "in" : "out";

  // Pilihan WFO/WFH hanya muncul pada hari Jumat bila kebijakan Jumat hybrid aktif
  const hybridToday = Boolean(office?.friday_hybrid) && isFriday;
  // Mode kerja yang berlaku saat ini: absen pulang mengikuti mode absen masuk
  const activeMode: WorkMode = validIn ? (validIn.work_mode === "wfh" ? "wfh" : "wfo") : (chosenMode ?? "wfo");
  const isWfh = hybridToday && activeMode === "wfh";
  const needModeChoice = hybridToday && !validIn && !chosenMode;

  // Pilihan lokasi apel (Senin/Rabu) hanya relevan sebelum absen MASUK & bila ada >1 kandidat lokasi
  const needApelChoice = !validIn && apelCandidates.length > 1 && !chosenApelId;
  const chosenApelLocation = apelCandidates.find((a) => a.id === chosenApelId) ?? null;

  function startClock(type: "in" | "out", mode?: WorkMode) {
    if (mode) setChosenMode(mode);
    setPendingType(type);
    setResultMsg(null);
    setCapture(null);
    setStep("locating");
    geo.request();
    setStep("capturing");
  }

  async function handleSubmit() {
    if (!capture || !geo.position || !pendingType) return;
    setStep("submitting");

    const formData = new FormData();
    formData.append("type", pendingType);
    formData.append("latitude", String(geo.position.latitude));
    formData.append("longitude", String(geo.position.longitude));
    formData.append("descriptor", JSON.stringify(capture.descriptor));
    formData.append("selfie", capture.imageBlob, "selfie.jpg");
    formData.append("work_mode", isWfh ? "wfh" : "wfo");
    if (pendingType === "in" && chosenApelId) formData.append("apel_location_id", chosenApelId);

    try {
      const res = await fetch("/api/attendance/clock", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        setResultMsg({ ok: false, text: json.error ?? "Gagal mengirim absensi." });
      } else if (json.status === "rejected") {
        setResultMsg({ ok: false, text: json.rejectReason });
      } else {
        setResultMsg({
          ok: true,
          text:
            (pendingType === "in" ? "Absen masuk berhasil dicatat" : "Absen pulang berhasil dicatat") +
            (isWfh ? " (WFH)." : ".") +
            (pendingType === "out" && json.locationLabel ? ` Lokasi tercatat: ${json.locationLabel}.` : ""),
        });
        setTodayRecords((prev) => [...prev, json.record]);
      }
    } catch {
      setResultMsg({ ok: false, text: "Terjadi kesalahan koneksi. Coba lagi." });
    } finally {
      setStep("done");
    }
  }

  function reset() {
    setChosenMode(null);
    setStep("idle");
    setPendingType(null);
    setCapture(null);
    setResultMsg(null);
  }

  if (loading) {
    return <p className="text-center text-sm text-slate-500">Memuat...</p>;
  }

  const distance =
    geo.position && office
      ? distanceInMeters(geo.position.latitude, geo.position.longitude, office.latitude, office.longitude)
      : null;
  const withinOfficeGeofence = distance !== null && office ? distance <= office.radius_meters : null;

  const apelDistance =
    geo.position && chosenApelLocation
      ? distanceInMeters(
          geo.position.latitude,
          geo.position.longitude,
          chosenApelLocation.latitude,
          chosenApelLocation.longitude
        )
      : null;
  const withinApelGeofence =
    apelDistance !== null && chosenApelLocation ? apelDistance <= chosenApelLocation.radius_meters : null;

  const withinGeofence = withinOfficeGeofence || withinApelGeofence;

  const initials =
    (employee?.full_name ?? "")
      .split(",")[0]
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "P";

  return (
    <div className="space-y-6">
      <section className="ep-hero space-y-3">
        <div className="flex items-start gap-3">
          <span className="ep-avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="min-w-0">
            <h1 className="break-words text-lg font-bold leading-snug text-slate-900">Halo, {employee?.full_name}</h1>
            <p className="text-sm text-slate-500">{employee?.position ?? "Pegawai"} · NIP {employee?.nip}</p>
          </div>
        </div>
        <ServerClock />
      </section>

      {/* Status hari ini */}
      <section className="card !p-0" aria-label="Status absensi hari ini">
        <div className="grid grid-cols-2 divide-x divide-slate-200/70">
          {[
            { label: "Absen Masuk", rec: validIn, Icon: LogIn },
            { label: "Absen Pulang", rec: validOut, Icon: LogOut },
          ].map(({ label, rec, Icon }) => (
            <div key={label} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{label}</p>
                {rec ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Icon size={20} className="text-slate-300" />}
              </div>
              <p className={`mt-1 text-xl font-bold tabular-nums ${rec ? "text-slate-900" : "text-slate-400"}`}>
                {rec ? formatTime(rec.server_time) : "Belum absen"}
              </p>
              {rec && (
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  WITA
                  {label === "Absen Masuk" &&
                    (rec.is_late ? (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">Terlambat</span>
                    ) : (
                      <span className="rounded-full bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700">Tepat waktu</span>
                    ))}
                  {rec.work_mode === "wfh" && (
                    <span className="rounded-full bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">WFH</span>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Flow absen */}
      {!employee?.face_descriptor ? (
        <div className="card flex items-center gap-3 border-amber-200 bg-amber-50 text-center">
          <ScanFace className="shrink-0 text-amber-600" size={28} />
          <p className="text-sm text-amber-800">
            {employee?.face_enrollment_status === "pending"
              ? "Wajah Anda sudah dikirim dan sedang menunggu persetujuan Admin sebelum bisa absen."
              : employee?.face_enrollment_status === "rejected"
                ? "Pendaftaran wajah Anda ditolak Admin. Silakan rekam ulang di menu Wajah Saya."
                : "Anda belum mendaftarkan wajah. Rekam wajah dulu di menu Wajah Saya sebelum bisa absen."}{" "}
            <Link href="/dashboard/face-enrollment" className="font-semibold underline">
              Buka Wajah Saya
            </Link>
          </p>
        </div>
      ) : todayLeave ? (
        <div className="card flex items-center gap-3 border-brand-200 bg-brand-50 text-center">
          <CalendarClock className="shrink-0 text-brand-600" size={28} />
          <p className="text-sm text-brand-800">
            Anda tercatat sedang <strong>{LEAVE_TYPE_LABEL[todayLeave.type]}</strong> hari ini
            (disetujui Admin) sehingga tidak perlu melakukan absensi masuk/pulang.
          </p>
        </div>
      ) : validIn && validOut ? (
        <div className="card text-center text-slate-600">
          Absensi hari ini sudah lengkap. Sampai jumpa besok! 👋
        </div>
      ) : step === "idle" ? (
        needApelChoice ? (
          <div className="card space-y-4 text-center">
            <div>
              <p className="font-semibold text-slate-800">Hari ini ada apel pagi — pilih lokasi Anda</p>
              <p className="mt-1 text-sm text-slate-500">
                Absen masuk boleh dilakukan dari lokasi apel di bawah ini, selain di kantor.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {apelCandidates.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setChosenApelId(loc.id)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-brand-100 bg-white/60 px-4 py-4 text-brand-900 transition hover:bg-white"
                >
                  <MapPin size={26} />
                  <span className="font-semibold">{loc.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setChosenApelId("__kantor__")} className="btn-secondary mx-auto">
              Saya absen di Kantor seperti biasa
            </button>
          </div>
        ) : needModeChoice ? (
          <div className="card space-y-4 text-center">
            <div>
              <p className="font-semibold text-slate-800">Hari ini Jumat — pilih mode kerja Anda</p>
              <p className="mt-1 text-sm text-slate-500">
                Pilih sebelum absen masuk. Pilihan ini juga berlaku untuk absen pulang hari ini.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => startClock("in", "wfo")}
                className="flex flex-col items-center gap-1 rounded-xl border border-brand-100 bg-white/60 px-4 py-4 text-brand-900 transition hover:bg-white"
              >
                <Building2 size={26} />
                <span className="font-semibold">WFO — Kerja di Kantor</span>
                <span className="text-xs text-slate-500">Wajib berada dalam radius kantor (geofencing)</span>
              </button>
              <button
                onClick={() => startClock("in", "wfh")}
                className="flex flex-col items-center gap-1 rounded-xl border border-emerald-200 bg-white/60 px-4 py-4 text-emerald-800 transition hover:bg-white"
              >
                <Home size={26} />
                <span className="font-semibold">WFH — Kerja dari Rumah</span>
                <span className="text-xs text-slate-500">Absen dari rumah, tanpa batas radius kantor</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="card text-center">
            {hybridToday && (
              <p
                className={`mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  isWfh ? "bg-emerald-100 text-emerald-700" : "bg-brand-100 text-brand-700"
                }`}
              >
                {isWfh ? <Home size={14} /> : <Building2 size={14} />}
                Mode hari ini: {isWfh ? "WFH (dari rumah)" : "WFO (di kantor)"}
              </p>
            )}
            <p className="mb-4 text-slate-600">
              {nextType === "in" ? "Silakan lakukan absen masuk." : "Silakan lakukan absen pulang."}
            </p>
            <button onClick={() => startClock(nextType)} className="btn-primary">
              {nextType === "in" ? <LogIn size={18} /> : <LogOut size={18} />}
              {nextType === "in" ? "Absen Masuk" : "Absen Pulang"}
            </button>
          </div>
        )
      ) : step === "done" ? (
        <div className="card text-center">
          {resultMsg?.ok ? (
            <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={40} />
          ) : (
            <XCircle className="mx-auto mb-2 text-red-500" size={40} />
          )}
          <p className={resultMsg?.ok ? "text-emerald-700" : "text-red-600"}>{resultMsg?.text}</p>
          <button onClick={reset} className="btn-secondary mt-4">Kembali</button>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <MapPin
              size={16}
              className={
                pendingType === "out" || isWfh || withinGeofence ? "text-emerald-500" : "text-amber-500"
              }
            />
            {geo.loading && <span className="text-slate-500">Mendapatkan lokasi GPS...</span>}
            {geo.error && <span className="text-red-600">{geo.error}</span>}
            {pendingType === "out" ? (
              // Absen pulang tidak mensyaratkan radius kantor — lokasi tetap direkam sbg jejak audit
              distance !== null && (
                <span className="text-slate-600">
                  Absen pulang boleh dilakukan dari mana saja (mis. sedang audit/tugas lapangan).
                  Titik lokasi Anda saat ini ({Math.round(distance)} m dari kantor) akan dicatat.
                </span>
              )
            ) : isWfh ? (
              !geo.loading &&
              !geo.error && (
                <span className="text-emerald-700">
                  Mode WFH — Anda boleh absen dari rumah, tidak perlu berada di radius kantor.
                </span>
              )
            ) : chosenApelLocation ? (
              apelDistance !== null && (
                <span className={withinGeofence ? "text-emerald-700" : "text-amber-600"}>
                  Jarak ke lokasi apel &quot;{chosenApelLocation.name}&quot;: {Math.round(apelDistance)}m{" "}
                  {withinApelGeofence ? "(dalam radius)" : `(di luar radius, atau ${Math.round(distance ?? 0)}m dari kantor)`}
                </span>
              )
            ) : (
              distance !== null && (
                <span className={withinGeofence ? "text-emerald-700" : "text-amber-600"}>
                  Jarak ke kantor: {Math.round(distance)}m {withinGeofence ? "(dalam radius)" : "(di luar radius)"}
                </span>
              )
            )}
          </div>

          <FaceCamera
            onCapture={setCapture}
            captureLabel={pendingType === "in" ? "Ambil Selfie Absen Masuk" : "Ambil Selfie Absen Pulang"}
          />

          <div className="flex justify-center gap-2">
            <button onClick={reset} className="btn-secondary">Batal</button>
            <button
              onClick={handleSubmit}
              disabled={!capture || !geo.position || step === "submitting"}
              className="btn-primary"
            >
              {step === "submitting" ? "Mengirim..." : "Kirim Absensi"}
            </button>
          </div>
        </div>
      )}

      <RecentHistory />
    </div>
  );
}
