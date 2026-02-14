# Pertanyaan untuk Backend: Error 410 Gone pada Assessment

## Masalah yang Dialami Frontend

Saat user memulai assessment baru, terjadi error **410 Gone** dari endpoint `/assessments/{id}/status` yang menyebabkan frontend menampilkan pesan error "Assessment sudah tidak tersedia atau telah expired".

### Log dari Console Browser:
```
[Home] Starting assessment: {track: "backend-engineer"}
Assessment started: {assessment_id: "ca28d9fc-ee99-4135-9e0e-d7b24296023e", total_questions: 10, role: "Backend Engineer"}
Loading assessment from cache: {assessment_id: "ca28d9fc...", total_questions: 10, role: "Backend Engineer"}
[API] Calling: {url: "/api/proxy?path=%2Fassessments%2Fca28d9fc-ee99-4135-9e0e-d7b24296023e%2Fstatus", method: "GET"}
[Error] Failed to load resource: the server responded with a status of 410 (Gone)
```

### Timeline:
1. User klik "Mulai Assessment" → `POST /assessments/start` → **Success** (dapat assessment_id + questions)
2. Redirect ke `/assessment/{id}` → Frontend load questions dari cache → **Success**
3. Frontend call `GET /assessments/{id}/status` → **410 Gone** ❌

---

## Pertanyaan untuk Backend

### 1. Kapan assessment dianggap expired?
- Berapa lama waktu expiry default? (dokumen menyebut 15 menit)
- Apakah `expires_at` dari response `POST /assessments/start` reliable?
- Apakah ada kondisi lain yang bisa menyebabkan 410 selain waktu expired?

### 2. Endpoint `/assessments/{id}/status` 
- Apakah endpoint ini menggunakan database berbeda dengan `/assessments/start`?
- Apakah ada delay/latency antara assessment dibuat dan tersedia di status endpoint?
- Apakah mungkin race condition dimana status endpoint belum "tahu" assessment baru dibuat?

### 3. Response 410 Gone
- Apa saja kondisi yang menyebabkan 410 dari status endpoint?
  - [ ] Assessment tidak ditemukan di database?
  - [ ] Assessment sudah expired berdasarkan `expires_at`?
  - [ ] Assessment sudah di-submit?
  - [ ] Kondisi lain?

### 4. Database/Cache
- Apakah ada caching layer di backend (Redis, etc)?
- Apakah ada replication lag jika pakai read replica?
- Apakah assessment disimpan di table yang sama dengan status?

### 5. Render Deployment
- API URL: `https://microcred-api.onrender.com`
- Apakah Render menggunakan cold start yang bisa menyebabkan delay?
- Apakah ada multiple instances yang mungkin tidak sync?

---

## Data yang Dibutuhkan dari Backend

### Request yang berhasil:
```
POST /assessments/start
Body: {"role_slug": "backend-engineer"}
Response: {
  "assessment_id": "ca28d9fc-ee99-4135-9e0e-d7b24296023e",
  "status": "in_progress",
  "expires_at": "2026-02-12T02:13:47.123Z",  // <- contoh
  "questions": [...10 items...],
  "role": {...}
}
```

### Request yang gagal (segera setelah berhasil):
```
GET /assessments/ca28d9fc-ee99-4135-9e0e-d7b24296023e/status
Response: 410 Gone
Body: ???
```

---

## Pertanyaan Tambahan

1. **Bisa minta contoh response body dari 410 error?**
   - Apakah ada field `detail` atau `message` yang menjelaskan alasan?

2. **Apakah ada logging di backend?**
   - Bisa cek log untuk assessment_id `ca28d9fc-ee99-4135-9e0e-d7b24296023e`?
   - Kapan dibuat, kapan expired, dsb?

3. **Apakah status endpoint wajib dipanggil?**
   - FE memanggil status untuk cek apakah user sudah submit sebelumnya (handle refresh)
   - Apakah lebih baik skip status check untuk assessment yang baru dibuat?

4. **Apakah ada endpoint alternatif?**
   - Untuk cek apakah assessment masih valid tanpa risiko 410?

---

## Saran untuk Backend (Jika Memungkinkan)

1. **Tambahkan grace period** - Jangan return 410 untuk assessment yang baru dibuat dalam 1-2 menit
2. **Return 404 instead of 410** jika assessment tidak ditemukan (belum di-sync)
3. **Tambahkan header `X-Assessment-Status`** di response POST untuk menghindari perlu call status

---

## Environment Info

- Frontend: Next.js 15 (development mode)
- API Proxy: `/api/proxy` → `https://microcred-api.onrender.com`
- Browser: Safari (dari log format)
- Waktu test: 12 Februari 2026, sekitar 01:58 WIB

---

## Catatan

Frontend sudah melakukan:
- Clear session sebelum start assessment baru
- Ignore 410 dari status endpoint (tidak block user)
- Hanya show error jika submit gagal dengan 410

Tapi error masih muncul, kemungkinan dari:
1. Backend status endpoint return 410 untuk assessment yang valid
2. Ada issue sync antara create dan read
3. Ada kondisi lain yang belum diketahui
