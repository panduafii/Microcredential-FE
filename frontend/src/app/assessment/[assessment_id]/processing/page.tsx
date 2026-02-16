"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { ArrowRight, CheckCircle2, CircleDot, Loader2, RefreshCcw, Timer } from "lucide-react";

interface Stage {
  name?: string;
  status?: string;
  percentage?: number;
  progress?: number;
  started_at?: string | null;
  completed_at?: string | null;
}

interface JobProgress {
  job_type: string;
  status?: string;
  progress_percentage?: number;
  progress_step?: string;
}

interface StatusResponse {
  assessment_id: string;
  status: string;
  overall_progress: number;
  stages?: Record<string, Stage> | Stage[];
  jobs?: JobProgress[];
  submitted_at?: string;
  completed_at?: string | null;
  degraded?: boolean;
}

const STAGE_ORDER = [
  { key: "gpt_scoring", label: "GPT Scoring" },
  { key: "rag_retrieval", label: "RAG Retrieval" },
  { key: "fusion_summary", label: "Fusion Summary" },
];
const STAGE_TO_JOB_TYPE: Record<string, string> = {
  gpt_scoring: "gpt",
  rag_retrieval: "rag",
  fusion_summary: "fusion",
};
const STAGE_KEY_ALIASES: Record<string, string> = {
  gpt_scoring: "gpt_scoring",
  gpt: "gpt_scoring",
  rag_retrieval: "rag_retrieval",
  rag: "rag_retrieval",
  fusion_summary: "fusion_summary",
  fusion: "fusion_summary",
};

const STAGE_KEYS = STAGE_ORDER.map((stage) => stage.key);
type StageProgressMap = Record<string, number>;

const clampProgress = (value: number): number => Math.max(0, Math.min(value, 100));
const COMPLETED_STATUSES = new Set(["completed", "done", "success", "succeeded"]);
const ACTIVE_STATUSES = new Set(["in_progress", "submitted", "running", "processing", "started"]);
const FAILED_STATUSES = new Set(["failed", "error"]);
const STAGE_COMPLETION_STEP_MS = 280;
const REDIRECT_AFTER_COMPLETION_MS = 1500;

const createZeroStageProgressMap = (): StageProgressMap =>
  Object.fromEntries(STAGE_KEYS.map((key) => [key, 0])) as StageProgressMap;

const normalizeStageStatus = (status?: string | null): string =>
  (status || "queued").toLowerCase().replace(/\s+/g, "_");

const hasStageSignal = (stage?: Stage): boolean => {
  if (!stage) return false;

  const normalizedStatus = normalizeStageStatus(stage.status);
  return (
    clampProgress(stage.progress || 0) > 0 ||
    Boolean(stage.started_at) ||
    Boolean(stage.completed_at) ||
    COMPLETED_STATUSES.has(normalizedStatus) ||
    ACTIVE_STATUSES.has(normalizedStatus) ||
    FAILED_STATUSES.has(normalizedStatus)
  );
};

const inferStageProgressFromOverall = (overallProgress: number): StageProgressMap => {
  const normalizedOverall = clampProgress(overallProgress);
  const totalStages = STAGE_KEYS.length;
  const progressByStage = createZeroStageProgressMap();

  STAGE_KEYS.forEach((key, index) => {
    const stageStart = (index / totalStages) * 100;
    const stageEnd = ((index + 1) / totalStages) * 100;
    const stageRange = stageEnd - stageStart;
    const withinStage = (normalizedOverall - stageStart) / stageRange;
    progressByStage[key] = clampProgress(withinStage * 100);
  });

  return progressByStage;
};

