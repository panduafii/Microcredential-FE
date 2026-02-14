"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, isAuthenticated } from "@/lib/auth";
import type {
  LearningPathKey,
  LearningPathsTrace,
  RagTraces,
  Recommendation,
  ScoreBreakdown,
} from "@/types/api";
import { ArrowLeft, BookOpen, CheckCircle2, Home, Loader2, Mail, Send, Sparkles, TrendingUp } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ResultResponse {
  assessment_id: string;
  status: string;
  summary: string;
  overall_score: number;
  score_breakdown: ScoreBreakdown;
  recommendations: Recommendation[];
  rag_traces?: RagTraces | null;
  completed_at?: string;
}

interface RecommendationSplit {
  mode: "single-path" | "two-path";
  mandatory: Recommendation[];
  target: Recommendation[];
  note?: string;
}

function splitRecommendationPaths(
  recommendations: Recommendation[],
  learningPaths?: LearningPathsTrace | null,
): RecommendationSplit {
  const mode = learningPaths?.mode ?? "single-path";

  const mandatory: Recommendation[] = [];
  const target: Recommendation[] = [];

  for (const item of recommendations) {
    const path: LearningPathKey = item.metadata?.learning_path ?? "target_path";
    if (path === "mandatory_foundation") {
      mandatory.push(item);
    } else {
      target.push(item);
    }
  }

  if (mode === "single-path") {
    return {
      mode,
      mandatory: [],
      target: recommendations,
      note: learningPaths?.note,
    };
  }

  return {
    mode,
    mandatory,
    target,
    note: learningPaths?.note,
  };
}

