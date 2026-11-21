# Panduan Deployment: Sistem Payroll & Absensi QR

Panduan ini menjelaskan cara menyiapkan database, mengisi konfigurasi, dan menjalankan aplikasi di Vercel sampai siap dipakai di kantor.

---

## Daftar Isi
1. [Kebutuhan Awal](#1-kebutuhan-awal)
2. [Langkah 1: Buat Database di Supabase](#langkah-1-buat-database-di-supabase)
3. [Langkah 2: Siapkan File Konfigurasi (.env)](#langkah-2-siapkan-file-konfigurasi-env)
4. [Langkah 3: Siapkan Tabel Database dan Data Awal](#langkah-3-siapkan-tabel-database-dan-data-awal)
5. [Langkah 4: Jalankan Aplikasi di Vercel](#langkah-4-jalankan-aplikasi-di-vercel)
6. [Langkah 5: Login Pertama dan Atur Lokasi Kantor](#langkah-5-login-pertama-dan-atur-lokasi-kantor)
7. [Langkah 6: Cara Pakai Harian di Kantor](#langkah-6-cara-pakai-harian-di-kantor)
8. [Tanya Jawab dan Solusi Masalah (FAQ)](#tanya-jawab-dan-solusi-masalah-faq)

---

## 1. Kebutuhan Awal

Siapkan empat hal ini sebelum mulai:

1. **Akun GitHub** (https://github.com) untuk menyimpan kode aplikasi.
2. **Akun Supabase** (https://supabase.com) untuk database PostgreSQL online (paket gratis sudah cukup untuk operasional kantor).
3. **Akun Vercel** (https://vercel.com) untuk menjalankan website secara online dengan domain HTTPS gratis.
4. **Komputer atau Laptop dengan Node.js (versi 18 atau 20)**:
   - Cek dengan membuka Terminal (Mac/Linux) atau Command Prompt/PowerShell (Windows), lalu jalankan:
     ```bash
     node -v
     ```
   - Jika muncul versi seperti `v20.x.x` atau `v18.x.x`, komputer sudah siap. Jika belum terpasang, unduh versi LTS di https://nodejs.org.

---

## Langkah 1: Buat Database di Supabase

Database ini menyimpan akun karyawan, data jam masuk-pulang, dan hitungan gaji.

1. Buka https://supabase.com lalu login.
2. Klik tombol **New Project**.
3. Isi informasi project:
   - **Name**: Beri nama bebas, contoh: `payroll-kantor`.
   - **Database Password**: Buat password yang kuat. Catat password ini karena Supabase tidak akan menampilkannya lagi.
   - **Region**: Pilih lokasi paling dekat dengan kantor, misalnya `Singapore (ap-southeast-1)`.
   - **Pricing Plan**: Pilih **Free Plan**.
4. Klik **Create new project** dan tunggu 1-2 menit sampai dashboard project terbuka.
5. Ambil alamat koneksi database:
   - Buka menu **Project Settings** (ikon roda gigi di pojok kiri bawah) lalu pilih **Database**.
   - Gulir ke bawah ke bagian **Connection string**, lalu klik tab **URI**.
   - Anda butuh dua baris koneksi:
     a. **Transaction Pooler (Port 6543)**:
        - Pilih mode **Transaction**.
        - Salin teks koneksi yang muncul. Teks ini untuk variabel `DATABASE_URL`.
        - Bentuknya seperti ini:
          ```text
          postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
          ```
        - Ganti tulisan `[PASSWORD]` dengan kata sandi database yang Anda buat di langkah 3.
     b. **Direct Connection (Port 5432)**:
        - Pilih mode **Session** (atau matikan opsi pooler) sampai port berubah ke 5432.
        - Salin teks koneksi ini untuk variabel `DIRECT_URL`.
        - Bentuknya seperti ini:
          ```text
          postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
          ```
        - Ganti tulisan `[PASSWORD]` dengan kata sandi database Anda.
6. Ambil API Keys Supabase:
   - Masuk ke menu **Project Settings** lalu pilih **API**.
   - Salin isi **Project URL** (contoh: `https://abcdefghijkl.supabase.co`). Ini untuk `NEXT_PUBLIC_SUPABASE_URL`.
   - Salin isi **Project API keys** bagian `anon` / `public`. Ini untuk `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Langkah 2: Siapkan File Konfigurasi (.env)

1. Buka folder proyek aplikasi di komputer Anda.
2. Cari file bernama `.env.example`.
3. Buat duplikat file tersebut, lalu ubah namanya menjadi `.env`.
4. Buka `.env` dan isi datanya dengan hasil dari Langkah 1:

```env
# Alamat Database Supabase
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

# Kredensial API Supabase
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[KUNCI_ANON_DARI_SUPABASE]"

# Pengaturan Sesi & Zona Waktu
SESSION_SECRET="kombinasi_acak_rahasia_minimal_32_karakter_bebas"
NEXT_PUBLIC_TIMEZONE="Asia/Jakarta"

# Kunci Enkripsi Audit Log (Dibuat otomatis lewat script di bawah)
AUDIT_SIGNING_PRIVATE_KEY=""
AUDIT_SIGNING_PUBLIC_KEY=""

# Kunci Pengaman Cron Job
CRON_SECRET="kombinasi_acak_rahasia_cron_bebas"
```

5. Buat Kunci Enkripsi Audit Log:
   - Sistem ini mencatat setiap aktivitas absensi dan perubahan gaji ke dalam catatan audit anti-rekayasa dengan tanda tangan digital Ed25519.
   - Buka terminal di folder proyek, lalu jalankan:
     ```bash
     node scripts/generate-audit-keys.js
     ```
   - Terminal akan langsung mengeluarkan dua baris kunci enkripsi.
   - Salin kunci privat ke `AUDIT_SIGNING_PRIVATE_KEY="..."`.
   - Salin kunci publik ke `AUDIT_SIGNING_PUBLIC_KEY="..."`.
   - Simpan file `.env`.

---

## Langkah 3: Siapkan Tabel Database dan Data Awal

Jalankan perintah ini di terminal komputer satu kali saja untuk membuat tabel di Supabase dan membuat akun admin pertama:

1. Pasang dependensi proyek:
   ```bash
   npm install
   ```
2. Buat seluruh tabel di database Supabase:
   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```
3. Pasang proteksi anti-hapus pada catatan audit:
   ```bash
   npm run db:triggers
   ```
   Perintah ini memasang aturan langsung di PostgreSQL agar riwayat audit tidak bisa dihapus atau diubah manual sekalipun lewat dashboard Supabase.
4. Masukkan data awal (akun Owner, shift kerja default, dan aturan gaji):
   ```bash
   npm run seed
   ```
   Setelah selesai, akun admin awal siap dipakai:
   - **Email**: `owner@company.com`
   - **Password**: `admin123`

---

## Langkah 4: Jalankan Aplikasi di Vercel

Vercel membuat aplikasi bisa diakses online dari HP karyawan dan monitor kantor dengan domain HTTPS resmi.

1. Upload seluruh folder proyek ini ke akun GitHub Anda.
2. Buka https://vercel.com lalu login dengan GitHub.
3. Klik tombol **Add New...** di pojok kanan atas, lalu pilih **Project**.
4. Cari repositori proyek Anda di daftar GitHub, lalu klik **Import**.
5. Di bagian pengaturan:
   - **Framework Preset**: Biarkan `Next.js`.
   - **Root Directory**: Biarkan `./`.
   - **Build Command**: Biarkan default (`prisma generate && next build` atau `npm run build`).
6. Buka bagian **Environment Variables**:
   Salin semua variabel yang ada di file `.env` lokal Anda ke form Vercel satu per satu:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SESSION_SECRET`
   - `NEXT_PUBLIC_TIMEZONE`
   - `AUDIT_SIGNING_PRIVATE_KEY`
   - `AUDIT_SIGNING_PUBLIC_KEY`
   - `CRON_SECRET`
7. Klik tombol **Deploy**.
8. Tunggu proses build sekitar 1-2 menit.
9. Setelah selesai, Vercel memberikan alamat website aktif, contoh:
   `https://payroll-kantor-anda.vercel.app`
10. Domain Vercel otomatis menggunakan HTTPS. Ini penting karena Chrome dan Safari hanya mengizinkan kamera HP dan GPS aktif di alamat HTTPS.

---

## Langkah 5: Login Pertama dan Atur Lokasi Kantor

1. Buka alamat Vercel Anda di browser:
   `https://payroll-kantor-anda.vercel.app/login`
2. Masuk menggunakan akun admin:
   - **Email**: `owner@company.com`
   - **Password**: `admin123`
3. Masuk ke menu **Pengaturan** (`/owner/settings`):
   - **Nama Kantor**: Tulis nama kantor Anda (contoh: Kantor Pusat Jakarta).
   - **Koordinat GPS**:
     - Klik tombol deteksi lokasi otomatis jika Anda sedang berada di kantor.
     - Atau ambil titik Latitude dan Longitude kantor dari Google Maps.
   - **Radius Absensi**: Tentukan jarak toleransi karyawan bisa absen dari titik kantor (disarankan 30 sampai 50 meter).
   - **Validasi IP WiFi (Opsional)**:
     - Jika kantor punya IP WiFi statis dan Anda ingin karyawan hanya bisa absen saat terhubung ke WiFi kantor, masukkan IP publik WiFi kantor di sini.
     - Jika tidak ingin membatasi jaringan WiFi (cukup GPS dan QR code), biarkan opsi ini mati.
   - Klik **Simpan Pengaturan**.
4. Ganti password akun admin di menu profil demi keamanan.

---

## Langkah 6: Cara Pakai Harian di Kantor

### 1. Pasang Layar QR Absensi di Kantor
- Buka browser di tablet, monitor, atau laptop yang ditaruh di pintu masuk kantor.
- Masuk ke halaman:
  `https://payroll-kantor-anda.vercel.app/owner/qr`
- Layar akan menampilkan QR code dinamis yang berganti otomatis setiap 15 detik. Kode ini langsung hangus setelah dipakai atau kedaluwarsa, jadi tidak bisa difoto untuk dititipkan ke orang lain.

### 2. Tambah Karyawan Baru
- Di dashboard admin, buka menu **Karyawan** (`/owner/employees`).
- Klik **Tambah Karyawan**.
- Masukkan Nama, NIP, email, password awal, shift kerja, dan nominal upah harian (contoh: tulis `150000` untuk Rp150.000 per hari).
- Simpan, lalu berikan email dan password tersebut ke karyawan bersangkutan.

### 3. Cara Karyawan Absen dari HP
1. Karyawan membuka browser di HP masing-masing:
   - Android: Gunakan **Google Chrome**.
   - iPhone: Gunakan **Safari**.
2. Karyawan membuka link website kantor dan login dengan email serta password mereka.
3. **Kunci Perangkat Otomatis**:
   - Pada login pertama, sistem langsung mencatat identitas fisik HP tersebut sebagai perangkat resmi akun.
   - Karyawan tidak bisa login di HP lain tanpa persetujuan dari admin.
4. Karyawan menekan tombol **Pindai QR Masuk** atau membuka menu **Scan**:
   - Berikan izin saat browser meminta akses kamera dan lokasi GPS.
   - Arahkan kamera ke layar QR kantor.
5. Sistem langsung memverifikasi:
   - Apakah QR code masih aktif dan belum dipakai orang lain?
   - Apakah posisi GPS karyawan berada di dalam radius kantor?
   - Apakah HP yang dipakai adalah perangkat yang terdaftar?
6. Jika semua cocok, absensi langsung tercatat, potongan keterlambatan (jika telat) dihitung otomatis, dan estimasi upah harian langsung muncul di layar karyawan.

---

## Tanya Jawab dan Solusi Masalah (FAQ)

### Kenapa kamera dan GPS tidak mau aktif saat dicoba di HP lewat IP lokal (seperti `100.x.x.x` atau `192.168.x.x`)?
Browser modern (Chrome dan Safari) punya aturan ketat: sensor kamera, GPS lokasi, dan biometrik sidik jari dimatikan otomatis jika dibuka lewat koneksi HTTP biasa atau alamat IP angka.
Solusinya: deploy aplikasi ke Vercel (Langkah 4). Domain dari Vercel otomatis memakai HTTPS resmi, sehingga kamera dan GPS langsung aktif normal tanpa kendala.

### Kenapa muncul kotak kuning "Buka di Browser Utama (Safari / Chrome) [WEBVIEW]"?
Pesan ini muncul kalau link dibuka dari dalam aplikasi chat seperti WhatsApp, Telegram, atau Instagram. Browser internal aplikasi chat membatasi akses kamera dan biometrik.
Solusinya: klik tombol **Salin Link** pada banner tersebut, buka aplikasi **Google Chrome** (Android) atau **Safari** (iPhone), tempel link di bilah alamat, lalu login seperti biasa.

### Karyawan ganti HP atau HP lama hilang, bagaimana cara login di HP baru?
Sistem mengunci satu akun hanya untuk satu HP fisik demi mencegah titip absen.
Jika karyawan login di HP baru:
1. Layar karyawan akan menampilkan kode permohonan buka kunci.
2. Admin membuka dashboard di menu **Perangkat** (`/owner/devices`).
3. Cari nama karyawan, lalu klik **Setujui Reset Perangkat** (atau sebutkan 6 digit kode buka kunci ke karyawan).
4. Setelah disetujui, HP baru karyawan langsung tersimpan sebagai perangkat sah.

### Muncul pesan database connection timeout saat deploy di Vercel?
Vercel berjalan dengan arsitektur serverless, sehingga butuh koneksi pooler agar tidak kehabisan jalur database.
Pastikan:
- Nilai `DATABASE_URL` memakai port **6543** dengan parameter `?pgbouncer=true` di ujungnya.
- Nilai `DIRECT_URL` memakai port **5432**.
- Password database di dalam URL koneksi sudah benar dan tidak ada salah ketik.

### Bagaimana cara mengosongkan data uji coba sebelum kantor mulai beroperasi?
Jika Anda selesai melakukan tes coba-coba dan ingin membersihkan riwayat absensi palsu sebelum dipakai karyawan asli, jalankan perintah ini di terminal komputer:
```bash
npm run db:clean
```
Perintah ini mengosongkan log absensi dan data pengujian, tetapi akun admin dan konfigurasi kantor tetap tersimpan rapi.
