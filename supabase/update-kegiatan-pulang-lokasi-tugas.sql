-- Jalankan SEKALI di Supabase > SQL Editor (aman dijalankan berulang / idempotent).
--
-- Tujuan: pegawai yang sedang TUGAS LUAR / LAPANGAN (peserta Kegiatan Lapangan) tidak wajib
-- kembali ke kantor untuk absen pulang. Pada kegiatan yang diberi opsi ini, peserta boleh
-- absen PULANG langsung dari LOKASI TUGAS (di dalam radius lokasi kegiatan) mulai jam yang
-- ditetapkan Admin/Inspektur/Sekretaris — tanpa harus menunggu jam pulang kantor (work_end).
--
--   allow_clock_out  -> true = peserta boleh absen pulang dari lokasi kegiatan ini.
--                       Default false: kegiatan lama TIDAK berubah perilakunya.
--   clock_out_time   -> "HH:MM" WITA, absen pulang di lokasi tugas dibuka mulai jam ini.

alter table public.kegiatan_absensi
  add column if not exists allow_clock_out boolean not null default false;

alter table public.kegiatan_absensi
  add column if not exists clock_out_time text;

comment on column public.kegiatan_absensi.allow_clock_out is
  'true = peserta boleh absen PULANG dari lokasi kegiatan (tugas lapangan), tidak wajib kembali ke kantor.';
comment on column public.kegiatan_absensi.clock_out_time is
  'Jam (HH:MM WITA) mulai dibukanya absen pulang di lokasi kegiatan. Wajib diisi bila allow_clock_out = true.';

notify pgrst, 'reload schema';
