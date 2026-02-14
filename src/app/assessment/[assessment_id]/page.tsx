"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { saveAssessmentSession } from "@/lib/assessment-session";
import { isAuthenticated } from "@/lib/auth";
import type { Question, QuestionOption } from "@/types/api";
import { ArrowLeft, ArrowRight, BadgeCheck, Clock, Loader2, LogOut, ShieldAlert, Sparkles } from "lucide-react";

interface AssessmentCache {
  questions: Question[];
  role?: { name?: string; slug?: string; description?: string };
  expires_at?: string;
  started_at?: string;
}

interface AssessmentStatus {
  status?: string;
}

function normalizeOptions(options: unknown): QuestionOption[] | undefined {
  if (!options) return undefined;

  if (Array.isArray(options)) {
    if (options.length === 0) return [];
    const first = options[0] as unknown;
    if (first && typeof first === "object" && "id" in (first as object)) {
      return options as QuestionOption[];
    }

    // Array of strings -> map to A, B, C...
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return (options as unknown[]).map((value, index) => ({
      id: letters[index] ?? String(index + 1),
      text: String(value ?? ""),
    }));
  }

  if (typeof options === "object") {
    const entries = Object.entries(options as Record<string, unknown>);
    const keys = entries.map(([key]) => key);

    const allSingleLetters = keys.every((key) => /^[A-Z]$/.test(key));
    const allNumbers = keys.every((key) => /^\d+$/.test(key));

    const sortedEntries = allSingleLetters
      ? [...entries].sort(([a], [b]) => a.charCodeAt(0) - b.charCodeAt(0))
      : allNumbers
        ? [...entries].sort(([a], [b]) => Number(a) - Number(b))
        : entries;

    return sortedEntries.map(([key, value]) => {
      if (value && typeof value === "object" && "text" in (value as object)) {
        return {
          id: key,
          text: String((value as { text?: unknown }).text ?? ""),
        };
      }

      return {
        id: key,
        text: String(value ?? ""),
      };
    });
  }

  return undefined;
}

function normalizeQuestions(items: Question[]): Question[] {
  return items.map((question) => {
    const fallbackOptions =
      question.expected_values?.allow_custom ? undefined : question.expected_values?.accepted_values;

    return {
      ...question,
      options: normalizeOptions(question.options ?? fallbackOptions),
    };
  });
}

function hasSelectableOptions(question: Question): boolean {
  return Array.isArray(question.options) && question.options.length > 0;
}

function isTextAnswerQuestion(question: Question): boolean {
  if (question.question_type === "essay") return true;

  if (question.question_type === "theoretical") {
    return !hasSelectableOptions(question);
  }

  if (question.question_type === "profile") {
    if (question.expected_values?.allow_custom) return true;
    return !hasSelectableOptions(question);
  }

  return false;
}

