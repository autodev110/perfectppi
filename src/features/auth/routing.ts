import type { UserRole } from "@/types/enums";

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
