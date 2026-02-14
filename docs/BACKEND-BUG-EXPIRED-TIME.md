# Bug Report: Backend Returns Already-Expired `expires_at` for Data Analyst Track

## Summary

Saat memulai assessment baru untuk track **data-analyst**, backend mengembalikan `expires_at` yang **sudah lewat** (expired). Ini menyebabkan frontend langsung mendeteksi assessment sebagai expired.

## Evidence dari Console Log

### Data Analyst (BUG ❌)
```
[Home] Assessment started successfully:
  assessment_id: "6c48f48b-555a-4e19-a3fd-56d75fc9f806"
  expires_at: "2026-02-11T17:50:35.071109+00:00"  ← WAKTU INI SUDAH LEWAT
  total_questions: 10
  role: "Data Analyst"

Current time saat start: 2026-02-11T18:43:17Z
Selisih: expires_at sudah lewat 53 MENIT yang lalu!
```

### Backend Engineer (OK ✅)
```
[Home] Assessment started successfully:
  assessment_id: "49b55855-4c56-4fb7-86ec-b1075bc205f8"
  expires_at: "2026-02-11T18:58:12.595982+00:00"  ← 15 MENIT KE DEPAN (BENAR)
  total_questions: 10
  role: "Backend Engineer"

Current time saat start: 2026-02-11T18:43:12Z
Selisih: expires_at adalah 15 menit ke depan (CORRECT)
```

## Expected Behavior

`POST /assessments/start` dengan `role_slug: "data-analyst"` seharusnya mengembalikan `expires_at` = **current_time + 15 menit**, sama seperti track lainnya.

## Actual Behavior

Backend mengembalikan `expires_at` yang sudah expired. Kemungkinan penyebab:
1. **Reuse old assessment** - Backend mungkin me-reuse assessment lama yang sudah expired untuk track data-analyst
2. **Cache issue** - Ada stale data di cache Redis/memory
3. **Database issue** - Query mengambil record lama alih-alih membuat baru
4. **Timezone bug** - Perhitungan waktu salah untuk track tertentu

## Request

1. Cek logic `POST /assessments/start` untuk kasus role_slug = "data-analyst"
2. Cek apakah ada assessment lama yang di-reuse
3. Cek apakah ada cache yang perlu di-clear
4. Verify `expires_at` selalu = `created_at + 15 minutes`

## How to Reproduce

1. Login sebagai user
2. Klik "Mulai Assessment" untuk track **Data Analyst**
3. Observe response dari `POST /assessments/start`
4. `expires_at` akan sudah lewat

## API Response yang Bermasalah

```json
POST /assessments/start
Request Body: { "role_slug": "data-analyst" }

Response:
{
  "assessment_id": "6c48f48b-555a-4e19-a3fd-56d75fc9f806",
  "status": "draft",
  "expires_at": "2026-02-11T17:50:35.071109+00:00",  // ❌ SUDAH LEWAT
  "role": {
    "slug": "data-analyst",
    "name": "Data Analyst",
    ...
  },
  "questions": [...]
}
```

## Impact

- User tidak bisa mengerjakan assessment untuk track Data Analyst
- Frontend mendeteksi expired dan menampilkan error
- Jika frontend tidak cek, submit akan gagal dengan 410 Gone

## Workaround (Temporary)

Frontend bisa skip check expired, tapi user tetap akan gagal saat submit karena backend akan return 410 Gone.

---

**Priority: HIGH**  
**Affected Track: data-analyst**  
**Working Track: backend-engineer**
