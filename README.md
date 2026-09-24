# Sistem Absensi Digital — Inspektorat Sumba Barat

Aplikasi absensi harian pegawai dengan **Face Recognition**, **Geofencing**, dan **Server Clock**
— konsep serupa Jibble Attendance Tracker, tetapi dibangun sendiri (self-hosted) di atas
**Next.js 14 + Supabase + Vercel**, sehingga data sepenuhnya dikuasai oleh Inspektorat dan tidak
tergantung pihak ketiga.

## Fitur

- **Face Recognition** — selfie wajib setiap absen, dicocokkan (di sisi server) dengan wajah
  terdaftar menggunakan `face-api.js`.
- **Geofencing** — absensi hanya diterima bila lokasi GPS pegawai berada dalam radius kantor
  (default 150m, dapat diubah di menu Pengaturan).
- **Server Clock** — waktu absensi dicatat dari jam server (Supabase/Postgres `now()`), bukan
  jam HP pegawai, sehingga tidak bisa dimanipulasi.
- **Do Not Allow Edit** — pegawai tidak dapat mengubah/menghapus data absensinya sendiri (dijamin
  oleh Row Level Security di database, bukan hanya di tampilan).
- **Export Excel 1 Klik** — admin dapat mengunduh rekap absensi (.xlsx) siap kirim ke BKPSDM,
  dengan filter tanggal dan pegawai.
- **Dashboard Admin** — kelola pegawai, aktifkan/nonaktifkan akun, daftar/daftar ulang wajah,
  atur lokasi kantor & jam kerja (termasuk kebijakan Jumat hybrid).
- **Cuti / Izin / Sakit** — pegawai dapat mengajukan cuti/izin/sakit lengkap dengan lampiran
  (mis. surat dokter); admin menyetujui/menolak lewat menu **Admin → Cuti/Izin**. Pengajuan yang
  disetujui otomatis membebaskan pegawai dari kewajiban absen pada tanggal tersebut.
- **Notifikasi Keterlambatan (WhatsApp/Telegram)** — begitu ada absen masuk yang tercatat
  terlambat, sistem otomatis mengirim pesan ke admin/pengawas (dan opsional ke pegawai ybs) lewat
  WhatsApp (gateway token, mis. Fonnte) dan/atau Telegram (Bot API resmi & gratis). Diatur di
  menu **Admin → Pengaturan**.
- **Integrasi Laporan Otomatis ke BKPSDM** — sistem dapat membuat & mengirim rekap Excel secara
  terjadwal (harian/mingguan/bulanan) lewat email dan/atau webhook custom (mis. endpoint BKPSDM,
  Zapier/Make), dijalankan otomatis oleh Vercel Cron. Diatur di menu **Admin → Pengaturan**,
  dengan tombol uji coba pengiriman manual.
- **Biaya Rp 0,-** — Supabase & Vercel free tier cukup untuk skala ~100 pegawai.

## Stack Teknologi

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Auth, Postgres + Row Level Security, Storage)
- `face-api.js` (TensorFlow.js) — deteksi & pengenalan wajah berjalan di browser pegawai
- `exceljs` — generate laporan .xlsx di server
- Fonnte / Telegram Bot API — notifikasi WhatsApp & Telegram untuk keterlambatan
- Resend — pengiriman email laporan otomatis ke BKPSDM
- Vercel Cron — penjadwal laporan otomatis harian/mingguan/bulanan
- Deploy: GitHub → Vercel (CI/CD otomatis setiap push)

## Pembaruan: Time Off & Absen Pulang

- **Time Off (Admin)** — pengajuan cuti/izin/sakit pegawai kini selalu muncul di menu Time Off
  (perbaikan query yang ambigu ke tabel `employees`), lengkap dengan jumlah per tab, badge
  jumlah "Menunggu" di sidebar, dan notifikasi WhatsApp/Telegram ke admin saat ada pengajuan baru.
- **Absen Pulang** — bebas lokasi (tidak memakai radius kantor). Titik GPS pulang tetap dicatat
  beserta label lokasi ("Pulang dari kantor" / "Pulang di luar kantor / lapangan"), tampil di log
  admin, riwayat pegawai, dan Excel (kolom Lokasi, Latitude, Longitude, Peta).
- Jalankan `supabase/update-time-off-logout-lokasi.sql` sekali di SQL Editor.

