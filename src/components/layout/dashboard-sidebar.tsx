"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

export function DashboardSidebar() {
  return <Sidebar items={navConfig.dashboard} title="Consumer" />;
}
