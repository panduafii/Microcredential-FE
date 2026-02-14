# Bug Report: Questions Missing `options` Column - Displayed as Essay Instead of Multiple Choice

## Summary

Beberapa pertanyaan dengan type `theoretical` dan `profile` **tidak memiliki data di kolom `options`**, sehingga frontend menampilkannya sebagai input text (essay) alih-alih pilihan ganda.

---

## Affected Questions

### Backend Engineer Track

| ID | Sequence | Type | Prompt | Issue |
|----|----------|------|--------|-------|
| 1 | 1 | theoretical | Jelaskan perbedaan utama antara FastAPI async... | ❌ `options` KOSONG |
| 2 | 2 | theoretical | Apa arti idempotensi pada endpoint submit... | ❌ `options` KOSONG |
| 3 | 3 | theoretical | Bandingkan modular monolith vs microservice... | ❌ `options` KOSONG |
| 7 | 7 | profile | Berapa pengalaman Anda bekerja dengan Redis... | ❌ `options` & `expected_values` KOSONG |

### Data Analyst Track

| ID | Sequence | Type | Prompt | Issue |
|----|----------|------|--------|-------|
| 11 | 1 | theoretical | Apa arti explainability dalam konteks... | ❌ `options` KOSONG |
| 12 | 2 | theoretical | Mengapa latency penting untuk trust advisor... | ❌ `options` KOSONG |
| 13 | 3 | theoretical | Bandingkan teknik RAG zero-shot vs RAG... | ❌ `options` KOSONG |
| 17 | 7 | profile | Apa pengalaman Anda dengan BI tools... | ❌ `options` & `expected_values` KOSONG |

---

## Frontend Logic

Frontend menentukan tampilan berdasarkan ketersediaan options:

```typescript
// src/app/assessment/[assessment_id]/page.tsx

function isTextAnswerQuestion(question: Question): boolean {
  // Essay = always text input
  if (question.question_type === "essay") return true;

  // Theoretical = multiple choice IF options exist
  if (question.question_type === "theoretical") {
    return !hasSelectableOptions(question); // No options = treated as essay
  }

  // Profile = multiple choice IF options OR expected_values exist
  if (question.question_type === "profile") {
    if (question.expected_values?.allow_custom) return true;
    return !hasSelectableOptions(question);
  }

  return false;
}

function hasSelectableOptions(question: Question): boolean {
  return Array.isArray(question.options) && question.options.length > 0;
}
```

Frontend juga tries fallback ke `expected_values.accepted_values`, tapi kolom itu juga kosong untuk Q1-3, Q7, Q11-13, Q17.

---

## Expected Data Format

### For `theoretical` questions (Q1-3, Q11-13)

Kolom `options` harus diisi dengan format JSON array:

```json
[
  {"id": "A", "text": "Pilihan jawaban A"},
  {"id": "B", "text": "Pilihan jawaban B"},
  {"id": "C", "text": "Pilihan jawaban C"},
  {"id": "D", "text": "Pilihan jawaban D"}
]
```

**Contoh untuk Question ID 1:**
```json
[
  {"id": "A", "text": "FastAPI async lebih cepat karena non-blocking I/O"},
  {"id": "B", "text": "Framework synchronous lebih mudah di-debug"},
  {"id": "C", "text": "Keduanya sama performanya untuk beban tinggi"},
  {"id": "D", "text": "FastAPI hanya cocok untuk aplikasi kecil"}
]
```

### For `profile` questions without options (Q7, Q17)

Kolom `expected_values` harus diisi:

```json
{
  "accepted_values": ["<1 tahun", "1-2 tahun", "3-5 tahun", ">5 tahun"],
  "allow_custom": false
}
```

**Atau** isi kolom `options` dengan format yang sama seperti theoretical.

---

## Questions That Are Correct ✅

| ID | Type | Has Options/Expected Values |
|----|------|----------------------------|
| 8 | profile | ✅ `expected_values.accepted_values` ada |
| 9 | profile | ✅ `expected_values.accepted_values` ada |
| 10 | profile | ✅ `expected_values.accepted_values` ada |
| 18 | profile | ✅ `expected_values.accepted_values` ada |
| 19 | profile | ✅ `expected_values.accepted_values` ada |
| 20 | profile | ✅ `expected_values.accepted_values` ada |
| 4, 5, 6 | essay | ✅ Essay tidak butuh options |
| 14, 15, 16 | essay | ✅ Essay tidak butuh options |

---

## Database Update Query (Example)

```sql
-- Update theoretical questions with options
UPDATE questions 
SET options = '[
  {"id": "A", "text": "Option A text"},
  {"id": "B", "text": "Option B text"},
  {"id": "C", "text": "Option C text"},
  {"id": "D", "text": "Option D text"}
]'::jsonb
WHERE id IN (1, 2, 3, 11, 12, 13);

-- Update profile questions with expected_values
UPDATE questions 
SET expected_values = '{
  "accepted_values": ["<1 tahun", "1-2 tahun", "3-5 tahun", ">5 tahun"],
  "allow_custom": false
}'::jsonb
WHERE id IN (7, 17);
```

---

## Impact

- **User Experience:** User harus mengetik jawaban panjang untuk pertanyaan yang seharusnya cukup pilih option
- **Scoring:** Rule-based scoring mungkin tidak bisa match jawaban free text dengan benar
- **Consistency:** 6 dari 20 pertanyaan ditampilkan salah

---

## Priority: HIGH

**Action Required:**
1. Buat/definisikan options untuk Q1, Q2, Q3, Q11, Q12, Q13 (theoretical)
2. Buat/definisikan expected_values untuk Q7, Q17 (profile experience)
3. Update database dengan SQL query
4. Test ulang di frontend

---

**Reported by:** Frontend Team  
**Date:** 2026-02-12
