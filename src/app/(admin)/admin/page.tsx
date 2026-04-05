import { getAdminMetrics } from "@/features/admin/queries";
import { Users, Wrench, Building2, Car, TrendingUp } from "lucide-react";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const metrics = await getAdminMetrics();

  const stats = [
    {
      label: "Total Users",
      value: metrics.totalUsers,
      icon: Users,
      href: "/admin/users",
      change: "+12.5%",
      bgIcon: "bg-secondary-container",
      textIcon: "text-on-secondary-container",
    },
    {
      label: "Technicians",
      value: metrics.totalTechnicians,
      icon: Wrench,
      href: "/admin/technicians",
      change: "+8.1%",
      bgIcon: "bg-tertiary-container",
      textIcon: "text-on-tertiary-container",
    },
    {
      label: "Organizations",
      value: metrics.totalOrganizations,
      icon: Building2,
      href: "/admin/organizations",
      change: null,
      bgIcon: "bg-secondary-container",
      textIcon: "text-on-secondary-container",
    },
    {
      label: "Vehicles",
      value: metrics.totalVehicles,
      icon: Car,
      href: "/admin/vehicles",
      change: null,
      bgIcon: "bg-secondary-container",
      textIcon: "text-on-secondary-container",
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex justify-between items-end">
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tighter text-on-surface">
            Overview
          </h1>
          <p className="text-on-surface-variant font-medium mt-1">
            Platform-wide metrics &amp; system health
          </p>
        </div>
      </header>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon, href, change, bgIcon, textIcon }) => (
          <Link
            key={label}
            href={href}
            className="bg-surface-container-lowest p-6 rounded-xl shadow-sm ring-1 ring-outline-variant/10 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 rounded-lg ${bgIcon} ${textIcon}`}>
                <Icon className="h-5 w-5" />
              </div>
              {change && (
                <span className="text-xs font-bold bg-secondary-container/30 px-2 py-1 rounded text-secondary flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {change}
                </span>
              )}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {label}
            </p>
            <h2 className="font-heading text-3xl font-black mt-1">
              {value.toLocaleString()}
            </h2>
          </Link>
        ))}
      </div>

      {/* Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl shadow-sm ring-1 ring-outline-variant/10 p-6">
          <h3 className="font-heading text-lg font-bold mb-6">
            Quick Navigation
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Users", href: "/admin/users", icon: Users },
              { label: "Technicians", href: "/admin/technicians", icon: Wrench },
              { label: "Vehicles", href: "/admin/vehicles", icon: Car },
              { label: "Organizations", href: "/admin/organizations", icon: Building2 },
            ].map(({ label, href, icon: NavIcon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors"
              >
                <NavIcon className="h-5 w-5 text-on-surface-variant" />
                <span className="font-semibold text-sm">{label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Platform Stats */}
        <div className="bg-gradient-to-br from-tertiary-container to-primary-container p-6 rounded-xl shadow-lg text-white">
          <h4 className="font-heading font-bold text-sm mb-4">
            Platform Status
          </h4>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-black">Active</span>
          </div>
          <p className="text-[10px] text-primary-fixed-dim mt-4 uppercase font-bold tracking-widest">
            All systems operational
          </p>
        </div>
      </div>
    </div>
  );
}
