-- ============================================================================
-- MIGRASI: (1) Admin utama berwenang menyetujui SEMUA pengajuan
--          (2) Apel sewaktu-waktu (Senin–Jumat atau tanggal tertentu) + batas akhir apel 08:30
--          (3) Absen di lokasi KEGIATAN (terkunci: peserta, tanggal, jam & radius ditentukan)
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan berulang (idempotent).
--
-- PRASYARAT: migrasi lama sudah dijalankan (terutama update-sekretaris-wewenang-penuh.sql,
-- fix-apel-lokasi-lengkap.sql / update-apel-*.sql, update-lembur.sql).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) ADMIN UTAMA = PENYETUJU SEMUA PENGAJUAN
--    is_leave_approver() dipakai RLS leave_requests (Cuti/Dinas), overtime_requests (Lembur),
--    dan is_izin_sakit_approver() (Izin/Sakit/Pengecualian Apel). Dengan Admin aktif ditambahkan
--    di sini, SEMUA kebijakan tsb otomatis ikut — tanpa mengubah kebijakan RLS lain.
-- ---------------------------------------------------------------------------
create or replace function public.is_leave_approver()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.employees
    where id = auth.uid()
      and is_active = true
      and (
        role = 'admin'
        or (
          role = 'pimpinan'
          and (
            can_approve_leave = true
            or pimpinan_type = 'sekretaris'
            or (pimpinan_type is null and position ilike '%sekretaris%')
          )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2) APEL: jadwal Senin–Jumat, apel sewaktu-waktu (tanggal tertentu), batas akhir apel
-- ---------------------------------------------------------------------------
-- 2a) Hari apel mingguan boleh Senin(1) s.d. Jumat(5) (sebelumnya hanya 1 & 3).
alter table public.apel_locations drop constraint if exists apel_locations_weekday_check;
alter table public.apel_locations
  add constraint apel_locations_weekday_check check (weekday is null or weekday between 1 and 5);

-- 2b) Apel SEWAKTU-WAKTU: berlaku HANYA pada tanggal tertentu, hari apa pun
--     (mis. tiba-tiba diminta apel di Kantor Bupati hari Selasa/Kamis/Jumat).
alter table public.apel_locations add column if not exists event_date date;
comment on column public.apel_locations.event_date is
  'Tanggal tertentu (apel sewaktu-waktu, sekali pakai). NULL bila jadwal mingguan (weekday) / bulanan (day_of_month).';

-- 2c) Batas akhir apel pagi (WITA). Setelah jam ini, pada hari apel absen masuk dilakukan
--     dari Kantor Inspektorat seperti biasa (pegawai tidak lagi diarahkan ke lokasi apel).
alter table public.offices add column if not exists apel_end_time text not null default '08:30';
comment on column public.offices.apel_end_time is
  'Batas akhir apel pagi "HH:MM" WITA (default 08:30). Setelah itu absen masuk dari Kantor Inspektorat.';

-- ---------------------------------------------------------------------------
-- 3) KEGIATAN LAPANGAN (absen di lokasi kegiatan — TERKUNCI)
--    Hanya pegawai yang DITUGASKAN (peserta), pada TANGGAL kegiatan, dalam JENDELA WAKTU,
--    dan di dalam RADIUS lokasi kegiatan yang bisa absen masuk dari lokasi tsb.
--    Dibuat/dikelola oleh Admin utama / Inspektur / Sekretaris (is_leave_approver()).
-- ---------------------------------------------------------------------------
create table if not exists public.kegiatan_absensi (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  activity_date date not null,
  start_time text not null default '06:00',   -- absen masuk dibuka mulai jam ini (WITA)
  end_time text not null default '10:00',     -- absen masuk ditutup setelah jam ini (WITA)
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 200,
  is_active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_kegiatan_absensi_date on public.kegiatan_absensi (activity_date);

create table if not exists public.kegiatan_peserta (
  kegiatan_id uuid not null references public.kegiatan_absensi(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kegiatan_id, employee_id)
);

create index if not exists idx_kegiatan_peserta_employee on public.kegiatan_peserta (employee_id);

alter table public.kegiatan_absensi enable row level security;
alter table public.kegiatan_peserta enable row level security;

-- Pegawai hanya bisa MELIHAT kegiatan tempat ia ditugaskan; Admin/Pimpinan melihat semua.
drop policy if exists "kegiatan_select" on public.kegiatan_absensi;
create policy "kegiatan_select" on public.kegiatan_absensi
  for select using (
    public.is_admin_or_pimpinan()
    or exists (
      select 1 from public.kegiatan_peserta p
      where p.kegiatan_id = kegiatan_absensi.id and p.employee_id = auth.uid()
    )
  );

drop policy if exists "kegiatan_write" on public.kegiatan_absensi;
create policy "kegiatan_write" on public.kegiatan_absensi
  for all using (public.is_leave_approver()) with check (public.is_leave_approver());

drop policy if exists "kegiatan_peserta_select" on public.kegiatan_peserta;
create policy "kegiatan_peserta_select" on public.kegiatan_peserta
  for select using (employee_id = auth.uid() or public.is_admin_or_pimpinan());

drop policy if exists "kegiatan_peserta_write" on public.kegiatan_peserta;
create policy "kegiatan_peserta_write" on public.kegiatan_peserta
  for all using (public.is_leave_approver()) with check (public.is_leave_approver());

-- Jejak kegiatan pada tabel absensi (audit: absen ini dilakukan lewat kegiatan mana).
alter table public.attendance
  add column if not exists activity_id uuid references public.kegiatan_absensi(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4) Muat ulang cache skema PostgREST agar kolom/tabel baru langsung dikenali API.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5) VERIFIKASI — Admin utama sekarang harus bernilai true di is_leave_approver().
--    (Dijalankan sebagai akun Admin lewat aplikasi; di SQL Editor auth.uid() = null,
--     jadi kolom bisa_setujui akan false — itu normal.)
-- ---------------------------------------------------------------------------
select full_name, role, is_active, offices.apel_end_time
from public.employees
cross join (select apel_end_time from public.offices limit 1) offices
where role = 'admin'
order by full_name;
