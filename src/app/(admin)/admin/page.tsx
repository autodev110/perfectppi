import { getAdminMetrics, getAdminRecentSignups, getAdminRecentPpiActivity } from "@/features/admin/queries";
import { Users, Wrench, Building2, Car, TrendingUp, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, formatDate } from "@/lib/utils/formatting";

export default async function AdminOverviewPage() {
  const [metrics, recentSignups, recentActivity] = await Promise.all([
    getAdminMetrics(),
    getAdminRecentSignups(8),
    getAdminRecentPpiActivity(8),
  ]);

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

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Users", href: "/admin/users", icon: Users },
          { label: "Technicians", href: "/admin/technicians", icon: Wrench },
          { label: "Vehicles", href: "/admin/vehicles", icon: Car },
          { label: "Organizations", href: "/admin/organizations", icon: Building2 },
        ].map(({ label, href, icon: NavIcon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 p-4 rounded-xl bg-surface-container-lowest ring-1 ring-outline-variant/10 hover:bg-surface-container transition-colors shadow-sm"
          >
            <NavIcon className="h-5 w-5 text-on-surface-variant" />
            <span className="font-semibold text-sm">{label}</span>
          </Link>
        ))}
      </div>

      {/* Activity Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Signups */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm ring-1 ring-outline-variant/10 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-heading text-base font-bold">Recent Signups</h3>
            <Link href="/admin/users" className="text-xs font-bold text-on-tertiary-container">
              View all →
            </Link>
          </div>
          {recentSignups.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No signups yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentSignups.map((user) => (
                <li key={user.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={user.avatar_url ?? ""} />
                    <AvatarFallback className="text-xs">
                      {getInitials(user.display_name ?? "U")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {user.display_name ?? user.username ?? "—"}
                    </p>
                    <p className="text-xs text-on-surface-variant">{user.role}</p>
                  </div>
                  <span className="text-xs text-on-surface-variant shrink-0">
                    {formatDate(user.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent PPI Activity */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm ring-1 ring-outline-variant/10 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-heading text-base font-bold">Recent PPI Activity</h3>
            <Link href="/admin/inspections" className="text-xs font-bold text-on-tertiary-container">
              View all →
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No inspections yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentActivity.map((submission) => {
                const req = submission.ppi_request as {
                  ppi_type: string;
                  vehicle: { year: number | null; make: string | null; model: string | null } | null;
                } | null;
                const vehicle = req?.vehicle;
                const label = vehicle
                  ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
                  : "Unknown Vehicle";
                return (
                  <li key={submission.id} className="flex items-center gap-3">
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-tertiary-container flex items-center justify-center">
                      <ClipboardCheck className="h-4 w-4 text-on-tertiary-container" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{label}</p>
                      <p className="text-xs text-on-surface-variant capitalize">
                        {submission.status} · {req?.ppi_type ?? "—"}
                      </p>
                    </div>
                    <span className="text-xs text-on-surface-variant shrink-0">
                      {submission.submitted_at ? formatDate(submission.submitted_at) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
