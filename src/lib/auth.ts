// Token Management & Session Handling

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  role: string;
  full_name?: string;
}

const TOKEN_KEY = "microcred_access_token";
const REFRESH_KEY = "microcred_refresh_token";
const USER_KEY = "microcred_user";
const EXPIRY_KEY = "microcred_token_expiry";

/**
 * Save authentication tokens and user data after login
 */
export function saveAuth(tokens: AuthTokens, user: User): void {
  const expiryTime = Date.now() + tokens.expires_in * 1000;

  localStorage.setItem(TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(EXPIRY_KEY, expiryTime.toString());

  console.log("[Auth] Tokens saved:", {
    expiresIn: tokens.expires_in,
    expiryTime: new Date(expiryTime).toLocaleString(),
  });

  // Dispatch custom event to notify components
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-changed"));
  }
}

/**
 * Get access token from localStorage (raw, no validation)
 */
function getRawAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get access token from localStorage
 * Auto-clears if token is invalid/expired
 */
export function getAccessToken(): string | null {
  const token = getRawAccessToken();
  
  // If no token, return null
  if (!token) return null;
  
  // Check if token is expired
  if (isTokenExpired()) {
    console.log("[Auth] Token expired, auto-clearing");
    clearAuth();
    return null;
  }
  
  return token;
}

/**
 * Get refresh token from localStorage
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser(): User | null {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * Check if token is expired or about to expire
 * Returns true if less than 5 minutes remaining
 */
export function isTokenExpired(): boolean {
  const token = getRawAccessToken();
  const expiryStr = localStorage.getItem(EXPIRY_KEY);
  
  // If no token, not expired (just not authenticated)
  if (!token) return false;
  
  // If token exists but no expiry, treat as expired/invalid
  if (!expiryStr) {
    console.log("[Auth] Token exists but no expiry time - treating as invalid");
    return true;
  }

  const expiryTime = parseInt(expiryStr, 10);
  const now = Date.now();

  // Consider expired if less than 5 minutes remaining
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  const isExpired = now >= expiryTime - bufferMs;

  if (isExpired) {
    console.log("[Auth] Token expired or expiring soon:", {
      expiryTime: new Date(expiryTime).toLocaleString(),
      now: new Date(now).toLocaleString(),
      remainingSeconds: Math.floor((expiryTime - now) / 1000),
    });
  }

  return isExpired;
}

/**
 * Clear all authentication data from localStorage
 */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRY_KEY);

  console.log("[Auth] Auth data cleared");

  // Dispatch custom event to notify components
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-changed"));
  }
}

/**
 * Check if user is authenticated with valid token
 */
export function isAuthenticated(): boolean {
  const token = getAccessToken();
  if (!token) {
    console.log("[Auth] No token found");
    return false;
  }

  if (isTokenExpired()) {
    console.log("[Auth] Token expired, clearing auth data");
    clearAuth();
    return false;
  }

  return true;
}

/**
 * Logout user and clear all auth data
 */
export function logout(): void {
  clearAuth();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}
