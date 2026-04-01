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