## Pembaruan: Server Clock Sinkron

- Penyebab jam tertinggal: endpoint `/api/server-time` ter-cache sebagai halaman statis saat build,
  sehingga jam yang tampil = waktu deploy terakhir. Kini dipaksa dinamis (`force-dynamic`, `no-store`).
- Jam berjalan dikoreksi latensi jaringan, memakai timer monotonik, dan sinkron ulang tiap 5 menit
  serta saat aplikasi dibuka kembali. Bila jam HP berbeda >1 menit dari server, muncul peringatan.
- Penentuan "hari ini" (hari Jumat/apel, cuti hari ini, absen hari ini) memakai tanggal server WITA.

## Pembaruan: Edit & Hapus Data (khusus Admin)

- **People (Data Pegawai)** — tombol *Edit* & *Hapus* per pegawai. Hapus = permanen (akun login,
  absensi, pengajuan cuti/izin, foto) dengan konfirmasi ketik `HAPUS`; tersedia juga di "Zona
  Berbahaya" halaman Kelola Pegawai. Untuk pegawai pindah/pensiun gunakan *Nonaktifkan*.
- **Timesheets** — tab *Log Absensi*: Edit (jenis, waktu WITA, status, mode, terlambat, lokasi),
  Hapus satu data, atau pilih banyak baris lalu *Hapus terpilih*. Klik sel jam di grid mingguan untuk
  langsung membuka data hari tersebut. Tab baru *Riwayat Perubahan* menampilkan jejak audit.
- **Reports** — per pegawai: *Edit* (buka log pegawai pada periode itu) & *Hapus* (data periode);
  serta "Kelola Data Periode Ini" untuk menghapus data Ditolak / seluruh data periode.
- **Pengaman** — otorisasi dicek di server; alasan wajib untuk koreksi/hapus absensi; setiap
  perubahan tercatat di tabel `audit_log` (siapa, kapan, alasan, data sebelum/sesudah); Admin tidak
  bisa menghapus akunnya sendiri atau menurunkan/menghapus satu-satunya Admin aktif.
- Jalankan `supabase/update-kelola-data-audit.sql` sekali di SQL Editor **sebelum** memakai fitur ini.
- Rekap Reports, grid Timesheets, dan Export Excel kini mengambil seluruh data (sebelumnya
  terpotong di 1000 baris) dan memakai batas hari WITA.

## Pembaruan: Bisa Dipasang di Layar Utama HP (PWA)

- Aplikasi kini punya *Web App Manifest* + ikon (`public/icons/`, logo Kab. Sumba Barat), sehingga di
  Android (Chrome) muncul **Instal aplikasi** dan di iPhone (Safari) **Tambahkan ke Layar Utama**
  dengan ikon yang benar dan tampilan layar penuh. Tidak perlu Play Store / App Store.
- Butuh alamat **https** (Vercel sudah https). Tidak ada service worker: aplikasi tetap membutuhkan internet.
- Panduan untuk pegawai: bagikan halaman panduan pemasangan (Android & iPhone).

## Pembaruan: Status Kehadiran Dashboard & Export Excel 3 Sheet

- **Dashboard Admin** — rincian *Status Kehadiran Hari Ini* kini: Tepat waktu · Terlambat · Cuti · Izin ·
  Sakit · Tanpa berita. Cuti/Izin/Sakit dipisah (dari pengajuan yang sudah disetujui dan berlaku hari ini);
  "Belum absen" diganti **Tanpa berita** (wajib absen, belum absen masuk, dan tidak punya cuti/izin/sakit).
- **Export Excel** (manual & laporan otomatis BKPSDM) kini berisi tiga sheet: **Jam Masuk**, **Jam Pulang**,
  dan **Resume** (satu baris per pegawai per hari: jam masuk, jam pulang, durasi kerja, status terlambat).
  Sheet Resume hanya memakai absensi berstatus Valid.

## Pembaruan: Import Pegawai via Excel & Wajib Ganti Password (khusus Admin)

- **People → Tambah Pegawai** kini punya dua tab: *Input Manual* dan *Import Excel*
  (tombol pintas *Import Excel* juga ada di halaman Data Pegawai).
- Alur: **Unduh Template** → isi Excel → **Pilih File** (sistem langsung memeriksa & menampilkan
  baris Siap/Bermasalah) → **Import**. Baris bermasalah dilewati & dijelaskan alasannya per baris.