const normalizeIncomingStages = (
  incomingStages?: StatusResponse["stages"],
): Record<string, Stage> => {
  const normalized: Record<string, Stage> = {};

  if (Array.isArray(incomingStages)) {
    for (const stage of incomingStages) {
      const rawName = String(stage?.name || "").trim().toLowerCase();
      const key = STAGE_KEY_ALIASES[rawName];
      if (!key) continue;
      normalized[key] = {
        ...stage,
        progress: stage?.progress ?? stage?.percentage ?? 0,
      };
    }
    return normalized;
  }

  if (!incomingStages || typeof incomingStages !== "object") return normalized;

  for (const [rawKey, stage] of Object.entries(incomingStages)) {
    const key = STAGE_KEY_ALIASES[String(rawKey).toLowerCase()] || rawKey;
    normalized[key] = {
      ...stage,
      progress: stage?.progress ?? stage?.percentage ?? 0,
    };
  }

  return normalized;
};

const normalizeIncomingJobs = (incomingJobs?: JobProgress[]): Record<string, JobProgress> => {
  const normalized: Record<string, JobProgress> = {};
  if (!Array.isArray(incomingJobs)) return normalized;

  for (const job of incomingJobs) {
    if (!job?.job_type) continue;
    normalized[String(job.job_type).toLowerCase()] = job;
  }

  return normalized;
};

const hasAssessmentReset = (data: StatusResponse): boolean => {
  if (clampProgress(data.overall_progress || 0) > 0) return false;
  if (data.status === "completed") return false;
  const stages = normalizeIncomingStages(data.stages);

  const hasStartedStage = Object.values(stages).some((stage) => {
    const normalizedStatus = normalizeStageStatus(stage.status);
    return (
      clampProgress(stage.progress || stage.percentage || 0) > 0 ||
      ACTIVE_STATUSES.has(normalizedStatus) ||
      COMPLETED_STATUSES.has(normalizedStatus) ||
      Boolean(stage.started_at) ||
      Boolean(stage.completed_at)
    );
  });

  return !hasStartedStage;
};

