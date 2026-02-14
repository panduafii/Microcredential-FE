# Frontend Integration: Assessment Session Management

## Ringkasan

Dokumen ini menjelaskan perubahan yang dilakukan untuk menangani error **410 Gone** (assessment expired) dan cara mengintegrasikannya dengan komponen React.

---

## Perubahan yang Dilakukan

### 1. File: `src/lib/api.ts`

**Perubahan:**
- Menambahkan penanganan error 410 (Gone)
- Menambahkan pre-flight check sebelum API call ke assessment endpoints
- Redirect otomatis ke homepage jika assessment expired

**Cara Kerja:**
```typescript
// Sebelum call API, cek apakah assessment sudah expired
const isAssessmentEndpoint = /\/assessments\/([a-f0-9-]+)/.test(endpoint);
if (isAssessmentEndpoint && !checkAssessmentValidity(assessmentId)) {
  throw new ApiError(410, "Assessment telah expired");
}
```

### 2. File Baru: `src/lib/assessment-session.ts`

Utility functions untuk mengelola session assessment:

| Function | Deskripsi |
|----------|-----------|
| `saveAssessmentSession(session)` | Simpan data assessment ke sessionStorage |
| `getAssessmentSession()` | Ambil data assessment dari sessionStorage |
| `clearAssessmentSession()` | Hapus data assessment |
| `checkAssessmentValidity(id)` | Cek apakah assessment masih valid |
| `isAssessmentExpired(expiresAt)` | Cek apakah waktu sudah lewat |
| `getRemainingMinutes(expiresAt)` | Hitung sisa waktu dalam menit |
| `shouldShowExpiryWarning()` | Cek apakah perlu tampilkan warning (< 3 menit) |
| `getFormattedRemainingTime()` | Format sisa waktu: "5 menit" |

---

## Yang Perlu Dilakukan FE

### 1. Simpan Session Saat Start Assessment ⚠️ WAJIB

Di komponen/function yang handle **start assessment** (setelah dapat response dari `POST /assessments`):

```typescript
import { saveAssessmentSession } from '@/lib/assessment-session';

async function handleStartAssessment(roleSlug: string) {
  const response = await api.post<AssessmentStartResponse>(
    '/assessments', 
    { role_slug: roleSlug }, 
    true
  );
  
  // ✅ WAJIB: Simpan session untuk tracking expiry
  saveAssessmentSession({
    id: response.assessment_id,
    expiresAt: response.expires_at,  // dari backend response
    startedAt: new Date().toISOString(),
  });
  
  // Navigate ke assessment page
  router.push(`/assessment/${response.assessment_id}`);
}
```

### 2. Clear Session Saat Submit ⚠️ WAJIB

Di komponen/function yang handle **submit assessment**:

```typescript
import { clearAssessmentSession } from '@/lib/assessment-session';

async function handleSubmitAssessment() {
  try {
    await api.post(`/assessments/${assessmentId}/submit`, data, true);
    
    // ✅ WAJIB: Clear session setelah submit berhasil
    clearAssessmentSession();
    
    router.push(`/assessment/${assessmentId}/processing`);
  } catch (error) {
    // Handle error...
  }
}
```

### 3. Tampilkan Warning Expiry (OPTIONAL)

Untuk UX yang lebih baik, tampilkan peringatan saat waktu hampir habis:

```typescript
import { 
  shouldShowExpiryWarning, 
  getFormattedRemainingTime 
} from '@/lib/assessment-session';
import { useState, useEffect } from 'react';

function AssessmentPage() {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState('');
  
  useEffect(() => {
    // Check setiap 30 detik
    const checkExpiry = () => {
      setShowWarning(shouldShowExpiryWarning());
      setRemainingTime(getFormattedRemainingTime());
    };
    
    checkExpiry(); // Initial check
    const interval = setInterval(checkExpiry, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div>
      {showWarning && (
        <div className="fixed top-4 right-4 bg-yellow-500/10 border border-yellow-500/30 px-4 py-2 rounded-lg text-yellow-100">
          ⚠️ Waktu tersisa: {remainingTime}. Segera submit jawaban Anda!
        </div>
      )}
      
      {/* Assessment content... */}
    </div>
  );
}
```

---

## Alur Kerja

```
┌─────────────────┐
│  Start Assessment │
│  POST /assessments │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ saveAssessmentSession() │  ← WAJIB
│ - id, expiresAt    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ User mengerjakan │
│ soal-soal...      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌───────────┐
│< 15 min│  │> 15 min   │
│ Valid  │  │ EXPIRED   │
└───┬───┘  └─────┬─────┘
    │            │
    ▼            ▼
┌───────┐  ┌────────────┐
│ Submit │  │ Auto-redirect │
│ Success│  │ ke homepage  │
└───┬───┘  │ + error msg  │
    │      └────────────┘
    ▼
┌─────────────────┐
│ clearAssessmentSession() │  ← WAJIB
└─────────────────┘
```

---

## Error Handling

### Error 410 (Gone)

Jika user mencoba mengakses/submit assessment yang sudah expired:

1. **API layer** akan otomatis:
   - Clear session storage
   - Set flag `assessment_expired` 
   - Redirect ke `/?error=assessment_expired`

2. **Di homepage**, handle query parameter:
   ```typescript
   // Di page.tsx atau layout.tsx
   const searchParams = useSearchParams();
   const error = searchParams.get('error');
   
   if (error === 'assessment_expired') {
     // Tampilkan toast/notification
     toast.error('Sesi assessment telah berakhir. Silakan mulai ulang.');
   }
   ```

---

## Catatan Penting

1. **Backend assessment expiry = 15 menit**
   - Tidak diubah dari default
   - Frontend harus handle ini dengan baik

2. **Pre-flight check mencegah 410 errors**
   - Sebelum call API, FE cek dulu apakah sudah expired
   - Jika sudah expired, langsung redirect tanpa call backend

3. **Session disimpan di sessionStorage (bukan localStorage)**
   - Data hilang saat tab ditutup
   - Ini intentional untuk keamanan

4. **`expires_at` dari backend harus disimpan**
   - Response `POST /assessments` mengandung `expires_at`
   - Wajib disimpan menggunakan `saveAssessmentSession()`

---

## Testing

1. **Test normal flow:**
   - Start assessment → kerjakan → submit dalam 15 menit ✅

2. **Test expired flow:**
   - Start assessment → tunggu > 15 menit → coba navigate/submit
   - Harus redirect ke homepage dengan pesan error ✅

3. **Test pre-flight check:**
   - Buka DevTools → Application → Session Storage
   - Edit `expires_at` ke waktu lampau
   - Coba klik next/submit → harus langsung redirect ✅

---

## Files yang Perlu Direview

- `src/lib/api.ts` - API layer dengan 410 handling
- `src/lib/assessment-session.ts` - Session management utilities
- Komponen yang handle start assessment
- Komponen yang handle submit assessment
