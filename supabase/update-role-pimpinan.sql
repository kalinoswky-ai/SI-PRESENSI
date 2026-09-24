-- ============================================================================
-- MIGRASI: Role "Pimpinan" (Inspektur & Sekretaris Inspektorat)
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan berulang.
--
-- Tujuan: memberi akses kepada pimpinan (mis. Inspektur Kabupaten Sumba Barat,
-- Sekretaris Inspektorat) untuk MELIHAT statistik/rekap kehadiran seluruh
-- pegawai lewat panel /admin (Dashboard, Timesheets, Reports, daftar Pegawai,
-- daftar Cuti/Izin) — TANPA bisa menambah, mengedit, atau menghapus data apa
-- pun (itu tetap khusus role 'admin'). Pimpinan tetap login & absen sendiri
-- seperti pegawai biasa lewat /dashboard.
-- ============================================================================

-- ---------- employees.role: tambahkan 'pimpinan' ke daftar role yang sah ----------
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees
  add constraint employees_role_check check (role in ('employee', 'admin', 'pimpinan'));

-- ---------- Helper: apakah user saat ini Pimpinan (aktif)? ----------
create or replace function public.is_pimpinan()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.employees
    where id = auth.uid() and role = 'pimpinan' and is_active = true
  );
$$;

-- ---------- Helper: admin ATAU pimpinan (dipakai utk akses baca/lihat saja) ----------
create or replace function public.is_admin_or_pimpinan()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.employees
    where id = auth.uid() and role in ('admin', 'pimpinan') and is_active = true
  );
$$;

-- ---------- employees: pimpinan boleh MEMBACA seluruh data pegawai ----------
-- (tetap TIDAK boleh insert/update/delete — kebijakan tulis di bawah masih khusus is_admin())
drop policy if exists "employees_select_self" on public.employees;
create policy "employees_select_self" on public.employees
  for select using (id = auth.uid() or public.is_admin_or_pimpinan());

-- ---------- attendance: pimpinan boleh MEMBACA seluruh log absensi pegawai ----------
drop policy if exists "attendance_select_own_or_admin" on public.attendance;
create policy "attendance_select_own_or_admin" on public.attendance
  for select using (employee_id = auth.uid() or public.is_admin_or_pimpinan());

-- ---------- leave_requests: pimpinan boleh MEMBACA seluruh pengajuan cuti/izin/sakit ----------
drop policy if exists "leave_select_own_or_admin" on public.leave_requests;
create policy "leave_select_own_or_admin" on public.leave_requests
  for select using (employee_id = auth.uid() or public.is_admin_or_pimpinan());

-- Catatan keamanan: seluruh kebijakan "for all"/update/delete/insert pada ketiga
-- tabel di atas TETAP memakai public.is_admin() (bukan is_admin_or_pimpinan()),
-- sehingga pimpinan hanya bisa melihat, tidak bisa mengubah/menghapus data apa
-- pun — persis seperti aplikasi (UI & API) yang juga membatasi hal yang sama.
