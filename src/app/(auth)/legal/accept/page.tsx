import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRoleHomePath } from "@/features/auth/routing";
import { recordTermsAcceptance } from "@/lib/legal/server";
import { TERMS_VERSION } from "@/lib/legal/constants";

async function acceptTerms(formData: FormData) {
  "use server";
  if (formData.get("acceptTerms") !== "on") redirect("/legal/accept?error=accept_required");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) redirect("/account-unavailable");

  await recordTermsAcceptance({ profileId: profile.id, source: "web_oauth", headers: await headers() });
  redirect(getRoleHomePath(profile.role));
}

export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) redirect("/account-unavailable");

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
      <h2 className="text-3xl font-heading font-extrabold tracking-tight">Review the Terms</h2>
      <p className="mt-3 text-sm leading-6 text-on-secondary-container">
        Before using PerfectPPI, review the current <Link href="/terms" target="_blank" className="font-semibold underline">Terms of Service</Link> and{" "}
        <Link href="/privacy" target="_blank" className="font-semibold underline">Privacy Policy</Link>. The{" "}
        <Link href="/notice-at-collection" target="_blank" className="font-semibold underline">Notice at Collection</Link> summarizes information collected at signup.
      </p>
      <form action={acceptTerms} className="mt-8 space-y-5">
        <label className="flex items-start gap-3 rounded-xl bg-surface-container-low p-4 text-sm leading-6">
          <input type="checkbox" name="acceptTerms" required className="mt-1 h-4 w-4" />
          <span>I have read and agree to the Terms of Service, version {TERMS_VERSION}.</span>
        </label>
        {params.error && <p className="text-sm font-medium text-destructive">You must explicitly accept the Terms to continue.</p>}
        <button type="submit" className="h-12 w-full rounded-xl bg-on-tertiary-container font-heading font-bold text-white">
          Accept and Continue
        </button>
      </form>
    </div>
  );
}
