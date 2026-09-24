"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, MapPin, Pencil, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { formatWita, mapsUrl, formatDistance, isLateClockIn } from "@/lib/geo";
import type { AttendanceRecord } from "@/types";

interface OfficeRule {
  work_start: string;
  friday_hybrid: boolean;
}

// ISO (UTC) -> "YYYY-MM-DDTHH:mm:ss" waktu WITA, utk <input type="datetime-local">
function toWitaInput(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 19);
}
function fromWitaInput(v: string): Date {
  return new Date(`${v.length === 16 ? v + ":00" : v}+08:00`);
}

export default function AttendanceLogTable({
  records,
  office,
  readOnly = false,
}: {
  records: AttendanceRecord[];
  office: OfficeRule | null;
  /** true untuk Pimpinan: sembunyikan checkbox pilih, tombol Edit/Hapus, dan hapus massal. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [deleting, setDeleting] = useState<AttendanceRecord | "bulk" | null>(null);

  const allSelected = records.length > 0 && selected.size === records.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function done() {
    setEditing(null);
    setDeleting(null);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <>
      {!readOnly && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/70 px-4 py-2 text-sm">
          <span className="text-slate-700">
            <strong>{selected.size}</strong> data dipilih
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="btn-secondary !px-3 !py-1.5 text-sm">
              Batal pilih
            </button>
            <button
              onClick={() => setDeleting("bulk")}
              className="btn-primary !bg-none !px-3 !py-1.5 bg-red-600 text-sm hover:bg-red-700"
            >
              <Trash2 size={15} /> Hapus terpilih
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {!readOnly && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(records.map((r) => r.id)))}
                    aria-label="Pilih semua"
                  />
                </th>
              )}
              <th className="px-4 py-3">Pegawai</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Waktu Server</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Lokasi</th>
              <th className="px-4 py-3">Wajah</th>
              <th className="px-4 py-3">Status</th>
              {!readOnly && <th className="px-4 py-3 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r) => (
              <tr key={r.id} className={selected.has(r.id) ? "bg-red-50/40" : undefined}>
                {!readOnly && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label="Pilih baris"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{r.employees?.full_name}</p>
                  <p className="text-xs text-slate-500">{r.employees?.nip}</p>
                </td>
                <td className="px-4 py-3">
                  {r.type === "in" ? "Masuk" : "Pulang"}
                  {r.is_late && (
                    <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-700">Terlambat</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatWita(new Date(r.server_time))}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      r.work_mode === "wfh" ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700"
                    }`}
                  >
                    {r.work_mode === "wfh" ? "WFH" : "WFO"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.location_label && <p className="text-xs">{r.location_label}</p>}
                  <p className="text-xs text-slate-400">
                    {r.work_mode === "wfh" ? "WFH" : `${formatDistance(r.distance_meters)} dari kantor`}
                  </p>
                  <a
                    href={mapsUrl(r.latitude, r.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    <MapPin size={12} /> Lihat peta
                  </a>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.face_match ? (
                    <CheckCircle2 className="text-emerald-500" size={16} />
                  ) : (
                    <XCircle className="text-red-500" size={16} />
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      r.status === "valid" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {r.status === "valid" ? "Valid" : "Ditolak"}
                  </span>
                  {r.edited_at && (
                    <span
                      title={`Dikoreksi Admin ${formatWita(new Date(r.edited_at))}${
                        r.edit_note ? ` — ${r.edit_note}` : ""
                      }`}
                      className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700"
                    >
                      Diedit
                    </span>
                  )}
                </td>
                {!readOnly && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing(r)}
                      className="mr-3 inline-flex items-center gap-1 text-brand-600 hover:underline"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      onClick={() => setDeleting(r)}
                      className="inline-flex items-center gap-1 text-red-600 hover:underline"
                    >
                      <Trash2 size={14} /> Hapus
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 7 : 9} className="px-4 py-8 text-center text-slate-400">
                  Tidak ada data absensi pada rentang ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && editing && (
        <EditModal record={editing} office={office} onClose={() => setEditing(null)} onDone={done} />
      )}
      {!readOnly && deleting && (
        <DeleteModal
          target={deleting}
          ids={deleting === "bulk" ? Array.from(selected) : [deleting.id]}
          onClose={() => setDeleting(null)}
          onDone={done}
        />
      )}
    </>
  );
}

function EditModal({
  record,
  office,
  onClose,
  onDone,
}: {
  record: AttendanceRecord;
  office: OfficeRule | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    type: record.type as "in" | "out",
    time: toWitaInput(record.server_time),
    status: record.status as "valid" | "rejected",
    work_mode: record.work_mode as "wfo" | "wfh",
    is_late: record.is_late,
    location_label: record.location_label ?? "",
    reject_reason: record.reject_reason ?? "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saran otomatis "Terlambat" saat jenis/waktu diubah (tetap bisa diubah manual)
  function autoLate(type: "in" | "out", time: string): boolean {
    if (type === "out" || !office) return false;
    const d = fromWitaInput(time);
    if (Number.isNaN(d.getTime())) return false;
    return isLateClockIn(d, office.work_start, office.friday_hybrid);
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    const when = fromWitaInput(form.time);
    if (Number.isNaN(when.getTime())) {
      setError("Waktu tidak valid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          server_time: when.toISOString(),
          status: form.status,
          work_mode: form.work_mode,
          is_late: form.is_late,
          location_label: form.location_label,
          reject_reason: form.status === "rejected" ? form.reject_reason : null,
          reason: form.reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal menyimpan koreksi.");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setError("Terjadi kesalahan koneksi.");
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit Absensi — ${record.employees?.full_name ?? ""}`} onClose={onClose} busy={busy}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Jenis</label>
            <select
              className="input"
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as "in" | "out";
                setForm((f) => ({ ...f, type, is_late: autoLate(type, f.time) }));
              }}
            >
              <option value="in">Masuk</option>
              <option value="out">Pulang</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => set("status", e.target.value as "valid" | "rejected")}
            >
              <option value="valid">Valid</option>
              <option value="rejected">Ditolak</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Waktu (WITA)</label>
          <input
            type="datetime-local"
            step={1}
            className="input"
            value={form.time}
            onChange={(e) => {
              const time = e.target.value;
              setForm((f) => ({ ...f, time, is_late: autoLate(f.type, time) }));
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Mode Kerja</label>
            <select
              className="input"
              value={form.work_mode}
              onChange={(e) => set("work_mode", e.target.value as "wfo" | "wfh")}
            >
              <option value="wfo">WFO</option>
              <option value="wfh">WFH</option>
            </select>
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.is_late} onChange={(e) => set("is_late", e.target.checked)} />
            Tandai Terlambat
          </label>
        </div>

        <div>
          <label className="label">Keterangan lokasi</label>
          <input
            className="input"
            value={form.location_label}
            onChange={(e) => set("location_label", e.target.value)}
            placeholder="Opsional"
          />
        </div>

        {form.status === "rejected" && (
          <div>
            <label className="label">Alasan penolakan</label>
            <input
              className="input"
              value={form.reject_reason}
              onChange={(e) => set("reject_reason", e.target.value)}
            />
          </div>
        )}

        <div className="border-t border-slate-100 pt-3">
          <label className="label">Alasan koreksi (wajib — tercatat di Riwayat Perubahan)</label>
          <input
            className="input"
            value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
            placeholder="Contoh: pegawai lupa absen pulang, sesuai konfirmasi atasan"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-secondary">
            Batal
          </button>
          <button onClick={save} disabled={busy || form.reason.trim().length < 3} className="btn-primary">
            {busy ? "Menyimpan..." : "Simpan Koreksi"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteModal({
  target,
  ids,
  onClose,
  onDone,
}: {
  target: AttendanceRecord | "bulk";
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const bulk = target === "bulk";
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      bulk
        ? `${ids.length} data absensi terpilih`
        : `absen ${target.type === "in" ? "masuk" : "pulang"} ${target.employees?.full_name ?? ""} (${formatWita(
            new Date(target.server_time)
          )})`,
    [bulk, ids.length, target]
  );

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = bulk
        ? await fetch("/api/attendance/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, reason }),
          })
        : await fetch(`/api/attendance/${ids[0]}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason }),
          });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Gagal menghapus data.");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setError("Terjadi kesalahan koneksi.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Hapus Data Absensi" onClose={onClose} busy={busy}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Anda akan menghapus <strong>{summary}</strong> secara permanen. Data sebelum dihapus disimpan di
          Riwayat Perubahan sebagai jejak audit.
        </p>
        <div>
          <label className="label">Alasan penghapusan (wajib)</label>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: absen ganda / salah catat"
          />
        </div>
        {bulk && (
          <div>
            <label className="label">
              Ketik <span className="font-mono text-red-600">HAPUS</span> untuk melanjutkan
            </label>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-secondary">
            Batal
          </button>
          <button
            onClick={run}
            disabled={busy || reason.trim().length < 3 || (bulk && confirmText !== "HAPUS")}
            className="btn-primary !bg-none bg-red-600 hover:bg-red-700"
          >
            {busy ? "Menghapus..." : "Hapus Permanen"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
