import type { UserRole } from "@/types/enums";

/**
 * A local path to come back to after signing in. Long enough for a deep link that
 * carries encoded text: an 80-character Georgian shop name is over 700 characters.
 * Browsers strip tabs and newlines from a redirect, so "/<tab>/site" would leave here.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  return value.length <= 2048 ? value : null;
}

/** Terms come before any deep link. Someone who already accepted is sent straight on. */
export function legalAcceptPath(returnTo: string | null): string {
  if (!returnTo) return "/legal/accept";
  return returnTo.startsWith("/legal/accept") ? returnTo : `/legal/accept?next=${encodeURIComponent(returnTo)}`;
}

export function getRoleHomePath(role: UserRole | null | undefined): string {
  switch (role) {
    case "technician":
      return "/tech";
    case "org_manager":
      return "/org";
    case "admin":
      return "/admin";
    case "developer":
      return "/dev";
    case "consumer":
    default:
      return "/dashboard";
  }
}

/**
 * Inbox route for a role. Each portal serves messages under its own prefix and
 * guards the others with `requireRole`, so anything that redirects a user into
 * a thread (e.g. Contact Seller) has to resolve the base from their role — a
 * hardcoded "/dashboard/messages" bounces every non-consumer straight back out.
 */
export function getMessagesBasePath(role: UserRole | null | undefined): string {
  // The developer portal is only the role switcher — there is no /dev/messages
  // to route to, and a conversation link built from it would 404. Fall through
  // to the consumer inbox, whose requireRole redirects back to /dev instead.
  if (role === "developer") return "/dashboard/messages";

  return `${getRoleHomePath(role)}/messages`;
}
