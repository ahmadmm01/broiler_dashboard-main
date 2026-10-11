# Broiler Dashboard

Dashboard monitoring kandang ayam berbasis Next.js. Versi produksi dapat tetap
menggunakan video dummy, sedangkan instalasi lokal dapat mengambil CCTV RTSP
melalui FFmpeg tanpa mengekspos alamat atau kredensial kamera ke browser.

## Menjalankan dashboard

```powershell
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

Perintah verifikasi:

```powershell
npm run lint
npm run type-check
npm run build
```

## Mode sumber video

Mode default adalah `dummy`. Jika variabel environment belum dikonfigurasi,
dashboard menggunakan file MP4 di `public/video` sehingga deployment Netlify
tetap berfungsi seperti sebelumnya.

Browser tidak membuka `rtsp://` secara langsung. Dalam mode RTSP, alurnya adalah:

```text
CCTV RTSP -> FFmpeg di server Next.js lokal -> MJPEG /api/video/stream -> browser
```

Alamat RTSP hanya dibaca oleh server Next.js. Endpoint konfigurasi yang diakses
browser hanya memberi tahu apakah kamera suatu zona sudah dikonfigurasi.

### 1. Siapkan FFmpeg

Pastikan perintah berikut berhasil di PowerShell:

```powershell
ffmpeg -version
```

Jika `ffmpeg` tidak ada di `PATH`, isi `FFMPEG_PATH` dengan lokasi lengkap
`ffmpeg.exe`, misalnya:

```env
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
```

### 2. Buat konfigurasi lokal

Salin template environment:

```powershell
Copy-Item .env.example .env.local
```

Ubah `.env.local` untuk satu CCTV yang dipakai bersama semua zona:

```env
VIDEO_SOURCE_MODE=rtsp
RTSP_URL="rtsp://username:password@192.168.1.100:554/stream1"
```

Atau konfigurasi CCTV berbeda untuk tiap zona:

```env
VIDEO_SOURCE_MODE=rtsp
RTSP_URL_A="rtsp://username:password@192.168.1.101:554/stream1"
RTSP_URL_B="rtsp://username:password@192.168.1.102:554/stream1"
RTSP_URL_C="rtsp://username:password@192.168.1.103:554/stream1"
```

`RTSP_URL_A`, `RTSP_URL_B`, atau `RTSP_URL_C` akan menggantikan `RTSP_URL`
untuk zona tersebut. Jika sebuah zona tidak mempunyai URL, kartu zona itu
otomatis kembali ke video dummy.

Jika password berisi karakter khusus seperti `@`, `#`, atau `:`, gunakan bentuk
URL-encoded dari password tersebut. Jangan masukkan URL atau password asli ke
`.env.example`.

Setelan opsional:

```env
RTSP_TRANSPORT=tcp
RTSP_FPS=10
RTSP_MAX_WIDTH=1280
RTSP_JPEG_QUALITY=5
RTSP_IDLE_TIMEOUT_MS=5000
```

- `tcp` biasanya lebih stabil pada jaringan lokal; `udp` dapat dipilih jika
  kamera membutuhkannya.
- Gunakan substream CCTV beresolusi lebih rendah bila tersedia untuk mengurangi
  beban laptop dan jaringan.
- Beberapa tampilan yang memakai URL sama berbagi satu proses FFmpeg, sehingga
  stream CCTV tidak dibuka berulang kali untuk setiap kartu.

Setelah mengubah `.env.local`, hentikan dan jalankan ulang `npm run dev`.

### 3. Kembali ke dummy

Ubah mode lalu restart development server:

```env
VIDEO_SOURCE_MODE=dummy
```

## Keamanan dan deployment

