-- ============================================================================
-- MIGRASI TAHAP 3: Persetujuan Koreksi Absensi (dashboard web)
-- Jalankan SEKALI di Supabase > SQL Editor, SETELAH update-koreksi-absensi.sql
-- (aman dijalankan berulang / idempotent).
--
-- Menyetujui/menolak dilakukan lewat DUA FUNGSI database agar SELURUH langkah berjalan dalam
-- SATU transaksi: (1) status pengajuan, (2) perubahan data absensi resmi, (3) jejak audit.
-- Bila salah satu gagal, semuanya dibatalkan — tidak mungkin absensi berubah tanpa audit.
--
-- Fungsi hanya bisa dipanggil oleh service role (server aplikasi). Pengecekan kewenangan
-- (siapa boleh menyetujui) dilakukan di API sebelum fungsi dipanggil; browser/pegawai tidak
-- bisa memanggil fungsi ini langsung.
--
-- Perilaku saat DISETUJUI (koreksi 'in' = absen masuk, 'out' = absen pulang):
--   * Bila pada tanggal itu sudah ada absen valid sejenis (masuk: yang paling awal, pulang: yang
--     paling akhir) -> jam-nya DIKOREKSI (dan is_late dihitung ulang utk absen masuk memakai aturan
--     jam kerja & Jumat hybrid dari tabel offices, sama dengan saat absen biasa).
--   * Bila belum ada -> dibuat baris absensi baru berstatus valid. Karena tidak ada GPS/wajah yang
--     nyata, koordinat diisi 0, face_match=false, within_geofence=false, dan location_label
--     bertuliskan "Koreksi absensi (disetujui)" agar mudah dibedakan di log/laporan.
--   * Baris ditandai edited_at/edited_by/edit_note (tampil sebagai "Diedit" di Timesheets).
-- ============================================================================

