"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, signInWithGoogle } from "@/features/auth/actions";
import { Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      <header className="mb-10">
        <h2 className="text-3xl font-heading font-extrabold text-on-surface tracking-tight mb-2">
          Welcome Back
        </h2>
        <p className="text-on-secondary-container font-medium">
          Enter your credentials to access your account.
        </p>
      </header>

      <div className="space-y-6">
        {/* Google OAuth */}
        <form action={async () => { await signInWithGoogle(); }}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 h-14 bg-surface-container-low hover:bg-surface-container-high transition-all rounded-xl border border-outline-variant/10 text-on-surface font-semibold text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
        </form>

        {/* Separator */}
        <div className="relative flex items-center py-2">
          <div className="flex-grow border-t border-outline-variant/20" />
          <span className="flex-shrink mx-4 text-xs font-bold uppercase tracking-widest text-outline-variant">
            or use email
          </span>
          <div className="flex-grow border-t border-outline-variant/20" />
        </div>

        {/* Form */}
        <form action={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1"
            >
              Email Address
            </label>
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="w-full h-14 px-4 rounded-xl bg-surface-container-low border-none focus:ring-2 focus:ring-on-tertiary-container/30 transition-all text-on-surface placeholder:text-outline-variant font-medium"
              />
              <Mail className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-outline-variant" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label
                htmlFor="password"
                className="text-xs font-bold uppercase tracking-widest text-on-surface-variant"
              >
                Password
              </label>
              <Link
                href="#"
                className="text-xs font-bold text-on-tertiary-container hover:underline"
              >
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="w-full h-14 px-4 rounded-xl bg-surface-container-low border-none focus:ring-2 focus:ring-on-tertiary-container/30 transition-all text-on-surface placeholder:text-outline-variant font-medium"
              />
              <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-outline-variant" />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 bg-on-tertiary-container hover:bg-tertiary-container text-white font-heading font-bold rounded-xl shadow-lg shadow-on-tertiary-container/10 transition-all active:scale-[0.98] mt-4 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>

      <footer className="mt-12 text-center">
        <p className="text-on-secondary-container font-medium">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-on-tertiary-container font-bold hover:underline"
          >
            Create Account
          </Link>
        </p>
      </footer>
    </>
  );
}
