-- Jalankan SEKALI di Supabase > SQL Editor (aman dijalankan berulang / idempotent).
--
-- Fitur: ADMIN UTAMA dapat mengatur "masuk lebih awal" — bila pegawai yang sedang cuti/izin/sakit/
-- dinas (pengajuan sudah disetujui) ternyata masuk kerja lebih cepat dari jadwal semula, Admin
-- menetapkan TANGGAL MASUK KEMBALI. Masa pengajuan dipangkas (end_date = tanggal masuk - 1 hari)
-- sehingga mulai tanggal itu pegawai wajib & dapat absen seperti biasa. Bila tanggal masuk = hari
-- pertama pengajuan, pengajuan dibatalkan seluruhnya (status 'cancelled').
--
--   original_end_date -> tanggal akhir semula (jejak audit; NULL = tidak pernah dimajukan)
--   resumed_by/at     -> admin yang memberi otorisasi & waktunya
--   resume_note       -> alasan (wajib diisi dari aplikasi)

alter table public.leave_requests drop constraint if exists leave_requests_status_check;
alter table public.leave_requests
  add constraint leave_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

alter table public.leave_requests add column if not exists original_end_date date;
alter table public.leave_requests add column if not exists resumed_by uuid references public.employees(id) on delete set null;
alter table public.leave_requests add column if not exists resumed_at timestamptz;
alter table public.leave_requests add column if not exists resume_note text;

comment on column public.leave_requests.original_end_date is
  'Tanggal akhir pengajuan SEBELUM dimajukan Admin (masuk lebih awal). NULL = tidak pernah dimajukan.';

notify pgrst, 'reload schema';
