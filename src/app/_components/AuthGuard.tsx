"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthSnapshot } from "@/lib/auth-store";

const PUBLIC_PATHS = ["/login", "/register"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuthSnapshot();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Run once after hydration to avoid auth guard mismatch during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isPublicPath = useMemo(
    () => PUBLIC_PATHS.includes(pathname || ""),
    [pathname],
  );

  useEffect(() => {
    if (!mounted) return;
    if (isPublicPath) return;

    if (!auth.isAuthenticated) {
      router.replace("/login");
    }
  }, [auth.isAuthenticated, isPublicPath, mounted, router]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-slate-400">Checking authentication...</div>
      </div>
    );
  }

  if (!isPublicPath && !auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-slate-400">Checking authentication...</div>
      </div>
    );
  }

  return <>{children}</>;
}
