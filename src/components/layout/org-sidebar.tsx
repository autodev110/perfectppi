"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

export function OrgSidebar() {
  return <Sidebar items={navConfig.org} title="Organization" />;
}
