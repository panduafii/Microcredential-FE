
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Brain, Clock, Loader2, ShieldCheck, Sparkles, Target, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { clearAssessmentSession, saveAssessmentSession } from "@/lib/assessment-session";
import type { Question } from "@/types/api";

interface Track {
  slug: string;
  name: string;
  description: string;
  question_count: number;
}

// Descriptive track information
const TRACK_INFO: Record<string, { description: string }> = {
  "backend-engineer": {
    description: "Learn API development, database design, microservices, and modern backend technologies such as Docker, Redis, and cloud deployment"
  },
  "data-analyst": {
    description: "Learn data analysis, visualization, SQL, Python for data science, and tools such as Pandas, Tableau, and Power BI"
  },
  "project-manager": {
    description: "Learn project planning, stakeholder alignment, risk mitigation, delivery governance, and strategic leadership"
  },
  "cyber-security": {
    description: "Learn security fundamentals, application and network security, incident response, and security architecture thinking"
  }
};

interface StartAssessmentResponse {
  assessment_id: string;
  status: string;
  expires_at?: string;
  role: {
    slug: string;
    name: string;
    description: string;
    question_count: number;
  };
  questions: Question[];
}

interface UserStats {
  total_completed: number;
  by_role: Record<string, number>;
}

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [confirmTrack, setConfirmTrack] = useState<Track | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Fetch tracks (public)
    api
      .get<{ tracks: Track[] }>("/tracks")
      .then((data) => setTracks(data.tracks))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Fetch user stats only if authenticated (optional)
    // Don't fail if not authenticated - this is public page
    if (typeof window !== 'undefined' && localStorage.getItem('microcred_access_token')) {
      api
        .get<UserStats>("/assessments/stats/user", true)
        .then((data) => setStats(data))
        .catch(() => setStats(null)); // Ignore errors, not critical
    }
  }, [router]);

  const handleStartAssessment = async (track: Track) => {
    // Show confirmation modal
    setConfirmTrack(track);
  };

  const handleConfirmStart = async () => {
    if (!confirmTrack) return;
    
    setStarting(confirmTrack.slug);
    setError(null);

    // Clear any stale expired flags before starting a new assessment
    console.log('[Home] Clearing old session before start...');
    clearAssessmentSession();
    
    console.log('[Home] Starting assessment:', {
      track: confirmTrack.slug,
    });

    try {
      const data = await api.post<StartAssessmentResponse>(
        "/assessments/start",
        { role_slug: confirmTrack.slug },
        true, // requiresAuth = true
      );

      console.log('[Home] Assessment started successfully:', {
        assessment_id: data.assessment_id,
        expires_at: data.expires_at,
        total_questions: data.questions?.length || 0,
        role: data.role?.name,
        question_types: data.questions?.reduce((acc: Record<string, number>, q) => {
          acc[q.question_type] = (acc[q.question_type] || 0) + 1;
          return acc;
        }, {})
      });

      console.log('[Home] Saving to localStorage...');
      const cacheKey = `assessment_${data.assessment_id}`;
      const cacheData = {
        questions: data.questions,
        role: data.role,
        expires_at: data.expires_at,
        started_at: new Date().toISOString(),
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      
      // Verify save
      const savedCheck = localStorage.getItem(cacheKey);
      console.log('[Home] Cache saved verification:', { 
        key: cacheKey,
        saved: !!savedCheck,
        questionsCount: data.questions?.length || 0,
      });

      console.log('[Home] Saving session...');
      saveAssessmentSession({
        id: data.assessment_id,
        expiresAt: data.expires_at ?? null,
        startedAt: new Date().toISOString(),
      });

      console.log('[Home] Navigating to assessment page:', `/assessment/${data.assessment_id}`);
      
      // Small delay to ensure storage is committed before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      router.push(`/assessment/${data.assessment_id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start assessment";
      setError(message);
    } finally {
      setStarting(null);
      setConfirmTrack(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-8">
        {/* Hero Section */}
        <header className="flex flex-col gap-6 items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100">
            <Sparkles className="h-4 w-4" />
            MicroCred AI
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              Find the Right Learning Path
            </h1>
            <p className="mx-auto max-w-3xl text-lg text-slate-300">
              Complete the assessment and our AI will recommend
              courses that match your current skill level
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur text-center">
              <div className="mb-3 mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold text-white">Fast & Efficient</h3>
              <p className="text-sm text-slate-300">10 questions, results in minutes</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur text-center">
              <div className="mb-3 mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold text-white">Personalized</h3>
              <p className="text-sm text-slate-300">Recommendations based on your experience and preferences</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur text-center">
              <div className="mb-3 mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold text-white">AI-Powered</h3>
              <p className="text-sm text-slate-300">Automated scoring powered by GPT & RAG</p>
            </div>
          </div>

          {/* Stats Card */}
          <div className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Available Tracks</p>
              <p className="text-3xl font-bold text-white">{tracks.length || "–"}</p>
              <p className="text-xs text-slate-400">Roles</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Completed Assessments</p>
              <p className="text-3xl font-bold text-white">{stats?.total_completed || 0}</p>
              <p className="text-xs text-slate-400">Total you have completed</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status API</p>
              {loading ? (
                <div className="flex items-center gap-2 text-amber-300">
                  <Clock className="h-5 w-5 animate-pulse" />
                  <span className="text-lg font-semibold">Checking...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="text-lg font-semibold">Connected</span>
                </div>
              )}
              <p className="text-xs text-slate-400">Ready for assessment</p>
            </div>
          </div>
        </header>

        {(loading || starting) && (
          <div className="loading-bar h-1 w-full rounded-full bg-white/20" aria-label="Loading data" />
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((key) => (
              <div
                key={key}
                className="h-40 animate-pulse rounded-xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        ) : (
          <section className="grid gap-6 sm:grid-cols-2">
            {tracks.map((track) => (
              <div
                key={track.slug}
                className="group relative flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl transition hover:-translate-y-1 hover:border-blue-400/50 hover:shadow-blue-900/40"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-blue-100">
                    <Brain className="h-4 w-4" />
                    {track.slug}
                  </div>
                  <h2 className="text-xl font-semibold">{track.name}</h2>
                  <p className="text-sm text-slate-200">
                    {TRACK_INFO[track.slug]?.description || track.description}
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-blue-100">
                    <Clock className="h-4 w-4" />
                    {track.question_count} questions • 15 minutes
                  </div>
                </div>
                <button
                  onClick={() => handleStartAssessment(track)}
                  disabled={!!starting && starting !== track.slug}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {starting === track.slug ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Setting up assessment...
                    </>
                  ) : (
                    <>
                      Start assessment
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Confirmation Modal */}
        {confirmTrack && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-white">Confirm Assessment Start</h2>
                <p className="mt-1 text-sm text-slate-300">{confirmTrack.name}</p>
              </div>

              <div className="space-y-4 rounded-xl bg-blue-500/10 p-4 text-sm text-slate-200">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 flex-shrink-0 text-blue-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Time Limit: 15 Minutes</p>
                    <p className="text-xs text-slate-300">The timer starts when you press &quot;Start Now&quot;</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <BadgeCheck className="h-5 w-5 flex-shrink-0 text-emerald-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">All Questions Must Be Answered</p>
                    <p className="text-xs text-slate-300">You cannot submit if any question is unanswered</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Zap className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Auto-Submit</p>
                    <p className="text-xs text-slate-300">If time runs out, the system will auto-submit answers (including unanswered ones)</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Brain className="h-5 w-5 flex-shrink-0 text-indigo-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">AI-Powered Evaluation</p>
                    <p className="text-xs text-slate-300">
                      Results are based on GPT scoring for essay responses, RAG for course recommendations,
                      and Fusion AI for learning path insights
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setConfirmTrack(null)}
                  disabled={!!starting}
                  className="flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/20 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmStart}
                  disabled={!!starting}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {starting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting...
                    </span>
                  ) : (
                    "Start Now"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
