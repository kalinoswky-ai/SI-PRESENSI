-- ============================================================================
-- MIGRASI: Pecah role "Pimpinan" menjadi jabatan eksplisit Inspektur / Sekretaris
-- Jalankan sekali di Supabase SQL Editor (aman dijalankan berulang).
--
-- LATAR BELAKANG:
--   Sebelumnya, akun Inspektur baru harus ditandai `can_approve_leave = true` secara
--   MANUAL lewat SQL Editor (supabase/update-approval-cuti-inspektur.sql) — sehingga akun
--   Pimpinan/Inspektur yang baru dibuat lewat aplikasi TIDAK LANGSUNG bisa menyetujui
--   pengajuan cuti/izin/sakit/dinas sebelum migrasi itu dijalankan ulang.
--
-- PERUBAHAN:
--   * Kolom baru `pimpinan_type` ('inspektur' | 'sekretaris', hanya relevan utk role
--     'pimpinan') — dipilih langsung lewat dropdown "Jabatan Pimpinan" di menu Tambah/Kelola
--     Pegawai (Admin). TIDAK PERLU lagi SQL Editor untuk akun baru:
--       - Pilih "Inspektur"  -> can_approve_leave otomatis TRUE (berwenang penuh: cuti,
--         izin, sakit, dinas dalam, dinas luar).
--       - Pilih "Sekretaris" -> can_approve_leave tetap FALSE, tapi tetap berwenang
--         menyetujui Izin & Sakit saja (sama seperti Admin utama).
--   * Ini MENGGANTI cara lama mendeteksi Sekretaris dari teks kolom Jabatan (ilike
--     '%sekretaris%'); pimpinan_type kini jadi sumber kebenaran (teks Jabatan lama tetap
--     dipakai sbg fallback bila pimpinan_type belum diisi, jangan sampai akses tiba-tiba
--     hilang sebelum di-resave lewat form baru).
--   * Trigger guard_can_approve_leave (dari migrasi cuti-inspektur) TETAP AKTIF: mencegah
--     sesi pegawai/pimpinan biasa mengubah can_approve_leave sendiri. Yang berubah HANYA
--     endpoint Admin (create/edit pegawai) — sudah memakai koneksi service role di server,
--     jadi tidak kena trigger tsb, TAPI tetap wajib login sebagai Admin (requireAdmin()).
--
-- SETELAH MENJALANKAN MIGRASI INI: buka Kelola Pegawai untuk akun Inspektur Anda, pilih
-- role Pimpinan + Jabatan Pimpinan "Inspektur", simpan — akun tsb langsung bisa menyetujui
-- pengajuan tanpa langkah SQL tambahan.
-- ============================================================================

-- 1) Kolom baru
alter table public.employees
  add column if not exists pimpinan_type text check (pimpinan_type in ('inspektur', 'sekretaris'));

-- 2) Backfill dari data yang sudah ada, supaya akun lama tidak kehilangan akses:
--    - Akun pimpinan yang sudah bertanda can_approve_leave = true -> 'inspektur'.
--    - Akun pimpinan lain yang jabatannya mengandung kata "sekretaris" -> 'sekretaris'.
update public.employees
set pimpinan_type = 'inspektur'
where role = 'pimpinan' and can_approve_leave = true and pimpinan_type is null;

update public.employees
set pimpinan_type = 'sekretaris'
where role = 'pimpinan' and position ilike '%sekretaris%' and pimpinan_type is null;

-- 3) Pimpinan_type hanya berlaku utk role 'pimpinan' — bersihkan bila role lain.
update public.employees set pimpinan_type = null where role <> 'pimpinan' and pimpinan_type is not null;

-- 4) Helper: apakah user saat ini penyetuju KHUSUS izin/sakit (Sekretaris ATAU Admin utama)?
--    (Menggantikan fungsi lama yang menebak dari teks Jabatan.)
create or replace function public.is_izin_sakit_extra_approver()
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
        or (role = 'pimpinan' and pimpinan_type = 'sekretaris')
        or (role = 'pimpinan' and pimpinan_type is null and position ilike '%sekretaris%')
      )
  );
$$;

-- 5) VERIFIKASI
select full_name, position, role, pimpinan_type, can_approve_leave
from public.employees
where role in ('pimpinan', 'admin')
order by role, full_name;
