"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

import { useTranslator } from "@/lib/i18n/client";

export function AdminSidebar() {
  const uiText = useTranslator();
  return <Sidebar items={navConfig.admin} title={uiText("ui.admin_c1c224b03c")} />;
}