- Kolom template: `NAMA | NIP | JABATAN | ROLE | EMAIL | NO HP | PASSWORD`.
  ROLE = `pegawai` / `pimpinan` / `admin`. NIP wajib untuk pegawai & pimpinan. NO HP otomatis
  diseragamkan ke format `62…`. Maksimal 300 pegawai per file (.xlsx, ≤ 2 MB).
- Pemeriksaan: email/NIP ganda (dalam file & terhadap data yang sudah ada), format email, role,
  password minimal 6 karakter, dan NIP yang terpotong Excel (kolom NIP di template sudah berformat Teks).
- **Wajib ganti password**: akun hasil import bertanda `must_change_password`. Saat login pertama,
  pegawai diarahkan ke halaman *Ganti Password* dan belum bisa membuka Dashboard/Admin sampai
  membuat password baru (min. 8 karakter, harus berbeda dari password awal). Password awal boleh sama
  untuk semua pegawai.
- Password awal tidak pernah ditampilkan kembali maupun ditulis ke *Riwayat Perubahan*; import
  tercatat di audit log sebagai `employee.import`.
- Jalankan `supabase/update-import-pegawai-excel.sql` sekali di SQL Editor **sebelum** memakai fitur ini.

## 1. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com) (gratis).
2. Buka **SQL Editor**, jalankan seluruh isi file [`supabase/schema.sql`](supabase/schema.sql).
   Ini akan membuat tabel `employees`, `offices`, `attendance`, `leave_requests` (Cuti/Izin/Sakit),
   kolom-kolom pengaturan notifikasi & integrasi BKPSDM di tabel `offices`, kebijakan RLS, dan
   bucket Storage (`selfies`, `profile-photos`, `leave-attachments`). File ini aman dijalankan
   ulang kapan saja (idempotent) jika Anda meng-update project dari versi lama.
3. Buka **Authentication → Providers**, pastikan **Email** provider aktif. Nonaktifkan
   "Confirm email" jika ingin admin langsung membuat akun pegawai tanpa perlu verifikasi email
   (opsional, sesuai kebutuhan instansi).
4. Buka **Project Settings → API**, catat:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ rahasia, jangan pernah dikirim ke
     browser atau dipublikasikan)

### Membuat akun Admin pertama

1. Di Supabase Dashboard → **Authentication → Users → Add user**, buat satu akun (email +
   password) untuk Admin pertama (misalnya Anda sendiri).
2. Salin **User UID** akun tersebut.
3. Di **SQL Editor**, jalankan (ganti nilai sesuai data Anda):

   ```sql
   insert into public.employees (id, nip, full_name, email, role, is_active)
   values ('TEMPEL-USER-UID-DI-SINI', '198501012010011001', 'Nama Admin', 'admin@sumbabaratkab.go.id', 'admin', true);
   ```

4. Login ke aplikasi dengan akun ini — Anda akan otomatis masuk ke `/admin`. Pegawai
   selanjutnya cukup dibuat lewat menu **Admin → Pegawai → Tambah Pegawai** (tidak perlu SQL
   manual lagi).

## 2. Jalankan di Lokal

```bash
npm install
cp .env.example .env.local
# isi .env.local dengan 3 nilai dari langkah Supabase di atas
npm run dev
```

Buka `http://localhost:3000`.

> Kamera & GPS browser hanya berfungsi di konteks aman (`https://` atau `localhost`) — untuk uji
> coba di HP melalui jaringan lokal, gunakan `ngrok`/tunnel HTTPS, atau langsung uji di Vercel
> Preview URL yang sudah HTTPS.

## 3. Deploy: GitHub → Vercel

```bash
git init
git add .
git commit -m "Sistem Absensi Digital - Inspektorat Sumba Barat"
git branch -M main
git remote add origin https://github.com/<username-anda>/absensi-digital-sumba-barat.git
git push -u origin main
```

