"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Trash2, Users } from "lucide-react";
import { useGeolocation } from "@/lib/useGeolocation";
import { witaDateKey } from "@/lib/geo";
import type { Kegiatan } from "@/types";

type Emp = { id: string; full_name: string; nip: string | null; role: string };

export default function KegiatanManager({
  canManage,
  kegiatan,
  participantCounts,
  employees,
}: {
  canManage: boolean;
  kegiatan: Kegiatan[];
  participantCounts: Record<string, number>;
  employees: Emp[];
}) {
  const router = useRouter();
  const geo = useGeolocation();
  const [form, setForm] = useState({
    name: "",
    description: "",
    activity_date: witaDateKey(new Date()),
    start_time: "06:00",
    end_time: "09:00",
    latitude: "",
    longitude: "",
    radius_meters: 200,
    allow_clock_out: true, // tugas luar: pegawai boleh absen pulang dari lokasi tugas
    clock_out_time: "12:00",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = employees.filter((e) =>
    `${e.full_name} ${e.nip ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function useCurrentLocation() {
    geo.request();
  }
  // Isi koordinat dari GPS begitu tersedia.
  useEffect(() => {
    if (geo.position) {
      setForm((f) => ({
        ...f,
        latitude: String(geo.position!.latitude),
        longitude: String(geo.position!.longitude),
      }));
    }
  }, [geo.position]);

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/kegiatan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          participant_ids: Array.from(selected),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal menyimpan kegiatan.");
        return;
      }
      setForm((f) => ({ ...f, name: "", description: "", latitude: "", longitude: "" }));
      setSelected(new Set());
      router.refresh();
    } catch {
      setError("Terjadi kesalahan koneksi.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(k: Kegiatan) {
    await fetch(`/api/kegiatan/${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !k.is_active }),
    });
    router.refresh();
  }

  async function patchClockOut(k: Kegiatan, fields: { allow_clock_out?: boolean; clock_out_time?: string }) {
    const res = await fetch(`/api/kegiatan/${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      alert(json?.error ?? "Gagal memperbarui kegiatan.");
    }
    router.refresh();
  }

  async function remove(k: Kegiatan) {
    if (!confirm(`Hapus kegiatan "${k.name}"? Riwayat absensi tetap tersimpan.`)) return;
    await fetch(`/api/kegiatan/${k.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-800">Tambah Kegiatan</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Nama Kegiatan</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="mis. Pendampingan reviu di Desa X"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Keterangan (opsional)</label>
              <input
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Tanggal</label>
              <input
                type="date"
                className="input"
                value={form.activity_date}
                onChange={(e) => setForm({ ...form, activity_date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Absen dibuka</label>
                <input
                  type="time"
                  className="input"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Absen ditutup</label>
                <input
                  type="time"
                  className="input"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Latitude</label>
              <input
                type="number"
                step="0.000001"
                className="input"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Longitude</label>
              <input
                type="number"
                step="0.000001"
                className="input"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Radius (meter)</label>
              <input
                type="number"
                className="input"
                value={form.radius_meters}
                onChange={(e) => setForm({ ...form, radius_meters: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
            <div className="sm:col-span-2 space-y-2 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.allow_clock_out}
                  onChange={(e) => setForm({ ...form, allow_clock_out: e.target.checked })}
                />
                <span>
                  <span className="font-semibold">Absen pulang dari lokasi tugas</span>
                  <span className="block text-xs text-slate-500">
                    Peserta tidak wajib kembali ke kantor: boleh absen pulang langsung dari lokasi kegiatan (di dalam
                    radius) mulai jam di bawah, tanpa menunggu jam pulang kantor.
                  </span>
                </span>
              </label>
              {form.allow_clock_out && (
                <div className="max-w-[10rem]">
                  <label className="label">Absen pulang dibuka</label>
                  <input
                    type="time"
                    className="input"
                    value={form.clock_out_time}
                    onChange={(e) => setForm({ ...form, clock_out_time: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="flex items-end">
              <button type="button" onClick={useCurrentLocation} className="btn-secondary">
                <MapPin size={16} />
                {geo.loading ? "Mendapatkan lokasi..." : "Gunakan Lokasi Saat Ini"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="label flex items-center gap-1.5">
              <Users size={15} /> Peserta ({selected.size} dipilih)
            </label>
            <input
              className="input"
              placeholder="Cari nama / NIP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {filtered.map((e) => (
                <label key={e.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  <span className="font-medium text-slate-800">{e.full_name}</span>
                  <span className="text-xs text-slate-400">{e.nip}</span>
                </label>
              ))}
              {filtered.length === 0 && <p className="px-2 py-1 text-sm text-slate-400">Tidak ada pegawai.</p>}
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button type="button" onClick={submit} disabled={saving} className="btn-primary">
            {saving ? "Menyimpan..." : "Simpan Kegiatan"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {kegiatan.length === 0 && <p className="card text-sm text-slate-500">Belum ada kegiatan.</p>}
        {kegiatan.map((k) => (
          <div key={k.id} className={`card flex flex-wrap items-start gap-3 ${k.is_active ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{k.name}</p>
              <p className="text-xs text-slate-500">
                {k.activity_date} · absen {k.start_time}–{k.end_time} WITA · radius {k.radius_meters}m ·{" "}
                {participantCounts[k.id] ?? 0} peserta
              </p>
              {k.description && <p className="text-xs text-slate-500">{k.description}</p>}
              {k.allow_clock_out && k.clock_out_time ? (
                <p className="mt-1 text-xs font-medium text-emerald-700">
                  Pulang dari lokasi tugas dibuka mulai {k.clock_out_time} WITA (tidak wajib kembali ke kantor)
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Absen pulang mengikuti jam pulang kantor</p>
              )}
            </div>
            {canManage && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={k.is_active} onChange={() => toggleActive(k)} />
                  Aktif
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={Boolean(k.allow_clock_out)}
                    onChange={(e) =>
                      patchClockOut(k, { allow_clock_out: e.target.checked, clock_out_time: k.clock_out_time ?? "12:00" })
                    }
                  />
                  Pulang di lokasi
                </label>
                {k.allow_clock_out && (
                  <input
                    type="time"
                    className="input !w-28 !py-1 text-xs"
                    defaultValue={k.clock_out_time ?? "12:00"}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== k.clock_out_time) {
                        patchClockOut(k, { clock_out_time: e.target.value });
                      }
                    }}
                    title="Jam absen pulang di lokasi tugas dibuka (WITA)"
                  />
                )}
                <button type="button" onClick={() => remove(k)} className="text-red-500 hover:text-red-700" title="Hapus">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
