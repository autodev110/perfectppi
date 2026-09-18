import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRoleHomePath } from "@/features/auth/routing";
import { recordTermsAcceptance } from "@/lib/legal/server";
import { TERMS_VERSION } from "@/lib/legal/constants";

import { getRequestTranslator } from "@/lib/i18n/server";

async function acceptTerms(formData: FormData) {
  "use server";
  if (formData.get("acceptTerms") !== "on") redirect("/legal/accept?error=accept_required");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, username_state")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) redirect("/account-unavailable");
  if (profile.username_state !== "claimed") redirect("/onboarding/username?next=/legal/accept");

  await recordTermsAcceptance({ profileId: profile.id, source: "web_oauth", headers: await headers() });
  redirect(getRoleHomePath(profile.role));
}

export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const uiText = await getRequestTranslator();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, username_state")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) redirect("/account-unavailable");
  if (profile.username_state !== "claimed") redirect("/onboarding/username?next=/legal/accept");

  const { data: accepted } = await supabase
    .from("legal_acceptances")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("document_type", "terms")
    .eq("document_version", TERMS_VERSION)
    .maybeSingle();
  if (accepted) redirect(getRoleHomePath(profile.role));

  const params = await searchParams;
  return (
    <div>
      <h2 className="text-3xl font-heading font-extrabold tracking-tight">{uiText("ui.review_the_terms_df4b4722cf")}</h2>
      <p className="mt-3 text-sm leading-6 text-on-secondary-container">{uiText("ui.before_using_perfectppi_review_the_current_c6d281f42e")}<Link href="/terms" target="_blank" className="font-semibold underline">{uiText("ui.terms_of_service_4afa55bf7a")}</Link>{uiText("ui.and_2e5f769687")}{" "}
        <Link href="/privacy" target="_blank" className="font-semibold underline">{uiText("ui.privacy_policy_506ff39462")}</Link>{uiText("ui.the_4706472a61")}{" "}
        <Link href="/notice-at-collection" target="_blank" className="font-semibold underline">{uiText("ui.notice_at_collection_6e0485e676")}</Link>{uiText("ui.summarizes_information_collected_at_signup_7e06fe2b31")}</p>
      <form action={acceptTerms} className="mt-8 space-y-5">
        <label className="flex items-start gap-3 rounded-xl bg-surface-container-low p-4 text-sm leading-6">
          <input type="checkbox" name="acceptTerms" required className="mt-1 h-4 w-4" />
          <span>{uiText("ui.i_have_read_and_agree_to_the_terms_of_servic_357297de0c")}{TERMS_VERSION}.</span>
        </label>
        {params.error && <p className="text-sm font-medium text-destructive">{uiText("ui.you_must_explicitly_accept_the_terms_to_cont_b72c985d25")}</p>}
        <button type="submit" className="h-12 w-full rounded-xl bg-on-tertiary-container font-heading font-bold text-white">{uiText("ui.accept_and_continue_bac94b1982")}</button>
      </form>
    </div>
  );
}
