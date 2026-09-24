"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useGeolocation } from "@/lib/useGeolocation";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import type { ApelLocation, Office } from "@/types";
import { witaDateKey } from "@/lib/geo";
import {
  MapPin,
  Save,
  CheckCircle2,
  Send,
  MessageCircle,
  FileSpreadsheet,
  Flag,
  Plus,
  Trash2,
  CalendarX,
  CalendarCheck,
} from "lucide-react";

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

  // ---------- Lokasi Apel: mingguan Senin/Rabu & bulanan tanggal tetap (mis. tgl 17) ----------
  const [apelLocations, setApelLocations] = useState<ApelLocation[]>([]);
  const [apelError, setApelError] = useState<string | null>(null);
  const [newApel, setNewApel] = useState({
    name: "",
    scheduleType: "weekday" as "weekday" | "monthly",
    weekday: 1 as 1 | 3,
    day_of_month: 17,
    group_name: "",
    latitude: "",
    longitude: "",
    radius_meters: 150,
  });
  const apelGeo = useGeolocation();
  const [todayKey, setTodayKey] = useState<string>(() => witaDateKey(new Date()));

  async function loadApelLocations() {
    const { data } = await supabase
      .from("apel_locations")
      .select("*")
      .order("weekday", { ascending: true, nullsFirst: false })
      .order("day_of_month", { ascending: true, nullsFirst: false })
      .order("name");
    setApelLocations((data ?? []) as ApelLocation[]);
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("offices").select("*").limit(1).single();
      setOffice(data as Office);
      setLoading(false);
    }
    load();
    loadApelLocations();
    // Tanggal "hari ini" (WITA) dipakai utk tombol batalkan-apel-hari-ini — ambil dari jam
    // server agar konsisten dgn penentuan tanggal di endpoint absensi (bukan jam perangkat admin).
    fetch(`/api/server-time?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTodayKey(witaDateKey(new Date(d.serverTime))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  function toggleCancelToday(loc: ApelLocation) {
    const isCancelledToday = loc.cancelled_date === todayKey;
    updateApelLocation(loc.id, { cancelled_date: isCancelledToday ? null : todayKey });
  }

  useEffect(() => {
    if (apelGeo.position) {
      setNewApel((n) => ({
        ...n,
        latitude: String(apelGeo.position!.latitude),
        longitude: String(apelGeo.position!.longitude),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apelGeo.position]);

  async function handleAddApelLocation() {
    setApelError(null);
    const lat = parseFloat(newApel.latitude);
    const lng = parseFloat(newApel.longitude);
    const isMonthly = newApel.scheduleType === "monthly";
    if (!newApel.name.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
      setApelError("Nama lokasi dan koordinat (latitude/longitude) wajib diisi.");
      return;
    }
    if (isMonthly && (!Number.isInteger(newApel.day_of_month) || newApel.day_of_month < 1 || newApel.day_of_month > 31)) {
      setApelError("Tanggal apel bulanan harus berupa angka 1-31.");
      return;
    }
    const { error } = await supabase.from("apel_locations").insert({
      name: newApel.name.trim(),
      weekday: isMonthly ? null : newApel.weekday,
      day_of_month: isMonthly ? newApel.day_of_month : null,
      group_name: isMonthly || newApel.weekday === 3 ? newApel.group_name.trim() || null : null,
      latitude: lat,
      longitude: lng,
      radius_meters: newApel.radius_meters,
      is_active: true,
    });
    if (error) {
      // Kolom belum ada di database / cache skema PostgREST belum dimuat ulang → beri petunjuk perbaikan yang jelas.
      const schemaProblem = /schema cache|day_of_month|cancelled_date|apel_group/i.test(error.message);
      setApelError(
        "Gagal menambah lokasi: " +
          error.message +
          (schemaProblem
            ? " — Database belum diperbarui. Jalankan file supabase/fix-apel-lokasi-lengkap.sql di Supabase > SQL Editor, lalu coba lagi."
            : "")
      );
      return;
    }
    setNewApel({
      name: "",
      scheduleType: "weekday",
      weekday: 1,
      day_of_month: 17,
      group_name: "",
      latitude: "",
      longitude: "",
      radius_meters: 150,
    });
    loadApelLocations();
  }

  async function updateApelLocation(id: string, fields: Partial<ApelLocation>) {
    await supabase.from("apel_locations").update(fields).eq("id", id);
    loadApelLocations();
  }

  async function deleteApelLocation(id: string) {
    await supabase.from("apel_locations").delete().eq("id", id);
    loadApelLocations();
  }

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

      {/* ---------- Keamanan Akun: ganti password sendiri ---------- */}
      <ChangePasswordForm />

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
          Kebijakan Jumat Hybrid (WFO & WFH) — pada hari Jumat pegawai memilih WFO (tetap geofencing)
          atau WFH (absen dari rumah tanpa radius kantor); absensi masuk tidak dihitung terlambat
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

      {/* ---------- Lokasi Apel Mingguan (Senin/Rabu) & Bulanan (tanggal tetap) ---------- */}
      <div id="lokasi-apel" className="card scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <Flag className="text-brand-600" size={20} />
          <h2 className="font-semibold text-slate-800">Lokasi Apel Pagi</h2>
        </div>
        <p className="text-sm text-slate-500">
          Setiap Senin, apel pagi dilaksanakan di Kantor Bupati — berlaku untuk semua pegawai.
          Setiap Rabu, apel dilaksanakan per kelompok perangkat daerah (OPD) — isi &quot;Kelompok
          OPD&quot; agar hanya berlaku untuk pegawai dengan kelompok apel yang sama (diatur di menu
          Kelola Pegawai). Selain jadwal mingguan tsb, tersedia juga jadwal <strong>bulanan</strong>{" "}
          pada tanggal tetap tiap bulan (mis. tanggal 17 — Apel Peringatan Hari Kesadaran
          Nasional) — berlaku pada tanggal tsb terlepas dari jatuh di hari apa. Pegawai boleh
          absen masuk dari lokasi ini pada hari/tanggal yang sesuai, selain di kantor.
        </p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Jika sewaktu-waktu apel <strong>tidak dilaksanakan</strong> (dibatalkan) pada hari
          berjalan, klik &quot;Batalkan hari ini&quot; pada lokasi tsb. Pegawai otomatis tidak
          bisa lagi absen masuk di lokasi apel itu untuk tanggal hari ini saja — presensi masuk
          kembali wajib dilakukan di radius Kantor Inspektorat, seperti hari biasa. Pengaturan ini
          otomatis tidak berlaku lagi di jadwal berikutnya (harus dibatalkan ulang bila apel
          kembali ditiadakan).
        </p>

        {apelLocations.length > 0 && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            {apelLocations.map((loc) => {
              const isCancelledToday = loc.cancelled_date === todayKey;
              const isMonthly = loc.day_of_month !== null;
              return (
                <div
                  key={loc.id}
                  className={`space-y-2 rounded-lg border p-3 ${
                    isCancelledToday ? "border-amber-300 bg-amber-50/60" : "border-slate-200"
                  }`}
                >
                  <div className="grid gap-2 sm:grid-cols-6 sm:items-center">
                    {isMonthly ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold uppercase text-emerald-600">Tgl</span>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          className="input w-16 px-2"
                          title="Tanggal tiap bulan (1-31)"
                          defaultValue={loc.day_of_month ?? 17}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (v && v !== loc.day_of_month && v >= 1 && v <= 31) {
                              updateApelLocation(loc.id, { day_of_month: v });
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        {loc.weekday === 1 ? "Senin" : "Rabu"}
                      </span>
                    )}
                    <input
                      className="input sm:col-span-2"
                      defaultValue={loc.name}
                      onBlur={(e) => e.target.value !== loc.name && updateApelLocation(loc.id, { name: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder={loc.weekday === 3 || isMonthly ? "Kelompok OPD" : "(semua pegawai)"}
                      disabled={loc.weekday === 1}
                      defaultValue={loc.group_name ?? ""}
                      onBlur={(e) =>
                        e.target.value !== (loc.group_name ?? "") &&
                        updateApelLocation(loc.id, { group_name: e.target.value.trim() || null })
                      }
                    />
                    <input
                      type="number"
                      className="input"
                      title="Radius (meter)"
                      defaultValue={loc.radius_meters}
                      onBlur={(e) =>
                        Number(e.target.value) !== loc.radius_meters &&
                        updateApelLocation(loc.id, { radius_meters: parseInt(e.target.value, 10) })
                      }
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={loc.is_active}
                          onChange={(e) => updateApelLocation(loc.id, { is_active: e.target.checked })}
                        />
                        Aktif
                      </label>
                      <button
                        type="button"
                        onClick={() => deleteApelLocation(loc.id)}
                        className="ml-auto text-red-500 hover:text-red-700"
                        title="Hapus lokasi"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-2">
                    {isCancelledToday ? (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          <CalendarX size={13} />
                          Apel ditiadakan hari ini — pegawai absen di kantor
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCancelToday(loc)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                        >
                          <CalendarCheck size={13} />
                          Aktifkan kembali apel hari ini
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleCancelToday(loc)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                      >
                        <CalendarX size={13} />
                        Batalkan hari ini (apel tidak dilaksanakan)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-6 sm:items-end">
          <div className="sm:col-span-2">
            <label className="label">Nama Lokasi</label>
            <input
              className="input"
              value={newApel.name}
              onChange={(e) => setNewApel((n) => ({ ...n, name: e.target.value }))}
              placeholder="mis. Kantor Bupati Sumba Barat"
            />
          </div>
          <div>
            <label className="label">Jenis Jadwal</label>
            <select
              className="input"
              value={newApel.scheduleType}
              onChange={(e) =>
                setNewApel((n) => ({ ...n, scheduleType: e.target.value as "weekday" | "monthly" }))
              }
            >
              <option value="weekday">Mingguan (Senin/Rabu)</option>
              <option value="monthly">Bulanan (tanggal tetap)</option>
            </select>
          </div>
          {newApel.scheduleType === "weekday" ? (
            <div>
              <label className="label">Hari</label>
              <select
                className="input"
                value={newApel.weekday}
                onChange={(e) => setNewApel((n) => ({ ...n, weekday: Number(e.target.value) as 1 | 3 }))}
              >
                <option value={1}>Senin</option>
                <option value={3}>Rabu</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="label">Tanggal (1-31)</label>
              <input
                type="number"
                min={1}
                max={31}
                className="input"
                value={newApel.day_of_month}
                onChange={(e) => setNewApel((n) => ({ ...n, day_of_month: parseInt(e.target.value, 10) || 0 }))}
                placeholder="mis. 17"
              />
            </div>
          )}
          <div>
            <label className="label">Kelompok OPD</label>
            <input
              className="input"
              disabled={newApel.scheduleType === "weekday" && newApel.weekday === 1}
              value={newApel.group_name}
              onChange={(e) => setNewApel((n) => ({ ...n, group_name: e.target.value }))}
              placeholder={
                newApel.scheduleType === "weekday" && newApel.weekday === 1 ? "semua pegawai" : "kosongkan = semua pegawai"
              }
            />
          </div>
          <div>
            <label className="label">Radius (m)</label>
            <input
              type="number"
              className="input"
              value={newApel.radius_meters}
              onChange={(e) => setNewApel((n) => ({ ...n, radius_meters: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Latitude</label>
            <input
              type="number"
              step="0.000001"
              className="input"
              value={newApel.latitude}
              onChange={(e) => setNewApel((n) => ({ ...n, latitude: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Longitude</label>
            <input
              type="number"
              step="0.000001"
              className="input"
              value={newApel.longitude}
              onChange={(e) => setNewApel((n) => ({ ...n, longitude: e.target.value }))}
            />
          </div>
          <button type="button" onClick={() => apelGeo.request()} className="btn-secondary">
            <MapPin size={16} />
            {apelGeo.loading ? "Mendapatkan lokasi..." : "Gunakan Lokasi Saat Ini"}
          </button>
          <button type="button" onClick={handleAddApelLocation} className="btn-primary sm:col-span-2">
            <Plus size={16} />
            Tambah Lokasi Apel
          </button>
        </div>
        {apelGeo.error && <p className="text-sm text-red-600">{apelGeo.error}</p>}
        {apelError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{apelError}</p>}
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
