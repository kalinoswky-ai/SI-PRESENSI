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
