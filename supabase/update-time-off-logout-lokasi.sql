-- Jalankan SEKALI di Supabase > SQL Editor (aman dijalankan berulang / idempotent).
--
-- 1. Memastikan kolom `location_label` ada di tabel attendance (dipakai utk mencatat
--    keterangan lokasi absen PULANG: "Pulang dari kantor" / "Pulang di luar kantor / lapangan").
-- 2. Memastikan kebijakan RLS pengajuan cuti/izin/sakit terpasang, sehingga pengajuan pegawai
--    terbaca oleh Admin di menu Time Off.
--
-- Perbaikan tampilan Time Off & absen pulang bebas-lokasi ada di kode aplikasi (deploy ulang ke
-- Vercel), bukan di SQL ini.

alter table public.attendance add column if not exists location_label text;

alter table public.leave_requests enable row level security;

drop policy if exists "leave_select_own_or_admin" on public.leave_requests;
create policy "leave_select_own_or_admin" on public.leave_requests
  for select using (employee_id = auth.uid() or public.is_admin());

drop policy if exists "leave_insert_own" on public.leave_requests;
create policy "leave_insert_own" on public.leave_requests
  for insert with check (employee_id = auth.uid() and status = 'pending');

drop policy if exists "leave_admin_update" on public.leave_requests;
create policy "leave_admin_update" on public.leave_requests
  for update using (public.is_admin());

-- (Opsional, utk diagnosis) daftar pengajuan terbaru — jalankan terpisah bila perlu:
-- select id, employee_id, type, status, start_date, end_date, created_at
-- from public.leave_requests order by created_at desc limit 20;
