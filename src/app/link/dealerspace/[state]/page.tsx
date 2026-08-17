import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Building2, Check, Link2, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  checkLinkEligibility,
  loadConsentContext,
} from "@/features/partner/user-links";
import {
  approveAccountLink,
  declineAccountLink,
} from "@/features/partner/link-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ error?: string }>;
}

// ============================================================================
// The consent screen. Reached from DealerSpace, but authenticated entirely by
// Perfect PPI: the technician signs in here with their existing Perfect PPI
// account, and the link is created only when they press Authorize.
//
// A matching email address is displayed as context and does nothing else — it
// never pre-approves or silently creates the link.
// ============================================================================

const FAILURE_COPY: Record<string, { title: string; detail: string }> = {
  unknown_transaction: {
    title: "This link request is not recognized",
    detail: "Start the connection again from DealerSpace to get a fresh link.",
  },
  expired: {
    title: "This link request has expired",
    detail: "Link requests are valid for 15 minutes. Start again from DealerSpace.",
  },
  already_used: {
    title: "This link request has already been used",
    detail: "Each request works once. Start again from DealerSpace if you need to relink.",
  },
  connection_revoked: {
    title: "This DealerSpace connection is no longer active",
    detail: "Ask your organization manager to reconnect DealerSpace in Perfect PPI.",
  },
  no_inspection_access: {
    title: "This account cannot be assigned inspections",
    detail:
      "DealerSpace inspections are assigned to technicians and organization managers. Sign in with an account that has one of those roles in this organization.",
  },
  not_org_member: {
    title: "This account is not part of the connected organization",
    detail:
      "You can only link an account that belongs to the Perfect PPI organization DealerSpace is connected to.",
  },
  profile_missing: {
    title: "We could not find your Perfect PPI profile",
    detail: "Contact support so we can look into it.",
  },
  internal_error: {
    title: "Something went wrong",
    detail: "Please try again in a moment.",
  },
};

export default async function DealerSpaceLinkPage({ params, searchParams }: PageProps) {
  const { state } = await params;
  const { error: errorParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/link/dealerspace/${state}`)}`);
  }

  const context = await loadConsentContext(state);
  if ("error" in context) {
    return <LinkFailure code={context.error} />;
  }

  if (errorParam && FAILURE_COPY[errorParam]) {
    return <LinkFailure code={errorParam} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return <LinkFailure code="profile_missing" />;
  }

  const eligibility = await checkLinkEligibility(
    profile.id,
    context.data.organizationId,
  );

  if (!eligibility.eligible) {
    return (
      <LinkFailure
        code={eligibility.reason ?? "internal_error"}
        signedInAs={profile.display_name ?? user.email ?? null}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Link2 className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Account linking
            </span>
          </div>
          <CardTitle className="text-xl">
            Link your Perfect PPI account to {context.data.partnerLabel}?
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">{context.data.organizationName}</p>
                <p className="text-muted-foreground">
                  DealerSpace user{" "}
                  <span className="font-mono text-xs">{context.data.externalUserId}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <p className="font-medium">Signed in to Perfect PPI as</p>
            <div className="rounded-lg border p-3">
              <p className="font-semibold">
                {profile.display_name ?? user.email ?? "Your account"}
              </p>
              {profile.username && (
                <p className="text-xs text-muted-foreground">@{profile.username}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Not you?{" "}
              <Link
                href={`/login?redirect=${encodeURIComponent(`/link/dealerspace/${state}`)}`}
                className="underline"
              >
                Sign in with a different account
              </Link>
              .
            </p>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <p className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                Inspections this DealerSpace user sends will be assigned to you
                automatically.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                The two accounts stay separate. DealerSpace never receives your
                Perfect PPI password or session.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Your organization manager can revoke this link at any time.
              </span>
            </p>
          </div>

          <div className="flex gap-3">
            <form action={approveAccountLink} className="flex-1">
              <input type="hidden" name="state" value={state} />
              <Button type="submit" className="w-full">
                Authorize
              </Button>
            </form>
            <form action={declineAccountLink} className="flex-1">
              <input type="hidden" name="state" value={state} />
              <Button type="submit" variant="outline" className="w-full">
                Cancel
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LinkFailure({
  code,
  signedInAs,
}: {
  code: string;
  signedInAs?: string | null;
}) {
  const copy = FAILURE_COPY[code] ?? FAILURE_COPY.internal_error;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Cannot link
            </span>
          </div>
          <CardTitle className="text-xl">{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{copy.detail}</p>
          {signedInAs && (
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium">{signedInAs}</span>.
            </p>
          )}
          <Button variant="outline" asChild>
            <Link href="/">Back to Perfect PPI</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
