import { getAccessToken, isTokenExpired, clearAuth } from "./auth";
import { 
  checkAssessmentValidity, 
  clearAssessmentSession,
  markAssessmentExpired
} from "./assessment-session";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Use proxy to avoid CORS issues in development
const USE_PROXY = process.env.NODE_ENV === 'development';
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROXY_URL = "/api/proxy";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  requiresAuth?: boolean;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, requiresAuth = false } = options;

  // Check assessment validity before making assessment-related API calls
  // Skip for: start assessment, status checks (handled gracefully by page)
  const assessmentMatch = endpoint.match(/\/assessments\/([a-f0-9-]+)/);
  const assessmentId = assessmentMatch?.[1];
  const isAssessmentEndpoint = Boolean(assessmentId);
  const isStatusEndpoint = endpoint.includes('/status');
  
  // Only run pre-flight check for submit/abandon endpoints, not status
  if (isAssessmentEndpoint && !isStatusEndpoint) {
    console.log('[API] Pre-flight check for:', endpoint);
    if (!checkAssessmentValidity(assessmentId)) {
      console.log('[API] Pre-flight check FAILED - throwing 410');
      throw new ApiError(410, "Assessment has expired. Please start a new assessment.");
    }
    console.log('[API] Pre-flight check PASSED');
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Auto-attach token if available or required
  if (requiresAuth || getAccessToken()) {
    // Check if token is expired (only for requiresAuth endpoints)
    if (requiresAuth && isTokenExpired()) {
      clearAuth();
      if (typeof window !== "undefined") {
        window.location.href = "/login?error=session_expired";
      }
      throw new Error("Session expired. Please login again.");
    }

    const token = getAccessToken();
    if (!token && requiresAuth) {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("No access token available");
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  try {
    // Use proxy in development to avoid CORS
    const url = USE_PROXY 
      ? `${PROXY_URL}?path=${encodeURIComponent(endpoint)}`
      : `${API_URL}${endpoint}`;

    console.log('[API] Fetching:', { url, method, endpoint, isStatusEndpoint });

    const response = await fetch(url, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });

    console.log('[API] Response:', { 
      status: response.status, 
      statusText: response.statusText,
      endpoint,
      ok: response.ok 
    });

    // Handle 401 Unauthorized - token invalid/expired
    // BUT: Don't clear auth for login/register endpoints (401 = wrong credentials there)
    const isAuthEndpoint = endpoint.startsWith('/auth/');
    if (response.status === 401) {
      if (isAuthEndpoint) {
        // For login/register, 401 means wrong credentials - don't clear auth
        console.log('[API] 401 on auth endpoint - wrong credentials');
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.detail || "Invalid email or password";
        throw new ApiError(401, message);
      }
      
      console.log('[API] 401 Unauthorized - clearing auth');
      clearAuth();
      
      // Only auto-redirect if this was a protected endpoint
      if (requiresAuth && typeof window !== "undefined") {
        window.location.href = "/login?error=unauthorized";
      }
      
      throw new ApiError(401, "Unauthorized. Please login again.");
    }

    // Handle 410 Gone - assessment expired or resource no longer available
    if (response.status === 410) {
      console.log('[API] 410 Gone received from backend:', { endpoint, assessmentId, isStatusEndpoint });
      
      // Only mark assessment as expired for non-status endpoints
      // Status endpoint 410s might be temporary sync issues - don't poison subsequent calls
      if (assessmentId && !isStatusEndpoint) {
        console.log('[API] Marking assessment expired:', assessmentId);
        markAssessmentExpired(assessmentId);
        clearAssessmentSession();
      } else {
        console.log('[API] NOT marking expired (status endpoint or no ID)');
      }
      
      // DON'T auto-redirect here - let the page component handle the UX
      // This prevents redirect loops and allows proper error display
      
      throw new ApiError(410, "Assessment session has ended. Please start a new assessment.");
    }

    if (!response.ok) {
      let message = "API request failed";
      try {
        const error = await response.json();
        console.log('[API] Error response body:', error);
        // Handle different error formats from FastAPI
        if (typeof error.detail === "string") {
          message = error.detail;
        } else if (Array.isArray(error.detail)) {
          // ValidationError format: [{ loc: [], msg: "", type: "" }]
          message = error.detail
            .map((e: { msg?: string; loc?: string[] }) => e.msg || JSON.stringify(e))
            .join(", ");
        } else if (error.detail && typeof error.detail === "object") {
          message = JSON.stringify(error.detail);
        } else if (error.message) {
          message = error.message;
        }
      } catch {
        message = response.statusText || message;
      }
      console.log('[API] Throwing ApiError:', { status: response.status, message });
      throw new ApiError(response.status, message);
    }

    return response.json();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      console.log('[API] ApiError caught:', { status: err.status, message: err.message });
      throw err;
    }
    const fallback = err instanceof Error ? err.message : "Network request failed";
    console.log('[API] Generic error:', fallback);
    throw new Error(fallback);
  }
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, requiresAuth = false) =>
    apiRequest<T>(endpoint, { requiresAuth }),

  post: <T>(endpoint: string, body: unknown, requiresAuth = false) =>
    apiRequest<T>(endpoint, { method: "POST", body, requiresAuth }),

  patch: <T>(endpoint: string, body: unknown, requiresAuth = false) =>
    apiRequest<T>(endpoint, { method: "PATCH", body, requiresAuth }),

  delete: <T>(endpoint: string, requiresAuth = false) =>
    apiRequest<T>(endpoint, { method: "DELETE", requiresAuth }),
};
