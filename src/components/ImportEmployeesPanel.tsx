"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { ROLE_LABEL, type EmployeeRole } from "@/types";

interface RowResult {
  rowNumber: number;
  full_name: string;
  nip: string | null;
  position: string | null;
  role: EmployeeRole | null;
  email: string;
  phone: string | null;
  status: "ok" | "error" | "created" | "failed";
  message: string | null;
}

interface PreviewResponse {
  mode: "preview";
  total: number;
  valid: number;
  invalid: number;
  rows: RowResult[];
}

interface ImportResponse {
  mode: "import";
  total: number;
  created: number;
  skipped: number;
  failed: number;
  rows: RowResult[];
  auditWarning: string | null;
}

const STATUS_STYLE: Record<RowResult["status"], { text: string; cls: string }> = {
  ok: { text: "Siap", cls: "bg-emerald-50 text-emerald-700" },
  error: { text: "Bermasalah", cls: "bg-red-50 text-red-600" },
  created: { text: "Berhasil", cls: "bg-emerald-50 text-emerald-700" },
  failed: { text: "Gagal", cls: "bg-red-50 text-red-600" },
};

export default function ImportEmployeesPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  async function send(f: File, mode: "preview" | "import") {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("mode", mode);
    const res = await fetch("/api/employees/import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Terjadi kesalahan pada server.");
    return json;
  }

  async function handleFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    if (!f) return;
    setBusy("preview");
    try {
      setPreview((await send(f, "preview")) as PreviewResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan koneksi.");
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    setError(null);
    setBusy("import");
    try {
      const data = (await send(file, "import")) as ImportResponse;
      setResult(data);
      setPreview(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan koneksi.");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const rows = result?.rows ?? preview?.rows ?? [];

  return (
    <div className="space-y-4">
      {/* Langkah 1 & 2 */}
      <div className="card space-y-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 shrink-0 text-brand-600" size={22} />
          <div className="space-y-1 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Import Data Pegawai dari Excel</p>
            <p>
              Kolom: <strong>NAMA | NIP | JABATAN | ROLE | EMAIL | NO HP | PASSWORD</strong>. ROLE diisi{" "}
              <strong>pegawai</strong>, <strong>pimpinan</strong>, atau <strong>admin</strong>. PASSWORD adalah
              password awal (boleh sama untuk semua) — setiap pegawai <strong>wajib menggantinya sendiri</strong>{" "}
              saat login pertama.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/api/employees/import/template" className="btn-secondary">
            <Download size={16} />
            1. Unduh Template
          </a>
          <label className="btn-primary cursor-pointer">
            <Upload size={16} />
            2. Pilih File Excel (.xlsx)
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={busy !== null}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {file && (
          <p className="text-sm text-slate-500">
            File: <strong>{file.name}</strong>
          </p>
        )}
        {busy === "preview" && <p className="text-sm text-slate-500">Memeriksa isi file...</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Hasil pemeriksaan */}
      {preview && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-slate-800">Hasil pemeriksaan ({preview.total} baris)</span>
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 size={15} /> {preview.valid} siap diimpor
            </span>
            {preview.invalid > 0 && (
              <span className="inline-flex items-center gap-1 text-red-600">
                <XCircle size={15} /> {preview.invalid} bermasalah (akan dilewati)
              </span>
            )}
          </div>

          {preview.invalid > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 shrink-0" size={15} />
              Baris bermasalah tidak akan diimpor. Perbaiki di Excel lalu unggah ulang, atau lanjutkan untuk
              mengimpor baris yang sudah benar saja.
            </p>
          )}

          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            disabled={busy !== null || preview.valid === 0}
            onClick={handleImport}
          >
            {busy === "import" ? "Mengimpor..." : `3. Import ${preview.valid} Pegawai`}
          </button>
        </div>
      )}

      {/* Hasil import */}
      {result && (
        <div className="card space-y-3">
          <p className="flex items-center gap-1.5 font-semibold text-slate-800">
            <CheckCircle2 className="text-emerald-600" size={18} />
            Import selesai: {result.created} pegawai berhasil dibuat
            {result.skipped + result.failed > 0 && `, ${result.skipped + result.failed} tidak diimpor`}.
          </p>
          <p className="text-sm text-slate-500">
            Beritahu pegawai password awalnya. Saat login pertama mereka otomatis diminta membuat password baru.
          </p>
          {result.auditWarning && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{result.auditWarning}</p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={reset}>
              Import File Lain
            </button>
            <button type="button" className="btn-primary" onClick={() => router.push("/admin/employees")}>
              Lihat Data Pegawai
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card max-h-[60vh] overflow-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500 shadow-sm">
              <tr>
                <th className="px-3 py-2">Baris</th>
                <th className="px-3 py-2">Nama</th>
                <th className="px-3 py-2">NIP</th>
                <th className="px-3 py-2">Jabatan</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">No HP</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const st = STATUS_STYLE[r.status];
                return (
                  <tr key={r.rowNumber} className={r.status === "error" || r.status === "failed" ? "bg-red-50/40" : ""}>
                    <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.full_name || "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.nip ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.position ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.role ? ROLE_LABEL[r.role] : "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.email || "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.phone ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span>
                      {r.message && <p className="mt-1 max-w-xs text-xs text-red-600">{r.message}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