create or replace function public.approve_attendance_correction(
  p_id uuid, p_actor uuid, p_actor_name text, p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.attendance_corrections%rowtype;
  o public.offices%rowtype;
  old_row public.attendance%rowtype;
  have_old boolean := false;
  new_ts timestamptz;
  day_start timestamptz;
  day_end timestamptz;
  other_ts timestamptz;
  late boolean := false;
  emp_name text;
  att_id uuid;
  mode text;
begin
  select * into c from public.attendance_corrections where id = p_id for update;
  if not found then raise exception 'KOREKSI_TIDAK_DITEMUKAN'; end if;
  if c.status <> 'pending' then raise exception 'KOREKSI_SUDAH_DIPROSES'; end if;

  new_ts := (c.work_date + c.requested_time) at time zone 'Asia/Makassar';
  day_start := c.work_date::timestamp at time zone 'Asia/Makassar';
  day_end := (c.work_date + 1)::timestamp at time zone 'Asia/Makassar';

  -- Konsistensi urutan: masuk harus sebelum pulang yang tercatat, dan sebaliknya.
  if c.type = 'in' then
    select max(server_time) into other_ts from public.attendance
      where employee_id = c.employee_id and type = 'out' and status = 'valid'
        and server_time >= day_start and server_time < day_end;
    if other_ts is not null and new_ts >= other_ts then raise exception 'URUTAN_TIDAK_VALID'; end if;
    select * into old_row from public.attendance
      where employee_id = c.employee_id and type = 'in' and status = 'valid'
        and server_time >= day_start and server_time < day_end
      order by server_time asc limit 1;
  else
    select min(server_time) into other_ts from public.attendance
      where employee_id = c.employee_id and type = 'in' and status = 'valid'
        and server_time >= day_start and server_time < day_end;
    if other_ts is not null and new_ts <= other_ts then raise exception 'URUTAN_TIDAK_VALID'; end if;
    select * into old_row from public.attendance
      where employee_id = c.employee_id and type = 'out' and status = 'valid'
        and server_time >= day_start and server_time < day_end
      order by server_time desc limit 1;
  end if;
  have_old := found;

  if c.type = 'in' then
    select * into o from public.offices limit 1;
    if found then
      late := not (o.friday_hybrid and extract(isodow from c.work_date) = 5)
              and c.requested_time > o.work_start;
    end if;
  end if;

  if have_old then
    update public.attendance
      set server_time = new_ts,
          is_late = case when c.type = 'in' then late else is_late end,
          edited_at = now(), edited_by = p_actor,
          edit_note = 'Koreksi absensi disetujui: ' || c.reason
      where id = old_row.id;
    att_id := old_row.id;
    mode := 'update';
  else
    insert into public.attendance (
      employee_id, type, server_time, latitude, longitude, distance_meters,
      within_geofence, face_match, status, is_late, work_mode, location_label,
      edited_at, edited_by, edit_note
    ) values (
      c.employee_id, c.type, new_ts, 0, 0, 0,
      false, false, 'valid', late, 'wfo', 'Koreksi absensi (disetujui)',
      now(), p_actor, 'Koreksi absensi disetujui: ' || c.reason
    ) returning id into att_id;
    mode := 'insert';
  end if;

  update public.attendance_corrections
    set status = 'approved', reviewed_by = p_actor, reviewed_at = now(), review_note = p_note
    where id = c.id;

  select full_name into emp_name from public.employees where id = c.employee_id;
  insert into public.audit_log (actor_id, actor_name, action, target_type, target_id, target_label, reason, old_data, new_data)
  values (
    p_actor, p_actor_name, 'correction.approve', 'correction', c.id::text,
    coalesce(emp_name, '-') || ' — koreksi absen ' || case c.type when 'in' then 'masuk' else 'pulang' end
      || ' ' || c.work_date::text || ' ' || to_char(c.requested_time, 'HH24:MI'),
    coalesce(p_note, c.reason),
    case when have_old then jsonb_build_object('attendance_id', old_row.id, 'server_time', old_row.server_time, 'is_late', old_row.is_late)
         else null end,
    jsonb_build_object('attendance_id', att_id, 'server_time', new_ts, 'is_late', late, 'mode', mode,
                       'correction_id', c.id, 'requested_reason', c.reason)
  );

  return jsonb_build_object('attendance_id', att_id, 'mode', mode);
end;
$$;

create or replace function public.reject_attendance_correction(
  p_id uuid, p_actor uuid, p_actor_name text, p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.attendance_corrections%rowtype;
  emp_name text;
begin
  select * into c from public.attendance_corrections where id = p_id for update;
  if not found then raise exception 'KOREKSI_TIDAK_DITEMUKAN'; end if;
  if c.status <> 'pending' then raise exception 'KOREKSI_SUDAH_DIPROSES'; end if;

  update public.attendance_corrections
    set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(), review_note = p_note
    where id = c.id;

  select full_name into emp_name from public.employees where id = c.employee_id;
  insert into public.audit_log (actor_id, actor_name, action, target_type, target_id, target_label, reason, old_data, new_data)
  values (
    p_actor, p_actor_name, 'correction.reject', 'correction', c.id::text,
    coalesce(emp_name, '-') || ' — koreksi absen ' || case c.type when 'in' then 'masuk' else 'pulang' end
      || ' ' || c.work_date::text || ' ' || to_char(c.requested_time, 'HH24:MI'),
    p_note, null, jsonb_build_object('correction_id', c.id, 'requested_reason', c.reason)
  );
end;
$$;

-- Hanya service role (server) yang boleh menjalankan fungsi ini.
revoke all on function public.approve_attendance_correction(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.reject_attendance_correction(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.approve_attendance_correction(uuid, uuid, text, text) to service_role;
grant execute on function public.reject_attendance_correction(uuid, uuid, text, text) to service_role;

-- VERIFIKASI (opsional): kedua fungsi harus muncul.
-- select proname from pg_proc where proname in ('approve_attendance_correction', 'reject_attendance_correction');
