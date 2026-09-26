-- Jalankan SEKALI di Supabase > SQL Editor bila database Anda sudah terlanjur dibuat
-- dengan koordinat perkiraan lama. Koordinat baru = titik Kantor Inspektorat Kabupaten
-- Sumba Barat dari Google Maps (Plus Code 9C79+88Q).
update public.offices
set latitude = -9.6366749,
    longitude = 119.4183576
where name = 'Inspektorat Sumba Barat';
