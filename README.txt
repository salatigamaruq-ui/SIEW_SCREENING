SIEW WEBSITE - VERSI DESAIN RESPONSIVE

Isi folder:
- index.html: halaman website mandiri (CSS, JavaScript, dan logo tertanam).
- style.css dan script.js: versi terpisah untuk pengembangan.
- Logo MA RUQ Al Falah tertanam di index.html agar tidak hilang saat dipindahkan.

Fitur: form data peserta (nama, jenis kelamin, tanggal lahir, berat, tinggi), dashboard parameter, input suhu manual, hasil skrining, mode demo, tampilan desktop dan mobile.

Integrasi yang diharapkan: website memanggil ESP32 pada http://192.168.4.1 dengan endpoint /api/participant, /api/data, dan /api/temperature.
Catatan: browser dapat memblokir permintaan HTTP lokal jika website dibuka dari HTTPS (misalnya GitHub Pages). Untuk penggunaan langsung via hotspot SIEW, halaman perlu disajikan oleh ESP32; sketch integrasi disertakan terpisah.

SIEW adalah prototipe, bukan alat diagnosis. Data peserta pada ESP32 hanya tersimpan sementara di RAM dan hilang saat restart.
