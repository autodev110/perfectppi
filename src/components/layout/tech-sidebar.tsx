"use client";

import { navConfig } from "@/config/site";
import { Sidebar } from "./sidebar";

export function TechSidebar() {
  return <Sidebar items={navConfig.tech} title="Technician" />;
}
