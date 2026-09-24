-- ============================================================================
-- PERBAIKAN: "Gagal menambah lokasi apel — Could not find the 'day_of_month'
--             column of 'apel_locations' in the schema cache"
--
-- Penyebab: migrasi apel bulanan (update-apel-bulanan-tanggal-tetap.sql) belum
-- dijalankan di database Supabase, ATAU sudah dijalankan tetapi cache skema
-- PostgREST belum dimuat ulang.
--
-- File ini MENGGABUNGKAN semua kolom yang dibutuhkan fitur Lokasi Apel
-- (mingguan + bulanan + batal hari ini) dan memuat ulang cache skema.
-- Jalankan SEKALI di Supabase > SQL Editor > New query > Run.
-- AMAN dijalankan berulang (idempotent) & tidak menghapus data yang ada.
-- ============================================================================

-- 1) Kolom pegawai untuk pengelompokan apel Rabu (OPD)
alter table public.employees add column if not exists apel_group text;

-- 2) Tabel lokasi apel (dibuat hanya bila belum ada)
create table if not exists public.apel_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  weekday smallint check (weekday in (1, 3)),
  group_name text,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 150,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Jadwal bulanan: weekday boleh kosong (NULL) + kolom tanggal tetap
alter table public.apel_locations alter column weekday drop not null;

alter table public.apel_locations add column if not exists day_of_month smallint
  check (day_of_month is null or (day_of_month between 1 and 31));

-- 4) Batalkan apel untuk hari ini saja
alter table public.apel_locations add column if not exists cancelled_date date;

-- 5) Jejak lokasi apel pada tabel absensi
alter table public.attendance add column if not exists apel_location_id uuid references public.apel_locations(id) on delete set null;
alter table public.attendance add column if not exists location_label text;

-- 6) Index & RLS (aman diulang)
create index if not exists idx_apel_locations_weekday on public.apel_locations (weekday, group_name);
alter table public.apel_locations enable row level security;

drop policy if exists "apel_locations_select_authenticated" on public.apel_locations;
create policy "apel_locations_select_authenticated" on public.apel_locations
  for select using (auth.role() = 'authenticated');

drop policy if exists "apel_locations_admin_write" on public.apel_locations;
create policy "apel_locations_admin_write" on public.apel_locations
  for all using (public.is_admin()) with check (public.is_admin());

-- 7) WAJIB: muat ulang cache skema PostgREST agar kolom baru langsung dikenali API
--    (tanpa ini error "schema cache" tetap muncul walau kolom sudah ada).
notify pgrst, 'reload schema';
