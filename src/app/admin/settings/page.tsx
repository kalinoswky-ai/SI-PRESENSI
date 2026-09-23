"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useGeolocation } from "@/lib/useGeolocation";
import type { Office } from "@/types";
import { MapPin, Save, CheckCircle2, Send, MessageCircle, FileSpreadsheet } from "lucide-react";

// Leaflet (peta Esri) butuh akses `window`, jadi wajib dimuat hanya di browser (ssr: false)
const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400">
      Memuat peta...
    </div>
  ),
});

export default function SettingsPage() {
  const supabase = createClient();
  const geo = useGeolocation();

  const [office, setOffice] = useState<Office | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingReport, setTestingReport] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("offices").select("*").limit(1).single();
      setOffice(data as Office);
      setLoading(false);
    }
    load();
  }, [supabase]);

  function update<K extends keyof Office>(key: K, value: Office[K]) {
    setOffice((o) => (o ? { ...o, [key]: value } : o));
    setSaved(false);
  }

  async function handleSave() {
    if (!office) return;
    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("offices")
      .update({
        name: office.name,
        latitude: office.latitude,
        longitude: office.longitude,
        radius_meters: office.radius_meters,
        work_start: office.work_start,
        work_end: office.work_end,
        friday_hybrid: office.friday_hybrid,
        wa_notify_enabled: office.wa_notify_enabled,
        wa_provider: office.wa_provider,
        wa_api_token: office.wa_api_token,
        wa_admin_numbers: office.wa_admin_numbers,
        wa_notify_employee: office.wa_notify_employee,
        telegram_notify_enabled: office.telegram_notify_enabled,
        telegram_bot_token: office.telegram_bot_token,
        telegram_chat_id: office.telegram_chat_id,
        bkpsdm_report_enabled: office.bkpsdm_report_enabled,
        bkpsdm_report_email: office.bkpsdm_report_email,
        bkpsdm_webhook_url: office.bkpsdm_webhook_url,
        bkpsdm_report_schedule: office.bkpsdm_report_schedule,
        updated_at: new Date().toISOString(),
      })
      .eq("id", office.id);

    if (error) {
      setError("Gagal menyimpan pengaturan: " + error.message);
    } else {
      setSaved(true);
    }
    setSaving(false);
  }

  function useCurrentLocation() {
    geo.request();
  }

  function handleMapChange(lat: number, lng: number) {
    if (!office) return;
    update("latitude", parseFloat(lat.toFixed(7)));
    update("longitude", parseFloat(lng.toFixed(7)));
  }

  async function handleTestBkpsdmReport() {
    setTestingReport(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/reports/bkpsdm/test", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, text: json.error ?? "Gagal mengirim laporan uji coba." });
      } else {
        setTestResult({
          ok: true,
          text: `Berhasil dikirim (${json.recordCount} baris data) ke: ${json.sentTo?.join(", ") || "-"}.`,
        });
      }
    } catch {
      setTestResult({ ok: false, text: "Terjadi kesalahan koneksi." });
    } finally {
      setTestingReport(false);
    }
  }

  useEffect(() => {
    if (geo.position && office) {
      update("latitude", geo.position.latitude);
      update("longitude", geo.position.longitude);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position]);

  if (loading || !office) return <p className="text-center text-sm text-slate-500">Memuat...</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-lg font-bold text-slate-900">Pengaturan</h1>

      <div id="lokasi" className="card space-y-4 scroll-mt-24">
        <h2 className="font-semibold text-slate-800">Lokasi &amp; Geofencing</h2>
        <div>
          <label className="label">Nama Kantor</label>
          <input
            className="input"
            value={office.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
          Tips: berdirilah tepat di depan/di dalam gedung Kantor Inspektorat, lalu tekan tombol di
          bawah agar koordinat GPS diisi otomatis sesuai lokasi kantor sebenarnya.
        </div>

        <button type="button" onClick={useCurrentLocation} className="btn-secondary">
          <MapPin size={18} />
          {geo.loading ? "Mendapatkan lokasi..." : "Gunakan Lokasi Saat Ini"}
        </button>
        {geo.error && <p className="text-sm text-red-600">{geo.error}</p>}

        <div>
          <label className="label">Klik/geser pin di peta untuk menentukan lokasi kantor</label>
          <LocationPicker
            latitude={office.latitude}
            longitude={office.longitude}
            radiusMeters={office.radius_meters}
            onChange={handleMapChange}
          />
          <p className="mt-1 text-xs text-slate-400">
            Klik di titik mana pun pada peta, atau seret pin biru untuk memindahkannya. Lingkaran
            biru menunjukkan radius geofencing saat ini.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Latitude</label>
            <input
              type="number"
              step="0.000001"
              className="input"
              value={office.latitude}
              onChange={(e) => update("latitude", parseFloat(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input
              type="number"
              step="0.000001"
              className="input"
              value={office.longitude}
              onChange={(e) => update("longitude", parseFloat(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Radius Geofencing (meter)</label>
            <input
              type="number"
              className="input"
              value={office.radius_meters}
              onChange={(e) => update("radius_meters", parseInt(e.target.value, 10))}
            />
          </div>
        </div>

        <div id="jam-kerja" className="grid scroll-mt-24 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="font-semibold text-slate-800">Jam Kerja (Work Schedules)</h2>
          </div>
          <div>
            <label className="label">Jam Masuk Kerja</label>
            <input
              type="time"
              className="input"
              value={office.work_start}
              onChange={(e) => update("work_start", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Jam Pulang Kerja</label>
            <input
              type="time"
              className="input"
              value={office.work_end}
              onChange={(e) => update("work_end", e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={office.friday_hybrid}
            onChange={(e) => update("friday_hybrid", e.target.checked)}
          />
          Kebijakan Jumat Hybrid (WFO & WFH) — absensi masuk tidak dihitung terlambat pada hari
          Jumat
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {saved && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 size={16} /> Pengaturan tersimpan.
          </p>
        )}

        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          <Save size={18} />
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </div>

      {/* ---------- Notifikasi Keterlambatan: WhatsApp ---------- */}
      <div id="notifikasi" className="card scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="text-emerald-600" size={20} />
          <h2 className="font-semibold text-slate-800">Notifikasi Keterlambatan — WhatsApp</h2>
        </div>
        <p className="text-sm text-slate-500">
          Kirim pesan WhatsApp otomatis ke admin/pengawas (dan opsional ke pegawai ybs) setiap
          kali ada absen masuk yang tercatat terlambat. Menggunakan gateway WhatsApp API berbasis
          token (contoh: <a href="https://fonnte.com" target="_blank" rel="noreferrer" className="text-brand-600 underline">Fonnte</a>).
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={office.wa_notify_enabled}
            onChange={(e) => update("wa_notify_enabled", e.target.checked)}
          />
          Aktifkan notifikasi WhatsApp
        </label>

        {office.wa_notify_enabled && (
          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <label className="label">Token API WhatsApp</label>
              <input
                type="password"
                className="input"
                value={office.wa_api_token ?? ""}
                onChange={(e) => update("wa_api_token", e.target.value)}
                placeholder="Token dari dashboard Fonnte/Wablas"
              />
            </div>
            <div>
              <label className="label">Nomor Admin/Pengawas</label>
              <input
                className="input"
                value={office.wa_admin_numbers ?? ""}
                onChange={(e) => update("wa_admin_numbers", e.target.value)}
                placeholder="62811xxxxxxx, 62812xxxxxxx"
              />
              <p className="mt-1 text-xs text-slate-400">Pisahkan dengan koma, format 62xxxxxxxxxx.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={office.wa_notify_employee}
                onChange={(e) => update("wa_notify_employee", e.target.checked)}
              />
              Kirim juga ke nomor WhatsApp pribadi pegawai (jika sudah diisi di data pegawai)
            </label>
          </div>
        )}
      </div>

      {/* ---------- Notifikasi Keterlambatan: Telegram ---------- */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Send className="text-sky-600" size={20} />
          <h2 className="font-semibold text-slate-800">Notifikasi Keterlambatan — Telegram</h2>
        </div>
        <p className="text-sm text-slate-500">
          Alternatif gratis & resmi: buat bot lewat @BotFather di Telegram, tambahkan bot ke grup
          pengawas, lalu isi token & Chat ID grup di bawah ini.
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={office.telegram_notify_enabled}
            onChange={(e) => update("telegram_notify_enabled", e.target.checked)}
          />
          Aktifkan notifikasi Telegram
        </label>

        {office.telegram_notify_enabled && (
          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <label className="label">Bot Token</label>
              <input
                type="password"
                className="input"
                value={office.telegram_bot_token ?? ""}
                onChange={(e) => update("telegram_bot_token", e.target.value)}
                placeholder="123456:ABC-DEF..."
              />
            </div>
            <div>
              <label className="label">Chat ID Grup/Channel</label>
              <input
                className="input"
                value={office.telegram_chat_id ?? ""}
                onChange={(e) => update("telegram_chat_id", e.target.value)}
                placeholder="-100xxxxxxxxxx"
              />
            </div>
          </div>
        )}
      </div>

      {/* ---------- Integrasi Laporan Otomatis ke BKPSDM ---------- */}
      <div id="integrasi" className="card scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="text-brand-600" size={20} />
          <h2 className="font-semibold text-slate-800">Integrasi Laporan Otomatis ke BKPSDM</h2>
        </div>
        <p className="text-sm text-slate-500">
          Sistem akan otomatis membuat rekap Excel dan mengirimkannya sesuai jadwal — lewat email
          dan/atau webhook (mis. endpoint BKPSDM, Zapier/Make, atau Google Apps Script) yang Anda
          tentukan. Pengiriman dijalankan oleh Vercel Cron setiap hari, lalu sistem memutuskan
          apakah hari itu adalah jadwal kirim.
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={office.bkpsdm_report_enabled}
            onChange={(e) => update("bkpsdm_report_enabled", e.target.checked)}
          />
          Aktifkan laporan otomatis
        </label>

        {office.bkpsdm_report_enabled && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Email Tujuan (BKPSDM)</label>
                <input
                  type="email"
                  className="input"
                  value={office.bkpsdm_report_email ?? ""}
                  onChange={(e) => update("bkpsdm_report_email", e.target.value)}
                  placeholder="bkpsdm@sumbabaratkab.go.id"
                />
              </div>
              <div>
                <label className="label">Jadwal Pengiriman</label>
                <select
                  className="input"
                  value={office.bkpsdm_report_schedule}
                  onChange={(e) => update("bkpsdm_report_schedule", e.target.value as Office["bkpsdm_report_schedule"])}
                >
                  <option value="daily">Harian</option>
                  <option value="weekly">Mingguan (tiap Senin)</option>
                  <option value="monthly">Bulanan (tiap tgl 1)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Webhook URL (opsional)</label>
              <input
                className="input"
                value={office.bkpsdm_webhook_url ?? ""}
                onChange={(e) => update("bkpsdm_webhook_url", e.target.value)}
                placeholder="https://hooks.example.go.id/absensi"
              />
              <p className="mt-1 text-xs text-slate-400">
                Jika diisi, sistem juga mengirim data (file .xlsx dalam base64 + metadata) sebagai
                POST JSON ke URL ini — cocok untuk integrasi langsung ke sistem BKPSDM/e-Kinerja
                bila tersedia endpoint-nya.
              </p>
            </div>

            {office.bkpsdm_last_sent_at && (
              <p className="text-xs text-slate-400">
                Laporan otomatis terakhir terkirim: {new Date(office.bkpsdm_last_sent_at).toLocaleString("id-ID")}
              </p>
            )}

            <button
              type="button"
              onClick={handleTestBkpsdmReport}
              disabled={testingReport}
              className="btn-secondary"
            >
              {testingReport ? "Mengirim uji coba..." : "Kirim Uji Coba Sekarang"}
            </button>
            {testResult && (
              <p className={`text-sm ${testResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                {testResult.text}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
