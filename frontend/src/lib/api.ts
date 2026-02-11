import { getAccessToken, isTokenExpired, clearAuth } from "./auth";

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

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Auto-attach token if available or required
  if (requiresAuth || getAccessToken()) {
    // Check if token is expired (only for requiresAuth endpoints)
    if (requiresAuth && isTokenExpired()) {
      console.error("[API] Token expired, clearing auth and redirecting to login");
      clearAuth();
      if (typeof window !== "undefined") {
        window.location.href = "/login?error=session_expired";
      }
      throw new Error("Session expired. Please login again.");
    }

    const token = getAccessToken();
    if (!token && requiresAuth) {
      console.error("[API] No access token available for protected endpoint");
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("No access token available");
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      console.log("[API] Request:", {
        endpoint,
        method,
        hasToken: true,
        requiresAuth,
        tokenPrefix: token.substring(0, 20) + "...",
      });
    }
  }

  try {
    // Use proxy in development to avoid CORS
    const url = USE_PROXY 
      ? `${PROXY_URL}?path=${encodeURIComponent(endpoint)}`
      : `${API_URL}${endpoint}`;

    console.log("[API] Calling:", { url, method, useProxy: USE_PROXY });

    const response = await fetch(url, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 401 Unauthorized - token invalid/expired
    if (response.status === 401) {
      console.error("[API] 401 Unauthorized, clearing auth");
      clearAuth();
      
      // Only auto-redirect if this was a protected endpoint
      if (requiresAuth && typeof window !== "undefined") {
        window.location.href = "/login?error=unauthorized";
      }
      
      throw new ApiError(401, "Unauthorized. Please login again.");
    }

    if (!response.ok) {
      let message = "API request failed";
      try {
        const error = await response.json();
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
      throw new ApiError(response.status, message);
    }

    return response.json();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const fallback = err instanceof Error ? err.message : "Network request failed";
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
