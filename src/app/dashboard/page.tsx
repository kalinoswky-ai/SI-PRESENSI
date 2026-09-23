"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGeolocation } from "@/lib/useGeolocation";
import FaceCamera, { FaceCaptureResult } from "@/components/FaceCamera";
import ServerClock from "@/components/ServerClock";
import { distanceInMeters, formatWita } from "@/lib/geo";
import type { AttendanceRecord, Employee, LeaveRequest, Office } from "@/types";
import { LEAVE_TYPE_LABEL } from "@/types";
import { CheckCircle2, MapPin, XCircle, LogIn, LogOut, CalendarClock } from "lucide-react";

type Step = "idle" | "locating" | "capturing" | "submitting" | "done";

export default function DashboardPage() {
  const supabase = createClient();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [todayLeave, setTodayLeave] = useState<LeaveRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>("idle");
  const [pendingType, setPendingType] = useState<"in" | "out" | null>(null);
  const [capture, setCapture] = useState<FaceCaptureResult | null>(null);
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const geo = useGeolocation();

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const todayStr = new Date().toISOString().slice(0, 10);

      const [{ data: emp }, { data: off }, { data: att }, { data: leave }] = await Promise.all([
        supabase.from("employees").select("*").eq("id", userData.user.id).single(),
        supabase.from("offices").select("*").limit(1).single(),
        supabase
          .from("attendance")
          .select("*")
          .eq("employee_id", userData.user.id)
          .gte("server_time", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
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
      ]);

      setEmployee(emp as Employee);
      setOffice(off as Office);
      setTodayRecords((att ?? []) as AttendanceRecord[]);
      setTodayLeave((leave as LeaveRequest) ?? null);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const validIn = todayRecords.find((r) => r.type === "in" && r.status === "valid");
  const validOut = todayRecords.find((r) => r.type === "out" && r.status === "valid");
  const nextType: "in" | "out" = !validIn ? "in" : "out";

  function startClock(type: "in" | "out") {
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
          text: pendingType === "in" ? "Absen masuk berhasil dicatat." : "Absen pulang berhasil dicatat.",
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
  const withinGeofence = distance !== null && office ? distance <= office.radius_meters : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Halo, {employee?.full_name}</h1>
          <p className="text-sm text-slate-500">{employee?.position ?? "Pegawai"} · NIP {employee?.nip}</p>
        </div>
        <ServerClock />
      </div>

      {/* Status hari ini */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Absen Masuk</p>
            <p className="font-semibold text-slate-800">
              {validIn ? formatWita(new Date(validIn.server_time)) : "Belum absen"}
            </p>
          </div>
          {validIn ? <CheckCircle2 className="text-emerald-500" /> : <LogIn className="text-slate-300" />}
        </div>
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Absen Pulang</p>
            <p className="font-semibold text-slate-800">
              {validOut ? formatWita(new Date(validOut.server_time)) : "Belum absen"}
            </p>
          </div>
          {validOut ? <CheckCircle2 className="text-emerald-500" /> : <LogOut className="text-slate-300" />}
        </div>
      </div>

      {/* Flow absen */}
      {todayLeave ? (
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
        <div className="card text-center">
          <p className="mb-4 text-slate-600">
            {nextType === "in" ? "Silakan lakukan absen masuk." : "Silakan lakukan absen pulang."}
          </p>
          <button onClick={() => startClock(nextType)} className="btn-primary">
            {nextType === "in" ? <LogIn size={18} /> : <LogOut size={18} />}
            {nextType === "in" ? "Absen Masuk" : "Absen Pulang"}
          </button>
        </div>
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
            <MapPin size={16} className={withinGeofence ? "text-emerald-500" : "text-amber-500"} />
            {geo.loading && <span className="text-slate-500">Mendapatkan lokasi GPS...</span>}
            {geo.error && <span className="text-red-600">{geo.error}</span>}
            {distance !== null && (
              <span className={withinGeofence ? "text-emerald-700" : "text-amber-600"}>
                Jarak ke kantor: {Math.round(distance)}m {withinGeofence ? "(dalam radius)" : "(di luar radius)"}
              </span>
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
    </div>
  );
}
