"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { ArrowRight, CheckCircle2, CircleDot, Loader2, RefreshCcw, Timer } from "lucide-react";

interface Stage {
  status: string;
  progress?: number;
  started_at?: string | null;
  completed_at?: string | null;
}

interface StatusResponse {
  assessment_id: string;
  status: string;
  overall_progress: number;
  stages?: Record<string, Stage>;
  submitted_at?: string;
  completed_at?: string | null;
  degraded?: boolean;
}

const STAGE_ORDER = [
  { key: "gpt_scoring", label: "GPT Scoring" },
  { key: "rag_retrieval", label: "RAG Retrieval" },
  { key: "fusion_summary", label: "Fusion Summary" },
];

export default function ProcessingPage() {
  const params = useParams<{ assessment_id: string }>();
  const router = useRouter();
  const assessmentId = Array.isArray(params.assessment_id)
    ? params.assessment_id[0]
    : params.assessment_id;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const [startedAtMs, setStartedAtMs] = useState<number>(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  const overallProgress = useMemo(
    () => status?.overall_progress || 0,
    [status],
  );
  const isBackendCompleted = status?.status === "completed";
  const canViewResult = isBackendCompleted || overallProgress >= 100;

  const mappedStages = useMemo(() => {
    const stages = status?.stages || {};
    return STAGE_ORDER.map((stage) => ({
      ...stage,
      data: stages[stage.key] || { status: "pending", progress: 0 },
    }));
  }, [status]);

  const getStageVisual = (statusText: string) => {
    if (statusText === "completed") return { 
      color: "text-emerald-100", 
      bar: "bg-emerald-500",
      bg: "bg-emerald-500/30",
      border: "border-emerald-500/70"
    };
    if (statusText === "in_progress" || statusText === "submitted")
      return { 
        color: "text-blue-100", 
        bar: "bg-blue-500",
        bg: "bg-blue-500/30",
        border: "border-blue-500/70"
      };
    return { 
      color: "text-slate-400", 
      bar: "bg-slate-600/50",
      bg: "bg-slate-500/5",
      border: "border-slate-500/20"
    };
  };

  const formatElapsedTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    // SECURITY: Always check authentication
    if (!isAuthenticated()) {
      console.log("[Processing] Not authenticated, redirecting");
      router.replace("/login");
      return;
    }

    isMounted.current = true;
    startPolling();
    return () => {
      isMounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  useEffect(() => {
    const updateElapsed = () => {
      setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startedAtMs]);

  // Poll status while processing.
  const startPolling = () => {
    const poll = async () => {
      try {
        const data = await api.get<StatusResponse>(
          `/assessments/${assessmentId}/status`,
          true, // requiresAuth = true
        );
        if (!isMounted.current) return; // Prevent state update after unmount

        const submittedAtMs = data.submitted_at ? Date.parse(data.submitted_at) : NaN;
        if (Number.isFinite(submittedAtMs)) {
          setStartedAtMs((previousStart) => Math.min(previousStart, submittedAtMs));
        }

        setStatus(data);
        setError(null);

        const shouldAutoRedirect =
          data.overall_progress >= 100 ||
          (data.status === "completed" && data.overall_progress >= 99);

        if (shouldAutoRedirect) {
          pollTimer.current = setTimeout(() => {
            if (isMounted.current) router.replace(`/assessment/${assessmentId}/result`);
          }, 800);
          return;
        }

        pollTimer.current = setTimeout(poll, 2000);
      } catch (err: unknown) {
        if (!isMounted.current) return;
        
        // Handle 410 Gone - assessment expired or deleted
        if (err instanceof ApiError && err.status === 410) {
          setError(
            "Assessment is no longer available or has expired. Please start a new assessment from the home page.",
          );
          // Don't retry for 410 errors
          return;
        }

        const message = err instanceof Error ? err.message : "Failed to load progress";
        setError(message);
        pollTimer.current = setTimeout(poll, 5000);
      }
    };

    poll();
  };

  const handleManualRefresh = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    startPolling();
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12 text-slate-50">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-blue-900/40 backdrop-blur">
          <div className="flex flex-col gap-2">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Processing Assessment</h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-300">
                <Timer className="h-4 w-4" />
                Elapsed time: {formatElapsedTime(elapsedMs)}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span>Overall progress</span>
              <span>{overallProgress.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-300 ease-out"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
            {mappedStages.map((stage) => {
              const statusText = stage.data.status || "pending";
              const isDone = statusText === "completed";
              const isActive = statusText === "in_progress" || statusText === "submitted";
              const visual = getStageVisual(statusText);

              return (
                <div
                  key={stage.key}
                  className={`rounded-2xl border p-4 shadow-lg transition-all duration-500 ${visual.border} ${visual.bg}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-50">{stage.label}</h3>
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                  ) : (
                    <CircleDot className="h-5 w-5 text-slate-500" />
                  )}
                </div>
                  <p className={`mt-2 text-xs font-semibold ${visual.color}`}>
                    {isDone && "Completed"}
                    {isActive && "In progress"}
                    {!isDone && !isActive && "Queued"}
                  </p>
                  <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                    <div
                      className={`h-2 rounded-full ${visual.bar} transition-all duration-300 ease-out`}
                      style={{ width: `${Math.min(stage.data.progress || 0, 100)}%` }}
                    />
                  </div>
                </div>
              );
          })}
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={handleManualRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-50 transition hover:border-white/40"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={() => router.replace(`/assessment/${assessmentId}/result`)}
              disabled={!canViewResult}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              View result
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
