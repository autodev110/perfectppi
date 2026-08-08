import type { UserRole } from "@/types/enums";

export function getRoleHomePath(role: UserRole | null | undefined): string {
  switch (role) {
    case "technician":
      return "/tech";
    case "org_manager":
      return "/org";
    case "admin":
      return "/admin";
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
  return `${getRoleHomePath(role)}/messages`;
}
