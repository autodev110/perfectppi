"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

import { useTranslator } from "@/lib/i18n/client";

export function OrgSidebar() {
  const uiText = useTranslator();
  return <Sidebar items={navConfig.org} title={uiText("ui.organization_d764d42592")} />;
}
