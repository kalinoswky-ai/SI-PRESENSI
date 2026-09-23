-- ============================================================================
-- SISTEM ABSENSI DIGITAL — INSPEKTORAT SUMBA BARAT
-- Jalankan seluruh isi file ini di Supabase SQL Editor (satu kali, saat setup)
-- ============================================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "pgcrypto";

-- ---------- TABLE: offices (lokasi kantor & radius geofencing) ----------
create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Inspektorat Sumba Barat',
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 150,
  work_start time not null default '07:00',
  work_end time not null default '14:30',
  friday_hybrid boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- TABLE: employees (profil pegawai, 1:1 dengan auth.users) ----------
create table if not exists public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  nip text unique not null,
  full_name text not null,
  position text,
  email text not null,
  role text not null default 'employee' check (role in ('employee', 'admin')),
  face_descriptor jsonb, -- 128-length float array dari face-api.js
  photo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- TABLE: attendance (log absensi) ----------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  server_time timestamptz not null default now(), -- WAKTU SERVER, tidak bisa dimanipulasi klien
  latitude double precision not null,
  longitude double precision not null,
  distance_meters numeric not null,
  within_geofence boolean not null,
  face_match boolean not null,
  face_distance numeric,
  selfie_url text,
  status text not null check (status in ('valid', 'rejected')),
  reject_reason text,
  is_late boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_employee_time on public.attendance (employee_id, server_time desc);
create index if not exists idx_attendance_time on public.attendance (server_time desc);

-- ---------- Helper: is current user an admin? ----------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.employees
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.offices enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;

-- offices: semua pegawai login boleh baca (untuk cek geofence di klien), hanya admin boleh ubah
drop policy if exists "offices_select_authenticated" on public.offices;
create policy "offices_select_authenticated" on public.offices
  for select using (auth.role() = 'authenticated');

drop policy if exists "offices_admin_write" on public.offices;
create policy "offices_admin_write" on public.offices
  for all using (public.is_admin()) with check (public.is_admin());

-- employees: pegawai boleh baca datanya sendiri; admin boleh baca/ubah semua
drop policy if exists "employees_select_self" on public.employees;
create policy "employees_select_self" on public.employees
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "employees_admin_write" on public.employees;
create policy "employees_admin_write" on public.employees
  for all using (public.is_admin()) with check (public.is_admin());

-- catatan: employee TIDAK boleh update/insert/delete baris employees miliknya sendiri
-- (termasuk face_descriptor) — hanya admin melalui service role / policy admin di atas.

-- attendance: pegawai boleh insert absensi miliknya sendiri & baca riwayat miliknya sendiri
-- TIDAK ADA policy update/delete untuk employee -> data absensi tidak bisa diubah pegawai.
drop policy if exists "attendance_select_own_or_admin" on public.attendance;
create policy "attendance_select_own_or_admin" on public.attendance
  for select using (employee_id = auth.uid() or public.is_admin());

drop policy if exists "attendance_insert_own" on public.attendance;
create policy "attendance_insert_own" on public.attendance
  for insert with check (employee_id = auth.uid());

drop policy if exists "attendance_admin_update_delete" on public.attendance;
create policy "attendance_admin_update_delete" on public.attendance
  for update using (public.is_admin());

drop policy if exists "attendance_admin_delete" on public.attendance;
create policy "attendance_admin_delete" on public.attendance
  for delete using (public.is_admin());

-- ---------- STORAGE: bucket untuk foto selfie & foto profil ----------
insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

drop policy if exists "selfies_insert_own" on storage.objects;
create policy "selfies_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'selfies' and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "selfies_select_own_or_admin" on storage.objects;
create policy "selfies_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'selfies' and (
      (auth.uid())::text = (storage.foldername(name))[1] or public.is_admin()
    )
  );

drop policy if exists "profile_photos_admin_write" on storage.objects;
create policy "profile_photos_admin_write" on storage.objects
  for insert with check (bucket_id = 'profile-photos' and public.is_admin());

drop policy if exists "profile_photos_public_read" on storage.objects;
create policy "profile_photos_public_read" on storage.objects
  for select using (bucket_id = 'profile-photos');

-- ---------- SEED: baris default offices (SILAKAN UPDATE koordinat via Admin > Pengaturan) ----------
-- Koordinat di bawah adalah titik pusat Kota Waikabubak (perkiraan), BUKAN titik
-- persis gedung Kantor Inspektorat. WAJIB diperbaiki lewat Admin > Pengaturan
-- menggunakan koordinat GPS aktual di depan Kantor Inspektorat Sumba Barat.
insert into public.offices (name, latitude, longitude, radius_meters, work_start, work_end, friday_hybrid)
select 'Inspektorat Sumba Barat', -9.63583, 119.41306, 150, '07:00', '14:30', true
where not exists (select 1 from public.offices);

-- ---------- SEED: akun admin pertama ----------
-- Setelah membuat user admin pertama lewat Supabase Auth (Authentication > Add user,
-- atau lewat halaman /login dengan akun yang sudah di-invite), jalankan baris berikut
-- dengan mengganti UUID dan data sesuai user tersebut:
--
-- insert into public.employees (id, nip, full_name, email, role, is_active)
-- values ('UUID-USER-DARI-AUTH', '000000000000000000', 'Nama Admin', 'admin@sumbabaratkab.go.id', 'admin', true);

