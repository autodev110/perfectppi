"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

/**
 * Managers reach this portal to perform an inspection assigned to them, so they
 * get a way back to their own portal. Without it the technician nav is a
 * one-way door for anyone whose home is /org.
 */
export function TechSidebar({ showOrgReturn = false }: { showOrgReturn?: boolean }) {
  const items = showOrgReturn
    ? [...navConfig.tech, { label: "Organization Portal", href: "/org", icon: "Building2" }]
    : navConfig.tech;

  return <Sidebar items={items} title={showOrgReturn ? "Inspections" : "Technician"} />;
}
