"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

import { useTranslator } from "@/lib/i18n/client";

/**
 * Managers reach this portal to perform an inspection assigned to them, so they
 * get a way back to their own portal. Without it the technician nav is a
 * one-way door for anyone whose home is /org.
 */
export function TechSidebar({ showOrgReturn = false }: { showOrgReturn?: boolean }) {
  const uiText = useTranslator();
  const items = showOrgReturn
    ? [...navConfig.tech, { label: uiText("ui.organization_portal_a41feef215"), href: "/org", icon: "Building2" }]
    : navConfig.tech;

  return <Sidebar items={items} title={showOrgReturn ? uiText("ui.inspections_20cbe85cdd") : uiText("ui.technician_9041ccc417")} />;
}
