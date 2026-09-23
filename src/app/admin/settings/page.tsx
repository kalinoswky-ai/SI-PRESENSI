"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGeolocation } from "@/lib/useGeolocation";
import type { Office } from "@/types";
import { MapPin, Save, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const supabase = createClient();
  const geo = useGeolocation();

  const [office, setOffice] = useState<Office | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <h1 className="text-lg font-bold text-slate-900">Pengaturan Kantor & Geofencing</h1>

      <div className="card space-y-4">
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

        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
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
    </div>
  );
}
