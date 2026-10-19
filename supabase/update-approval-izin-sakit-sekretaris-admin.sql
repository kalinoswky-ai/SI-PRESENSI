-- ============================================================================
-- MIGRASI: Izin & Sakit juga bisa disetujui Sekretaris dan Admin utama
-- Jalankan sekali di Supabase SQL Editor (aman dijalankan berulang).
--
-- CATATAN: fungsi is_izin_sakit_extra_approver() di file ini kemudian DIPERBARUI oleh
-- supabase/update-pimpinan-inspektur-sekretaris.sql (deteksi Sekretaris via kolom
-- pimpinan_type, bukan lagi menebak dari teks Jabatan). Jalankan file ini DULU, baru file
-- tsb setelahnya.
--
-- Aturan baru:
--   * Izin & Sakit: boleh disetujui/ditolak oleh Inspektur (can_approve_leave = true,
--     seperti sebelumnya), ATAU Sekretaris (role 'pimpinan', jabatan mengandung kata
--     "sekretaris"), ATAU Admin utama (role 'admin') — masing-masing akun aktif.
--   * Cuti, Dinas Dalam, dan Dinas Luar: TETAP hanya Inspektur — TIDAK berubah
--     (lihat supabase/update-approval-cuti-inspektur.sql).
--   * Ini hanya mengubah siapa yang boleh MENYETUJUI/MENOLAK (update status). Kebijakan
--     baca (select) & hapus (delete) TIDAK diubah oleh migrasi ini.
-- ============================================================================

-- 1) Helper: apakah user saat ini penyetuju KHUSUS izin/sakit (Sekretaris atau Admin utama)?
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
        or (role = 'pimpinan' and position ilike '%sekretaris%')
      )
  );
$$;

-- 2) Helper gabungan: penyetuju untuk jenis izin/sakit = Inspektur ATAU Sekretaris/Admin utama.
create or replace function public.is_izin_sakit_approver()
returns boolean
language sql
security definer
stable
as $$
  select public.is_leave_approver() or public.is_izin_sakit_extra_approver();
$$;

-- 3) RLS: ganti kebijakan update leave_requests supaya bercabang per jenis pengajuan.
drop policy if exists "leave_admin_update" on public.leave_requests;
drop policy if exists "leave_approver_update" on public.leave_requests;
create policy "leave_approver_update" on public.leave_requests
  for update using (
    case
      when type in ('izin', 'sakit') then public.is_izin_sakit_approver()
      else public.is_leave_approver()
    end
  )
  with check (
    case
      when type in ('izin', 'sakit') then public.is_izin_sakit_approver()
      else public.is_leave_approver()
    end
  );

-- 4) VERIFIKASI — pastikan hanya akun yang dimaksud yang bisa menyetujui izin/sakit.
select full_name, position, role, can_approve_leave,
  public.is_izin_sakit_extra_approver() as bisa_setujui_izin_sakit_tambahan
from public.employees
where role in ('pimpinan', 'admin')
order by role, full_name;

-- Bila jabatan Sekretaris ditulis berbeda (mis. tidak mengandung kata "sekretaris") sehingga
-- tidak terdeteksi otomatis, perbaiki datanya di tabel employees (kolom position), lalu
-- jalankan ulang query VERIFIKASI di atas.
