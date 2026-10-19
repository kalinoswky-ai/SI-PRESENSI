-- Jalankan SEKALI di Supabase > SQL Editor (aman dijalankan berulang / idempotent).
--
-- Mendukung fitur Import Pegawai via Excel + wajib ganti password saat login pertama:
--   Kolom employees.must_change_password — bernilai true untuk akun hasil import Excel
--   (password awal ditentukan Admin). Selama true, pengguna diarahkan ke halaman
--   "Ganti Password" sesudah login dan belum bisa membuka Dashboard/Admin.
--   Flag dikosongkan (false) OTOMATIS oleh server setelah pengguna berhasil mengganti password.
--
-- Pegawai tidak punya hak UPDATE pada tabel employees (lihat RLS di schema.sql), sehingga
-- flag ini tidak dapat dimatikan sendiri dari browser tanpa mengganti password.

alter table public.employees
  add column if not exists must_change_password boolean not null default false;
