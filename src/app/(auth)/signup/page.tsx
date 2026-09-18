"use client";

import { useState } from "react";
import Link from "next/link";
import { signUp, signInWithGoogle } from "@/features/auth/actions";
import { Mail, Lock, User } from "lucide-react";
import { UsernameInput } from "@/components/shared/username-input";

import { useTranslator } from "@/lib/i18n/client";

export default function SignUpPage() {
  const uiText = useTranslator();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signUp(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      <header className="mb-10">
        <h2 className="text-3xl font-heading font-extrabold text-on-surface tracking-tight mb-2">{uiText("ui.create_account_0dffe234b4")}</h2>
        <p className="text-on-secondary-container font-medium">{uiText("ui.get_started_with_perfectppi_in_seconds_7c522d7f21")}</p>
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
            </svg>{uiText("ui.continue_with_google_cce937e891")}</button>
        </form>
        <p className="-mt-3 text-center text-xs leading-5 text-on-secondary-container">{uiText("ui.google_sign_in_continues_to_a_versioned_term_7a81ee1830")}</p>

        {/* Separator */}
        <div className="relative flex items-center py-2">
          <div className="flex-grow border-t border-outline-variant/20" />
          <span className="flex-shrink mx-4 text-xs font-bold uppercase tracking-widest text-outline-variant">{uiText("ui.or_use_email_14622b8d6f")}</span>
          <div className="flex-grow border-t border-outline-variant/20" />
        </div>

        {/* Form */}
        <form action={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="username" className="ml-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">{uiText("ui.username_e3b89e9d33")}</label>
            <UsernameInput value={username} onChange={setUsername} />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="displayName"
              className="text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1"
            >{uiText("ui.full_name_8e00cdf71f")}</label>
            <div className="relative">
              <input
                id="displayName"
                name="displayName"
                type="text"
                placeholder={uiText("ui.john_doe_6cea57c2fb")}
                required
                className="w-full h-14 px-4 rounded-xl bg-surface-container-low border-none focus:ring-2 focus:ring-on-tertiary-container/30 transition-all text-on-surface placeholder:text-outline-variant font-medium"
              />
              <User className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-outline-variant" />
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-xl bg-surface-container-low p-4 text-sm leading-6 text-on-secondary-container">
            <input name="acceptTerms" type="checkbox" required className="mt-1 h-4 w-4" />
            <span>{uiText("ui.i_have_read_and_agree_to_the_a69ccc9a43")}{" "}
              <Link href="/terms" target="_blank" className="font-bold underline">{uiText("ui.terms_of_service_4afa55bf7a")}</Link>{uiText("ui.the_05384a3742")}<Link href="/privacy" target="_blank" className="font-bold underline">{uiText("ui.privacy_policy_506ff39462")}</Link>{uiText("ui.explains_data_use_and_is_not_a_separate_cons_841968d1a7")}{" "}<Link href="/notice-at-collection" target="_blank" className="font-bold underline">{uiText("ui.notice_at_collection_6e0485e676")}</Link>.
            </span>
          </label>

          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1"
            >{uiText("ui.email_address_09bf25ef30")}</label>
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
            <label
              htmlFor="password"
              className="text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1"
            >{uiText("ui.password_e7cf3ef4f1")}</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type="password"
                placeholder={uiText("ui.min_8_characters_a65c371c93")}
                required
                minLength={8}
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
            {loading ? uiText("ui.creating_account_7dd3701aa3") : uiText("ui.create_account_0dffe234b4")}
          </button>
        </form>
      </div>

      <footer className="mt-12 text-center">
        <p className="text-on-secondary-container font-medium">{uiText("ui.already_have_an_account_e77fea936d")}{" "}
          <Link
            href="/login"
            className="text-on-tertiary-container font-bold hover:underline"
          >{uiText("ui.sign_in_bcc0bcc914")}</Link>
        </p>
        <p className="mt-4 text-xs leading-5 text-on-secondary-container">
          <Link href="/privacy" className="underline">{uiText("ui.privacy_54a57c3147")}</Link>
          {" · "}
          <Link href="/terms" className="underline">{uiText("ui.terms_ede5489964")}</Link>
          {" · "}
          <Link href="/support" className="underline">{uiText("ui.support_be91940b79")}</Link>
        </p>
      </footer>
    </>
  );
}
