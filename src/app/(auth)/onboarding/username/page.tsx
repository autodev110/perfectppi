import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UsernameForm } from "./username-form";
import { signOut } from "@/features/auth/actions";

import { getRequestTranslator } from "@/lib/i18n/server";

function safeNextPath(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/legal/accept";
}

export default async function UsernameOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const uiText = await getRequestTranslator();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username_state")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/account-unavailable");
  if (profile.username_state === "claimed") redirect("/legal/accept");

  const params = await searchParams;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-tertiary-container">{uiText("ui.one_last_step_be98b10d2d")}</p>
      <h2 className="mt-3 text-3xl font-heading font-extrabold tracking-tight">{uiText("ui.choose_your_username_f1597938fd")}</h2>
      <p className="mt-3 text-sm leading-6 text-on-secondary-container">{uiText("ui.this_is_how_other_perfectppi_members_will_re_1448c697e3")}</p>
      <UsernameForm nextPath={safeNextPath(params.next)} />
      <form action={signOut} className="mt-4 text-center">
        <button type="submit" className="text-sm font-semibold text-on-secondary-container underline-offset-4 hover:underline">{uiText("ui.sign_out_48f0d3d397")}</button>
      </form>
    </div>
  );
}