Lalu di [vercel.com](https://vercel.com):

1. **Add New Project** → Import repo GitHub di atas.
2. **Framework Preset**: Next.js (terdeteksi otomatis). **Output Directory**: biarkan default
   (`.next`) — JANGAN diubah ke `dist`.
3. Tambahkan 3 **Environment Variables** yang sama seperti di `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Klik **Deploy**. Setiap `git push` ke `main` berikutnya akan otomatis redeploy.

## 4. Konfigurasi Setelah Deploy

1. Login sebagai Admin → **Pengaturan**:
   - Koordinat kantor bawaan sudah diisi dengan titik **Kantor Inspektorat Kabupaten Sumba Barat**
     (-9.6366749, 119.4183576 — Plus Code 9C79+88Q). Bila database Anda sudah dibuat dengan
     koordinat lama, jalankan `supabase/update-koordinat-kantor.sql` sekali di Supabase SQL Editor.
   - Peta memakai **Esri** (gratis, tanpa API key/kartu kredit) dengan pilihan lapisan **Jalan / Satelit**.
     Klik atau geser pin untuk menyesuaikan titik; atau berdiri di gedung lalu klik
     **"Gunakan Lokasi Saat Ini"**.
   - Atur radius geofencing (default 150m), jam kerja (default 07:00–14:30 WITA), dan kebijakan
     Jumat hybrid.
   - **Jumat Hybrid (WFO/WFH):** bila dicentang, pada hari Jumat pegawai memilih **WFO** atau **WFH**
     sebelum absen masuk. WFO tetap wajib berada dalam radius kantor (geofencing); WFH boleh absen
     dari rumah tanpa radius kantor (wajah tetap diverifikasi & lokasi GPS tetap dicatat). Absen
     pulang otomatis mengikuti pilihan absen masuk. Absen masuk hari Jumat tidak dihitung terlambat.
     Hari Jumat ditentukan dari jam server (WITA). Untuk database yang sudah berjalan, jalankan
     `supabase/update-jumat-hybrid-wfh.sql` sekali di Supabase SQL Editor.
2. **Admin → Pegawai → Tambah Pegawai**: input NIP, nama, jabatan, email, password awal, lalu
   ambil foto wajah pegawai (pencahayaan cukup, wajah menghadap kamera) untuk pendaftaran face
   recognition. Ulangi untuk seluruh 95 ASN.
3. Bagikan email + password awal ke masing-masing pegawai. Sarankan pegawai mengganti password
   lewat menu "Forgot password" Supabase Auth bila diaktifkan, atau melalui Admin.

## 5. Setup Notifikasi Keterlambatan (Opsional)

**WhatsApp (via Fonnte, gratis untuk skala kecil):**
1. Daftar di [fonnte.com](https://fonnte.com), hubungkan nomor WhatsApp perangkat pengawas/admin,
   catat **Token**-nya.
2. Login sebagai Admin → **Pengaturan** → aktifkan "Notifikasi WhatsApp", tempel token, isi nomor
   admin/pengawas (format `62xxxxxxxxxx`, pisahkan koma jika lebih dari satu).
3. (Opsional) aktifkan "Kirim juga ke nomor pegawai" — pastikan nomor WA pegawai diisi di menu
   **Admin → Pegawai → Kelola**.

**Telegram (gratis & resmi):**
1. Chat dengan [@BotFather](https://t.me/BotFather) di Telegram → `/newbot` → catat **Bot Token**.
2. Tambahkan bot tersebut ke grup pengawas, lalu ambil **Chat ID** grup (mis. lewat
   `https://api.telegram.org/bot<token>/getUpdates` setelah mengirim satu pesan apa saja di grup).
3. Login sebagai Admin → **Pengaturan** → aktifkan "Notifikasi Telegram", isi Bot Token & Chat ID.

Setelah diaktifkan, setiap absen masuk yang tercatat terlambat (melewati Jam Masuk Kerja di
Pengaturan) otomatis mengirim notifikasi. Kegagalan pengiriman notifikasi **tidak pernah**
membatalkan/menggagalkan absensi pegawai itu sendiri.

## 6. Setup Integrasi Laporan Otomatis ke BKPSDM (Opsional)

1. **Untuk kirim lewat email** — daftar gratis di [resend.com](https://resend.com), buat API key,
   isi `RESEND_API_KEY` (dan opsional `RESEND_FROM_EMAIL` setelah verifikasi domain pengirim) di
   Environment Variables Vercel/`.env.local`.
2. **Untuk kirim lewat webhook** — jika BKPSDM/instansi Anda punya endpoint penerima (atau Anda
   memakai perantara seperti Zapier/Make/Google Apps Script), catat URL-nya.
3. Login sebagai Admin → **Pengaturan** → aktifkan "Laporan Otomatis", isi email tujuan dan/atau
   webhook URL, pilih jadwal (Harian/Mingguan tiap Senin/Bulanan tiap tanggal 1).
4. Klik **"Kirim Uji Coba Sekarang"** untuk memastikan email/webhook diterima dengan benar
   sebelum mengandalkannya secara otomatis.
5. Aktifkan **Vercel Cron** (sudah dikonfigurasi di [`vercel.json`](vercel.json), berjalan setiap
   hari jam 06:00 WITA) — pada Vercel Hobby plan, Cron Jobs tersedia gratis dengan batas 1x/hari
   per job, yang sudah sesuai kebutuhan di sini (endpoint sendiri yang memutuskan apakah hari itu
   adalah jadwal kirim). Tambahkan `CRON_SECRET` di Environment Variables Vercel agar endpoint
   `/api/reports/bkpsdm` tidak bisa dipanggil sembarang orang dari luar.

## 7. Alur Penggunaan Harian (Pegawai)

1. Buka aplikasi di HP saat tiba di kantor.
2. Tekan **Absen Masuk** / **Absen Pulang**.
3. Izinkan akses Lokasi & Kamera.
4. Ambil selfie — sistem memeriksa wajah & lokasi.
5. ✅ Berhasil bila wajah cocok DAN dalam radius kantor; ✖ ditolak beserta alasannya bila tidak.

## Catatan Keamanan & Keterbatasan (penting untuk dipahami)

- **Geofencing** mengandalkan GPS perangkat pegawai. GPS palsu ("fake GPS", umumnya butuh mode
  developer aktif) secara teknis bisa memalsukan koordinat pada sebagian ponsel — ini adalah
  keterbatasan umum semua aplikasi absensi berbasis GPS ponsel (termasuk Jibble), bukan hanya
  aplikasi ini. Kombinasinya dengan **Face Recognition + Server Clock** membuat kecurangan jauh
  lebih sulit dibanding absensi manual.
- **Face matching** dihitung ulang di server (bukan hanya di browser pegawai) memakai ambang
  batas (`FACE_MATCH_THRESHOLD` di `src/lib/geo.ts`, default `0.5`) — dapat disesuaikan bila
  terlalu ketat/longgar setelah beberapa minggu pemakaian.
- **Waktu absensi** selalu memakai `new Date()` di server (route handler), sehingga tidak
  terpengaruh jam di HP pegawai.
- Pegawai **tidak memiliki** hak `UPDATE`/`DELETE` pada tabel `attendance` (dijamin lewat RLS
  Postgres), sehingga data historis tidak bisa diubah dari sisi pegawai.

## Struktur Folder

```
src/
  app/
    login/                    -> halaman login
    dashboard/                -> area pegawai (absen, riwayat, cuti/izin)
    admin/                    -> area admin (pegawai, absensi, cuti/izin, pengaturan)
    api/
      attendance/clock/       -> proses absen (validasi geofence + wajah + simpan + trigger notifikasi)
      attendance/export/      -> generate laporan Excel (manual, oleh admin)
      employees/create/       -> admin membuat akun pegawai baru
      employees/[id]/         -> update data / re-enroll wajah pegawai
      leave/create/           -> pegawai mengajukan cuti/izin/sakit
      leave/[id]/             -> admin menyetujui/menolak pengajuan
      leave/attachment/       -> signed URL lampiran cuti (privat)
      reports/bkpsdm/         -> endpoint cron laporan otomatis terjadwal
      reports/bkpsdm/test/    -> kirim uji coba laporan otomatis (dari menu Pengaturan)
  components/                 -> FaceCamera, ServerClock, Navbar
  lib/
    supabase/                 -> client/server/admin Supabase
    notifications/            -> whatsapp.ts, telegram.ts, notify.ts (orkestrator), email.ts (Resend)
    reports/                  -> attendanceWorkbook.ts (generator Excel), bkpsdmReport.ts (kirim + jadwal)
    geo.ts, useGeolocation.ts -> helper geofencing, waktu WITA, deteksi keterlambatan
  types/                      -> tipe TypeScript
supabase/schema.sql           -> skema database + RLS + storage buckets (+ migrasi fitur baru)
vercel.json                   -> jadwal Vercel Cron untuk laporan otomatis BKPSDM
public/models/                -> model face-api.js (tinyFaceDetector, landmark68, recognition)
```