export default function ResultPage() {
  const params = useParams<{ assessment_id: string }>();
  const router = useRouter();
  const assessmentId = Array.isArray(params.assessment_id)
    ? params.assessment_id[0]
    : params.assessment_id;

  const [result, setResult] = useState<ResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState({
    rating_relevance: 0,
    rating_acceptance: 0,
    comment: "",
  });
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailToast, setEmailToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (!emailToast) return;
    const timer = window.setTimeout(() => setEmailToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [emailToast]);

  useEffect(() => {
    // SECURITY: Always check authentication before loading result data
    if (!isAuthenticated()) {
      console.log("[Result] Not authenticated, redirecting");
      router.replace("/login");
      return;
    }

    api
      .get<ResultResponse>(`/assessments/${assessmentId}/result`, true)
      .then((data) => {
        console.log('Result data:', {
          assessment_id: data.assessment_id,
          overall_score: data.overall_score,
          score_breakdown: data.score_breakdown,
          summary_preview: data.summary?.substring(0, 200)
        });
        setResult(data);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          if (err.status === 410) {
            setError("Assessment is no longer available or has expired.");
            return;
          }

          // Result is not ready yet - return to processing page
          if (err.status === 503 || err.status === 409) {
            setError("Assessment result is not ready yet. Redirecting to processing page...");
            window.setTimeout(() => {
              router.replace(`/assessment/${assessmentId}/processing`);
            }, 1200);
            return;
          }
        }

        setError(err instanceof Error ? err.message : "Failed to load results");
      })
      .finally(() => setLoading(false));
  }, [assessmentId, router]);

  // Parse markdown-style formatting from GPT summary
  const renderMarkdown = (text: string) => {
    let html = '';
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) {
        html += '<div class="h-3"></div>'; // Spacing for empty lines
        continue;
      }
      
      // Bold: **text**
      line = line.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
      
      // Italic/emphasis: _text_
      line = line.replace(/_([^_]+)_/g, '<em class="italic text-blue-300">$1</em>');
      
      // Numbered list: 1. text
      if (/^\d+\.\s+/.test(line)) {
        const match = line.match(/^(\d+)\.\s+(.+)$/);
        if (match) {
          html += `<div class="flex gap-3 mb-2 mt-4">
            <span class="font-semibold text-blue-400 text-base" style="min-width: 1.5rem;">${match[1]}.</span>
            <span class="text-base text-white leading-relaxed">${match[2]}</span>
          </div>`;
        }
      }
      // Bullet points: - text or * text or • text (with indent under numbered items)
      else if (/^[\-\*•]\s+/.test(line)) {
        const match = line.match(/^[\-\*•]\s+(.+)$/);
        if (match) {
          html += `<div class="flex gap-2 mb-1.5" style="margin-left: 2.5rem;">
            <span class="text-blue-400 text-xs mt-1">•</span>
            <span class="text-sm text-slate-300 leading-relaxed">${match[1]}</span>
          </div>`;
        }
      }
      // Headings or bold standalone text
      else if (line.includes('**')) {
        html += `<p class="mb-3 mt-4 text-base font-semibold text-white leading-relaxed">${line}</p>`;
      }
      // Regular paragraph
      else {
        html += `<p class="mb-3 text-sm text-slate-200 leading-relaxed">${line}</p>`;
      }
    }
    
    return html;
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingFeedback(true);
    try {
      await api.post(
        `/assessments/${assessmentId}/feedback`,
        {
          rating_relevance: Number(feedback.rating_relevance),
          rating_acceptance: Number(feedback.rating_acceptance),
          comment: feedback.comment,
        },
        true,
      );
      setFeedbackSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send feedback";
      setError(message);
    } finally {
      setSendingFeedback(false);
    }
  };

  const handleSendToEmail = async () => {
    const token = getAccessToken();
    if (!token) {
      setEmailToast({
        message: "You must be logged in to send email.",
        variant: "error",
      });
      return;
    }

    if (!result?.assessment_id) {
      setEmailToast({
        message: "Assessment not found.",
        variant: "error",
      });
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch(
        `${API_URL}/assessments/${result.assessment_id}/email-summary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        let message = "An error occurred. Please try again.";
        if (response.status === 409) {
          message = "Result is not ready yet, please try again shortly";
        } else if (response.status === 400) {
          message = "User email is not available";
        } else if (response.status === 403 || response.status === 404) {
          message = "No access / assessment not found";
        } else if (response.status === 502) {
          message = "Failed to send email, please try again";
        }
        setEmailToast({ message, variant: "error" });
        return;
      }

      const data = (await response.json()) as {
        assessment_id: string;
        to_email: string;
        resend_id: string;
        sent_at: string;
      };
      setEmailToast({
        message: `Email sent to ${data.to_email}`,
        variant: "success",
      });
    } catch {
      const message = "An error occurred. Please try again.";
      setEmailToast({ message, variant: "error" });
    } finally {
      setSendingEmail(false);
    }
  };

  const recommendationSplit = useMemo(
    () =>
      splitRecommendationPaths(
        result?.recommendations ?? [],
        result?.rag_traces?.readiness?.learning_paths,
      ),
    [result?.recommendations, result?.rag_traces?.readiness?.learning_paths],
  );

  if (loading) {
    return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
      <div className="mx-auto h-40 max-w-5xl animate-pulse rounded-2xl bg-white/10" />
    </main>
  );
}

if (error) {
  return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <p>{error}</p>
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home page
          </button>
        </div>
      </main>
  );
}

if (!result) return null;

  const breakdown = result.score_breakdown;
  const scoreBadges = [
    { label: "Theoretical", value: breakdown.theoretical.percentage },
    { label: "Essay", value: breakdown.essay.percentage },
  ];

  const renderRecommendationCard = (rec: Recommendation) => (
    <div
      key={rec.course_id}
      className="flex h-full flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 text-slate-50"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span>Rank #{rec.rank}</span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-emerald-100">
            {Math.round(rec.relevance_score * 100)}% match
          </span>
        </div>
        <h4 className="text-lg font-semibold text-white">{rec.course_title}</h4>
        <p className="text-xs text-slate-300">{rec.match_reason || "-"}</p>
        <div className="text-xs text-slate-400">
          Level: {rec.metadata?.level || "-"} • {rec.metadata?.num_reviews || "0"} reviews •{" "}
          {rec.metadata?.num_subscribers || "0"} enrolled
        </div>
      </div>
      {rec.course_url ? (
        <a
          href={rec.course_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-200 hover:text-blue-100"
        >
          View course
            <ArrowLeft className="h-4 w-4 rotate-180" />
          </a>
        ) : (
          <span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
          Course URL not available
          </span>
        )}
    </div>
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12 text-slate-50">
      {emailToast && (
        <div
          role={emailToast.variant === "error" ? "alert" : "status"}
          className={`fixed bottom-6 right-6 z-50 max-w-xs rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
            emailToast.variant === "success"
              ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-100"
              : "border-red-500/40 bg-red-500/20 text-red-100"
          }`}
        >
          {emailToast.message}
        </div>
      )}
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-blue-900/40 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.15em] text-blue-100">Assessment completed</p>
            <h1 className="text-3xl font-bold text-white">Your assessment results</h1>
            <p className="text-sm text-slate-200">
              GPT summary, score breakdown, and course recommendations from the RAG & Fusion service.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push("/")}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-2 text-xs font-semibold text-slate-50 transition hover:bg-white/20"
              >
                <Home className="h-4 w-4" />
                Back to Home
              </button>
              <button
                onClick={handleSendToEmail}
                disabled={sendingEmail}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-600 disabled:opacity-60"
              >
                {sendingEmail ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Send to Email
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            {result.status === "completed" ? "Completed" : result.status}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-blue-900/30 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-100">
                <TrendingUp className="h-4 w-4" />
                Overall Score
              </div>
              <div className="text-3xl font-bold text-white">
                {result.overall_score.toFixed(1)}
                <span className="text-base font-semibold text-slate-200"> pts</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {scoreBadges.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-50"
                >
                  <p className="text-xs font-semibold text-slate-300">{item.label}</p>
                  <p className="text-2xl font-bold text-white">{item.value}%</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 px-6 py-5 shadow-lg">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-blue-50 shadow-sm">
                <Sparkles className="h-4 w-4" />
                AI-Generated Insights
              </div>
              {result?.summary ? (
                <div 
                  className="prose prose-invert max-w-none"
                  style={{ lineHeight: '1.7' }}
                  dangerouslySetInnerHTML={{ 
                    __html: renderMarkdown(result.summary) 
                  }}
                />
              ) : (
                <p className="text-sm text-slate-300">No summary available.</p>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-blue-900/30 backdrop-blur">
              <h3 className="text-lg font-semibold text-white">Submit feedback</h3>
              <p className="text-sm text-slate-200">
              Help us improve recommendations by giving a short rating.
              </p>
            {feedbackSent ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Thank you! Your feedback has been received.
              </div>
            ) : (
              <form className="space-y-3" onSubmit={handleFeedbackSubmit}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-sm font-semibold text-slate-100">
                    Relevance (1-5)
                    <input
                      type="number"
                      min={1}
                      max={5}
                      required
                      value={feedback.rating_relevance || ""}
                      onChange={(e) =>
                        setFeedback((prev) => ({
                          ...prev,
                          rating_relevance: Number(e.target.value),
                        }))
                      }
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200/40"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold text-slate-100">
                    Acceptance (1-5)
                    <input
                      type="number"
                      min={1}
                      max={5}
                      required
                      value={feedback.rating_acceptance || ""}
                      onChange={(e) =>
                        setFeedback((prev) => ({
                          ...prev,
                          rating_acceptance: Number(e.target.value),
                        }))
                      }
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200/40"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-sm font-semibold text-slate-100">
                  Comment
                  <textarea
                    rows={3}
                    value={feedback.comment}
                    onChange={(e) =>
                      setFeedback((prev) => ({ ...prev, comment: e.target.value }))
                    }
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200/40"
                    placeholder="What was most helpful or less relevant?"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  disabled={sendingFeedback}
                >
                  {sendingFeedback ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Send feedback
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-blue-900/30 backdrop-blur">
          <div className="mb-4 flex items-center gap-2 text-slate-50">
            <BookOpen className="h-5 w-5 text-blue-200" />
            <h3 className="text-lg font-semibold">Recommended Courses</h3>
          </div>
          {recommendationSplit.mode === "two-path" && (
            <div className="mb-5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
              {recommendationSplit.note ||
                "Target Path is aspirational. Complete Mandatory Foundation first."}
            </div>
          )}

          {result.recommendations?.length ? (
            recommendationSplit.mode === "two-path" ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-base font-semibold text-white">Mandatory Foundation</h4>
                    <p className="text-xs text-slate-300">
                      Complete this path first to increase your success chances in the target topic.
                    </p>
                  </div>
                  {recommendationSplit.mandatory.length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {recommendationSplit.mandatory.map(renderRecommendationCard)}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">
                      No courses yet for the Mandatory Foundation path.
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-base font-semibold text-white">Target Path (Aspirational)</h4>
                    <p className="text-xs text-slate-300">
                      Your interest path, recommended after the foundation is complete.
                    </p>
                  </div>
                  {recommendationSplit.target.length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {recommendationSplit.target.map(renderRecommendationCard)}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">No courses yet for Target Path.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {recommendationSplit.target.map(renderRecommendationCard)}
              </div>
            )
          ) : (
            <p className="text-sm text-slate-300">No recommendations yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}
