"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", { redirect: false, email, password });
      if (res?.error) {
        setError("Invalid email or password.");
        toast.error("Invalid credentials. Please try again.");
      } else {
        router.push("/admin");
        router.refresh();
      }
    } catch {
      setError("Unable to sign in. Please try again.");
      toast.error("Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      {/* Gold gradient glow behind card */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="gradient-gold absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-5 blur-3xl" />
      </div>

      {/* Theme toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold">
            <span className="text-text">Aether </span>
            <span className="text-accent">Dental</span>
          </div>
          <p className="mt-1 text-sm text-text-muted">Clinic Management</p>
        </div>

        <form onSubmit={handleSubmit} className="animate-scale-in rounded-2xl border border-border bg-surface p-6 shadow-lg">
          <h1 className="text-lg font-bold text-text">Sign in</h1>
          <p className="mt-1 text-sm text-text-muted">Access your clinic dashboard.</p>

          {error && (
            <div className="mt-4 rounded-lg border border-error/20 bg-error-bg px-3 py-2 text-sm text-error">{error}</div>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="admin@aetherdental.ph"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full gradient-gold rounded-lg py-2.5 font-semibold text-[#0E0F10] shadow transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-border bg-background-alt p-3 text-xs text-text-muted">
            <p className="font-semibold text-text-secondary">Demo accounts</p>
            <p>admin@aetherdental.ph / admin123</p>
            <p>reception@aetherdental.ph / reception123</p>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-text-muted">
          <Link href="/" className="font-medium text-accent hover:text-accent-hover transition-colors duration-200">â† Back to home</Link>
        </p>
      </div>
    </div>
  );
}
