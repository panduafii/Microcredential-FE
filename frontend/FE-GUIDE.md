# Frontend Development Guide
**MicroCred AI-Powered Assessment Platform**

Version: 1.1  
Last Updated: December 30, 2025

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

Akun User (Student):

Email: user1@demo.com
Password: User123!
Full Name: User Satu
Role: student
Akun Admin:

Email: admin1@demo.com
Password: Admin123!
Full Name: Admin Satu
Role: admin
Silakan gunakan data di atas pada halaman register, lalu login sesuai role yang diinginkan.

--

## Overview

### System Purpose
Platform untuk assessment skills dengan AI-powered recommendations. Menggunakan:
- **GPT** untuk scoring essay responses
- **RAG (Retrieval-Augmented Generation)** untuk course recommendations
- **Fusion Service** untuk generate summary dan insights

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

**Question Types:**
- `theoretical` - Multiple choice or short answer (100 points)
- `essay` - Long-form answer, GPT scored (100 points)
- `profile` - Experience/background questions (100 points)

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
      "prompt": "Jelaskan perbedaan REST API dan GraphQL...",
      "metadata": {"dimension": "api-design"},
      "response": null
    },
    {
      "id": "q2-uuid",
      "sequence": 2,
      "question_type": "theoretical",
      "prompt": "Apa yang dimaksud dengan database indexing?",
      "metadata": {"dimension": "database"},
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
      "answer_text": "REST API uses HTTP methods...",
      "selected_option_id": null
    },
    {
      "question_id": "q2-uuid",
      "answer_text": "Database indexing creates data structures...",
      "selected_option_id": null
    }
  ]
}
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

#### 4. Get Results
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

#### 5. Submit Feedback
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
- Estimated time: 30-45 minutes

#### 2. Take Assessment
```
┌──────────────────┐
│ Question 1 of 10 │
├──────────────────┤
│ [Progress Bar]   │
├──────────────────┤
│ Question text... │
│                  │
│ [Answer input]   │
│                  │
│ [< Prev] [Next >]│
└──────────────────┘
```

**UI Requirements:**
- Progress indicator (1/10, 2/10, etc.)
- Save answers to localStorage (auto-save)
- Navigation: Previous/Next buttons
- Submit button on last question
- Confirmation dialog before submit

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
│    [View Course]       │
│                        │
│ [Submit Feedback]      │
└────────────────────────┘
```

**UI Requirements:**
- Score visualization (donut chart/gauge)
- Expandable sections
- Course cards with metadata
- Feedback form (ratings + comment)
- Share/Download results button

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
<div class="course-card">
  <h3>Course Title</h3>
  <div class="metadata">
    <span class="rating">⭐ 4.5 (137)</span>
    <span class="price">$75</span>
  </div>
  <p class="match-reason">Matches: node, api</p>
  <a href="..." class="btn-primary">View Course</a>
</div>
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
