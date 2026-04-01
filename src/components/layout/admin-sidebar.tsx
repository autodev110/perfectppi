"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

export function AdminSidebar() {
  return <Sidebar items={navConfig.admin} title="Admin" />;
}
