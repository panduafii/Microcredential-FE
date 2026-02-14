"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveAuth, type AuthTokens, type User } from "@/lib/auth";
import { Loader2, LockKeyhole, Sparkles, Eye, EyeOff } from "lucide-react";

interface AuthResponse {
  message: string;
  user: User;
  tokens: AuthTokens;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<AuthResponse>("/auth/login", { email, password });
      
      // Save tokens and user data using proper auth management
      saveAuth(data.tokens, data.user);
      
      console.log("[Login] Success:", data.user.email);
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-5xl grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-[1.1fr,0.9fr] sm:px-8">
        <section className="flex flex-col justify-center gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100">
            <Sparkles className="h-4 w-4" />
            MicroCred
          </div>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            Discover your potential and build the right skills.
          </h1>
          <p className="text-sm text-slate-200 sm:text-base">
            Smart assessments that understand your strengths and recommend the best courses for your career.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-blue-100">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Built around your profile
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Fast results while you wait
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Multiple role tracks available
            </span>
          </div>
        </section>

        <section className="flex items-center">
          <form
            onSubmit={handleLogin}
            className="w-full space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-blue-900/30 backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-100">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-blue-100">Sign in</p>
                <h2 className="text-lg font-semibold text-slate-50">Use your MicroCred account</h2>
              </div>
            </div>

            {loading && (
              <div className="loading-bar h-1 w-full rounded-full bg-white/20" aria-label="Processing sign in" />
            )}

            {error && <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-100">
                Email
                <input
                  type="email"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200/40"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-slate-100">
                Password
                <div className="relative mt-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 pr-10 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200/40"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>

            <div className="space-y-3">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
              <p className="text-center text-xs text-slate-300">
                Don&apos;t have an account?{" "}
                <a href="/register" className="font-semibold text-blue-200 hover:text-blue-100">
                  Sign up
                </a>
              </p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
