-- ============================================================================
-- MIGRASI: Perjalanan Dinas (Dalam Daerah & Luar Daerah)
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan berulang.
--
-- Tujuan: menambah 2 jenis pengajuan baru pada tabel leave_requests yang sudah
-- ada (Cuti/Izin/Sakit) — yaitu 'dinas_dalam' (Perjalanan Dinas Dalam Daerah)
-- dan 'dinas_luar' (Perjalanan Dinas Luar Daerah) — sehingga pegawai yang
-- sedang melaksanakan tugas dinas TIDAK PERLU absen masuk/pulang selama masa
-- penugasan, persis seperti pegawai yang cuti/izin/sakit disetujui (memakai
-- alur & tabel yang sama: pengajuan → persetujuan Inspektur → otomatis
-- dikecualikan dari absensi & status "Tanpa Berita" pada tanggal terkait).
--
-- Tambahan kolom (khusus dipakai utk 2 jenis dinas ini, NULL utk cuti/izin/sakit):
--   destination    -> tujuan/lokasi penugasan (mis. "Kabupaten Sumba Timur",
--                      "Jakarta", "Kecamatan Lamboya")
--   letter_number  -> nomor Surat Perintah Tugas (SPT), opsional
-- ============================================================================

-- ---------- leave_requests.type: tambahkan 'dinas_dalam' & 'dinas_luar' ----------
alter table public.leave_requests drop constraint if exists leave_requests_type_check;
alter table public.leave_requests
  add constraint leave_requests_type_check
  check (type in ('cuti', 'izin', 'sakit', 'dinas_dalam', 'dinas_luar'));

-- ---------- leave_requests: kolom tambahan khusus perjalanan dinas ----------
alter table public.leave_requests add column if not exists destination text;
alter table public.leave_requests add column if not exists letter_number text;

comment on column public.leave_requests.destination is
  'Tujuan/lokasi penugasan — diisi khusus utk type = dinas_dalam / dinas_luar.';
comment on column public.leave_requests.letter_number is
  'Nomor Surat Perintah Tugas (SPT), opsional — diisi khusus utk type = dinas_dalam / dinas_luar.';

-- Tidak ada perubahan RLS/kebijakan yang diperlukan: kebijakan select/insert/update/delete
-- pada leave_requests sudah berlaku umum utk semua nilai kolom "type" (lihat schema.sql).
-- Bucket Storage "leave-attachments" (utk lampiran, mis. scan Surat Tugas/SPT) juga sudah
-- generik dan langsung bisa dipakai tanpa perubahan.

-- ---------- reload skema PostgREST agar kolom baru langsung dikenali API ----------
notify pgrst, 'reload schema';