export default function ProcessingPage() {
  const params = useParams<{ assessment_id: string }>();
  const router = useRouter();
  const assessmentId = Array.isArray(params.assessment_id)
    ? params.assessment_id[0]
    : params.assessment_id;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [targetOverallProgress, setTargetOverallProgress] = useState(0);
  const [displayOverallProgress, setDisplayOverallProgress] = useState(0);
  const [targetStageProgress, setTargetStageProgress] = useState<StageProgressMap>(
    () => createZeroStageProgressMap(),
  );
  const [displayStageProgress, setDisplayStageProgress] = useState<StageProgressMap>(
    () => createZeroStageProgressMap(),
  );
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completionSequenceStarted = useRef(false);
  const isMounted = useRef(true);
  const [startedAtMs, setStartedAtMs] = useState<number>(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  const isBackendCompleted = status?.status === "completed";
  const canViewResult = targetOverallProgress >= 100 || displayOverallProgress >= 99.5;

  const clearCompletionTimers = () => {
    for (const timer of completionTimers.current) clearTimeout(timer);
    completionTimers.current = [];
  };

  const runCompletionSequence = () => {
    if (completionSequenceStarted.current) return;
    completionSequenceStarted.current = true;
    clearCompletionTimers();

    STAGE_KEYS.forEach((key, index) => {
      const timer = setTimeout(() => {
        if (!isMounted.current) return;
        setTargetStageProgress((previousProgress) => {
          if ((previousProgress[key] || 0) >= 100) return previousProgress;
          return { ...previousProgress, [key]: 100 };
        });
      }, index * STAGE_COMPLETION_STEP_MS);
      completionTimers.current.push(timer);
    });

    const overallTimer = setTimeout(() => {
      if (!isMounted.current) return;
      setTargetOverallProgress(100);
    }, STAGE_KEYS.length * STAGE_COMPLETION_STEP_MS);
    completionTimers.current.push(overallTimer);

    const redirectTimer = setTimeout(() => {
      if (isMounted.current) router.replace(`/assessment/${assessmentId}/result`);
    }, REDIRECT_AFTER_COMPLETION_MS);
    completionTimers.current.push(redirectTimer);
  };

  const mappedStages = useMemo(() => {
    const stages = normalizeIncomingStages(status?.stages);
    return STAGE_ORDER.map((stage) => {
      const stageData = stages[stage.key];
      const targetProgress = clampProgress(targetStageProgress[stage.key] || 0);
      const normalizedStatus = normalizeStageStatus(stageData?.status);

      let derivedStatus = "queued";
      if (
        status?.status === "completed" ||
        targetProgress >= 99.9 ||
        COMPLETED_STATUSES.has(normalizedStatus)
      ) {
        derivedStatus = "completed";
      } else if (FAILED_STATUSES.has(normalizedStatus)) {
        derivedStatus = "failed";
      } else if (ACTIVE_STATUSES.has(normalizedStatus) || targetProgress > 0) {
        derivedStatus = "in_progress";
      }

      return {
        ...stage,
        data: {
          ...stageData,
          status: derivedStatus,
          progress: targetProgress,
        },
      };
    });
  }, [status, targetStageProgress]);

  const getStageVisual = (statusText: string) => {
    if (statusText === "completed")
      return {
        color: "text-emerald-100",
        bar: "bg-emerald-500",
        bg: "bg-emerald-500/30",
        border: "border-emerald-500/70",
      };
    if (statusText === "failed")
      return {
        color: "text-red-100",
        bar: "bg-red-500",
        bg: "bg-red-500/25",
        border: "border-red-500/60",
      };
    if (statusText === "in_progress" || statusText === "submitted")
      return {
        color: "text-blue-100",
        bar: "bg-blue-500",
        bg: "bg-blue-500/30",
        border: "border-blue-500/70",
      };
    return {
      color: "text-slate-400",
      bar: "bg-slate-600/50",
      bg: "bg-slate-500/5",
      border: "border-slate-500/20",
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

    setStatus(null);
    setError(null);
    setStartedAtMs(Date.now());
    setElapsedMs(0);
    setTargetOverallProgress(0);
    setDisplayOverallProgress(0);
    setTargetStageProgress(createZeroStageProgressMap());
    setDisplayStageProgress(createZeroStageProgressMap());
    completionSequenceStarted.current = false;
    clearCompletionTimers();

    isMounted.current = true;
    startPolling();
    return () => {
      isMounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      clearCompletionTimers();
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

  useEffect(() => {
    let raf = 0;
    const smoothFactor = isBackendCompleted ? 0.35 : 0.16;

    const animate = () => {
      setDisplayOverallProgress((previousProgress) => {
        const diff = targetOverallProgress - previousProgress;
        if (Math.abs(diff) < 0.2) {
          return previousProgress === targetOverallProgress
            ? previousProgress
            : targetOverallProgress;
        }

        return clampProgress(previousProgress + diff * smoothFactor);
      });

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [isBackendCompleted, targetOverallProgress]);

  useEffect(() => {
    let raf = 0;
    const smoothFactor = isBackendCompleted ? 0.35 : 0.16;

    const animate = () => {
      setDisplayStageProgress((previousProgress) => {
        let hasChanges = false;
        const nextProgress = { ...previousProgress };

        for (const key of STAGE_KEYS) {
          const target = targetStageProgress[key] || 0;
          const current = previousProgress[key] || 0;
          const diff = target - current;

          if (Math.abs(diff) < 0.2) {
            if (current !== target) {
              nextProgress[key] = target;
              hasChanges = true;
            }
            continue;
          }

          const updated = clampProgress(current + diff * smoothFactor);
          if (updated !== current) {
            nextProgress[key] = updated;
            hasChanges = true;
          }
        }

        return hasChanges ? nextProgress : previousProgress;
      });

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [isBackendCompleted, targetStageProgress]);

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

        const normalizedStages = normalizeIncomingStages(data.stages);
        const normalizedJobs = normalizeIncomingJobs(data.jobs);
        const resetDetected = hasAssessmentReset(data);
        const normalizedOverallProgress = clampProgress(data.overall_progress || 0);
        const inferredStageProgress =
          data.status === "completed"
            ? createZeroStageProgressMap()
            : inferStageProgressFromOverall(normalizedOverallProgress);

        setTargetOverallProgress((previousProgress) => {
          if (resetDetected) {
            return previousProgress === normalizedOverallProgress
              ? previousProgress
              : normalizedOverallProgress;
          }
          if (data.status === "completed") return previousProgress;
          return Math.max(previousProgress, normalizedOverallProgress);
        });

        setTargetStageProgress((previousProgress) => {
          if (resetDetected) {
            const isAlreadyZero = STAGE_KEYS.every((key) => (previousProgress[key] || 0) === 0);
            return isAlreadyZero ? previousProgress : createZeroStageProgressMap();
          }

          let hasChanges = false;
          const nextProgress = { ...previousProgress };
          for (const key of STAGE_KEYS) {
            const stage = normalizedStages[key];
            const job = normalizedJobs[STAGE_TO_JOB_TYPE[key]];
            const normalizedStatus = normalizeStageStatus(stage?.status || job?.status);
            const normalizedStageProgress = clampProgress(stage?.progress || stage?.percentage || 0);
            const normalizedJobProgress = clampProgress(job?.progress_percentage || 0);
            const fallbackProgress = inferredStageProgress[key] || 0;
            const hasSignal =
              hasStageSignal(stage) ||
              normalizedJobProgress > 0 ||
              ACTIVE_STATUSES.has(normalizeStageStatus(job?.status)) ||
              COMPLETED_STATUSES.has(normalizeStageStatus(job?.status)) ||
              FAILED_STATUSES.has(normalizeStageStatus(job?.status));

            let incomingTarget = previousProgress[key] || 0;
            if (
              COMPLETED_STATUSES.has(normalizedStatus) ||
              COMPLETED_STATUSES.has(normalizeStageStatus(job?.status))
            ) {
              incomingTarget = 100;
            } else if (hasSignal || data.status !== "completed") {
              incomingTarget = Math.max(
                normalizedStageProgress,
                normalizedJobProgress,
                fallbackProgress,
              );
            }

            const nextValue = Math.max(previousProgress[key] || 0, incomingTarget);

            if (nextValue !== (previousProgress[key] || 0)) {
              nextProgress[key] = nextValue;
              hasChanges = true;
            }
          }

          return hasChanges ? nextProgress : previousProgress;
        });

        if (resetDetected) {
          setDisplayOverallProgress(normalizedOverallProgress);
          setDisplayStageProgress((previousProgress) => {
            const isAlreadyZero = STAGE_KEYS.every((key) => (previousProgress[key] || 0) === 0);
            return isAlreadyZero ? previousProgress : createZeroStageProgressMap();
          });
          completionSequenceStarted.current = false;
          clearCompletionTimers();
        }

        if (data.status === "completed") {
          runCompletionSequence();
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
              <span>{displayOverallProgress.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-300 ease-out"
                style={{ width: `${displayOverallProgress}%` }}
              />
            </div>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          {mappedStages.map((stage) => {
            const statusText = stage.data.status || "queued";
            const isDone = statusText === "completed";
            const isFailed = statusText === "failed";
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
                  ) : isFailed ? (
                    <CircleDot className="h-5 w-5 text-red-400" />
                  ) : isActive ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                  ) : (
                    <CircleDot className="h-5 w-5 text-slate-500" />
                  )}
                </div>
                <p className={`mt-2 text-xs font-semibold ${visual.color}`}>
                  {isDone && "Completed"}
                  {isFailed && "Failed"}
                  {isActive && "In progress"}
                  {!isDone && !isFailed && !isActive && "Queued"}
                </p>
                <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                  <div
                    className={`h-2 rounded-full ${visual.bar} transition-all duration-300 ease-out`}
                    style={{ width: `${displayStageProgress[stage.key] || 0}%` }}
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
