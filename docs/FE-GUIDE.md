# Frontend Development Guide
**MicroCred AI-Powered Assessment Platform**

Version: 1.2  
Last Updated: January 9, 2026

---

## Table of Contents
1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Architecture](#architecture)
4. [Authentication & Authorization](#authentication--authorization)
5. [API Endpoints](#api-endpoints)
6. [User Flows](#user-flows)
7. [UI/UX Guidelines](#uiux-guidelines)
8. [Data Models](#data-models)
9. [Error Handling](#error-handling)
10. [Testing Guide](#testing-guide)
11. [Deployment](#deployment)

---

## Overview

### System Purpose
AI-powered skills assessment platform yang membantu kamu menemukan learning path yang tepat.

**Cara kerja:**
1. Pilih track dan kerjakan 10 soal (15 menit)
2. Sistem AI score jawabanmu otomatis
3. Dapatkan rekomendasi course yang sesuai skill level kamu

**Teknologi:**
- **GPT** scoring untuk essay responses
- **RAG** untuk personalized course recommendations
- **Fusion AI** untuk insights dan learning path

### Tech Stack
- **Backend:** FastAPI + PostgreSQL + Redis (deployed on Render)
- **Frontend:** (Your choice - Next.js/React/Vue recommended)
- **Auth:** JWT-based authentication
- **API Style:** REST

### Base URL
```
Development: http://localhost:8000
Production: https://microcred-api.onrender.com
```

---

## Getting Started

### Repository Structure (Recommended)

```
~/Development/
├── MicroCred-genAI/           # Backend (this repo)
│   └── Deployed: microcred-api.onrender.com
│
└── microcred-frontend/        # Frontend (separate repo)
    └── Deployed: microcred.vercel.app
```

**Why separate repos?**
- Backend sudah mature dan deployed
- FE bisa punya lifecycle sendiri
- Lebih mudah kolaborasi dengan FE developer lain
- CI/CD terpisah, lebih clean

### Quick Start

```bash
# 1. Create Next.js project (recommended)
cd ~/Development
npx create-next-app@latest microcred-frontend --typescript --tailwind --app

# Or with Vite + React
npm create vite@latest microcred-frontend -- --template react-ts

# 2. Go to project
cd microcred-frontend

# 3. Install additional dependencies
npm install axios  # HTTP client (optional, fetch works too)

# 4. Create environment file
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# 5. Run development server
npm run dev
```

### Environment Variables

```env
# .env.local (for local development)
NEXT_PUBLIC_API_URL=http://localhost:8000

# .env.production (for production - set in Vercel/Netlify)
NEXT_PUBLIC_API_URL=https://microcred-api.onrender.com
```

### API Client Setup

Create `src/lib/api.ts`:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
}

export async function apiRequest<T>(
  endpoint: string, 
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, token } = options;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'API request failed');
  }
  
  return response.json();
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, token?: string) => 
    apiRequest<T>(endpoint, { token }),
    
  post: <T>(endpoint: string, body: unknown, token?: string) => 
    apiRequest<T>(endpoint, { method: 'POST', body, token }),
    
  patch: <T>(endpoint: string, body: unknown, token?: string) => 
    apiRequest<T>(endpoint, { method: 'PATCH', body, token }),
    
  delete: <T>(endpoint: string, token?: string) => 
    apiRequest<T>(endpoint, { method: 'DELETE', token }),
};
```

### CORS Configuration

Backend sudah dikonfigurasi untuk menerima requests dari:
- `http://localhost:3000` (Next.js dev server)
- `http://localhost:5173` (Vite dev server)
- `https://*.vercel.app` (Vercel deployments)
- `https://*.netlify.app` (Netlify deployments)

Jika menggunakan custom domain, beritahu backend team untuk menambahkan domain tersebut.

---

## Architecture

### System Flow
```
┌─────────────┐
│   Student   │
└──────┬──────┘
       │ 1. Start Assessment
       ▼
┌─────────────────┐
│  POST /start    │ → Creates draft assessment with questions
└─────────┬───────┘
          │ 2. Answer questions (client-side)
          ▼
┌─────────────────┐
│ POST /submit    │ → Triggers async scoring
└─────────┬───────┘
          │ 3. Queue jobs: GPT → RAG → Fusion
          ▼
┌─────────────────┐
│ GET /status     │ → Poll for progress (0-100%)
└─────────┬───────┘
          │ 4. Wait until 100%
          ▼
┌─────────────────┐
│ GET /result     │ → Get recommendations & scores
└─────────┬───────┘
          │ 5. Submit feedback
          ▼
┌─────────────────┐
│ POST /feedback  │ → Rate recommendations
└─────────────────┘
```

### Role-Based Access
```
┌──────────────┬─────────────┬─────────────┬─────────────┐
│   Feature    │   Student   │   Advisor   │    Admin    │
├──────────────┼─────────────┼─────────────┼─────────────┤
│ Take Test    │     ✅      │     ✅      │     ✅      │
│ View Result  │  Own only   │  Own only   │     All     │
│ CRUD Tracks  │     ❌      │     ❌      │     ✅      │
│ CRUD Questions│    ❌      │     ❌      │     ✅      │
│ View Analytics│    ❌      │     ✅      │     ✅      │
└──────────────┴─────────────┴─────────────┴─────────────┘
```

---

## Authentication & Authorization


### 1. Register & Login (Production-ready)

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@email.com",
  "password": "YourPassword123!",
  "full_name": "User Name",
  "role": "student" | "advisor" | "admin"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@email.com",
  "password": "YourPassword123!"
}
```

**Response (register & login):**
```json
{
  "message": "Registration successful" | "Login successful",
  "user": {
    "id": "uuid",
    "email": "...",
    "full_name": "...",
    "role": "student" | "advisor" | "admin",
    ...
  },
  "tokens": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "bearer",
    "expires_in": 3600
  }
}
```

#### Get Current User
```http
GET /auth/me
Authorization: Bearer <access_token>
```

#### Change Password
```http
POST /auth/change-password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "old_password": "...",
  "new_password": "..."
}
```

### 2. Include in Headers
```http
Authorization: Bearer <access_token>
```

### 3. Token Structure
```json
{
  "sub": "user-uuid",
  "roles": ["student"],
  "email": "user@email.com",
  ...
}
```

### 4. Role Requirements
- **Public:** `/health`, `GET /tracks`
- **Student:** Assessment endpoints
- **Admin:** CRUD for tracks, questions, courses

---

## API Endpoints

### Base Endpoints

#### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "environment": "production",
  "version": "1.0.0",
  "timestamp": "2025-12-30T10:00:00Z",
  "datastores": {
    "postgres": {
      "status": "ok"
    },
    "redis": {
      "status": "ok"
    }
  }
}
```

**Degraded Response (if database/redis down):**
```json
{
  "status": "degraded",
  "environment": "production",
  "version": "1.0.0",
  "timestamp": "2025-12-30T10:00:00Z",
  "datastores": {
    "postgres": {
      "status": "error",
      "message": "Connection failed: ..."
    },
    "redis": {
      "status": "ok"
    }
  }
}
```

---

### Track Management

#### 1. List Available Tracks
```http
GET /tracks
```

**Response:**
```json
{
  "tracks": [
    {
      "slug": "backend-engineer",
      "name": "Backend Engineer",
      "description": "API development and server-side programming",
      "question_count": 10
    },
    {
      "slug": "data-analyst",
      "name": "Data Analyst",
      "description": "Data analysis and visualization",
      "question_count": 10
    }
  ]
}
```

#### 2. Create Track (Admin Only)
```http
POST /tracks
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "slug": "frontend-engineer",
  "name": "Frontend Engineer",
  "description": "Modern web development with React/Vue",
  "skill_focus_tags": ["javascript", "react", "css"]
}
```

**Response:** `201 Created`
```json
{
  "slug": "frontend-engineer",
  "name": "Frontend Engineer",
  "description": "Modern web development with React/Vue",
  "skill_focus_tags": ["javascript", "react", "css"],
  "question_mix_overrides": null,
  "is_active": true,
  "created_at": "2025-12-30T10:00:00Z"
}
```

**Note:** Hanya user dengan role `admin` yang bisa create/update/delete track. Jika bukan admin, akan mendapat:
```json
{"detail": "Insufficient role privileges"}
```

#### 3. Get Track Details
```http
GET /tracks/{slug}
```

#### 4. Update Track (Admin Only)
```http
PATCH /tracks/{slug}
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "description": "Updated description",
  "skill_focus_tags": ["javascript", "typescript", "react"]
}
```

#### 5. Delete Track (Admin Only)
```http
DELETE /tracks/{slug}
Authorization: Bearer <admin_token>
```

**Note:** Soft delete - sets `is_active=false`

---

### Question Management

#### 1. List Questions
```http
GET /questions?role_slug=backend-engineer
Authorization: Bearer <admin_token>
```

**Response:**
```json
[
  {
    "id": 1,
    "role_slug": "backend-engineer",
    "sequence": 1,
    "question_type": "theoretical",
    "prompt": "Explain REST API vs GraphQL",
    "metadata": {
      "dimension": "api-design",
      "difficulty": "medium"
    },
    "version": 1,
    "is_active": true,
    "created_at": "2025-12-30T10:00:00Z"
  }
]
```

#### 2. Create Question (Admin Only)
```http
POST /questions
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "role_slug": "backend-engineer",
  "sequence": 11,
  "question_type": "essay",
  "prompt": "Design a REST API for e-commerce",
  "metadata_": {
    "dimension": "system-design",
    "difficulty": "hard"
  }
}
```

**Note:** Hanya user dengan role `admin` yang bisa create/update/delete question. Jika bukan admin, akan mendapat:
```json
{"detail": "Insufficient role privileges"}
```

**Question Types & Jumlah:**
- `theoretical` (3 soal) - Multiple choice dengan options A/B/C/D, nilai 100 poin per soal
- `essay` (3 soal) - Jawaban panjang, di-scoring via GPT, nilai 100 poin per soal
- `profile` (4 soal) - Pertanyaan pengalaman/background, pilihan ganda tanpa jawaban benar/salah
  - **Q7:** Experience level - COMPOUND question (months + projects) ✨ UPDATED
  - **Q8:** Tech/tools preferences (with custom text input) ✨ NEW
  - **Q9:** Course duration preference (short/medium/long/any) ✨ NEW
  - **Q10:** Payment preference (paid/free/any) ✨ NEW

**Question Structure:**
```typescript
interface QuestionOption {
  id: string;     // "A", "B", "C", "D"
  text: string;   // Option text
}

// For compound questions (Q7)
interface CompoundField {
  id: string;           // "months" | "projects"
  label: string;        // "Lama belajar programming:"
  type: "select";
  options: Array<{ value: string; text: string }>;
}

interface CompoundOptions {
  type: "compound";
  fields: CompoundField[];
  display_format: string;  // "{months} dan {projects}"
}

interface Question {
  id: string;
  sequence: number;
  question_type: 'theoretical' | 'essay' | 'profile';
  prompt: string;
  options?: QuestionOption[] | CompoundOptions;  // Array for normal, Object for compound
  metadata?: {
    dimension?: string;
    topic?: string;
    type?: "compound";  // ✨ NEW - indicates compound question
  };
  expected_values?: {  // ✨ NEW - For profile questions
    accepted_values?: string[];  // Suggested values for dropdown
    allow_custom?: boolean;      // Allow free text input
    type?: "compound";           // For compound scoring
    scoring?: Record<string, Record<string, number>>;  // Per-field scoring
    weight?: Record<string, number>;  // Per-field weights
  };
}
```

#### Q7 - Experience Level (Compound Question) ✨ NEW

Q7 adalah **compound question** dengan DUA input number untuk bulan dan project:

```json
{
  "sequence": 7,
  "question_type": "profile",
  "prompt": "Sudah berapa lama Anda belajar programming dan berapa project yang sudah Anda kerjakan?",
  "expected_values": {
    "type": "compound",
    "fields": ["months", "projects"],
    "display_format": "{months} bulan dan {projects} project"
  },
  "metadata": {"dimension": "experience-level", "type": "compound"}
}
```

**UI Implementation untuk Q7 (Compound):**
```tsx
// Render for Q7 compound question
if (question.expected_values?.type === "compound") {
  const [months, setMonths] = useState("");
  const [projects, setProjects] = useState("");
  
  // Parse existing answer "6 bulan dan 3 project"
  useEffect(() => {
    const answer = answers[question.id];
    if (answer) {
      const match = answer.match(/(\d+) bulan dan (\d+) project/);
      if (match) {
        setMonths(match[1]);
        setProjects(match[2]);
      }
    }
  }, []);
  
  const handleUpdate = () => {
    if (months && projects) {
      const formatted = `${months} bulan dan ${projects} project`;
      onChange(formatted);
    }
  };
  
  return (
    <div className="space-y-4">
      <h3>{question.prompt}</h3>
      
      <div>
        <label className="block text-sm font-medium mb-1">
          Lama belajar programming (bulan):
        </label>
        <input
          type="number"
          min="0"
          value={months}
          onChange={(e) => {
            setMonths(e.target.value);
            handleUpdate();
          }}
          placeholder="Contoh: 6"
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">
          Jumlah project yang dikerjakan:
        </label>
        <input
          type="number"
          min="0"
          value={projects}
          onChange={(e) => {
            setProjects(e.target.value);
            handleUpdate();
          }}
          placeholder="Contoh: 3"
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>
      
      {months && projects && (
        <p className="text-sm text-gray-600">
          Preview: <strong>{months} bulan dan {projects} project</strong>
        </p>
      )}
    </div>
  );
}
```

**Submit Format untuk Q7:**
```json
{
  "question_id": "q7-uuid",
  "answer_text": "6 bulan dan 3 project",
  "selected_option_id": null
}
```

#### Personalization Questions (Q8-Q10)

Profile questions Q8-Q10 mendukung personalization untuk rekomendasi course yang lebih relevan:

**Q8 - Tech/Tools Preferences:**
```json
{
  "sequence": 8,
  "question_type": "profile",
  "prompt": "Teknologi/tools apa yang ingin Anda pelajari lebih dalam? (Sebutkan 2-3, misal: Docker, AWS, GraphQL)",
  "expected_values": {
    "accepted_values": [
      "docker", "kubernetes", "aws", "gcp", "azure",
      "graphql", "redis", "kafka", "microservices",
      "ci/cd", "terraform", "mongodb", "postgresql", "elasticsearch"
    ],
    "allow_custom": true  // ✨ User bisa input custom text
  }
}
```

**Q9 - Duration Preference:**
```json
{
  "sequence": 9,
  "question_type": "profile",
  "prompt": "Preferensi durasi course yang Anda inginkan?",
  "options": [
    {"id": "A", "text": "Short (< 5 hours)"},
    {"id": "B", "text": "Medium (5-15 hours)"},
    {"id": "C", "text": "Long (> 15 hours)"},
    {"id": "D", "text": "Any duration"}
  ],
  "expected_values": {
    "accepted_values": ["short", "medium", "long", "any"],
    "allow_custom": false
  }
}
```

**Q10 - Payment Preference:**
```json
{
  "sequence": 10,
  "question_type": "profile",
  "prompt": "Apakah Anda tertarik dengan course berbayar atau gratis?",
  "options": [
    {"id": "A", "text": "Paid courses only"},
    {"id": "B", "text": "Free courses only"},
    {"id": "C", "text": "Any"}
  ],
  "expected_values": {
    "accepted_values": ["paid", "free", "any"],
    "allow_custom": false
  }
}
```

**UI Implementation untuk Q8 (Custom Input):**
```tsx
// components/ProfileQuestion8.tsx
interface ProfileQuestion8Props {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}

export function ProfileQuestion8({ question, value, onChange }: ProfileQuestion8Props) {
  const { prompt, expected_values } = question;
  const suggestions = expected_values?.accepted_values || [];
  const allowCustom = expected_values?.allow_custom || false;

  return (
    <div className="question-container">
      <h3>{prompt}</h3>
      
      {/* Suggestions as chips/tags */}
      <div className="suggestions">
        <p className="text-sm text-gray-600 mb-2">Quick picks:</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200"
              onClick={() => {
                // Add to existing value
                const current = value ? value.split(',').map(v => v.trim()) : [];
                if (!current.includes(suggestion)) {
                  onChange([...current, suggestion].join(', '));
                }
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Free text input */}
      {allowCustom && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your answer (comma-separated):
          </label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g., Docker, Kubernetes, Rust"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
          <p className="text-xs text-gray-500 mt-1">
            ✨ You can add custom technologies not in the suggestions
          </p>
        </div>
      )}
    </div>
  );
}
```

**How Personalization Works:**
1. **Q8 responses** → Used to enhance RAG query with user's tech preferences
2. **Q9 responses** → Boosts courses matching duration preference (+0.05 relevance)
3. **Q10 responses** → Filters courses by payment type (paid/free/any)

**Recommendation & Summary Outputs:**
- Ranking kursus akan mengutamakan match terhadap Q8 (tech/tools), Q9 (durasi), dan Q10 (paid/free/any)
- Summary hasil akan menjelaskan alasan rekomendasi, misalnya: "Diprioritaskan untuk topik {Q8}, durasi {Q9}, sesuai preferensi pembayaran {Q10}"
- Pastikan FE menampilkan alasan tersebut (field `match_reason` dan ringkasan dari endpoint `/assessments/{id}/result`)

Result: More personalized and relevant course recommendations! 🎯

#### 3. Update Question (Admin Only)
```http
PATCH /questions/{id}
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "prompt": "Updated question text"
}
```

**Note:** Creates new version, old version marked inactive

#### 4. Delete Question (Admin Only)
```http
DELETE /questions/{id}
Authorization: Bearer <admin_token>
```

---

### Assessment Flow

#### 1. Start Assessment
```http
POST /assessments/start
Authorization: Bearer <student_token>
Content-Type: application/json

{
  "role_slug": "backend-engineer"
}
```

**Response:** `200 OK`
```json
{
  "assessment_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "draft",
  "expires_at": "2025-12-31T10:00:00Z",
  "role": {
    "slug": "backend-engineer",
    "name": "Backend Engineer",
    "description": "...",
    "question_count": 10
  },
  "questions": [
    {
      "id": "q1-uuid",
      "sequence": 1,
      "question_type": "theoretical",
      "prompt": "Apa perbedaan utama antara FastAPI dengan Flask dalam hal performa?",
      "options": [
        {"id": "A", "text": "FastAPI lebih lambat karena menggunakan type hints"},
        {"id": "B", "text": "FastAPI mendukung async/await secara native sehingga lebih efisien untuk I/O-bound tasks"},
        {"id": "C", "text": "Flask lebih cepat karena lebih ringan"},
        {"id": "D", "text": "Tidak ada perbedaan performa yang signifikan"}
      ],
      "metadata": {"dimension": "framework-knowledge"},
      "response": null
    },
    {
      "id": "q4-uuid",
      "sequence": 4,
      "question_type": "essay",
      "prompt": "Rancang arsitektur sistem scoring hybrid (rule-based + GPT) yang dapat memenuhi SLA response time < 10 detik...",
      "options": null,
      "metadata": {"dimension": "system-design"},
      "response": null
    },
    {
      "id": "q7-uuid",
      "sequence": 7,
      "question_type": "profile",
      "prompt": "Berapa tahun pengalaman Anda bekerja dengan Python untuk backend development?",
      "options": [
        {"id": "A", "text": "Belum pernah / < 6 bulan"},
        {"id": "B", "text": "6 bulan - 1 tahun"},
        {"id": "C", "text": "1-2 tahun"},
        {"id": "D", "text": "2-5 tahun"},
        {"id": "E", "text": "> 5 tahun"}
      ],
      "metadata": {"dimension": "experience"},
      "response": null
    }
  ]
}
```

**UI Implementation:**
```javascript
// Store assessment_id and questions in state
const [assessmentId, setAssessmentId] = useState(null);
const [questions, setQuestions] = useState([]);
const [answers, setAnswers] = useState({});

const startAssessment = async (roleSlug) => {
  const response = await fetch('/assessments/start', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role_slug: roleSlug })
  });
  
  const data = await response.json();
  setAssessmentId(data.assessment_id);
  setQuestions(data.questions);
};
```

#### 2. Submit Assessment
**Important:** Answers are stored client-side, sent on submit

```http
POST /assessments/{assessment_id}/submit
Authorization: Bearer <student_token>
Content-Type: application/json

{
  "responses": [
    {
      "question_id": "q1-uuid",
      "answer_text": null,
      "selected_option_id": "B"
    },
    {
      "question_id": "q4-uuid",
      "answer_text": "Sistem scoring hybrid terdiri dari beberapa layer: 1) Synchronous Layer untuk rule-based scoring yang memproses theoretical dan profile questions secara langsung...",
      "selected_option_id": null
    },
    {
      "question_id": "q7-uuid",
      "answer_text": null,
      "selected_option_id": "D"
    }
  ]
}
```

**Response Fields per Question Type:**
| Field | Theoretical | Essay | Profile | Profile (Custom - Q8) |
|-------|-------------|-------|---------|----------------------|
| `selected_option_id` | ✅ Required (A/B/C/D) | ❌ null | ✅ Required (A/B/C/D/E) | ❌ null |
| `answer_text` | ❌ null | ✅ Required | ❌ null | ❌ null |
| `value` | ❌ null | ❌ null | ❌ null | ✅ Required (custom text) |

**Q8 (Tech Preferences) - Special Handling:**
```json
{
  "question_id": "q8-uuid",
  "value": "golang, kubernetes, docker"
}
```
Q8 uses `allow_custom: true` yang memungkinkan input free text. Gunakan field `value` untuk menyimpan jawaban custom (comma-separated).

### Scoring Logic

**1. Theoretical (Multiple Choice)**
- Scoring: **Rule-based, instant**
- Jawaban dibandingkan dengan `correct_answer` di database
- Benar = 100 poin, Salah = 0 poin
- Nilai langsung tersedia di response submit

**2. Profile**
- Scoring: **Rule-based, instant**
- Setiap opsi punya nilai di `expected_values.scoring`:
  ```json
  {"A": 20, "B": 40, "C": 60, "D": 80, "E": 100}
  ```
- Tidak ada jawaban "benar/salah" - hanya pengukuran experience level
- Nilai langsung tersedia di response submit

**3. Essay**
- Scoring: **Async via GPT, requires polling**
- Jawaban dikirim ke GPT-4 dengan rubric dari database
- Contoh rubric:
  ```json
  {
    "completeness": {"weight": 0.3, "description": "Mencakup semua komponen utama"},
    "technical_accuracy": {"weight": 0.3, "description": "Konsep teknis benar"},
    "optimization": {"weight": 0.2, "description": "Strategi optimasi yang valid"},
    "clarity": {"weight": 0.2, "description": "Penjelasan jelas dan terstruktur"}
  }
  ```
- GPT mengembalikan skor per dimensi dan total
- Poll `/assessments/{id}/status` untuk progress
- Hasil tersedia di `/assessments/{id}/results` setelah completed
```

**Response:** `200 OK`
```json
{
  "assessment_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "submitted",
  "submitted_at": "2025-12-30T10:05:00Z",
  "scores": {
    "theoretical": {
      "total": 300.0,
      "max": 300.0,
      "percentage": 100.0
    },
    "profile": {
      "total": 200.0,
      "max": 400.0,
      "percentage": 50.0
    },
    "essay": {
      "total": 0,
      "max": 300.0,
      "percentage": 0
    }
  },
  "jobs_queued": ["gpt", "rag", "fusion"],
  "degraded": false
}
```

**UI Implementation:**
```javascript
const submitAssessment = async () => {
  // Build responses array from answers state
  const responses = questions.map(q => ({
    question_id: q.id,
    answer_text: answers[q.id] || '',
    selected_option_id: null
  }));
  
  const response = await fetch(`/assessments/${assessmentId}/submit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ responses })
  });
  
  const data = await response.json();
  
  // Start polling for status
  startPolling(assessmentId);
};
```

#### 3. Check Status (Polling)
```http
GET /assessments/{assessment_id}/status
Authorization: Bearer <student_token>
```

**Response (Processing):**
```json
{
  "assessment_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "submitted",
  "overall_progress": 66.67,
  "stages": {
    "gpt_scoring": {
      "status": "completed",
      "progress": 100.0,
      "started_at": "2025-12-30T10:05:01Z",
      "completed_at": "2025-12-30T10:05:05Z"
    },
    "rag_retrieval": {
      "status": "completed",
      "progress": 100.0,
      "started_at": "2025-12-30T10:05:05Z",
      "completed_at": "2025-12-30T10:05:08Z"
    },
    "fusion_summary": {
      "status": "in_progress",
      "progress": 50.0,
      "started_at": "2025-12-30T10:05:08Z",
      "completed_at": null
    }
  },
  "submitted_at": "2025-12-30T10:05:00Z",
  "completed_at": null
}
```

**Response (Complete):**
```json
{
  "assessment_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "overall_progress": 100.0,
  "stages": {
    "gpt_scoring": {
      "status": "completed",
      "progress": 100.0
    },
    "rag_retrieval": {
      "status": "completed",
      "progress": 100.0
    },
    "fusion_summary": {
      "status": "completed",
      "progress": 100.0
    }
  },
  "submitted_at": "2025-12-30T10:05:00Z",
  "completed_at": "2025-12-30T10:05:12Z"
}
```

**UI Implementation - Polling:**
```javascript
const pollStatus = async (assessmentId) => {
  const response = await fetch(`/assessments/${assessmentId}/status`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  
  // Update progress bar
  setProgress(data.overall_progress);
  
  // Check if complete
  if (data.overall_progress === 100) {
    // Stop polling and fetch results
    fetchResults(assessmentId);
  } else {
    // Poll again in 2 seconds
    setTimeout(() => pollStatus(assessmentId), 2000);
  }
};
```

#### 4. Exit/Abandon Assessment (NEW)
```http
DELETE /assessments/{assessment_id}/abandon
Authorization: Bearer <student_token>
```

**Response:** `200 OK`
```json
{
  "message": "Assessment berhasil dihapus"
}
```

**When to Use:**
- User clicks "Keluar" button during assessment
- Only works for draft or in-progress assessments
- Submitted/completed assessments cannot be abandoned
- All related data (questions, responses) will be deleted

**Error Responses:**
- `404 Not Found` - Assessment tidak ditemukan
- `403 Forbidden` - Bukan pemilik assessment
- `400 Bad Request` - Assessment sudah submitted/completed

**UI Implementation:**
```javascript
const exitAssessment = async (assessmentId) => {
  if (!confirm('Yakin ingin keluar? Progress akan hilang.')) {
    return;
  }
  
  try {
    await fetch(`/assessments/${assessmentId}/abandon`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // Redirect to home
    router.push('/');
  } catch (error) {
    alert('Gagal keluar dari assessment');
  }
};
```

#### 5. Get User Statistics (NEW)
```http
GET /assessments/stats/user
Authorization: Bearer <student_token>
```

**Response:** `200 OK`
```json
{
  "total_completed": 3,
  "by_role": {
    "backend-engineer": 2,
    "data-analyst": 1
  }
}
```

**UI Implementation:**
```javascript
// Display in dashboard
const [stats, setStats] = useState(null);

useEffect(() => {
  fetch('/assessments/stats/user', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(data => setStats(data));
}, []);

// In UI:
<div className="stats">
  <div className="stat-card">
    <h3>Assessment Selesai</h3>
    <p className="stat-value">{stats?.total_completed || 0}</p>
  </div>
  <div className="stat-card">
    <h3>Backend Engineer</h3>
    <p className="stat-value">{stats?.by_role?.['backend-engineer'] || 0}</p>
  </div>
  <div className="stat-card">
    <h3>Data Analyst</h3>
    <p className="stat-value">{stats?.by_role?.['data-analyst'] || 0}</p>
  </div>
</div>
```

#### 6. Get Results
```http
GET /assessments/{assessment_id}/result
Authorization: Bearer <student_token>
```

**Response:** `200 OK`
```json
{
  "assessment_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "completed": true,
  "summary": "Good job! Your assessment for the Backend Engineer role shows solid foundations with room for growth. Overall score: 62.5%.\n\n**Score Breakdown:**\n- Technical Knowledge: 100.0%\n- Profile Alignment: 50.0%\n- Essay Quality: 75.0%\n\n**Recommended Courses:**\n1. Learn Web Scraping with Node.js\n   _Matches: node, api_\n2. API development in Node, Express, MongoDB\n   _Matches: node, api_\n3. Python Django Course\n   _Matches: python_",
  "overall_score": 500.0,
  "score_breakdown": {
    "theoretical": {
      "score": 300.0,
      "max": 300.0,
      "percentage": 100.0
    },
    "profile": {
      "score": 200.0,
      "max": 400.0,
      "percentage": 50.0
    },
    "essay": {
      "score": 225.0,
      "max": 300.0,
      "percentage": 75.0
    },
    "overall": {
      "score": 725.0,
      "percentage": 72.5
    }
  },
  "recommendations": [
    {
      "rank": 1,
      "course_id": "701636",
      "course_title": "Learn Web Scraping with Node.js",
      "course_url": "https://www.udemy.com/web-scraping-nodejs/",
      "relevance_score": 0.475,
      "match_reason": "Matches: node, api",
      "metadata": {
        "subject": "Web Development",
        "level": "All Levels",
        "num_subscribers": "16731",
        "num_reviews": "137",
        "is_paid": "True",
        "price": "75"
      }
    },
    {
      "rank": 2,
      "course_id": "1009254",
      "course_title": "Beginner API development in Node, Express, ES6, & MongoDB",
      "course_url": "https://www.udemy.com/api-development/",
      "relevance_score": 0.451,
      "match_reason": "Matches: node, api",
      "metadata": {
        "subject": "Web Development",
        "level": "Beginner Level",
        "num_subscribers": "7057",
        "num_reviews": "655",
        "is_paid": "True",
        "price": "165"
      }
    }
  ],
  "rag_traces": {
    "query": "python java node api database",
    "method": "tfidf",
    "top_k": 5,
    "degraded": false
  },
  "degraded": false,
  "processing_duration_ms": 12000,
  "completed_at": "2025-12-30T10:05:12Z"
}
```

#### 7. Submit Feedback
```http
POST /assessments/{assessment_id}/feedback
Authorization: Bearer <student_token>
Content-Type: application/json

{
  "rating_relevance": 4,
  "rating_acceptance": 3,
  "comment": "Good recommendations, will check them out!"
}
```

**Response:** `201 Created`
```json
{
  "id": "feedback-uuid",
  "assessment_id": "550e8400-e29b-41d4-a716-446655440000",
  "rating_relevance": 4,
  "rating_acceptance": 3,
  "comment": "Good recommendations, will check them out!",
  "created_at": "2025-12-30T10:10:00Z"
}
```

---

## User Flows

### Student Flow

#### 1. Choose Track
```
┌─────────────────┐
│  Landing Page   │
│                 │
│ • Backend Eng   │
│ • Data Analyst  │
└────────┬────────┘
         │ Click track
         ▼
```

**UI Elements:**
- Track cards with description
- "Start Assessment" button
- Estimated time: 15 minutes

#### 2. Take Assessment
```
┌──────────────────────────────┐
│ Question 1 of 10   ⏱ 42:15  │
├──────────────────────────────┤
│ [Progress Bar: 10%]          │
├──────────────────────────────┤
│ Question text...             │
│                              │
│ [Answer input]               │
│                              │
│ [Keluar] [< Prev] [Next >]  │
└──────────────────────────────┘
```

**Assessment Timer (NEW):**
- **Duration:** 15 minutes dari start
- **Display:** Countdown timer MM:SS (pojok kanan atas)
- **Warning:** Kuning ketika < 5 menit tersisa
- **Auto-submit:** Langsung submit otomatis ketika mencapai 00:00
- **Exit Button:** Izinkan pengguna keluar dan menghapus draft assessment

**Exit & Back Navigation (NEW):**
- Tombol **Keluar** memanggil `DELETE /assessments/{id}/abandon` (hanya status draft/in_progress)
- Saat user menekan **Back** di browser atau mencoba menutup tab, tampilkan konfirmasi
- Jika user memilih keluar, panggil abandon endpoint, lalu redirect ke halaman awal

```javascript
// Hook contoh (React) untuk proteksi back/close
useEffect(() => {
  const handleBeforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = "Progress akan hilang. Keluar dari tes?";
  };

  const handlePopState = (e) => {
    const confirmExit = window.confirm("Keluar dari tes? Progress akan hilang.");
    if (!confirmExit) {
      // Dorong history lagi supaya tetap di halaman
      window.history.pushState(null, "", window.location.href);
    } else {
      abandonAssessment();
    }
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("popstate", handlePopState);
  // Lock current state
  window.history.pushState(null, "", window.location.href);

  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("popstate", handlePopState);
  };
}, []);

async function abandonAssessment() {
  try {
    await fetch(`/assessments/${assessmentId}/abandon`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    router.push("/");
  } catch (err) {
    console.error("Abandon failed", err);
  }
}
```

**UI Requirements:**
- Progress indicator (1/10, 2/10, etc.) with percentage
- Save answers to localStorage (auto-save every 30 seconds)
- Navigation: Previous/Next buttons
- Exit button with confirmation dialog
- Submit button on last question
- Confirmation dialog before submit
- Timer display with color coding:
  - Green: > 10 minutes remaining
  - Yellow: 5-10 minutes remaining
  - Red: < 5 minutes remaining

**Timer Implementation:**
```javascript
const AssessmentTimer = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState(null);
  const [autoSubmitWarning, setAutoSubmitWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diff = expiry - now;
      
      if (diff <= 0) {
        // Timer habis: langsung auto-submit
        setTimeLeft("00:00");
        setAutoSubmitWarning(true);
        handleForceSubmit();
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        setAutoSubmitWarning(false);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [expiresAt]);
  
  const getColor = () => {
    if (autoSubmitWarning) return 'red';
    const [minutes] = timeLeft.split(':').map(Number);
    if (minutes > 10) return 'green';
    if (minutes > 5) return 'yellow';
    return 'red';
  };
  
  return (
    <div className={`timer timer-${getColor()}`}>
      ⏱ {timeLeft}
    </div>
  );
};

// Auto-submit handler (frontend-driven)
async function handleForceSubmit() {
  if (isSubmitting) return;
  setIsSubmitting(true);
  try {
    await fetch(`/assessments/${assessmentId}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ responses: collectedResponses }),
    });
    // Lanjutkan ke status/polling
    router.push(`/assessments/${assessmentId}/status`);
  } catch (err) {
    console.error("Auto-submit failed", err);
    // Opsional: tampilkan toast retry
  } finally {
    setIsSubmitting(false);
  }
}
```

#### 3. Processing Screen
```
┌──────────────────┐
│  Processing...   │
├──────────────────┤
│ [Progress: 66%]  │
│                  │
│ ✓ Scoring essays │
│ ✓ Finding courses│
│ ⏳ Generating...  │
└──────────────────┘
```

**UI Requirements:**
- Animated progress bar
- Stage indicators:
  - ✓ GPT Scoring (33%)
  - ✓ RAG Retrieval (66%)
  - ⏳ Fusion Summary (100%)
- Estimated time: 10-20 seconds

#### 4. Results Page
```
┌────────────────────────┐
│   Your Results         │
├────────────────────────┤
│ Overall Score: 72.5%   │
│                        │
│ [Score Breakdown]      │
│ • Technical: 100%      │
│ • Profile: 50%         │
│ • Essay: 75%           │
│                        │
│ [Summary Text]         │
│                        │
│ Recommended Courses:   │
│ 1. Course Title        │
│    ⭐⭐⭐⭐⭐ (137 reviews)│
│    $75 | 16,731 enrolled│
│    [View Course →]     │  ← Opens course_url in new tab
│                        │
│ [Submit Feedback]      │
└────────────────────────┘
```

**UI Requirements:**
- Score visualization (donut chart/gauge)
- Expandable sections
- Course cards with metadata
- **Clickable course links** (opens in new tab)
- Feedback form (ratings + comment)
- Share/Download results button

### Recommendations Component

Course recommendations should be clickable and open in a new tab. Use the `course_url` field:

```tsx
// components/RecommendationCard.tsx
interface RecommendationCardProps {
  recommendation: {
    rank: number;
    course_title: string;
    course_url: string;       // ← Clickable link to course
    relevance_score: number;
    match_reason: string;
    metadata: {
      subject: string;
      level: string;
      num_subscribers: string;
      num_reviews: string;
      is_paid: string;
      price: string;
    };
  };
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const { course_title, course_url, match_reason, metadata } = recommendation;
  
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <h3 className="font-semibold text-lg">{course_title}</h3>
      
