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
- **Biaya Rp 0,-** — Supabase & Vercel free tier cukup untuk skala ~100 pegawai.

## Stack Teknologi

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Auth, Postgres + Row Level Security, Storage)
- `face-api.js` (TensorFlow.js) — deteksi & pengenalan wajah berjalan di browser pegawai
- `exceljs` — generate laporan .xlsx di server
- Deploy: GitHub → Vercel (CI/CD otomatis setiap push)

## 1. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com) (gratis).
2. Buka **SQL Editor**, jalankan seluruh isi file [`supabase/schema.sql`](supabase/schema.sql).
   Ini akan membuat tabel `employees`, `offices`, `attendance`, kebijakan RLS, dan bucket Storage
   (`selfies`, `profile-photos`).
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
   - Berdiri di depan/dalam gedung Kantor Inspektorat, klik **"Gunakan Lokasi Saat Ini"** agar
     koordinat GPS kantor terisi akurat (koordinat bawaan di `schema.sql` hanya perkiraan pusat
     Kota Waikabubak, **wajib diperbarui**).
   - Atur radius geofencing (default 150m), jam kerja (default 07:00–14:30 WITA), dan kebijakan
     Jumat hybrid.
2. **Admin → Pegawai → Tambah Pegawai**: input NIP, nama, jabatan, email, password awal, lalu
   ambil foto wajah pegawai (pencahayaan cukup, wajah menghadap kamera) untuk pendaftaran face
   recognition. Ulangi untuk seluruh 95 ASN.
3. Bagikan email + password awal ke masing-masing pegawai. Sarankan pegawai mengganti password
   lewat menu "Forgot password" Supabase Auth bila diaktifkan, atau melalui Admin.

## Alur Penggunaan Harian (Pegawai)

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
    dashboard/                -> area pegawai (absen, riwayat)
    admin/                    -> area admin (pegawai, absensi, pengaturan)
    api/
      attendance/clock/       -> proses absen (validasi geofence + wajah + simpan)
      attendance/export/      -> generate laporan Excel
      employees/create/       -> admin membuat akun pegawai baru
      employees/[id]/         -> update data / re-enroll wajah pegawai
  components/                 -> FaceCamera, ServerClock, Navbar
  lib/                        -> supabase client/server/admin, helper geo & waktu
  types/                      -> tipe TypeScript
supabase/schema.sql           -> skema database + RLS + storage buckets
public/models/                -> model face-api.js (tinyFaceDetector, landmark68, recognition)
```
