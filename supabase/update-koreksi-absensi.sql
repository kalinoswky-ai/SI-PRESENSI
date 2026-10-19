-- ============================================================================
-- MIGRASI TAHAP 2: Pengajuan Koreksi Absensi (sisi pegawai)
-- Jalankan SEKALI di Supabase > SQL Editor (aman dijalankan berulang / idempotent).
--
-- Prinsip:
--   * Pengajuan TIDAK mengubah tabel attendance. Data absensi resmi hanya berubah setelah
--     pihak berwenang menyetujui (diimplementasikan di Tahap 3).
--   * Pegawai hanya bisa MEMBUAT pengajuan (status pending) untuk dirinya sendiri dan
--     MEMBACA miliknya. Tidak ada policy update/delete untuk pegawai, sehingga status
--     tidak bisa diubah/dihapus pegawai. Admin/Pimpinan boleh membaca semua.
--   * Policy untuk menyetujui/menolak sengaja BELUM dibuat di sini (Tahap 3).
--   * Lampiran memakai bucket 'leave-attachments' yang sudah ada (folder pertama = id pegawai),
--     sehingga tidak perlu bucket/policy storage baru.
-- ============================================================================

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,                       -- tanggal absensi yang dikoreksi (WITA)
  type text not null check (type in ('in', 'out')),  -- koreksi absen masuk / pulang
  requested_time time not null,                  -- jam yang diajukan (WITA)
  reason text not null,
  attachment_url text,                           -- path di bucket leave-attachments
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_corrections_employee on public.attendance_corrections (employee_id, work_date desc);
create index if not exists idx_corrections_status on public.attendance_corrections (status);

-- Cegah pengajuan ganda: satu pengajuan MENUNGGU per pegawai + tanggal + jenis.
create unique index if not exists uq_corrections_one_pending
  on public.attendance_corrections (employee_id, work_date, type)
  where status = 'pending';

alter table public.attendance_corrections enable row level security;

drop policy if exists "corrections_select_own_or_leadership" on public.attendance_corrections;
create policy "corrections_select_own_or_leadership" on public.attendance_corrections
  for select using (employee_id = auth.uid() or public.is_admin_or_pimpinan());

drop policy if exists "corrections_insert_own" on public.attendance_corrections;
create policy "corrections_insert_own" on public.attendance_corrections
  for insert with check (
    employee_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and review_note is null
  );

-- VERIFIKASI (opsional): harus mengembalikan 2 policy (select & insert).
-- select policyname, cmd from pg_policies where tablename = 'attendance_corrections';