      <div className="flex gap-4 text-sm text-gray-600 mt-2">
        <span>⭐ {metadata.num_reviews} reviews</span>
        <span>{parseInt(metadata.num_subscribers).toLocaleString()} enrolled</span>
        <span>{metadata.is_paid === 'True' ? `$${metadata.price}` : 'Free'}</span>
      </div>
      
      <p className="text-sm text-blue-600 mt-2">
        <em>{match_reason}</em>
      </p>
      
      {/* IMPORTANT: Open course URL in new tab */}
      <a
        href={course_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        View Course
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    </div>
  );
}
```

**Usage in Results Page:**
```tsx
// pages/results/[id].tsx
{result.recommendations.map((rec) => (
  <RecommendationCard key={rec.course_id} recommendation={rec} />
))}
```

### Admin Flow

#### 1. Dashboard
```
┌─────────────────────────────┐
│ Admin Dashboard             │
├─────────────────────────────┤
│ [Tracks] [Questions]        │
├─────────────────────────────┤
│ Active Tracks: 2            │
│ Total Questions: 20         │
│ Assessments Today: 15       │
└─────────────────────────────┘
```

#### 2. Manage Tracks
```
┌─────────────────────────────┐
│ Tracks Management           │
│ [+ Create New Track]        │
├─────────────────────────────┤
│ Backend Engineer            │
│ 10 questions | Active       │
│ [Edit] [Delete] [Questions] │
│                             │
│ Data Analyst                │
│ 10 questions | Active       │
│ [Edit] [Delete] [Questions] │
└─────────────────────────────┘
```

#### 3. Manage Questions
```
┌─────────────────────────────┐
│ Questions - Backend Engineer│
│ [+ Create New Question]     │
├─────────────────────────────┤
│ Q1. Theoretical             │
│ "Explain REST API vs..."    │
│ [Edit] [Delete] [Preview]   │
│                             │
│ Q2. Theoretical             │
│ "What is database indexing?"│
│ [Edit] [Delete] [Preview]   │
└─────────────────────────────┘
```

---

## UI/UX Guidelines

### Landing Page / Hero Section (NEW)

#### Improved Copywriting
**Old (Too technical):**
> "Pilih track, kerjakan assessment, dapatkan rekomendasi course terbaik.
> Mulai assessment, tunggu proses singkat, dan langsung lihat hasil serta rekomendasi course yang relevan.
> Auto-save jawaban di localStorage
> Polling status setiap 2 detik
> Rekomendasi course siap pakai"

**New (Simple & compelling):**
```html
<section class="hero">
  <h1>Temukan Learning Path yang Tepat</h1>
  <p class="subtitle">
    Kerjakan assessment 10 soal (15 menit), AI kami akan rekomendasikan 
    course yang sesuai dengan skill level kamu
  </p>
  
  <div class="features">
    <div class="feature">
      <span class="icon">⚡</span>
      <h3>Cepat & Efisien</h3>
      <p>10 pertanyaan, hasil dalam hitungan menit</p>
    </div>
    
    <div class="feature">
      <span class="icon">🎯</span>
      <h3>Personalized</h3>
      <p>Rekomendasi sesuai pengalaman & preferensi kamu</p>
    </div>
    
    <div class="feature">
      <span class="icon">🤖</span>
      <h3>AI-Powered</h3>
      <p>Scoring otomatis dengan teknologi GPT & RAG</p>
    </div>
  </div>
  
  <button class="cta-button">Mulai Assessment</button>
