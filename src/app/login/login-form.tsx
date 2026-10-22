"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export interface LoginFormProps {
  /** True when the passwordless read-only demo provider is available. */
  demoEnabled: boolean;
}

export function LoginForm({ demoEnabled }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState("");

  function goToDashboard() {
    router.push("/admin");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", { redirect: false, email, password });
      if (res?.error) {
        setError("Invalid email or password.");
        document.getElementById("login-email")?.focus();
        toast.error("Invalid credentials. Please try again.");
      } else {
        goToDashboard();
      }
    } catch {
      setError("Unable to sign in. Please try again.");
      toast.error("Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError("");
    setDemoLoading(true);
    try {
      // Passwordless provider: the session is flagged read-only server-side.
      const res = await signIn("demo", { redirect: false });
      if (res?.error) {
        setError("Demo access is unavailable right now. Please try again later.");
        toast.error("Demo access is unavailable right now.");
      } else {
        goToDashboard();
      }
    } catch {
      setError("Unable to open the demo. Please try again.");
      toast.error("Unable to open the demo.");
    } finally {
      setDemoLoading(false);
    }
  }

  const busy = loading || demoLoading;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      {/* Gold gradient glow behind card */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="gradient-gold absolute left-1/2 top-1/2 h-150 w-150 -translate-x-1/2 -translate-y-1/2 opacity-5 blur-3xl" />
      </div>

      {/* Theme toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo
            href={null}
            variant="stacked"
            showTagline
            markClassName="h-14 w-14"
            wordmarkClassName="text-2xl font-bold"
            taglineClassName="text-sm"
          />
        </div>

        <form onSubmit={handleSubmit} className="animate-scale-in rounded-card border border-border bg-surface p-6 shadow-lg">
          <h1 className="text-lg font-bold text-text">Sign in</h1>
          <p className="mt-1 text-sm text-text-muted">Access your clinic dashboard.</p>

          {error && (
            <div id="login-error" role="alert" className="mt-4 rounded-control border border-error/20 bg-error-bg px-3 py-2 text-sm text-error">{error}</div>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-text">Email</label>
              <input
                id="login-email"
                aria-describedby={error ? "login-error" : undefined}
                aria-invalid={!!error}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                // House focus idiom (THEME.md §Focus): no `outline-none` — the
                // global 2px `var(--focus-ring)` outline is the accessible
                // indicator; `focus:border-accent` is mouse feedback and the
                // ring pair is decorative.
                // `min-h-11` is the 44px default contract (--control-height-md,
                // WCAG 2.5.5); `px-3 py-2 text-sm` alone renders 38px.
                className="w-full min-h-11 rounded-control border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition-[color,box-shadow] focus:border-accent focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40"
                placeholder="example@clinic.com"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-text">Password</label>
              <input
                id="login-password"
                aria-describedby={error ? "login-error" : undefined}
                aria-invalid={!!error}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full min-h-11 rounded-control border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder-text-muted transition-[color,box-shadow] focus:border-accent focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:ring-focus/40"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full gradient-gold rounded-control py-2.5 font-semibold text-[#0E0F10] shadow-sm transition-opacity duration-(--dur-fast) hover:opacity-90 disabled:opacity-60"
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

          {demoEnabled && (
            <div className="mt-5 border-t border-border pt-4">
              <button
                type="button"
                onClick={handleDemo}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-control border border-border bg-background-alt py-2.5 text-sm font-semibold text-text transition-colors duration-(--dur-fast) hover:bg-surface-alt disabled:opacity-60"
              >
                {demoLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Opening demo...
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" aria-hidden />
                    Explore the demo dashboard
                  </>
                )}
              </button>
              <p className="mt-2 text-center text-xs text-text-muted">
                Read-only access to seeded demo data — no account needed.
              </p>
            </div>
          )}
        </form>

        <p className="mt-4 text-center text-sm text-text-muted">
          <Link href="/" className="font-medium text-accent hover:text-accent-hover transition-colors duration-(--dur-fast)">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
