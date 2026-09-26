-- Jalankan SEKALI di Supabase > SQL Editor pada database yang sudah berjalan
-- (aman dijalankan berulang — semua perintah memakai IF NOT EXISTS).
--
-- Menambahkan:
--   1. Kolom `apel_group` pada employees (kelompok OPD pegawai, untuk menentukan
--      lokasi apel Rabu mana yang berlaku bagi pegawai tsb).
--   2. Tabel `apel_locations` — daftar lokasi apel pagi Senin (Kantor Bupati,
--      berlaku untuk semua pegawai) & Rabu (per kelompok perangkat daerah/OPD),
--      dikelola sepenuhnya lewat menu Admin > Pengaturan.
--   3. Kolom `apel_location_id` & `location_label` pada attendance, untuk mencatat
--      lokasi apel yang dipilih pegawai saat absen (jejak audit).
--
-- Catatan: perubahan agar absen PULANG tidak lagi mensyaratkan radius kantor adalah
-- perubahan logika aplikasi (src/app/api/attendance/clock/route.ts), bukan skema
-- database — tidak ada perintah SQL untuk bagian tsb.

alter table public.employees add column if not exists apel_group text;

create table if not exists public.apel_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  weekday smallint not null check (weekday in (1, 3)), -- 1 = Senin, 3 = Rabu
  group_name text, -- null = berlaku utk semua pegawai (Senin); diisi utk pengelompokan lokasi apel Rabu
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 150,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_apel_locations_weekday on public.apel_locations (weekday, group_name);

alter table public.apel_locations enable row level security;

drop policy if exists "apel_locations_select_authenticated" on public.apel_locations;
create policy "apel_locations_select_authenticated" on public.apel_locations
  for select using (auth.role() = 'authenticated');

drop policy if exists "apel_locations_admin_write" on public.apel_locations;
create policy "apel_locations_admin_write" on public.apel_locations
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.attendance add column if not exists apel_location_id uuid references public.apel_locations(id) on delete set null;
alter table public.attendance add column if not exists location_label text;
