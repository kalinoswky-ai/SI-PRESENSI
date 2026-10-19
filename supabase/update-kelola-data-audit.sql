-- Jalankan SEKALI di Supabase > SQL Editor (aman dijalankan berulang / idempotent).
--
-- Mendukung fitur Edit & Hapus data (Timesheets, Reports, People) oleh Admin:
--   1. Tabel audit_log — jejak audit setiap koreksi/penghapusan (siapa, kapan, alasan,
--      data sebelum & sesudah). Hanya Admin yang dapat membaca; penulisan hanya lewat server.
--   2. Kolom edited_at / edited_by / edit_note pada attendance — penanda "Diedit" pada log.
--   3. leave_requests.reviewed_by -> ON DELETE SET NULL, agar akun admin yang pernah
--      memproses pengajuan dapat dihapus tanpa error relasi.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,            -- sengaja TANPA foreign key: jejak audit tetap ada walau akun dihapus
  actor_name text,
  action text not null,     -- attendance.update | attendance.delete | attendance.bulk_delete | employee.update | employee.delete
  target_type text not null,
  target_id text,
  target_label text,
  reason text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_admin_select" on public.audit_log;
create policy "audit_log_admin_select" on public.audit_log
  for select using (public.is_admin());
-- Tidak ada policy insert/update/delete: log hanya ditulis oleh server (service role) dan tidak
-- dapat diubah/dihapus dari aplikasi.

alter table public.attendance add column if not exists edited_at timestamptz;
alter table public.attendance add column if not exists edited_by uuid;
alter table public.attendance add column if not exists edit_note text;

alter table public.leave_requests drop constraint if exists leave_requests_reviewed_by_fkey;
alter table public.leave_requests
  add constraint leave_requests_reviewed_by_fkey
  foreign key (reviewed_by) references public.employees(id) on delete set null;
