-- Jalankan SEKALI di Supabase > SQL Editor pada database yang sudah berjalan
-- (aman dijalankan berulang — memakai IF NOT EXISTS / kolom nullable).
--
-- Menambahkan dukungan APEL BULANAN pada tanggal tetap tiap bulan (mis. tanggal 17 —
-- Apel Peringatan Hari Kesadaran Nasional di Kantor Bupati, berlaku semua pegawai),
-- selain apel mingguan Senin/Rabu yang sudah ada.
--
--   1. Kolom `weekday` pada apel_locations dibuat boleh NULL (sebelumnya wajib diisi
--      1 atau 3) — dipakai bila lokasi tsb jadwal MINGGUAN.
--   2. Kolom baru `day_of_month` (1-31) — dipakai bila lokasi tsb jadwal BULANAN pada
--      tanggal tetap (weekday dikosongkan/NULL untuk baris ini).
--
-- Satu baris apel_locations HANYA salah satu: weekday terisi (mingguan) ATAU
-- day_of_month terisi (bulanan) — diatur & divalidasi dari menu Admin > Pengaturan.

alter table public.apel_locations alter column weekday drop not null;

alter table public.apel_locations add column if not exists day_of_month smallint
  check (day_of_month is null or (day_of_month between 1 and 31));

comment on column public.apel_locations.day_of_month is
  'Tanggal tetap (1-31) tiap bulan utk apel bulanan (mis. 17 = Apel Kesadaran Nasional). '
  'NULL bila lokasi ini memakai jadwal mingguan (kolom weekday).';
