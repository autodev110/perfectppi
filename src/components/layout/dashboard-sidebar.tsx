"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

import { useTranslator } from "@/lib/i18n/client";

export function DashboardSidebar() {
  const uiText = useTranslator();
  return <Sidebar items={navConfig.dashboard} title={uiText("ui.consumer_3fdb185870")} />;
}
