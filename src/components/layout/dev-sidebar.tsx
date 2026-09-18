"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

import { useTranslator } from "@/lib/i18n/client";

export function DevSidebar() {
  const uiText = useTranslator();
  return <Sidebar items={navConfig.dev} title={uiText("ui.developer_3fb7b39416")} />;
}
