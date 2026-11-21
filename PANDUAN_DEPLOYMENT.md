# Panduan Deployment Mandiri: Sistem Payroll & Absensi QR

Panduan ini disusun menggunakan bahasa awam dan langkah demi langkah agar pembeli dapat melakukan instalasi, konfigurasi database, dan deployment ke server cloud (Vercel) secara mandiri tanpa memerlukan bantuan teknisi pemrograman.

---

## Daftar Isi
1. [Kebutuhan Awal (Prerequisites)](#1-kebutuhan-awal-prerequisites)
2. [Langkah 1: Membuat Database di Supabase](#langkah-1-membuat-database-di-supabase)
3. [Langkah 2: Menyiapkan File Konfigurasi (.env)](#langkah-2-menyiapkan-file-konfigurasi-env)
4. [Langkah 3: Mengunggah Struktur Database & Mengisi Data Awal](#langkah-3-mengunggah-struktur-database--mengisi-data-awal)
5. [Langkah 4: Deploy ke Vercel (Online & Otomatis HTTPS)](#langkah-4-deploy-ke-vercel-online--otomatis-https)
6. [Langkah 5: Login Pertama & Pengaturan Lokasi Kantor (GPS)](#langkah-5-login-pertama--pengaturan-lokasi-kantor-gps)
7. [Langkah 6: Panduan Penggunaan Harian untuk Kantor & Karyawan](#langkah-6-panduan-penggunaan-harian-untuk-kantor--karyawan)
8. [Tanya Jawab & Solusi Masalah Umum (FAQ)](#tanya-jawab--solusi-masalah-umum-faq)

---

## 1. Kebutuhan Awal (Prerequisites)

Sebelum memulai, pastikan Anda telah menyiapkan akun-akun gratis berikut:

1. **Akun GitHub** (https://github.com): Digunakan untuk menyimpan salinan kode program aplikasi Anda.
2. **Akun Supabase** (https://supabase.com): Layanan penyedia database PostgreSQL online (paket gratis sudah sangat cukup untuk operasional kantor).
3. **Akun Vercel** (https://vercel.com): Layanan hosting web otomatis yang terhubung ke GitHub (gratis dan sudah otomatis menyediakan sertifikat keamanan HTTPS).
4. **Laptop atau Komputer dengan Node.js**:
   - Pastikan komputer Anda terpasang Node.js versi 18 atau versi 20.
   - Cara cek: buka Terminal (di Mac/Linux) atau Command Prompt / PowerShell (di Windows), lalu ketik:
     ```bash
     node -v
     ```
     Jika muncul angka seperti `v20.x.x` atau `v18.x.x`, berarti sudah siap. Jika belum terpasang, unduh dari https://nodejs.org (pilih versi LTS).

---

## Langkah 1: Membuat Database di Supabase

Aplikasi ini membutuhkan database PostgreSQL untuk menyimpan data karyawan, log absensi, dan perhitungan gaji.

1. Buka situs https://supabase.com dan masuk ke akun Anda.
2. Klik tombol **New Project** (Project Baru).
3. Isi formulir pembuatan project:
   - **Name**: Beri nama project Anda, misalnya: `payroll-kantor`.
   - **Database Password**: Buat kata sandi database yang kuat. **PENTING: Catat dan simpan password ini**, karena Supabase tidak akan menampilkan password ini lagi.
   - **Region**: Pilih wilayah terdekat dengan kantor Anda agar koneksi cepat, misalnya `Singapore (ap-southeast-1)`.
   - **Pricing Plan**: Pilih **Free Plan**.
4. Klik **Create new project** dan tunggu 1-2 menit hingga proses inisialisasi selesai.
5. Mengambil Alamat Koneksi Database (Connection Strings):
   - Klik menu **Project Settings** (ikon roda gigi di pojok kiri bawah).
   - Klik sub-menu **Database**.
   - Gulir ke bawah hingga bagian **Connection string**.
   - Pilih tab **URI**.
   - Perhatikan ada dua mode:
     a. **Mode Transaction Pooler (Port 6543)**:
        - Pilih mode **Transaction**.
        - Salin teks koneksi yang muncul. Teks ini akan digunakan sebagai `DATABASE_URL`.
        - Formatnya menyerupai:
          ```text
          postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
          ```
        - Ganti teks `[PASSWORD]` dengan kata sandi database yang Anda buat pada langkah 3.
     b. **Mode Direct Connection (Port 5432)**:
        - Pilih mode **Session** atau matikan centang pooler untuk melihat koneksi port 5432.
        - Salin teks koneksi port 5432. Teks ini akan digunakan sebagai `DIRECT_URL`.
        - Formatnya menyerupai:
          ```text
          postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
          ```
        - Ganti teks `[PASSWORD]` dengan kata sandi database Anda.
6. Mengambil Kunci API Supabase:
   - Pada menu **Project Settings**, klik sub-menu **API**.
   - Salin **Project URL** (contoh: `https://abcdefghijkl.supabase.co`). Ini akan menjadi `NEXT_PUBLIC_SUPABASE_URL`.
   - Salin **Project API keys** bagian `anon` / `public`. Ini akan menjadi `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Langkah 2: Menyiapkan File Konfigurasi (.env)

1. Buka folder proyek aplikasi ini di komputer Anda menggunakan terminal atau text editor (seperti Visual Studio Code).
2. Temukan file bernama `.env.example` di dalam folder utama.
3. Buat salinan dari file tersebut dan ubah namanya menjadi `.env`.
4. Buka file `.env` dan isi nilai-nilainya sesuai data dari Langkah 1:

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

# Kunci Enkripsi Audit Log (Dihasilkan melalui script otomatis di bawah)
AUDIT_SIGNING_PRIVATE_KEY=""
AUDIT_SIGNING_PUBLIC_KEY=""

# Kunci Pengaman Jadwal Otomatis (Cron Job)
CRON_SECRET="kombinasi_acak_rahasia_cron_bebas"
```

5. Membuat Kunci Enkripsi Audit Log (`AUDIT_SIGNING_PRIVATE_KEY` & `AUDIT_SIGNING_PUBLIC_KEY`):
   - Aplikasi ini dilengkapi sistem catatan audit anti-manipulasi yang ditandatangani secara kriptografi (Ed25519).
   - Di terminal komputer Anda, ketik perintah:
     ```bash
     node scripts/generate-audit-keys.js
     ```
   - Terminal akan langsung menampilkan sepasang kunci enkripsi.
   - Salin teks kunci privat ke `AUDIT_SIGNING_PRIVATE_KEY="..."`.
   - Salin teks kunci publik ke `AUDIT_SIGNING_PUBLIC_KEY="..."`.
   - Simpan file `.env`.

---

## Langkah 3: Mengunggah Struktur Database & Mengisi Data Awal

Langkah ini dilakukan satu kali melalui terminal komputer untuk membuat tabel-tabel di Supabase dan memasukkan akun pemilik (Owner) pertama kali.

1. Buka terminal di dalam folder proyek.
2. Pasang semua pustaka yang dibutuhkan:
   ```bash
   npm install
   ```
3. Sinkronkan tabel ke database Supabase:
   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```
   Perintah ini akan membaca skema aplikasi dan langsung membuat seluruh tabel di Supabase.

4. Aktifkan sistem pengaman database anti-manipulasi (Database Triggers):
   ```bash
   npm run db:triggers
   ```
   Perintah ini memastikan catatan audit log tidak dapat dihapus atau diubah sekalipun dari dashboard database.

5. Isi data awal default (Akun Owner, Shift Kerja, & Konfigurasi Default):
   ```bash
   npm run seed
   ```
   Setelah selesai, sistem telah memiliki akun pemilik awal:
   - **Email**: `owner@company.com`
   - **Password**: `admin123`

---

## Langkah 4: Deploy ke Vercel (Online & Otomatis HTTPS)

Agar aplikasi dapat diakses dari mana saja oleh monitor kantor dan HP karyawan, aplikasi harus dideploy ke Vercel.

1. Pastikan seluruh folder proyek aplikasi ini sudah Anda simpan dan dorong (push) ke repositori akun GitHub Anda sendiri.
2. Buka situs https://vercel.com dan login menggunakan akun GitHub Anda.
3. Klik tombol **Add New...** di kanan atas, lalu pilih **Project**.
4. Cari nama repositori proyek Anda di daftar GitHub, lalu klik **Import**.
5. Pada halaman konfigurasi project:
   - **Framework Preset**: Pilih `Next.js` (biasanya terdeteksi otomatis).
   - **Root Directory**: Biarkan `./`.
   - **Build Command**: Biarkan default (`prisma generate && next build` atau `npm run build`).
6. Masuk ke bagian **Environment Variables**:
   Buka file `.env` yang sudah Anda isi di Langkah 2, lalu masukkan satu per satu nama variabel dan nilainya ke Vercel:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SESSION_SECRET`
   - `NEXT_PUBLIC_TIMEZONE`
   - `AUDIT_SIGNING_PRIVATE_KEY`
   - `AUDIT_SIGNING_PUBLIC_KEY`
   - `CRON_SECRET`
7. Klik tombol biru **Deploy**.
8. Tunggu proses deployment berlangsung sekitar 1 hingga 2 menit.
9. Jika selesai, Vercel akan memberikan alamat situs web resmi yang aktif, misalnya:
   `https://payroll-kantor-anda.vercel.app`
10. Alamat web tersebut sudah otomatis memiliki sertifikat keamanan HTTPS resmi, yang merupakan syarat wajib browser untuk mengizinkan akses kamera, GPS, dan biometrik sidik jari.

---

## Langkah 5: Login Pertama & Pengaturan Lokasi Kantor (GPS)

Setelah website aktif di Vercel:

1. Buka alamat website Anda di browser laptop atau HP:
   `https://payroll-kantor-anda.vercel.app/login`
2. Masuk menggunakan akun pemilik (Owner):
   - **Email**: `owner@company.com`
   - **Password**: `admin123`
3. Setelah masuk, Anda akan berada di Dashboard Owner.
4. Masuk ke menu **Pengaturan** (`/owner/settings`):
   - **Nama Kantor**: Masukkan nama kantor Anda (contoh: Kantor Pusat Jakarta).
   - **Koordinat GPS Kantor**:
     - Anda dapat menekan tombol deteksi lokasi otomatis jika sedang berada di kantor.
     - Atau salin koordinat latitude dan longitude dari Google Maps kantor Anda.
   - **Radius Absensi**: Tentukan jarak toleransi absensi dari kantor (disarankan antara 30 hingga 50 meter).
   - **Validasi IP WiFi (Opsional)**:
     - Jika kantor Anda memiliki koneksi WiFi kantor tetap, Anda dapat memasukkan alamat IP publik WiFi kantor agar karyawan hanya bisa absen saat terhubung ke WiFi kantor.
     - Jika tidak ingin membatasi WiFi (hanya mengandalkan GPS dan QR), biarkan opsi ini dinonaktifkan.
   - Klik **Simpan Pengaturan**.
5. **Ganti Password Akun Owner**:
   - Demi keamanan, segera ganti password akun pemilik melalui menu profil atau manajemen pengguna.

---

## Langkah 6: Panduan Penggunaan Harian untuk Kantor & Karyawan

### A. Memasang Layar Terminal QR di Kantor
1. Siapkan tablet, laptop, atau smart monitor yang diletakkan di pintu masuk atau lobi kantor.
2. Buka browser di layar tersebut dan masuk ke halaman:
   `https://payroll-kantor-anda.vercel.app/owner/qr`
3. Layar akan menampilkan kode QR dinamis yang berputar dan berganti otomatis setiap 15 detik. Kode QR ini tidak dapat difoto untuk dikirim ke teman karena memiliki masa kedaluwarsa ketat (anti-screenshot dan anti-titip absen).

### B. Menambahkan Karyawan Baru
1. Di Dashboard Owner, buka menu **Karyawan** (`/owner/employees`).
2. Klik tombol **Tambah Karyawan**.
3. Masukkan data:
   - Nama Lengkap
   - NIP (Nomor Induk Pegawai)
   - Email dan Kata Sandi Login Awal untuk karyawan
   - Shift Kerja (Pagi / Sore / Malam)
   - Tarif Upah Harian (contoh: 150000 untuk Rp150.000 / hari)
4. Klik Simpan. Berikan email dan kata sandi tersebut kepada karyawan.

### C. Cara Karyawan Melakukan Absensi di HP
1. Karyawan membuka peramban resmi di HP mereka:
   - Pengguna Android: Gunakan **Google Chrome**.
   - Pengguna iPhone: Gunakan **Safari**.
2. Karyawan membuka link website kantor dan login dengan email serta password mereka.
3. **Penguncian Perangkat Otomatis (Single-Device Lock)**:
   - Saat karyawan pertama kali login, sistem akan secara otomatis mengikat dan mengunci identitas fisik HP tersebut.
   - Karyawan tidak akan bisa login menggunakan HP lain tanpa izin dari Owner.
4. Karyawan menekan tombol **Pindai QR Masuk** atau membuka menu **Scan**:
   - Izinkan akses kamera saat peramban meminta izin.
   - Izinkan akses lokasi (GPS) saat peramban meminta izin.
   - Arahkan kamera HP ke layar monitor terminal kantor.
5. Sistem akan memverifikasi dalam waktu kurang dari 1 detik:
   - Apakah kode QR sah dan belum kedaluwarsa?
   - Apakah karyawan benar-benar berada di dalam radius GPS kantor?
   - Apakah perangkat yang digunakan adalah HP yang terdaftar?
6. Jika semua syarat terpenuhi, absensi berhasil dicatat, potongan keterlambatan (jika ada) dihitung otomatis, dan estimasi upah harian langsung tertera di layar karyawan.

---

## Tanya Jawab & Solusi Masalah Umum (FAQ)

### 1. Kenapa kamera dan lokasi tidak mau menyala saat diuji coba di HP lewat IP lokal (misal: 100.x.x.x atau 192.168.x.x)?
- **Penyebab**: Peramban modern (Google Chrome dan Apple Safari) memiliki aturan keamanan ketat bernama **Secure Context**. Fitur sensor kamera, GPS lokasi, dan biometrik sidik jari secara otomatis dimatikan oleh peramban jika website dibuka melalui koneksi HTTP biasa atau alamat IP mentah non-HTTPS.
- **Solusi**: Deploy website Anda ke Vercel (Langkah 4). Vercel memberikan domain berakhiran `.vercel.app` yang sudah dilengkapi sertifikat keamanan HTTPS resmi. Begitu dibuka melalui HTTPS, kamera dan lokasi akan langsung aktif normal tanpa kendala.

### 2. Kenapa muncul pesan warna kuning "Buka di Browser Utama (Safari / Chrome) [WEBVIEW]"?
- **Penyebab**: Pesan ini muncul jika karyawan mengeklik link website dari dalam aplikasi perpesanan seperti WhatsApp, Telegram, atau Instagram. Browser mini bawaan aplikasi perpesanan membatasi izin sensor kamera dan biometrik.
- **Solusi**: Karyawan cukup mengeklik tombol **Salin Link** yang ada di banner tersebut, lalu buka aplikasi **Google Chrome** (di Android) atau **Safari** (di iPhone), tempelkan link tersebut di bilah alamat, dan lanjutkan login seperti biasa.

### 3. Karyawan ganti HP baru atau HP lamanya rusak, bagaimana cara login di HP baru?
- **Penyebab**: Sistem menerapkan kebijakan keamanan satu akun untuk satu perangkat fisik untuk mencegah kecurangan absensi.
- **Solusi**:
  1. Karyawan mencoba login di HP baru. Sistem akan mengunci sesi dan menampilkan kode permohonan buka kunci.
  2. Pemilik (Owner) cukup membuka Dashboard Owner di menu **Perangkat** (`/owner/devices`).
  3. Cari nama karyawan tersebut pada daftar permohonan, lalu klik tombol **Setujui Reset Perangkat** atau bagikan 6 angka kode pembuka kunci kepada karyawan.
  4. Setelah disetujui, HP baru karyawan akan langsung terdaftar sebagai perangkat yang sah.

### 4. Terjadi kesalahan database connection timeout saat deploy di Vercel?
- **Penyebab**: Koneksi serverless Vercel membutuhkan sambungan pooler agar koneksi database tidak kehabisan kuota sambungan.
- **Solusi**:
  - Pastikan variabel `DATABASE_URL` di Vercel menggunakan port **6543** dengan akhiran `?pgbouncer=true`.
  - Pastikan variabel `DIRECT_URL` menggunakan port **5432**.
  - Pastikan password database di dalam URL koneksi sudah benar dan tidak mengandung karakter spesial yang belum di-encode.

### 5. Bagaimana cara membersihkan seluruh data uji coba dan mulai bersih dari awal?
- Jika Anda telah selesai melakukan pengujian dan ingin membersihkan seluruh data absensi percobaan sebelum digunakan karyawan asli kantor, jalankan perintah ini di terminal komputer Anda:
  ```bash
  npm run db:clean
  ```
  Perintah ini akan mengosongkan seluruh riwayat absensi dan sesi pengujian, namun tetap mempertahankan akun Owner dan skema pengaturan yang sudah dibuat.
