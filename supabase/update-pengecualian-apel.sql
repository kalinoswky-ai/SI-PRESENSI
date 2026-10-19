-- ============================================================================
-- MIGRASI: Pengecualian Apel (Sakit/Hamil/Alasan Khusus)
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan berulang.
--
-- LATAR BELAKANG:
--   Pegawai yang sedang sakit, hamil, atau punya alasan khusus lain (tidak bisa berdiri
--   lama) tidak dapat mengikuti apel pagi (Senin/Rabu/tanggal 17 tiap bulan). Fitur ini
--   menambah jenis pengajuan BARU 'pengecualian_apel' pada tabel leave_requests yang sudah
--   ada (Cuti/Izin/Sakit/Dinas) — TAPI BERBEDA dari jenis lain: pegawai yang disetujui
--   TETAP WAJIB absen masuk & pulang seperti biasa (berketerangan Hadir), hanya dibebaskan
--   dari kewajiban hadir FISIK di lokasi apel. Bukan cuti — pegawai tetap bekerja.
--
--   Alur: pegawai mengajukan (pilih kategori Sakit/Hamil/Alasan Khusus + tanggal + alasan,
--   lampiran opsional mis. surat dokter/bidan) -> persetujuan Inspektur, Sekretaris, ATAU
--   Admin utama (sama seperti Izin & Sakit) -> setelah disetujui, absen masuk pegawai ybs
--   pada tanggal terkait otomatis tercatat "dikecualikan dari apel" bila ia absen dari
--   Kantor (bukan lokasi apel) -- lihat perubahan src/app/api/attendance/clock/route.ts.
--
-- Tambahan kolom (khusus dipakai utk type = pengecualian_apel, NULL utk jenis lain):
--   apel_exemption_reason -> kategori alasan: 'sakit' | 'hamil' | 'alasan_khusus'
-- ============================================================================

-- ---------- leave_requests.type: tambahkan 'pengecualian_apel' ----------
alter table public.leave_requests drop constraint if exists leave_requests_type_check;
alter table public.leave_requests
  add constraint leave_requests_type_check
  check (type in ('cuti', 'izin', 'sakit', 'dinas_dalam', 'dinas_luar', 'pengecualian_apel'));

-- ---------- leave_requests: kolom kategori alasan pengecualian apel ----------
alter table public.leave_requests add column if not exists apel_exemption_reason text;
alter table public.leave_requests drop constraint if exists leave_requests_apel_exemption_reason_check;
alter table public.leave_requests
  add constraint leave_requests_apel_exemption_reason_check
  check (apel_exemption_reason in ('sakit', 'hamil', 'alasan_khusus') or apel_exemption_reason is null);

comment on column public.leave_requests.apel_exemption_reason is
  'Kategori alasan pengecualian apel (sakit/hamil/alasan_khusus) — diisi khusus utk type = pengecualian_apel.';

-- ---------- RLS: siapa yang boleh menyetujui/menolak 'pengecualian_apel' ----------
-- Sama seperti Izin & Sakit: Inspektur, ATAU Sekretaris, ATAU Admin utama (masing-masing
-- akun aktif) — memakai helper is_izin_sakit_approver() yang sudah ada (lihat
-- update-approval-izin-sakit-sekretaris-admin.sql & update-pimpinan-inspektur-sekretaris.sql).
-- Cuti, Dinas Dalam, Dinas Luar TETAP tidak berubah (tetap hanya Inspektur).
drop policy if exists "leave_admin_update" on public.leave_requests;
drop policy if exists "leave_approver_update" on public.leave_requests;
create policy "leave_approver_update" on public.leave_requests
  for update using (
    case
      when type in ('izin', 'sakit', 'pengecualian_apel') then public.is_izin_sakit_approver()
      else public.is_leave_approver()
    end
  )
  with check (
    case
      when type in ('izin', 'sakit', 'pengecualian_apel') then public.is_izin_sakit_approver()
      else public.is_leave_approver()
    end
  );

-- Tidak ada perubahan pada kebijakan select/insert/delete — sudah berlaku umum utk semua
-- nilai kolom "type" (lihat schema.sql). Bucket Storage "leave-attachments" juga generik.

-- ---------- reload skema PostgREST agar kolom baru langsung dikenali API ----------
notify pgrst, 'reload schema';

-- ---------- VERIFIKASI ----------
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.leave_requests'::regclass
  and conname in ('leave_requests_type_check', 'leave_requests_apel_exemption_reason_check');