-- ============================================================================
-- MIGRASI TAMBAHAN — jalankan sekali di SQL Editor (aman dijalankan berulang,
-- semua perintah memakai IF NOT EXISTS / ON CONFLICT):
--  1. Nomor WhatsApp pegawai (untuk notifikasi pribadi keterlambatan)
--  2. Pengaturan Notifikasi WhatsApp/Telegram + Integrasi Laporan Otomatis BKPSDM
--     (disimpan di tabel offices yang sudah ada, sebagai tabel pengaturan tunggal)
--  3. Tabel leave_requests (Cuti/Izin/Sakit) beserta RLS & bucket lampiran
-- ============================================================================

-- ---------- employees: nomor WhatsApp pribadi (opsional) ----------
alter table public.employees add column if not exists phone text;

-- ---------- offices: pengaturan notifikasi & integrasi BKPSDM ----------
alter table public.offices add column if not exists wa_notify_enabled boolean not null default false;
alter table public.offices add column if not exists wa_provider text not null default 'fonnte'; -- 'fonnte' | 'wablas' | 'other' (generic HTTP API bertoken)
alter table public.offices add column if not exists wa_api_token text;
alter table public.offices add column if not exists wa_admin_numbers text; -- nomor admin/pengawas, pisahkan dengan koma, format 62xxxxxxxxxx
alter table public.offices add column if not exists wa_notify_employee boolean not null default true; -- kirim juga ke nomor pegawai ybs jika ada

alter table public.offices add column if not exists telegram_notify_enabled boolean not null default false;
alter table public.offices add column if not exists telegram_bot_token text;
alter table public.offices add column if not exists telegram_chat_id text; -- id grup/channel pengawas

alter table public.offices add column if not exists bkpsdm_report_enabled boolean not null default false;
alter table public.offices add column if not exists bkpsdm_report_email text; -- email tujuan (dikirim via Resend)
alter table public.offices add column if not exists bkpsdm_webhook_url text; -- opsional: endpoint/webhook BKPSDM atau Zapier/Make
alter table public.offices add column if not exists bkpsdm_report_schedule text not null default 'monthly'; -- 'daily' | 'weekly' | 'monthly'
alter table public.offices add column if not exists bkpsdm_last_sent_at timestamptz;

-- ---------- TABLE: leave_requests (Cuti / Izin / Sakit) ----------
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  type text not null check (type in ('cuti', 'izin', 'sakit')),
  start_date date not null,
  end_date date not null,
  reason text not null,
  attachment_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.employees(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint leave_dates_valid check (end_date >= start_date)
);

create index if not exists idx_leave_employee on public.leave_requests (employee_id, start_date desc);
create index if not exists idx_leave_status on public.leave_requests (status);

alter table public.leave_requests enable row level security;

-- pegawai boleh baca pengajuan miliknya sendiri; admin boleh baca semua
drop policy if exists "leave_select_own_or_admin" on public.leave_requests;
create policy "leave_select_own_or_admin" on public.leave_requests
  for select using (employee_id = auth.uid() or public.is_admin());

-- pegawai boleh mengajukan cuti/izin untuk dirinya sendiri, hanya berstatus pending
drop policy if exists "leave_insert_own" on public.leave_requests;
create policy "leave_insert_own" on public.leave_requests
  for insert with check (employee_id = auth.uid() and status = 'pending');

-- hanya admin boleh mengubah (approve/reject) & menghapus pengajuan
drop policy if exists "leave_admin_update" on public.leave_requests;
create policy "leave_admin_update" on public.leave_requests
  for update using (public.is_admin());

drop policy if exists "leave_admin_delete" on public.leave_requests;
create policy "leave_admin_delete" on public.leave_requests
  for delete using (public.is_admin());

-- catatan: pegawai TIDAK bisa mengubah/menghapus pengajuannya sendiri setelah dikirim
-- (mencegah pegawai mengubah status approved/rejected sendiri) — hanya admin yang bisa.

-- ---------- STORAGE: bucket lampiran cuti/izin (misal: surat dokter) ----------
insert into storage.buckets (id, name, public)
values ('leave-attachments', 'leave-attachments', false)
on conflict (id) do nothing;

drop policy if exists "leave_attachments_insert_own" on storage.objects;
create policy "leave_attachments_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'leave-attachments' and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "leave_attachments_select_own_or_admin" on storage.objects;
create policy "leave_attachments_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'leave-attachments' and (
      (auth.uid())::text = (storage.foldername(name))[1] or public.is_admin()
    )
  );

-- ============================================================================
-- MIGRASI: Pendaftaran wajah mandiri oleh pegawai + persetujuan manual admin
-- Pegawai merekam wajahnya sendiri lewat halaman /dashboard/face-enrollment,
-- tersimpan sementara di kolom pending_* — TIDAK langsung dipakai untuk absensi.
-- face_descriptor (kolom lama, dipakai saat validasi absen) hanya terisi/berubah
-- setelah admin menekan tombol "Setujui" di halaman Kelola Pegawai.
-- ============================================================================
alter table public.employees add column if not exists face_enrollment_status text not null default 'none'
  check (face_enrollment_status in ('none', 'pending', 'approved', 'rejected'));
alter table public.employees add column if not exists pending_face_descriptor jsonb;
alter table public.employees add column if not exists pending_photo_url text;
alter table public.employees add column if not exists face_rejection_reason text;

-- Migrasi data lama: pegawai yang sudah punya face_descriptor (didaftarkan admin sebelumnya)
-- otomatis dianggap sudah 'approved' agar tidak perlu approval ulang.
update public.employees
set face_enrollment_status = 'approved'
where face_descriptor is not null and face_enrollment_status = 'none';

-- ============================================================================
-- MIGRASI: NIP opsional untuk akun admin
-- (unique constraint tetap berlaku untuk baris yang NIP-nya diisi;
--  Postgres mengizinkan banyak baris dengan nip NULL secara bersamaan)
-- ============================================================================
alter table public.employees alter column nip drop not null;