</section>
```

#### Stats Card (Updated)
**Old:** Total pertanyaan (confusing - total in system)
**New:** Assessment selesai (useful - user progress)

```html
<div class="stats-grid">
  <div class="stat-card">
    <h3>Track Tersedia</h3>
    <p class="stat-value">2</p>
    <p class="stat-label">Backend & Data Analyst</p>
  </div>
  
  <div class="stat-card">
    <h3>Assessment Selesai</h3>
    <p class="stat-value">{user.stats.total_completed}</p>
    <p class="stat-label">Total yang kamu selesaikan</p>
  </div>
  
  <div class="stat-card">
    <h3>Status API</h3>
    <p class="stat-value status-ok">Terhubung</p>
    <p class="stat-label">Siap untuk assessment</p>
  </div>
</div>
```

**Implementation:**
```javascript
// Fetch user stats on mount
const [stats, setStats] = useState({ total_completed: 0, by_role: {} });

useEffect(() => {
  if (isAuthenticated) {
    api.get('/assessments/stats/user', token)
      .then(data => setStats(data))
      .catch(() => setStats({ total_completed: 0, by_role: {} }));
  }
}, [isAuthenticated, token]);
```

---

### Design System

#### Colors
```css
/* Primary */
--primary: #3B82F6;      /* Blue - CTAs, links */
--primary-dark: #2563EB;
--primary-light: #93C5FD;