- `.env`, `.env.local`, dan file environment lokal lain diabaikan oleh Git.
- `.env.example` hanya berisi placeholder aman dan boleh di-commit.
- Jangan memakai awalan `NEXT_PUBLIC_` untuk URL RTSP atau kredensial CCTV.
- Jika `VIDEO_SOURCE_MODE` tidak diset di Netlify, mode default tetap `dummy`.
- Netlify tidak dapat mengakses IP privat CCTV di jaringan kandang; mode RTSP
  memang ditujukan untuk server Next.js yang berjalan di laptop lokal.

Deployment produksi saat ini: [chickendash-frontend.netlify.app](https://chickendash-frontend.netlify.app/).

## Mode presentasi audit

Dashboard mendukung tampilan satu atau tiga zona tanpa mengubah kode. Untuk
presentasi umum gunakan `A,B,C`; untuk audit yang fokus pada satu kandang gunakan
`A`. Tampilan satu zona otomatis melebar, sedangkan pemilih zona hanya muncul
saat lebih dari satu zona diaktifkan.

Fitur presentasi audit yang tersedia:

- alur dashboard dibagi menjadi Current Data Monitoring terlebih dahulu,
  kemudian Historical Data untuk completed cycles;
- sensor replay bergerak sesuai `NEXT_PUBLIC_SENSOR_REPLAY_INTERVAL_MS` hanya
  untuk Realtime Readings dan alert;
- Current Cycle Sensor Trends menampilkan small-multiple chart temperature,
  humidity, CO₂, NH₃, dan PM2.5 untuk tanggal yang termasuk cycle aktif, dengan
  pilihan Daily Average atau Raw Readings serta garis batas alert;
- Historical Cycle Trends memakai dua snapshot siklus lengkap dari
  `src/app/data/historicalCycles.json`, sehingga nilainya tetap dan tidak ikut
  berubah ketika replay realtime bergerak atau halaman diakses ulang;
- setiap historical cycle juga menyimpan 37 hari mortality, feed, water, dan
  body weight yang berbeda untuk visual production outcome dan analisis AI;
- aggregation historical menghitung average per tanggal, minggu kalender
  Senin–Minggu, atau bulan kalender, dengan label waktu yang sesuai periodenya;
- notification center dengan alert threshold, severity, sound opsional,
  acknowledgement, dan status resolved;
- data mortality, feed, water, dan body weight untuk satu siklus 37 hari;
- visual Current Production Performance dan Historical Production Performance
  memakai komponen chart yang sama: KPI cards, Daily Mortality bar chart,
  gabungan Daily Feed & Water, serta Body Weight vs Standard;
- Production Cycle Management menyediakan alur Start New Cycle, Edit Cycle
  Data, Complete Cycle, dan Reopen Cycle dengan alasan koreksi;
- setiap mortality, feed/water, weight, dan alert baru diberi `cycleId`, sehingga
  data current cycle tidak bercampur dengan flock sebelumnya;
- Complete Cycle mengunci input produksi dan otomatis membuat snapshot sensor
  serta production outcome di Historical Data; Reopen menghapus snapshot lama
  sampai cycle diselesaikan kembali;
- lifecycle menyimpan status, revision, timestamp, completion notes, dan audit
  trail lokal. Cycle ID dikunci setelah cycle dimulai;
- indikator Cycle Day dan progress bar menunjukkan hari berjalan terhadap
  durasi ideal cycle (default 37 hari), dihitung sampai bacaan sensor terbaru;
- KPI mortality rate, birds remaining, live weight, FCR estimate, ADG,
  water-to-feed ratio, sensor completeness, dan alert event count;
- Current Cycle Prediction dengan proyeksi numerik rule-based dari cycle aktif,
  risk level, forecast confidence, dan rekomendasi tindakan yang dapat
  ditingkatkan melalui OpenAI;
- AI Historical Cycle Analysis mengikuti cycle yang dipilih user dan merangkum
  production outcome, threshold exceedance, temuan lingkungan, serta tindakan
  untuk cycle berikutnya; section ini ditempatkan paling akhir dalam blok history;
- PDF end-of-cycle report yang menggabungkan production KPI, statistik sensor,
  recommended actions, dan AI-assisted summary;
- rule-based fallback ditampilkan jika request AI yang dipicu user tidak tersedia;
- seluruh request OpenAI hanya dijalankan setelah user menekan tombol Generate;
  membuka halaman atau mengganti pilihan analisis tidak memanggil AI otomatis;
- grafik mortality, feed, water, dan body weight sebagai tampilan utama, dengan
  form input dan riwayat data yang dapat dibuka saat diperlukan.

Lifecycle dan managed historical cycle saat ini disimpan di browser melalui
`localStorage`, sehingga cocok untuk prototype dan presentasi pada satu perangkat.
Untuk operasional multi-user atau lintas perangkat, state ini perlu dipindahkan
ke database/API dengan autentikasi dan audit trail server-side.

Data sensor bawaan adalah `Sensor Replay`, bukan pembacaan live. Interval replay
dapat diubah lewat `.env.local` lalu restart server:

```env
NEXT_PUBLIC_SENSOR_REPLAY_INTERVAL_MS=15000
NEXT_PUBLIC_ACTIVE_ZONES=A,B,C
NEXT_PUBLIC_OPERATIONAL_STATUS=active
NEXT_PUBLIC_SENSOR_LAST_RECORDED_AT=
```

Untuk mode audit satu zona, ubah menjadi `NEXT_PUBLIC_ACTIVE_ZONES=A`. Nilai
yang diizinkan adalah `A`, `B`, dan `C`, dipisahkan koma. Setelah mengubah
konfigurasi `NEXT_PUBLIC_`, restart `npm run dev`.

Nilai minimum yang diterima adalah `5000` ms. Untuk laptop presentasi,
`15000` sampai `30000` ms disarankan.

Gunakan `NEXT_PUBLIC_OPERATIONAL_STATUS=inactive` ketika monitoring tidak
berjalan. Mode ini menghentikan replay sensor, menampilkan CCTV sebagai
disconnected, mempertahankan grafik sensor terakhir, dan membuat current-cycle
data hanya dapat dibaca. Cycle tidak dapat dimulai atau diubah, tetapi data yang
sudah tersimpan tidak dihapus. Ubah kembali menjadi `active` dan restart
development server untuk melanjutkan operasi.

Ketika mode `inactive`, isi `NEXT_PUBLIC_SENSOR_LAST_RECORDED_AT` dengan waktu
bacaan terakhir dalam format `YYYY-MM-DD HH:mm`. Dashboard akan membekukan
grafik pada waktu tersebut sehingga reload halaman tidak menambahkan data demo.

AI summary dan Current Cycle Prediction menggunakan konfigurasi server-side:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
```

Jangan menambahkan awalan `NEXT_PUBLIC_` pada API key. Tanpa API key, proyeksi
dan rekomendasi rule-based tetap tersedia; hanya peningkatan rekomendasi AI yang
dinonaktifkan.

Baseline pilot berat dan feed menggunakan
[Ross 308 AP Broiler Performance Objectives 2022](https://ap.aviagen.com/assets/Tech_Center/Ross_Broiler/RossxRoss308AP-BroilerPerformanceObjectives2022-EN.pdf)
untuk as-hatched performance sampai hari ke-37. Estimasi water menggunakan
rasio konfigurasi `2.2 × feed`. Konfirmasi kembali breed, target farm, dan rasio
air dengan supervisor sebelum report audit ditandatangani.

## Troubleshooting RTSP

1. Pastikan laptop dan CCTV berada pada jaringan yang sama.
2. Pastikan IP kamera dapat dijangkau dan port RTSP (umumnya `554`) terbuka.
3. Pastikan RTSP diaktifkan pada pengaturan CCTV/NVR.
4. Pastikan stream path sesuai merek kamera; path tidak selalu `/stream1`.
5. Periksa terminal `npm run dev` jika tampilan kembali ke video dummy.
6. Coba `RTSP_TRANSPORT=tcp` jika stream UDP terputus-putus.
