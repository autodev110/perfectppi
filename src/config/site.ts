export const siteConfig = {
  name: "PerfectPPI",
  description:
    "Professional pre-purchase vehicle inspections with standardized reports and warranty options.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
} as const;

export const navConfig = {
  public: [
    { label: "Home", href: "/" },
    { label: "Find a Technician", href: "/technicians" },
  ],
  dashboard: [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Vehicles", href: "/dashboard/vehicles", icon: "Car" },
    { label: "Inspections", href: "/dashboard/ppi", icon: "ClipboardCheck" },
    { label: "Warranties", href: "/dashboard/warranty", icon: "Shield" },
    { label: "Messages", href: "/dashboard/messages", icon: "MessageSquare" },
    { label: "Media", href: "/dashboard/media", icon: "Image" },
  ],
  tech: [
    { label: "Dashboard", href: "/tech", icon: "LayoutDashboard" },
    { label: "Inspections", href: "/tech/ppi", icon: "ClipboardCheck" },
    { label: "Profile", href: "/tech/profile", icon: "User" },
    { label: "Organization", href: "/tech/organization", icon: "Building2" },
    { label: "Messages", href: "/tech/messages", icon: "MessageSquare" },
  ],
  org: [
    { label: "Dashboard", href: "/org", icon: "LayoutDashboard" },
    { label: "Technicians", href: "/org/technicians", icon: "Users" },
    { label: "Inspections", href: "/org/inspections", icon: "ClipboardCheck" },
    { label: "Profile", href: "/org/profile", icon: "Building2" },
  ],
  admin: [
    { label: "Overview", href: "/admin", icon: "LayoutDashboard" },
    { label: "Users", href: "/admin/users", icon: "Users" },
    { label: "Vehicles", href: "/admin/vehicles", icon: "Car" },
    { label: "Technicians", href: "/admin/technicians", icon: "Wrench" },
    { label: "Organizations", href: "/admin/organizations", icon: "Building2" },
    {
      label: "Inspections",
      href: "/admin/inspections",
      icon: "ClipboardCheck",
    },
    { label: "Outputs", href: "/admin/outputs", icon: "FileText" },
    { label: "Warranties", href: "/admin/warranties", icon: "Shield" },
    { label: "Contracts", href: "/admin/contracts", icon: "FileSignature" },
    { label: "Payments", href: "/admin/payments", icon: "CreditCard" },
    {
      label: "Communications",
      href: "/admin/communications",
      icon: "MessageSquare",
    },
    { label: "Audit Log", href: "/admin/audit", icon: "ScrollText" },
  ],
} as const;
