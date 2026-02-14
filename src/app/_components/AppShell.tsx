"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth";
import { useAuthSnapshot } from "@/lib/auth-store";

const HIDE_HEADER_ON = ["/login", "/register"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuthSnapshot();

  const greeting = useMemo(() => {
    if (!auth.user) return null;
    return auth.user.full_name || auth.user.email || "User";
  }, [auth.user]);

  const shouldHideHeader = HIDE_HEADER_ON.includes(pathname || "");

  return (
    <div className="min-h-screen">
      {!shouldHideHeader && auth.isAuthenticated && (
        <header className="sticky top-0 z-40 border-b border-white/5 bg-gradient-to-br from-slate-950/90 via-slate-900/85 to-slate-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-end px-4 py-3 text-sm text-slate-50 sm:px-6">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-2 shadow-lg shadow-black/20">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                Hi, {greeting}
              </span>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-50 transition hover:border-white/60"
              >
                Logout
              </button>
            </div>
          </div>
        </header>
      )}
      <div>{children}</div>
    </div>
  );
}