export default function AssessmentPage() {
  const params = useParams<{ assessment_id: string }>();
  const router = useRouter();
  const assessmentId = Array.isArray(params.assessment_id)
    ? params.assessment_id[0]
    : params.assessment_id;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [role, setRole] = useState<AssessmentCache["role"]>();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!assessmentId) return;

    console.log('[AssessmentPage] useEffect started:', { assessmentId });

    // SECURITY: Always check authentication before loading assessment data
    if (!isAuthenticated()) {
      console.log("[AssessmentPage] Not authenticated, redirecting");
      router.replace("/login");
      return;
    }

    const cached = localStorage.getItem(`assessment_${assessmentId}`);
    
    // Debug: List all assessment keys in localStorage
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('assessment_'));
    console.log('[AssessmentPage] Cache check:', { 
      assessmentId,
      lookingFor: `assessment_${assessmentId}`,
      hasCached: !!cached,
      allAssessmentKeys: allKeys
    });
    
    if (cached) {
      try {
        const parsed: AssessmentCache = JSON.parse(cached);
        
        // Check if cached assessment is already expired (with 5 min grace period)
        if (parsed.expires_at) {
          const now = new Date().getTime();
          const expiry = new Date(parsed.expires_at).getTime();
          const graceMs = 5 * 60 * 1000; // 5 minutes grace
          
          if (now > expiry + graceMs) {
            console.log('[AssessmentPage] Cached assessment is expired beyond grace period:', {
              expires_at: parsed.expires_at,
              now: new Date().toISOString(),
              diff_minutes: Math.round((now - expiry) / 60000)
            });
            // Clear expired cache
            localStorage.removeItem(`assessment_${assessmentId}`);
            localStorage.removeItem(`answers_${assessmentId}`);
            setError("Assessment sudah expired. Silakan mulai ulang dari halaman utama.");
            setLoading(false);
            return;
          }
        }
        
        const normalizedQuestions = normalizeQuestions(parsed.questions || []);
        console.log('[AssessmentPage] Loading assessment from cache:', {
          assessment_id: assessmentId,
          total_questions: normalizedQuestions.length || 0,
          role: parsed.role?.name,
          expires_at: parsed.expires_at,
          question_types: normalizedQuestions.reduce((acc: Record<string, number>, q) => {
            acc[q.question_type] = (acc[q.question_type] || 0) + 1;
            return acc;
          }, {})
        });
        setQuestions(normalizedQuestions);
        setRole(parsed.role);
        if (parsed.expires_at) {
          setExpiresAt(parsed.expires_at);
          console.log('[AssessmentPage] Set expiresAt:', parsed.expires_at);
        }
        console.log('[AssessmentPage] Saving session...');
        saveAssessmentSession({
          id: assessmentId,
          expiresAt: parsed.expires_at ?? null,
          startedAt: parsed.started_at ?? new Date().toISOString(),
        });
        // Persist normalized data to avoid malformed options downstream
        localStorage.setItem(
          `assessment_${assessmentId}`,
          JSON.stringify({
            ...parsed,
            questions: normalizedQuestions,
          }),
        );
        console.log('[AssessmentPage] Cache loaded successfully');
      } catch (e) {
        console.log('[AssessmentPage] Cache parse error:', e);
        setError("Gagal membaca data assessment lokal. Mulai ulang assessment.");
      }
    } else {
      console.log('[AssessmentPage] No cache found, setting error');
      setError("Data assessment tidak ditemukan. Mulai lagi dari halaman utama.");
    }

    const savedAnswers = localStorage.getItem(`answers_${assessmentId}`);
    if (savedAnswers) setAnswers(JSON.parse(savedAnswers));

    // Jika user refresh di tengah jalan, cek status untuk redirect otomatis
    // Note: We IGNORE errors here - let user proceed with cached data
    console.log('[AssessmentPage] Calling status API...');
    api
      .get<AssessmentStatus>(`/assessments/${assessmentId}/status`, true)
      .then((status) => {
        console.log('[AssessmentPage] Status response:', status);
        if (status?.status === "submitted") {
          router.replace(`/assessment/${assessmentId}/processing`);
          return;
        }
        if (status?.status === "completed") {
          router.replace(`/assessment/${assessmentId}/result`);
          return;
        }
        console.log('[AssessmentPage] Status OK, setting loading=false');
        setLoading(false);
      })
      .catch((err) => {
        // Ignore ALL errors on status check - let user proceed with cached data
        console.log('[AssessmentPage] Status error (ignored):', err);
        setLoading(false);
      });
  }, [assessmentId, router]);

  // Browser back protection and beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Progress akan hilang. Keluar dari tes?";
    };

    const handlePopState = () => {
      // Push state back to prevent navigation
      window.history.pushState(null, "", window.location.href);
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

  // Timer countdown effect
  useEffect(() => {
    if (!expiresAt || error) {
      console.log('[AssessmentPage] Timer skipped:', { expiresAt, hasError: !!error });
      return;
    }

    console.log('[AssessmentPage] Timer started with expiresAt:', expiresAt);

    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        // Timer expired, check grace period (5 minutes)
        const graceTime = Math.abs(diff);
        console.log('[AssessmentPage] Timer expired:', {
          expiresAt,
          graceTime_minutes: Math.round(graceTime / 60000),
          withinGrace: graceTime < 5 * 60 * 1000
        });
        if (graceTime < 5 * 60 * 1000) {
          // Within grace period - show warning
          setTimeRemaining("Waktu habis! Submitting...");
        } else {
          // Grace period over - force submit (allow empty answers)
          console.log('[AssessmentPage] Timer triggering auto-submit (grace period exceeded)');
          setTimeRemaining("Submitting...");
          handleSubmit(true);
        }
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeRemaining(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  // handleSubmit intentionally excluded to keep timer interval stable while typing answers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, error]);

  useEffect(() => {
    if (!assessmentId) return;
    localStorage.setItem(`answers_${assessmentId}`, JSON.stringify(answers));
  }, [answers, assessmentId]);

  const totalQuestions = questions.length;
  const progress = useMemo(
    () => (totalQuestions ? Math.round(((current + 1) / totalQuestions) * 100) : 0),
    [current, totalQuestions],
  );
  const currentQuestion = questions[current];
  const currentHasOptions = currentQuestion ? hasSelectableOptions(currentQuestion) : false;
  const currentIsTextAnswer = currentQuestion ? isTextAnswerQuestion(currentQuestion) : false;
  const isCustomProfile =
    currentQuestion?.question_type === "profile" &&
    currentQuestion.expected_values?.allow_custom;
  const isOptionQuestion =
    !!currentQuestion &&
    !currentIsTextAnswer &&
    (currentQuestion.question_type === "theoretical" ||
      currentQuestion.question_type === "profile") &&
    currentHasOptions;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!currentQuestion) return;
    setAnswers({ ...answers, [currentQuestion.id]: e.target.value });
  };

  const handleOptionSelect = (optionId: string) => {
    if (!currentQuestion) return;
    setAnswers({ ...answers, [currentQuestion.id]: optionId });
  };

  const handlePrev = () => setCurrent((c) => Math.max(0, c - 1));
  const handleNext = () => setCurrent((c) => Math.min(totalQuestions - 1, c + 1));

  const handleExit = async () => {
    if (!window.confirm("Yakin ingin keluar? Progress akan hilang dan tidak bisa dikembalikan.")) return;
    
    setExiting(true);
    try {
      await api.delete(`/assessments/${assessmentId}/abandon`, true);
      localStorage.removeItem(`assessment_${assessmentId}`);
      localStorage.removeItem(`answers_${assessmentId}`);
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal keluar dari assessment";
      alert(message);
      setExiting(false);
    }
  };

  const handleSubmit = async (isAutoSubmit = false) => {
    console.log('[AssessmentPage] handleSubmit called:', { isAutoSubmit, submitting, hasError: !!error });
    
    // Prevent submit if already submitting or there's an error
    if (submitting || error) {
      console.log('[AssessmentPage] Submit blocked:', { submitting, error });
      return;
    }

    // Check if all questions are answered (unless auto-submit)
    if (!isAutoSubmit) {
      const unansweredQuestions = questions.filter(q => !answers[q.id]);
      if (unansweredQuestions.length > 0) {
        const questionNumbers = unansweredQuestions.map(q => `Q${q.sequence}`).join(', ');
        alert(`Mohon jawab semua soal terlebih dahulu!\n\nSoal yang belum dijawab: ${questionNumbers} (${unansweredQuestions.length} soal)`);
        return;
      }
      if (!window.confirm("Yakin ingin submit jawaban? Setelah submit tidak bisa diubah.")) return;
    }
    setSubmitting(true);
    setError(null);
    try {
      console.log('[AssessmentPage] Preparing submit payload...');
      const responses = questions.map((question) => {
        const answer = answers[question.id];

        if (isTextAnswerQuestion(question)) {
          return {
            question_id: question.id,
            answer_text: answer || "",
            selected_option_id: null,
          };
        }

        return {
          question_id: question.id,
          answer_text: null,
          selected_option_id: answer || null,
        };
      });
      console.log('[AssessmentPage] Calling submit API...');
      await api.post<unknown>(`/assessments/${assessmentId}/submit`, { responses }, true);
      console.log('[AssessmentPage] Submit successful!');
      localStorage.removeItem(`answers_${assessmentId}`);
      router.push(`/assessment/${assessmentId}/processing`);
    } catch (err: unknown) {
      console.log('[AssessmentPage] Submit error:', err);
      if (err instanceof ApiError && err.status === 410) {
        console.log('[AssessmentPage] 410 error - assessment expired');
        localStorage.removeItem(`assessment_${assessmentId}`);
        localStorage.removeItem(`answers_${assessmentId}`);
        setQuestions([]); // Clear questions to prevent further attempts
        setError("Assessment sudah tidak tersedia atau telah expired. Silakan mulai ulang dari halaman utama.");
        return;
      }
      const message = err instanceof Error ? err.message : "Gagal submit assessment";
      console.log('[AssessmentPage] Setting error:', message);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
        <div className="mx-auto h-40 max-w-5xl animate-pulse rounded-2xl bg-white/10" />
      </main>
    );
  }

  if (error) {
    console.log('[AssessmentPage] Rendering error state:', error);
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <ShieldAlert className="h-5 w-5" />
          <p>{error}</p>
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke halaman utama
          </button>
        </div>
      </main>
    );
  }

  if (!questions.length || !currentQuestion) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
        <div className="mx-auto rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 max-w-3xl">
          Pertanyaan tidak ditemukan. Silakan mulai assessment lagi.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-50">
      <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-blue-300">Assessment</p>
          <h1 className="text-2xl font-bold text-white">
            {role?.name || "Track"} — Question {current + 1} dari {totalQuestions}
          </h1>
          <p className="text-sm text-slate-300">
            Jawaban disimpan otomatis di perangkat kamu. Submit setelah semua selesai.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExit}
            disabled={submitting || exiting}
            className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {exiting ? "Keluar..." : "Keluar"}
          </button>
          {timeRemaining && (
            <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${
              timeRemaining.startsWith('Auto-submit') || timeRemaining.startsWith('Submitting') ? 'bg-red-500/20 text-red-300' :
              timeRemaining.split(':')[0] && parseInt(timeRemaining.split(':')[0]) < 5 ? 'bg-amber-500/20 text-amber-300' :
              'bg-blue-500/20 text-blue-300'
            }`}>
              <Clock className="h-4 w-4" />
              {timeRemaining}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300">
            <BadgeCheck className="h-4 w-4" />
            Auto-save aktif
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
        <aside className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-blue-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="space-y-1 text-xs text-slate-300">
            {questions.map((question, index) => {
              const isAnswered = !!answers[question.id];
              const isCurrent = index === current;
              return (
              <button
                key={question.id}
                onClick={() => setCurrent(index)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-white/10 ${
                  isCurrent ? "bg-blue-500/20 text-blue-300 font-semibold" : 
                  isAnswered ? "bg-emerald-500/20 text-emerald-300" : ""
                }`}
              >
                <span className="truncate">
                  Q{question.sequence}: {question.question_type}
                </span>
                <span className="text-[10px] uppercase text-slate-500">
                  {question.metadata?.dimension}
                </span>
              </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span className="rounded-full bg-blue-500/20 px-3 py-1 font-semibold text-blue-300">
              {currentQuestion.question_type}
            </span>
            {currentQuestion.metadata?.dimension && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">
                {currentQuestion.metadata.dimension}
              </span>
            )}
            {currentQuestion.metadata?.difficulty && (
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-300">
                {currentQuestion.metadata.difficulty}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">{currentQuestion.prompt}</p>
            <p className="text-sm text-slate-300">
              Berikan jawaban sejelas mungkin. Kamu bisa kembali kapan saja sebelum submit.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              {currentIsTextAnswer ? "Jawaban kamu" : "Pilih jawaban"}
            </label>
            
            {/* Essay Question */}
            {currentQuestion.question_type === 'essay' && (
              <>
                <textarea
                  className="min-h-[160px] w-full rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                  value={answers[currentQuestion.id] || ""}
                  onChange={handleTextChange}
                  placeholder="Tulis jawaban kamu di sini..."
                />
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  Jawaban tersimpan otomatis.
                </p>
              </>
            )}
            
            {/* Profile Question with Custom Input (Q8 - Tech Preferences) */}
            {currentQuestion.question_type === 'profile' && 
             currentQuestion.expected_values?.allow_custom && 
             currentQuestion.expected_values?.type !== 'compound' && (
              <div className="space-y-4">
                {/* Suggestion chips */}
                {currentQuestion.expected_values.accepted_values && currentQuestion.expected_values.accepted_values.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">💡 Quick picks (klik untuk menambahkan):</p>
                    <div className="flex flex-wrap gap-2">
                      {currentQuestion.expected_values.accepted_values.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            const current = answers[currentQuestion.id] || "";
                            const items = current ? current.split(',').map(v => v.trim()) : [];
                            if (!items.includes(suggestion)) {
                              const updated = [...items, suggestion].filter(Boolean).join(', ');
                              setAnswers({ ...answers, [currentQuestion.id]: updated });
                            }
                          }}
                          className="rounded-full bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-blue-500/30 hover:text-blue-100"
                        >
                          + {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom text input */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Teknologi/tools yang ingin dipelajari (pisahkan dengan koma):
                  </label>
                  <textarea
                    className="min-h-[100px] w-full rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    value={answers[currentQuestion.id] || ""}
                    onChange={handleTextChange}
                    placeholder="Contoh: Docker, Kubernetes, GraphQL, Redis"
                  />
                  <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
                    <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-400" />
                    <span>Kamu bisa menambahkan teknologi custom yang tidak ada di suggestions. Jawaban tersimpan otomatis.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Theoretical/Profile without options -> Text Answer */}
            {currentIsTextAnswer &&
              currentQuestion.question_type !== "essay" &&
              !isCustomProfile && (
                <>
                  <textarea
                    className="min-h-[160px] w-full rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                    value={answers[currentQuestion.id] || ""}
                    onChange={handleTextChange}
                    placeholder="Tulis jawaban kamu di sini..."
                  />
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    Jawaban tersimpan otomatis.
                  </p>
                </>
              )}
            
            {/* Regular Profile & Theoretical Questions (Multiple Choice) */}
            {isOptionQuestion && currentQuestion.options && (
              <div className="space-y-2">
                {currentQuestion.options.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleOptionSelect(option.id)}
                    className={`w-full rounded-xl border p-4 text-left text-sm transition ${
                      answers[currentQuestion.id] === option.id
                        ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <span className="font-semibold">{option.id}.</span> {option.text}
                  </button>
                ))}
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  Pilihan tersimpan otomatis.
                </p>
              </div>
            )}

            {/* Fallback for malformed questions */}
            {!currentIsTextAnswer && !isOptionQuestion && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                ⚠️ Format soal tidak valid. Silakan laporkan masalah ini.
                <pre className="mt-2 text-xs overflow-auto">
                  {JSON.stringify({ 
                    type: currentQuestion.question_type,
                    hasOptions: !!currentQuestion.options,
                    optionsType: typeof currentQuestion.options,
                    hasCompound: currentQuestion.expected_values?.type === 'compound'
                  }, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/20 disabled:opacity-50"
              onClick={handlePrev}
              disabled={current === 0 || submitting}
            >
              <ArrowLeft className="h-4 w-4" />
              Pertanyaan sebelumnya
            </button>
            {current < totalQuestions - 1 ? (
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-700 disabled:opacity-50"
                onClick={handleNext}
                disabled={submitting}
              >
                Pertanyaan berikutnya
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => handleSubmit(false)}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Mengirim jawaban...
                  </>
                ) : (
                  <>
                    Submit assessment
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
        </section>
      </div>
      </div>
    </main>
  );
}
