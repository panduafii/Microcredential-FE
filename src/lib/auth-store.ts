"use client";

import { useSyncExternalStore } from "react";
import { getCurrentUser, isTokenExpired, type User } from "./auth";

export type AuthSnapshot = {
  isAuthenticated: boolean;
  user: User | null;
};

const SERVER_SNAPSHOT: AuthSnapshot = {
  isAuthenticated: false,
  user: null,
};

let lastSnapshot: AuthSnapshot = SERVER_SNAPSHOT;
let lastUserRaw: string | null = null;
let lastUserObj: User | null = null;

function getSnapshot(): AuthSnapshot {
  if (typeof window === "undefined") {
    return SERVER_SNAPSHOT;
  }

  const token = localStorage.getItem("microcred_access_token");
  if (!token || isTokenExpired()) {
    lastSnapshot = SERVER_SNAPSHOT;
    return SERVER_SNAPSHOT;
  }

  const userRaw = localStorage.getItem("microcred_user");
  if (userRaw) {
    if (userRaw !== lastUserRaw) {
      try {
        lastUserObj = JSON.parse(userRaw) as User;
      } catch {
        lastUserObj = null;
      }
      lastUserRaw = userRaw;
    }
  } else {
    lastUserRaw = null;
    lastUserObj = null;
  }

  const nextSnapshot: AuthSnapshot = {
    isAuthenticated: true,
    user: lastUserObj ?? getCurrentUser(),
  };

  if (
    lastSnapshot.isAuthenticated === nextSnapshot.isAuthenticated &&
    lastSnapshot.user === nextSnapshot.user
  ) {
    return lastSnapshot;
  }

  lastSnapshot = nextSnapshot;
  return nextSnapshot;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (!event.key) {
      callback();
      return;
    }

    if (
      event.key.includes("microcred_") ||
      event.key.includes("token") ||
      event.key.includes("user")
    ) {
      callback();
    }
  };

  const handleAuthChanged = () => {
    callback();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      callback();
    }
  };

  const handlePageShow = () => {
    callback();
  };

  const handleFocus = () => {
    callback();
  };

  const handlePopState = () => {
    callback();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener("auth-changed", handleAuthChanged);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", handlePageShow as EventListener);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("popstate", handlePopState);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("auth-changed", handleAuthChanged);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pageshow", handlePageShow as EventListener);
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("popstate", handlePopState);
  };
}

export function useAuthSnapshot(): AuthSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}
