-- ============================================================================
-- MIGRASI: Sekretaris diberi wewenang approval PENUH, setara Inspektur
-- Jalankan sekali di Supabase SQL Editor (aman dijalankan berulang).
--
-- PRASYARAT: jalankan setelah
--   - supabase/update-approval-cuti-inspektur.sql
--   - supabase/update-approval-izin-sakit-sekretaris-admin.sql
--   - supabase/update-pimpinan-inspektur-sekretaris.sql
--   - supabase/update-lembur.sql
-- (fungsi is_leave_approver(), is_izin_sakit_approver(), kolom can_approve_leave &
--  pimpinan_type, serta tabel overtime_requests dipakai/diperluas di sini).
--
-- LATAR BELAKANG:
--   Sebelumnya Cuti, Dinas Dalam, Dinas Luar, dan Lembur HANYA bisa disetujui/ditolak oleh
--   Inspektur (can_approve_leave = true). Bila Inspektur berhalangan/tidak sempat, semua
--   pengajuan tsb menumpuk tanpa ada yang bisa memprosesnya.
--
-- PERUBAHAN:
--   * Fungsi public.is_leave_approver() diperluas: sekarang bernilai true untuk akun
--     role 'pimpinan' aktif YANG BERTANDA can_approve_leave = true (Inspektur) ATAU
--     berjabatan Sekretaris (pimpinan_type = 'sekretaris', dgn fallback ke teks Jabatan
--     lama bila pimpinan_type belum diisi) — SAMA seperti deteksi Sekretaris yang sudah
--     dipakai untuk Izin/Sakit.
--   * Karena leave_requests (utk Cuti/Dinas) dan overtime_requests (Lembur) sama-sama
--     memakai is_leave_approver() di kebijakan RLS-nya, Sekretaris otomatis ikut
--     berwenang menyetujui/menolak Cuti, Dinas Dalam, Dinas Luar, dan Lembur — TANPA
--     perlu mengubah kebijakan RLS lain.
--   * Admin utama TIDAK ditambahkan wewenang oleh migrasi ini — Admin tetap hanya
--     berwenang utk Izin/Sakit/Pengecualian Apel (tidak berubah).
--   * Izin, Sakit, Pengecualian Apel: TIDAK berubah — sudah bisa Inspektur/Sekretaris/
--     Admin sejak migrasi sebelumnya.
-- ============================================================================

-- 1) Perluas is_leave_approver(): Inspektur ATAU Sekretaris.
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
      and (
        can_approve_leave = true
        or pimpinan_type = 'sekretaris'
        or (pimpinan_type is null and position ilike '%sekretaris%')
      )
  );
$$;

-- 2) Tidak ada perubahan pada kebijakan RLS itu sendiri — leave_requests
--    ("leave_approver_update", cabang selain izin/sakit/pengecualian_apel) dan
--    overtime_requests ("overtime_approver_update") sudah memanggil is_leave_approver()
--    di atas, jadi otomatis ikut berubah begitu fungsinya diperbarui.

-- 3) VERIFIKASI — pastikan Inspektur DAN Sekretaris sama-sama bernilai true, Admin tetap false.
select full_name, position, role, pimpinan_type, can_approve_leave,
  public.is_leave_approver() as bisa_setujui_cuti_dinas_lembur
from public.employees
where role in ('pimpinan', 'admin')
order by role, full_name;

-- Bila jabatan Sekretaris ditulis berbeda (mis. tidak mengandung kata "sekretaris" dan
-- pimpinan_type belum diisi lewat menu Kelola Pegawai), perbaiki datanya (kolom position,
-- atau lebih baik set pimpinan_type = 'sekretaris' lewat menu Kelola Pegawai), lalu jalankan
-- ulang query VERIFIKASI di atas.
