# Jawaban Backend: Error 410 Gone pada Assessment

## TL;DR - Ringkasan Masalah

**Masalah sebenarnya BUKAN dari backend.** Error 410 yang muncul di console berasal dari **pre-flight check di frontend** yang salah dijalankan untuk endpoint status.

**Fix sudah diterapkan** di `src/lib/api.ts` - status endpoint sekarang di-skip dari pre-flight check.

---

## Jawaban untuk Pertanyaan FE

### 1. Kapan assessment dianggap expired?

| Parameter | Nilai |
|-----------|-------|
| **Waktu expiry default** | 15 menit dari waktu `POST /assessments` |
| **Field `expires_at`** | ✅ Reliable - dihitung server-side saat assessment dibuat |
| **Kondisi lain yang menyebabkan 410** | Hanya waktu expired, tidak ada kondisi lain |

**Kode backend:**
```python
# src/domain/services/assessments.py
ASSESSMENT_EXPIRY_MINUTES = 15

# src/domain/services/submission.py
if now > expires_at:
    raise AssessmentExpiredError("Assessment sudah expired")
```

### 2. Endpoint `/assessments/{id}/status`

| Pertanyaan | Jawaban |
|------------|---------|
| **Database berbeda?** | ❌ Tidak - sama dengan start assessment |
| **Delay/latency?** | ❌ Tidak - PostgreSQL single instance |
| **Race condition?** | ❌ Tidak mungkin - synchronous commit |

**PENTING:** Endpoint status **TIDAK mengembalikan 410**. Hanya mengembalikan:
- `404` jika assessment tidak ditemukan
- `403` jika bukan milik user

```python
# src/api/routes/assessments.py line 291-294
except StatusNotFoundError as exc:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
except StatusNotOwnedError as exc:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
```

### 3. Kondisi yang menyebabkan 410 dari backend

**Hanya dari endpoint SUBMIT** (`POST /assessments/{id}/submit`):

- [x] Assessment sudah expired berdasarkan `expires_at`
- [ ] Assessment tidak ditemukan → 404 (bukan 410)
- [ ] Assessment sudah di-submit → 409 Conflict (bukan 410)

```python
# src/api/routes/assessments.py line 224-225
except AssessmentExpiredError as exc:
    raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc))
```

### 4. Database/Cache

| Komponen | Status |
|----------|--------|
| **Caching layer** | Redis untuk job queue, bukan untuk assessment data |
| **Read replica** | ❌ Tidak ada - single PostgreSQL instance |
| **Table yang sama** | ✅ Ya - `assessments` table untuk semua operasi |

### 5. Render Deployment

| Karakteristik | Nilai |
|---------------|-------|
| **Cold start** | Ada, tapi tidak mempengaruhi data consistency |
| **Multiple instances** | 1 instance (Free tier) |
| **Database** | PostgreSQL managed by Render |

---

## Root Cause yang Sebenarnya

### Error 410 berasal dari Frontend, BUKAN Backend

**Bukti:**
1. Backend status endpoint hanya return 404/403, tidak 410
2. Backend submit endpoint return 410, tapi belum dipanggil saat error muncul
3. Error muncul segera setelah start (masih jauh dari 15 menit)

**Penyebab:**
Frontend memiliki pre-flight check yang mengecek `expires_at` di sessionStorage. Karena assessment baru belum disimpan sessionnya, check gagal dan throw 410.

**Kode bermasalah (SUDAH DIPERBAIKI):**
```typescript
// SEBELUM - ALL assessment endpoints kena pre-flight check
if (isAssessmentEndpoint && !checkAssessmentValidity(assessmentId)) {
  throw new ApiError(410, "Assessment telah expired");
}

// SESUDAH - Status endpoint di-skip
const isStatusEndpoint = endpoint.includes('/status');
if (isAssessmentEndpoint && !isStatusEndpoint && !checkAssessmentValidity(assessmentId)) {
  throw new ApiError(410, "Assessment telah expired");
}
```

---

## Response Body dari 410 Error

### Dari Backend (submit endpoint):
```json
{
  "detail": "Assessment sudah expired"
}
```

### Dari Frontend (pre-flight check):
```
ApiError: Assessment telah expired. Silakan mulai assessment baru.
```

---

## Logging di Backend

Backend menggunakan `structlog` untuk logging. Untuk assessment tertentu:

```bash
# Cek log di Render Dashboard → Logs
# Filter by assessment_id
grep "ca28d9fc-ee99-4135-9e0e-d7b24296023e" /var/log/app.log
```

Assessment lifecycle events yang di-log:
- Assessment created
- Questions assigned  
- Response submitted
- Assessment submitted
- Job queued
- Job completed

---

## Apakah Status Endpoint Wajib Dipanggil?

**Tidak wajib**, tapi berguna untuk:
1. Handle page refresh - cek apakah assessment masih valid
2. Polling progress setelah submit
3. Menampilkan status job processing

**Rekomendasi:**
- Untuk assessment baru → Skip status check, langsung tampilkan questions dari cache
- Untuk page refresh → Call status, handle 404 dengan redirect ke home
- Setelah submit → Polling status untuk progress

---

## Endpoint Alternatif

Tidak ada endpoint khusus untuk cek validity. Tapi bisa gunakan:

```
GET /assessments/{id}/status
```

**Response berdasarkan kondisi:**
| Kondisi | Response | Action |
|---------|----------|--------|
| Valid, in_progress | 200 OK | Lanjutkan assessment |
| Tidak ditemukan | 404 | Redirect ke home |
| Bukan milik user | 403 | Redirect ke home |
| Sudah submitted | 200 + status=submitted | Redirect ke processing |

**Status endpoint TIDAK return 410** meskipun expired. Assessment yang expired masih bisa di-query, tapi tidak bisa di-submit.

---

## Perubahan yang Sudah Diterapkan di FE

### 1. `src/lib/api.ts`
- Skip pre-flight check untuk status endpoint
- Hanya throw 410 untuk submit/abandon endpoints

### 2. `src/lib/assessment-session.ts`
- Track assessment ID di expired flag
- Prevent false positive untuk assessment berbeda

---

## Kesimpulan

| Pertanyaan | Jawaban |
|------------|---------|
| Apakah bug di backend? | ❌ Tidak |
| Apakah status endpoint return 410? | ❌ Tidak, hanya 404/403 |
| Apakah submit endpoint return 410? | ✅ Ya, jika expired |
| Dimana asal error 410? | Frontend pre-flight check |
| Sudah diperbaiki? | ✅ Ya |

---

## Testing Setelah Fix

1. **Start assessment** → Harus sukses tanpa error
2. **Navigate/refresh** → Status endpoint return 200 atau 404
3. **Submit dalam 15 menit** → Harus sukses
4. **Submit setelah 15 menit** → 410 Gone dari backend (expected)

---

## Kontak

Jika ada pertanyaan lanjutan, silakan tanyakan spesifik:
- Assessment ID yang bermasalah
- Timestamp error
- Full request/response dari Network tab
