# FE Guide: 2 Jalur Rekomendasi Course (Mandatory Foundation + Target Path)

## Ringkasan
Backend sekarang bisa mengembalikan rekomendasi dalam 2 jalur belajar:

1. `Mandatory Foundation` (wajib dikerjakan dulu)
2. `Target Path (Aspirational)` (jalur minat user setelah fondasi cukup)

Perubahan ini **tidak memecah kontrak API lama**. Data dikirim lewat:
- `recommendations[].metadata.learning_path`
- `recommendations[].metadata.learning_path_label`
- `rag_traces.readiness.learning_paths`

---

## Kapan Mode 2 Jalur Aktif
Mode 2 jalur aktif saat:
- user memilih target teknologi advanced (mis. AWS/GraphQL/cloud)
- tetapi skor readiness belum memenuhi KKM untuk langsung ke jalur advanced

Jika tidak memenuhi kondisi itu, backend tetap kirim mode normal (`single-path`).

---

## Contract Response yang Perlu FE Baca

Endpoint: `GET /assessments/{assessment_id}/result`

### 1) Field per item rekomendasi
Setiap item di `recommendations` sekarang punya metadata:

```json
{
  "rank": 1,
  "course_id": "123",
  "course_title": "Python API Fundamentals",
  "course_url": "https://...",
  "relevance_score": 0.84,
  "match_reason": "Mandatory Foundation • ...",
  "metadata": {
    "level": "Beginner Level",
    "learning_path": "mandatory_foundation",
    "learning_path_label": "Mandatory Foundation"
  }
}
```

Nilai `learning_path`:
- `mandatory_foundation`
- `target_path`

### 2) Field ringkasan jalur di `rag_traces`
Contoh:

```json
{
  "rag_traces": {
    "match_count": 5,
    "readiness": {
      "readiness_tier": "foundation",
      "force_foundation": true,
      "reason": "Target teknologi bersifat advanced, tetapi skor belum memenuhi KKM. Rekomendasi diarahkan ke fundamental terlebih dahulu.",
      "learning_paths": {
        "mode": "two-path",
        "mandatory_foundation_count": 3,
        "target_path_count": 2,
        "mandatory_foundation_query": "...",
        "target_path_query": "...",
        "note": "Target path bersifat aspirational. Selesaikan Mandatory Foundation terlebih dahulu agar risiko gagal belajar lebih rendah."
      }
    }
  }
}
```

Nilai `mode`:
- `single-path`
- `two-path`

---

## Aturan Rendering FE

1. Jika `learning_paths.mode === "two-path"`:
- Render section `Mandatory Foundation` dulu.
- Render section `Target Path (Aspirational)` setelahnya.
- Tampilkan `learning_paths.note` sebagai helper text.

2. Jika `learning_paths.mode === "single-path"`:
- Render seperti saat ini (satu daftar rekomendasi).

3. Fallback kompatibilitas:
- Jika `metadata.learning_path` belum ada pada item, anggap item masuk `target_path`.
- Jika `rag_traces` kosong/null, pakai UI lama (satu list).

---

## Contoh Implementasi TypeScript (FE)

```ts
type LearningPathKey = "mandatory_foundation" | "target_path";

type RecommendationItem = {
  rank: number;
  course_id: string;
  course_title: string;
  course_url?: string | null;
  relevance_score: number;
  match_reason?: string | null;
  metadata?: {
    learning_path?: LearningPathKey;
    learning_path_label?: string;
    [key: string]: unknown;
  } | null;
};

type LearningPathsTrace = {
  mode?: "single-path" | "two-path";
  mandatory_foundation_count?: number;
  target_path_count?: number;
  note?: string;
};

function splitRecommendationPaths(
  recommendations: RecommendationItem[],
  learningPaths?: LearningPathsTrace
) {
  const mode = learningPaths?.mode ?? "single-path";

  const mandatory: RecommendationItem[] = [];
  const target: RecommendationItem[] = [];

  for (const item of recommendations) {
    const path = item.metadata?.learning_path ?? "target_path";
    if (path === "mandatory_foundation") mandatory.push(item);
    else target.push(item);
  }

  if (mode === "single-path") {
    return { mode, mandatory: [], target: recommendations };
  }

  return { mode, mandatory, target };
}
```

---

## UX Copy yang Direkomendasikan

- Section 1 title: `Mandatory Foundation`
- Section 1 subtitle: `Selesaikan jalur ini dulu agar peluang sukses di topik target lebih tinggi.`
- Section 2 title: `Target Path (Aspirational)`
- Section 2 subtitle: `Jalur minat Anda, disarankan setelah fondasi terpenuhi.`

---

## Checklist QA FE

1. Saat mode `two-path`, item terpisah benar sesuai `metadata.learning_path`.
2. Urutan section: `Mandatory Foundation` lalu `Target Path`.
3. Saat mode `single-path`, UI tetap normal (tanpa section wajib).
4. Jika `rag_traces` tidak ada, UI tidak error dan tetap menampilkan list rekomendasi.
5. Tombol `Lihat course` dan metadata course tetap berfungsi di kedua section.

---

## Catatan Kompatibilitas
- Backend tidak mengubah schema utama `recommendations[]`.
- Informasi 2 jalur ditambahkan di metadata/traces agar rollout FE bisa bertahap.
- FE lama tetap bisa jalan, FE baru cukup menambah logic grouping.
