-- ============================================================================
-- MIGRASI: Fitur Lembur (pengajuan lembur pegawai + persetujuan Inspektur)
-- Jalankan sekali di Supabase SQL Editor (aman dijalankan berulang).
--
-- PRASYARAT: update-approval-cuti-inspektur.sql sudah dijalankan (fungsi
-- public.is_leave_approver() dan kolom can_approve_leave dipakai ulang di sini).
--
-- Aturan:
--   * Pegawai (dan Pimpinan sebagai pegawai) mengajukan lembur untuk dirinya sendiri.
--   * Yang boleh menyetujui/menolak = penyetuju yang sama dengan cuti/izin (Inspektur).
--   * Admin & Sekretaris hanya melihat. Pegawai tidak bisa mengubah pengajuannya sendiri.
--   * Lampiran (mis. surat perintah lembur) memakai bucket 'leave-attachments' yang sudah ada.
-- ============================================================================

create table if not exists public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,                 -- tanggal pelaksanaan lembur
  start_time time not null,                -- jam mulai (WITA)
  end_time time not null,                  -- jam selesai (WITA), harus setelah jam mulai
  duration_minutes integer not null default 0,  -- diisi otomatis oleh trigger
  description text not null,               -- uraian pekerjaan yang akan dilembur
  attachment_url text,                     -- opsional: surat perintah lembur
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.employees(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint overtime_time_valid check (end_time > start_time)
);

create index if not exists idx_overtime_employee on public.overtime_requests (employee_id, work_date desc);
create index if not exists idx_overtime_status on public.overtime_requests (status);
create index if not exists idx_overtime_date on public.overtime_requests (work_date);

-- Durasi dihitung di database supaya tidak bisa dimanipulasi dari sisi klien.
create or replace function public.set_overtime_duration()
returns trigger
language plpgsql
as $$
begin
  new.duration_minutes := (extract(epoch from (new.end_time - new.start_time)) / 60)::integer;
  return new;
end;
$$;

drop trigger if exists trg_set_overtime_duration on public.overtime_requests;
create trigger trg_set_overtime_duration
  before insert or update of start_time, end_time on public.overtime_requests
  for each row execute function public.set_overtime_duration();

alter table public.overtime_requests enable row level security;

-- baca: pemilik, atau admin/pimpinan
drop policy if exists "overtime_select_own_or_leadership" on public.overtime_requests;
create policy "overtime_select_own_or_leadership" on public.overtime_requests
  for select using (employee_id = auth.uid() or public.is_admin_or_pimpinan());

-- ajukan: hanya untuk diri sendiri & berstatus pending
drop policy if exists "overtime_insert_own" on public.overtime_requests;
create policy "overtime_insert_own" on public.overtime_requests
  for insert with check (employee_id = auth.uid() and status = 'pending');

-- ubah status: hanya penyetuju (Inspektur)
drop policy if exists "overtime_approver_update" on public.overtime_requests;
create policy "overtime_approver_update" on public.overtime_requests
  for update using (public.is_leave_approver()) with check (public.is_leave_approver());

-- hapus: hanya admin
drop policy if exists "overtime_admin_delete" on public.overtime_requests;
create policy "overtime_admin_delete" on public.overtime_requests
  for delete using (public.is_admin());