/* Success/Progress */
--success: #10B981;      /* Green - completed states */
--warning: #F59E0B;      /* Orange - in-progress */
--error: #EF4444;        /* Red - errors */

/* Neutrals */
--gray-50: #F9FAFB;
--gray-100: #F3F4F6;
--gray-500: #6B7280;
--gray-900: #111827;

/* Text */
--text-primary: #111827;
--text-secondary: #6B7280;
```

#### Typography
```css
/* Headings */
h1 { font-size: 2rem; font-weight: 700; }
h2 { font-size: 1.5rem; font-weight: 600; }
h3 { font-size: 1.25rem; font-weight: 600; }

/* Body */
body { font-size: 1rem; line-height: 1.5; }
.small { font-size: 0.875rem; }
```

#### Components

**Button States:**
```css
.btn-primary {
  background: var(--primary);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
}

.btn-primary:hover {
  background: var(--primary-dark);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Progress Bar:**
```html
<div class="progress-bar">
  <div class="progress-fill" style="width: 66%"></div>
</div>
```

**Course Card:**
```html
<!-- Course recommendation card with clickable link -->
<div class="course-card">
  <h3>Course Title</h3>
  <div class="metadata">
    <span class="rating">⭐ 4.5 (137 reviews)</span>
    <span class="price">$75</span>
    <span class="enrolled">16,731 enrolled</span>
  </div>
  <p class="match-reason">Matches: node, api</p>
  
  <!-- IMPORTANT: Use course_url from API response -->
  <a 
    href="https://www.udemy.com/course-slug/" 
    target="_blank" 
    rel="noopener noreferrer"
    class="btn-primary"
  >
    View Course →
  </a>
</div>

<style>
.course-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  transition: box-shadow 0.2s;
}
.course-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.course-card h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 8px;
}
.metadata {
  display: flex;
  gap: 12px;
  font-size: 0.875rem;
  color: #6b7280;
}
.match-reason {
  font-size: 0.875rem;
  color: #2563eb;
  font-style: italic;
  margin: 8px 0;
}
</style>
```

### Responsive Design

**Breakpoints:**
```css
/* Mobile first */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
```

**Mobile Considerations:**
- Stack questions vertically
- Large touch targets (min 44px)
- Fixed navigation bar
- Swipe gestures for next/previous

---

## Data Models

### Assessment
```typescript
interface Assessment {
  assessment_id: string;
  owner_id: string;
  role_slug: string;
  status: 'draft' | 'in_progress' | 'submitted' | 'completed' | 'failed';
  expires_at: string; // ISO 8601
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
```

### Question
```typescript
interface Question {
  id: string;
  sequence: number;
  question_type: 'theoretical' | 'essay' | 'profile';
  prompt: string;
  metadata: {
    dimension: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  };
  response: Response | null;
}
```

### Response
```typescript
interface Response {
  question_id: string;
  answer_text: string;
  selected_option_id: string | null;
}
```

### Recommendation
```typescript
interface Recommendation {
  rank: number;
  course_id: string;
  course_title: string;
  course_url: string;
  relevance_score: number;
  match_reason: string;
  metadata: {
    subject: string;
    level: string;
    num_subscribers: string;
    num_reviews: string;
    is_paid: string;
    price: string;
  };
}
```

### Score Breakdown
```typescript
interface ScoreBreakdown {
  theoretical: {
    score: number;
    max: number;
    percentage: number;
  };
  profile: {
    score: number;
    max: number;
    percentage: number;
  };
  essay: {
    score: number;
    max: number;
    percentage: number;
  };
  overall: {
    score: number;
    percentage: number;
  };
}
```

---

## Error Handling

### HTTP Status Codes
```
200 OK              - Success
201 Created         - Resource created
204 No Content      - Success with no body (DELETE)
400 Bad Request     - Invalid input
401 Unauthorized    - Missing/invalid token
403 Forbidden       - Insufficient permissions
404 Not Found       - Resource doesn't exist
409 Conflict        - Duplicate resource
422 Unprocessable   - Validation error
500 Server Error    - Internal error
```

### Error Response Format
```json
{
  "detail": "Error message here"
}
```

### Common Errors

#### 1. Authentication Failed
```json
{
  "detail": "Could not validate credentials"
}
```

**UI Action:** Redirect to login

#### 2. Assessment Not Found
```json
{
  "detail": "Assessment 550e8400-... not found"
}
```

**UI Action:** Show error message, redirect to home

#### 3. Permission Denied
```json
{
  "detail": "Insufficient permissions"
}
```

**UI Action:** Show "Access Denied" page

#### 4. Duplicate Sequence
```json
{
  "detail": "Question with sequence 1 already exists for backend-engineer"
}
```

**UI Action:** Show validation error in form

### Error Handling Pattern
```javascript
const handleApiError = (error, response) => {
  if (response.status === 401) {
    // Redirect to login
    window.location.href = '/login';
  } else if (response.status === 404) {
    // Show not found message
    showToast('Resource not found', 'error');
  } else if (response.status === 500) {
    // Show generic error
    showToast('Something went wrong. Please try again.', 'error');
  } else {
    // Show specific error message
    const data = await response.json();
    showToast(data.detail, 'error');
  }
};
```

---

## Testing Guide

### Manual Testing Checklist

#### Student Flow
- [ ] Can select a track
- [ ] Can start assessment
- [ ] Can answer all questions
- [ ] Answers saved to localStorage
- [ ] Can navigate prev/next
- [ ] Can submit assessment
- [ ] Progress bar updates correctly
- [ ] Results display correctly
- [ ] Can submit feedback
- [ ] Cannot access other user's results

#### Admin Flow
- [ ] Can view tracks list
- [ ] Can create new track
- [ ] Can edit track
- [ ] Can delete track (soft)
- [ ] Can view questions list
- [ ] Can filter questions by role
- [ ] Can create new question
- [ ] Can edit question (versioning works)
- [ ] Can delete question (soft)

### API Testing with cURL

**Note:** Use `BASE_URL=http://localhost:8000` for local development, or `BASE_URL=https://microcred-api.onrender.com` for production.

#### Health Check
```bash
# Production
curl https://microcred-api.onrender.com/health

# Local
curl http://localhost:8000/health
```

#### Start Assessment
```bash
BASE_URL="https://microcred-api.onrender.com"  # or http://localhost:8000
TOKEN="your_student_token"

curl -X POST $BASE_URL/assessments/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role_slug": "backend-engineer"}'
```

#### Submit Assessment
```bash
ASSESSMENT_ID="550e8400-e29b-41d4-a716-446655440000"

curl -X POST $BASE_URL/assessments/$ASSESSMENT_ID/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "responses": [
      {
        "question_id": "q1-uuid",
        "answer_text": "REST API uses HTTP methods...",
        "selected_option_id": null
      }
    ]
  }'
```

#### Check Status
```bash
curl $BASE_URL/assessments/$ASSESSMENT_ID/status \
  -H "Authorization: Bearer $TOKEN"
```

#### Get Results
```bash
curl $BASE_URL/assessments/$ASSESSMENT_ID/result \
  -H "Authorization: Bearer $TOKEN"
```

### Testing with Postman

1. **Import Collection:**
   - Create collection "MicroCred API"
   - Add environment variables:
     - `base_url`: http://localhost:8000
     - `student_token`: (your token)
     - `admin_token`: (your token)

2. **Create Requests:**
   - GET {{base_url}}/tracks
   - POST {{base_url}}/assessments/start
   - GET {{base_url}}/assessments/{{assessment_id}}/status
   - GET {{base_url}}/assessments/{{assessment_id}}/result

3. **Set Auth:**
   - Authorization tab → Bearer Token
   - Token: {{student_token}}

---

## Best Practices

### Performance
- **Polling Interval:** 2-3 seconds (don't poll too frequently)
- **Cache Tracks:** Store in localStorage for 1 hour
- **Lazy Load:** Load results only when needed
- **Debounce:** Search inputs (300ms)

### Security
- **Store Token Securely:** Use httpOnly cookies if possible
- **Validate Input:** Client-side validation before submit
- **Sanitize Output:** Escape HTML in user content
- **HTTPS Only:** Production must use HTTPS

### UX
- **Loading States:** Show spinners during API calls
- **Error Messages:** Clear, actionable error messages
- **Auto-save:** Save answers periodically
- **Confirmation:** Confirm before destructive actions
- **Feedback:** Show success/error toasts

### Accessibility
- **Keyboard Navigation:** Tab order, Enter to submit
- **Screen Readers:** ARIA labels on interactive elements
- **Color Contrast:** WCAG AA compliance (4.5:1 ratio)
- **Focus Indicators:** Visible focus states

---

## Next Steps

### Phase 1: Core Student Experience
1. Implement track selection page
2. Build assessment form with navigation
3. Add progress tracking and polling
4. Display results with recommendations
5. Add feedback form

### Phase 2: Admin Panel
1. Track management CRUD
2. Question management CRUD
3. Analytics dashboard
4. User management

### Phase 3: Enhancements
1. Real-time notifications (WebSocket)
2. PDF export for results
3. Social sharing
4. Course wishlist
5. Multi-language support

---

## Deployment

### Deployment Options

| Platform | Best For | Free Tier | Auto-Deploy | Custom Domain |
|----------|----------|-----------|-------------|---------------|
| **Vercel** ⭐ | Next.js, React | ✅ Yes | ✅ Yes | ✅ Yes |
| **Netlify** | Static/SPA | ✅ Yes | ✅ Yes | ✅ Yes |
| **Cloudflare Pages** | Static sites | ✅ Yes | ✅ Yes | ✅ Yes |
| **Render** | Any static | ✅ Yes | ✅ Yes | ✅ Yes |

**Recommendation: Vercel** - optimal untuk Next.js, gratis, mudah setup.

### Deploy to Vercel (Recommended)

#### Step 1: Push to GitHub
```bash
cd microcred-frontend
git init
git add .
git commit -m "Initial commit"
gh repo create microcred-frontend --public --push
# atau manual push ke GitHub
```

#### Step 2: Connect to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (first time - will prompt for settings)
vercel

# Deploy to production
vercel --prod
```

#### Step 3: Set Environment Variables
Di Vercel Dashboard (vercel.com):
1. Go to Project → Settings → Environment Variables
2. Add:
   ```
   NEXT_PUBLIC_API_URL = https://microcred-api.onrender.com
   ```
3. Redeploy untuk apply changes

#### Alternative: Via Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import from GitHub
4. Select `microcred-frontend` repo
5. Configure:
   - Framework: Next.js (auto-detected)
   - Environment Variables: Add `NEXT_PUBLIC_API_URL`
6. Click "Deploy"

### Deploy to Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Login
netlify login

# Build
npm run build

# Deploy
netlify deploy --prod --dir=.next
# atau untuk React/Vite:
netlify deploy --prod --dir=dist
```

### Production Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCTION SETUP                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Frontend (Vercel)              Backend (Render)            │
│   ┌──────────────────┐          ┌──────────────────┐        │
│   │ microcred        │  ──API─► │ microcred-api    │        │
│   │ .vercel.app      │          │ .onrender.com    │        │
│   └──────────────────┘          └──────────────────┘        │
│         │                              │                     │
│         │                              ▼                     │
│         │                       ┌──────────────────┐        │
│         │                       │  PostgreSQL +    │        │
│         │                       │  Redis (Render)  │        │
│         │                       └──────────────────┘        │
│         │                                                    │
│   With custom domain:                                        │
│   microcred.com ─────────────► api.microcred.com            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Custom Domain Setup (Optional)

#### For Frontend (Vercel):
1. Buy domain (Namecheap, Google Domains, dll)
2. Vercel Dashboard → Project → Settings → Domains
3. Add: `microcred.com`
4. Add DNS records as instructed

#### For Backend (Render):
1. Render Dashboard → microcred-api → Settings → Custom Domains
2. Add: `api.microcred.com`
3. Add CNAME record pointing to Render

### Cost Summary

| Service | Plan | Cost |
|---------|------|------|
| Render (Backend + DB + Redis) | Free | $0/month |
| Vercel (Frontend) | Hobby | $0/month |
| Custom Domain | - | ~$10-15/year |
| **Total MVP** | - | **$0/month** |

### Continuous Deployment

Both Vercel and Netlify support auto-deploy on push:

```
git push origin main
    │
    ▼
┌───────────────┐
│ GitHub        │
│ (trigger)     │
└───────┬───────┘
        │
   ┌────┴────┐
   ▼         ▼
┌─────┐  ┌──────┐
│Vercel│  │Render│
│(FE)  │  │(BE)  │
└─────┘  └──────┘
```

### Environment Checklist

Before deploying, ensure:

- [ ] `NEXT_PUBLIC_API_URL` set in Vercel/Netlify
- [ ] CORS configured in backend for your domain
- [ ] API endpoints tested with production URL
- [ ] Error handling for API failures
- [ ] Loading states implemented
- [ ] Mobile responsive tested

---

## Support

### Cara Menggunakan DBeaver untuk Database di Render (Production)

1. **Buka Render Dashboard**
  - Masuk ke https://dashboard.render.com
  - Pilih service PostgreSQL yang digunakan project

2. **Ambil Connection String**
  - Di halaman database, cari bagian **Connection String** (format: `postgres://user:password@host:port/dbname`)
  - Catat host, port, database, user, dan password

3. **Whitelist IP (Jika Perlu)**
  - Beberapa database Render hanya bisa diakses dari IP tertentu
  - Tambahkan IP publik kamu ke daftar allowed IP di pengaturan database Render

4. **Buka DBeaver, buat koneksi baru:**
  - Klik `Database` → `New Database Connection` → pilih **PostgreSQL**
  - Isi:
    - **Host:** (dari connection string, misal: dpg-xxxxxx.render.com)
    - **Port:** (biasanya 5432)
    - **Database:** (nama database, misal: microcred)
    - **Username:** (misal: microcred)
    - **Password:** (dari connection string)

5. **Klik Test Connection**
  - Jika sukses, klik **Finish**

6. **Browse & Query Data**
  - Sama seperti koneksi lokal: expand database, view data, query SQL, dll

**Catatan:**
- Jangan edit data production sembarangan!
- Jika gagal connect, cek whitelist IP dan pastikan database Render dalam kondisi running.

### Cara Menggunakan DBeaver untuk PostgreSQL

1. **Install DBeaver**
  - Download di https://dbeaver.io/download/
  - Install sesuai OS (Windows/Mac/Linux)

2. **Buka DBeaver, klik** `Database` → `New Database Connection`
  - Pilih **PostgreSQL**
  - Klik **Next**

3. **Isi koneksi:**
  - **Host:** `localhost` (atau host Render jika remote)
  - **Port:** `5432`
  - **Database:** `microcred`
  - **Username:** `microcred`
  - **Password:** `postgres-password`
  - (Jika di production, ambil connection string dari Render dashboard)

4. **Klik Test Connection**
  - Jika sukses, klik **Finish**

5. **Browse Data**
  - Expand database di sidebar kiri
  - Buka tabel (misal: `users`, `role_catalog`, `question_template`, dll)
  - Klik kanan → **View Data** untuk melihat isi tabel
  - Bisa juga langsung query SQL: klik kanan database → **SQL Editor**

6. **Tips**
  - Bisa edit data langsung di grid (double click cell)
  - Export/import data (CSV, Excel, SQL dump)
  - Support ER diagram, filter, search, dll

**Catatan:**
- Untuk akses database production (Render), gunakan connection string dari Render dashboard dan pastikan IP kamu di-whitelist jika perlu.
- Jangan edit data production sembarangan!

### Documentation
- **API Docs (Local):** http://localhost:8000/docs (Swagger UI)
- **API Docs (Production):** https://microcred-api.onrender.com/docs
- **Architecture:** `/docs/architecture.md`
- **PRD:** `/docs/prd.md`

### Development (Local)
- **Backend:** FastAPI on port 8000
- **Database:** PostgreSQL on port 5432
- **Redis:** Redis on port 6379
- **Testing:** `poetry run pytest tests/`

### Production (Render)
- **API:** https://microcred-api.onrender.com
- **Database:** PostgreSQL (managed by Render)
- **Redis:** Redis (managed by Render)

### Questions?
Contact the backend team or refer to `/docs/STATUS.md` for current implementation status.

---

**Happy Coding! 🚀**
