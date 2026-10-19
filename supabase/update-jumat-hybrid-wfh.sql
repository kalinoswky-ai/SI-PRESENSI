-- Jalankan SEKALI di Supabase > SQL Editor pada database yang sudah berjalan.
-- Menambahkan kolom work_mode (WFO / WFH) untuk fitur pilihan WFO/WFH pada hari Jumat hybrid.
-- Data lama otomatis bernilai 'wfo'.
alter table public.attendance add column if not exists work_mode text not null default 'wfo';

do $$ begin
  alter table public.attendance
    add constraint attendance_work_mode_check check (work_mode in ('wfo', 'wfh'));
exception when duplicate_object then null; end $$;
