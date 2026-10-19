-- ============================================================================
-- MIGRASI: Approval cuti/izin/sakit HANYA oleh Inspektur
-- Jalankan sekali di Supabase SQL Editor (aman dijalankan berulang).
--
-- Aturan baru:
--   * Yang boleh menyetujui/menolak pengajuan = akun role 'pimpinan' yang aktif DAN
--     bertanda can_approve_leave = true (diberikan hanya ke akun Inspektur).
--   * Admin dan Sekretaris hanya dapat MELIHAT pengajuan.
--   * Penanda can_approve_leave hanya bisa diubah lewat SQL Editor ini, tidak lewat
--     aplikasi — sehingga Admin tidak bisa memberi hak itu ke dirinya sendiri.
-- ============================================================================

-- 1) Penanda hak approval
alter table public.employees
  add column if not exists can_approve_leave boolean not null default false;

-- 2) Beri hak otomatis ke akun pimpinan berjabatan "Inspektur ..." (bukan Inspektur
--    Pembantu, bukan Sekretaris). WAJIB diperiksa hasilnya lewat query di bagian 6.
update public.employees
set can_approve_leave = true
where role = 'pimpinan'
  and is_active = true
  and position ilike 'inspektur%'
  and position not ilike '%pembantu%'
  and can_approve_leave = false;

-- 3) Helper: apakah user saat ini penyetuju cuti/izin?
create or replace function public.is_leave_approver()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.employees
    where id = auth.uid()
      and role = 'pimpinan'
      and is_active = true
      and can_approve_leave = true
  );
$$;

-- 4) Kunci penanda: perubahan dari aplikasi (ada auth.uid()) ditolak / direset.
create or replace function public.guard_can_approve_leave()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.can_approve_leave := false;
    elsif new.can_approve_leave is distinct from old.can_approve_leave then
      raise exception 'can_approve_leave hanya dapat diubah lewat SQL Editor Supabase.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_can_approve_leave on public.employees;
create trigger trg_guard_can_approve_leave
  before insert or update on public.employees
  for each row execute function public.guard_can_approve_leave();

-- 5) RLS: ubah status pengajuan hanya oleh penyetuju (bukan lagi admin).
--    Kebijakan baca & hapus TIDAK diubah.
drop policy if exists "leave_admin_update" on public.leave_requests;
drop policy if exists "leave_approver_update" on public.leave_requests;
create policy "leave_approver_update" on public.leave_requests
  for update using (public.is_leave_approver()) with check (public.is_leave_approver());

--    Penyetuju perlu melihat lampiran (mis. surat dokter) sebelum memutuskan.
drop policy if exists "leave_attachments_select_own_or_admin" on storage.objects;
create policy "leave_attachments_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'leave-attachments' and (
      (auth.uid())::text = (storage.foldername(name))[1] or public.is_admin_or_pimpinan()
    )
  );

-- 6) VERIFIKASI — pastikan hanya akun Inspektur yang bernilai true.
select full_name, position, role, can_approve_leave
from public.employees
where role in ('pimpinan', 'admin')
order by can_approve_leave desc, role, full_name;

-- Bila akun Inspektur belum bertanda true (mis. jabatan ditulis berbeda), set manual:
--   update public.employees set can_approve_leave = true where email = 'email-inspektur@contoh.go.id';
-- Bila ada akun yang salah bertanda true:
--   update public.employees set can_approve_leave = false where email = '...';
