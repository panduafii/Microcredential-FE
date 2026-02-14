/**
 * Assessment Session Manager
 * Prevents 410 errors by managing assessment expiry on the frontend
 */

export interface AssessmentSession {
  id: string;
  expiresAt: string | null;
  startedAt: string;
}

interface ExpiredFlag {
  id?: string;
  at?: string;
}

/**
 * Check if assessment has expired
 */
export function isAssessmentExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  
  const now = new Date();
  const expiry = new Date(expiresAt);
  
  return now > expiry;
}

/**
 * Get remaining time in minutes
 */
export function getRemainingMinutes(expiresAt: string | null): number {
  if (!expiresAt) return Infinity;
  
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  
  return Math.max(0, Math.floor(diffMs / 1000 / 60));
}

/**
 * Save current assessment session
 */
export function saveAssessmentSession(session: AssessmentSession): void {
  if (typeof window === "undefined") return;
  
  try {
    console.log('[AssessmentSession] Saving session:', session);
    sessionStorage.setItem("currentAssessment", JSON.stringify(session));
    console.log('[AssessmentSession] Session saved successfully');
  } catch (e) {
    console.log('[AssessmentSession] Save error:', e);
  }
}

/**
 * Get current assessment session
 */
export function getAssessmentSession(): AssessmentSession | null {
  if (typeof window === "undefined") return null;
  
  try {
    const data = sessionStorage.getItem("currentAssessment");
    if (!data) {
      console.log('[AssessmentSession] getSession: no data found');
      return null;
    }
    
    const parsed = JSON.parse(data) as AssessmentSession;
    console.log('[AssessmentSession] getSession:', parsed);
    return parsed;
  } catch (e) {
    console.log('[AssessmentSession] getSession error:', e);
    return null;
  }
}

/**
 * Clear assessment session
 */
export function clearAssessmentSession(): void {
  if (typeof window === "undefined") return;
  
  try {
    console.log('[AssessmentSession] Clearing session...');
    sessionStorage.removeItem("currentAssessment");
    sessionStorage.removeItem("assessment_expired");
    localStorage.removeItem("lastAssessmentId");
    console.log('[AssessmentSession] Session cleared');
  } catch (e) {
    console.log('[AssessmentSession] Clear error:', e);
  }
}

function readExpiredFlag(): ExpiredFlag | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem("assessment_expired");
    console.log('[AssessmentSession] readExpiredFlag raw:', raw);
    if (!raw) return null;
    if (raw === "true") return {};

    const parsed = JSON.parse(raw) as { id?: unknown; at?: unknown } | null;
    if (!parsed || typeof parsed !== "object") return {};

    return {
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      at: typeof parsed.at === "string" ? parsed.at : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Check if assessment has already expired (cached check)
 * Returns true if we've already seen a 410 error for THIS SPECIFIC assessment
 */
export function hasSeenExpiredError(assessmentId?: string): boolean {
  if (typeof window === "undefined") return false;

  const flag = readExpiredFlag();
  console.log('[AssessmentSession] hasSeenExpiredError check:', { assessmentId, flag });
  
  if (!flag) {
    console.log('[AssessmentSession] No expired flag found');
    return false;
  }

  // If no assessmentId provided, we can't verify - assume NOT expired to avoid false positives
  if (!assessmentId) {
    console.log('[AssessmentSession] No assessmentId provided, returning false');
    return false;
  }

  // Only return true if flag has an ID AND it matches current assessment
  if (flag.id) {
    const matches = flag.id === assessmentId;
    console.log('[AssessmentSession] Flag ID check:', { flagId: flag.id, requestedId: assessmentId, matches });
    return matches;
  }

  // No ID in flag = old format, ignore it (don't block new assessments)
  console.log('[AssessmentSession] Old format flag, ignoring');
  return false;
}

/**
 * Mark a specific assessment as expired
 */
export function markAssessmentExpired(assessmentId: string): void {
  if (typeof window === "undefined") return;
  
  try {
    sessionStorage.setItem("assessment_expired", JSON.stringify({ 
      id: assessmentId, 
      at: new Date().toISOString() 
    }));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check current assessment and redirect if expired
 * Call this before making assessment-related API calls
 * Returns true if assessment is valid, false if expired
 */
export function checkAssessmentValidity(assessmentId?: string): boolean {
  // No assessment ID = can't check, let API handle it
  if (!assessmentId) return true;
  
  // Check if we've already seen an expiry error for THIS assessment
  if (hasSeenExpiredError(assessmentId)) {
    console.log('[AssessmentSession] Blocking - already seen 410 for:', assessmentId);
    if (typeof window !== "undefined") {
      window.location.href = "/?error=assessment_expired";
    }
    return false;
  }
  
  const session = getAssessmentSession();
  if (!session) {
    console.log('[AssessmentSession] No session, allowing:', assessmentId);
    return true; // No session, let API handle it
  }

  // Only check expiry if session matches current assessment
  if (session.id !== assessmentId) {
    console.log('[AssessmentSession] Session mismatch, allowing:', { sessionId: session.id, requestedId: assessmentId });
    return true;
  }
  
  // Check if expired based on local time
  if (isAssessmentExpired(session.expiresAt)) {
    console.log('[AssessmentSession] Session expired:', { expiresAt: session.expiresAt, now: new Date().toISOString() });
    clearAssessmentSession();
    markAssessmentExpired(assessmentId);
    
    if (typeof window !== "undefined") {
      window.location.href = "/?error=assessment_expired";
    }
    
    return false;
  }
  
  console.log('[AssessmentSession] Valid:', { id: assessmentId, expiresAt: session.expiresAt });
  return true;
}

/**
 * Warning threshold in minutes
 */
const WARNING_THRESHOLD = 3;

/**
 * Check if should show expiry warning
 */
export function shouldShowExpiryWarning(): boolean {
  const session = getAssessmentSession();
  if (!session || !session.expiresAt) return false;
  
  const remaining = getRemainingMinutes(session.expiresAt);
  return remaining > 0 && remaining <= WARNING_THRESHOLD;
}

/**
 * Get formatted remaining time (e.g., "5 minutes", "1 minute")
 */
export function getFormattedRemainingTime(): string {
  const session = getAssessmentSession();
  if (!session || !session.expiresAt) return "";
  
  const remaining = getRemainingMinutes(session.expiresAt);
  if (remaining <= 0) return "Time is up";
  
  return `${remaining} minute${remaining === 1 ? "" : "s"}`;
}
