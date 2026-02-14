"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { getAccessToken, getCurrentUser, isAuthenticated, isTokenExpired } from "@/lib/auth";

export default function DebugAuth() {
  const [result, setResult] = useState<string>("");

  const checkToken = () => {
    const token = getAccessToken();
    const user = getCurrentUser();
    
    setResult(JSON.stringify({
      tokenExists: !!token,
      tokenLength: token?.length,
      tokenPrefix: token?.substring(0, 30) + "...",
      userExists: !!user,
      userEmail: user?.email,
      isAuthenticated: isAuthenticated(),
      isExpired: isTokenExpired(),
      allKeys: Object.keys(localStorage).filter(k => 
        k.includes('token') || k.includes('access') || k.includes('user') || k.includes('microcred')
      )
    }, null, 2));
  };

  const testAPI = async () => {
    try {
      setResult("Testing public API call...");
      const data = await api.get("/tracks");
      setResult("✅ API call successful:\n" + JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setResult("❌ API call failed:\n" + message);
    }
  };

  const testAuthAPI = async () => {
    try {
      setResult("Testing authenticated API call...");
      const data = await api.get("/assessments/stats/user", true);
      setResult("✅ Auth API call successful:\n" + JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setResult("❌ Auth API call failed:\n" + message);
    }
  };

  const clearAssessmentCache = () => {
    const removed: string[] = [];
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("assessment_") || key.startsWith("answers_")) {
        localStorage.removeItem(key);
        removed.push(key);
      }
    });

    if (removed.length === 0) {
      setResult("✅ No assessment cache found.");
      return;
    }

    setResult(
      "✅ Assessment cache cleared:\n" + JSON.stringify(removed, null, 2),
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold">Debug Authentication</h1>
        
        <div className="flex flex-wrap gap-3">
          <button
            onClick={checkToken}
            className="rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-700"
          >
            Check Token
          </button>
          
          <button
            onClick={testAPI}
            className="rounded bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-700"
          >
            Test Public API
          </button>

          <button
            onClick={testAuthAPI}
            className="rounded bg-amber-600 px-4 py-2 font-semibold hover:bg-amber-700"
          >
            Test Auth API
          </button>

          <button
            onClick={clearAssessmentCache}
            className="rounded bg-rose-600 px-4 py-2 font-semibold hover:bg-rose-700"
          >
            Clear Assessment Cache
          </button>
        </div>

        {result && (
          <pre className="rounded bg-slate-900 p-4 text-sm overflow-auto">
            {result}
          </pre>
        )}

        <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          <h2 className="font-semibold mb-2">📋 Instructions:</h2>
          <ol className="list-decimal list-inside space-y-1">
            <li>Login first at <a href="/login" className="underline">/login</a></li>
            <li>Come back to this page</li>
            <li>Click &quot;Check Token&quot; to verify token exists</li>
            <li>Click &quot;Test Public API&quot; to test /tracks endpoint</li>
            <li>Click &quot;Test Auth API&quot; to test authenticated endpoint</li>
            <li>Open browser DevTools → Network tab to see the actual requests</li>
          </ol>
        </div>

        <div className="rounded border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-200">
          <h2 className="font-semibold mb-2">🔍 What to check in Network tab:</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Request Headers should contain: <code className="bg-slate-800 px-1 rounded">Authorization: Bearer ...</code></li>
            <li>Response should be 200 OK (not 401 Unauthorized)</li>
            <li>If CORS error: backend needs to allow your origin</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
