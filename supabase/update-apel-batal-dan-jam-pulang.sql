-- Jalankan SEKALI di Supabase > SQL Editor pada database yang sudah berjalan
-- (aman dijalankan berulang — memakai IF NOT EXISTS).
--
-- Menambahkan:
--   1. Kolom `cancelled_date` pada apel_locations — dipakai Admin untuk membatalkan
--      apel pagi Senin/Rabu HANYA untuk tanggal tsb (sekali pakai), tanpa perlu
--      menonaktifkan (is_active) lokasi apel secara permanen. Saat lokasi apel
--      ditandai batal pada tanggal berjalan, pegawai otomatis diwajibkan kembali
--      presensi di radius Kantor Inspektorat pada hari itu (bukan di lokasi apel).
--
-- Catatan: aturan "clock-out hanya bisa pukul work_end (jam pulang) atau setelahnya"
-- adalah perubahan logika aplikasi (src/app/api/attendance/clock/route.ts) yang
-- memakai kolom `offices.work_end` yang sudah ada — tidak ada perintah SQL tambahan
-- untuk bagian tsb.

alter table public.apel_locations add column if not exists cancelled_date date;

comment on column public.apel_locations.cancelled_date is
  'Tanggal (YYYY-MM-DD) apel di lokasi ini ditiadakan — hanya berlaku utk tanggal tsb. '
  'NULL = apel berjalan normal. Diisi ulang tiap kali admin membatalkan apel hari itu; '
  'tidak otomatis reset, jadi minggu berikutnya (weekday sama) otomatis tidak lagi cocok '
  'dgn tanggal hari itu sehingga apel kembali berjalan normal.';
