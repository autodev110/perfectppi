"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

export function DevSidebar() {
  return <Sidebar items={navConfig.dev} title="Developer" />;
}
