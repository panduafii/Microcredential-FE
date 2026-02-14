# FE Guide: Q7 Project Count + Checklist

## Ringkasan
Ya, ini perlu diinformasikan ke tim FE.

Q7 **sudah berubah** dari single-choice menjadi input terstruktur:
1. `project_count` (angka total project)
2. `selected_options` (checklist multi-select konteks project)

Jika FE masih mengirim 1 pilihan seperti UI saat ini, skor Q7 bisa tidak akurat (bahkan 0).

---

## Dampak Perubahan

- **Sebelum**: pilih satu opsi level pengalaman.
- **Sekarang**: isi jumlah project + pilih beberapa konteks project.
- **Tujuan**: skor profile lebih granular dan adil untuk rekomendasi course.

---

## Contract dari Backend

### Response `POST /assessments/start` (Q7)
Contoh struktur penting:

```json
{
  "question_type": "profile",
  "sequence": 7,
  "prompt": "Masukkan total project ... lalu pilih semua konteks ...",
  "options": [
    {"id": "personal", "text": "Project personal"},
    {"id": "kampus", "text": "Project kampus/bootcamp"},
    {"id": "production", "text": "Project production (real user)"},
    {"id": "lintas-domain", "text": "Project lintas domain/industri"}
  ],
  "expected_values": {
    "type": "project_checklist",
    "project_count": {
      "ranges": [
        {"min": 0, "max": 1, "score": 10},
        {"min": 2, "max": 4, "score": 25},
        {"min": 5, "max": 8, "score": 40},
        {"min": 9, "max": 999, "score": 60}
      ]
    },
    "checklist_scoring": {
      "personal": 5,
      "kampus": 10,
      "production": 15,
      "lintas-domain": 10
    }
  }
}
```

---

## UI yang Harus Dibuat FE untuk Q7

1. Input number: `Total project yang pernah dikerjakan`
2. Checklist multi-select (checkbox), source dari `question.options`
3. Bukan radio/single-select

Rekomendasi validasi FE:
- `project_count` wajib integer `>= 0`
- minimal 1 checklist dipilih

---

## Payload Submit yang Benar

Endpoint: `POST /assessments/{assessment_id}/submit`

Untuk Q7, kirim:

```json
{
  "question_id": "<snapshot_id_q7>",
  "project_count": 5,
  "selected_options": ["kampus", "production"],
  "value": "5"
}
```

Catatan:
- `selected_options` harus berisi `id` opsi (bukan label text).
- `value` dipertahankan untuk kompatibilitas lintas implementasi.

---

## Cara Hitung Skor Q7 (Backend)

Rumus:

- `raw_score = score(project_count range) + sum(score tiap checklist)`
- `final_score = (raw_score / 100) * max_score_profile_question`

Contoh:
- `project_count = 5` -> `40`
- checklist: `kampus (10)` + `production (15)` -> `25`
- `raw_score = 65`
- `final_score = 65%` dari bobot maksimal Q7

---

## Checklist QA FE

1. Q7 menampilkan input angka + checkbox list.
2. Bisa pilih lebih dari satu konteks.
3. Payload mengandung `project_count` dan `selected_options`.
4. Submit sukses dan score profile berubah sesuai kombinasi input.
5. Tidak ada fallback ke mode single-select lama untuk Q7.

---

## Catatan Kompatibilitas

Backend masih punya fallback untuk payload lama tertentu, tetapi **jangan diandalkan**.
Implementasi FE yang wajib dipakai adalah payload terstruktur di atas.
