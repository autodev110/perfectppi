import { getMyOrg, getOrgInspections } from "@/features/organizations/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDate, getInitials } from "@/lib/utils/formatting";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { notFound } from "next/navigation";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  in_progress: "secondary",
  submitted: "default",
  completed: "default",
  needs_revision: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  submitted: "Submitted",
  completed: "Completed",
  needs_revision: "Needs Revision",
};

const PPI_TYPE_LABEL: Record<string, string> = {
  personal: "Personal",
  general_tech: "General Tech",
  certified_tech: "Certified Tech",
};

const PPI_TYPE_COLOR: Record<string, string> = {
  personal: "bg-amber-100 text-amber-700",
  general_tech: "bg-slate-100 text-slate-700",
  certified_tech: "bg-yellow-100 text-yellow-700",
};

type PageProps = {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function OrgInspectionsPage({ searchParams }: PageProps) {
  await requireRole(["org_manager"]);

  const org = await getMyOrg();
  if (!org) notFound();

  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page ?? "1"));
  const perPage = 50;

  const { submissions, total } = await getOrgInspections(org.id, currentPage, perPage, {
    status: params.status,
  });

  const totalPages = Math.ceil(total / perPage);
  const hasFilters = !!(params.status || params.from || params.to);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = { ...params, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/org/inspections${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Organization Inspections</h1>
          <p className="text-muted-foreground text-sm">
            {total.toLocaleString()} inspection{total !== 1 ? "s" : ""} by your technicians
            {hasFilters && " · Filtered"}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <form action="/org/inspections" method="GET" className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs font-bold text-muted-foreground mb-1">Status</p>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In Progress</option>
            <option value="submitted">Submitted</option>
            <option value="completed">Completed</option>
            <option value="needs_revision">Needs Revision</option>
          </select>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground mb-1">From date</p>
          <Input
            name="from"
            type="date"
            defaultValue={params.from ?? ""}
            className="h-9 w-36 text-sm"
          />
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground mb-1">To date</p>
          <Input
            name="to"
            type="date"
            defaultValue={params.to ?? ""}
            className="h-9 w-36 text-sm"
          />
        </div>

        <Button type="submit" size="sm">Apply</Button>
        {hasFilters && (
          <Button asChild variant="outline" size="sm">
            <Link href="/org/inspections">
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Link>
          </Button>
        )}
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Vehicle</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Requester</th>
              <th className="px-4 py-3 text-left font-medium">Technician</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Submitted</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {hasFilters ? "No inspections match your filters." : "No inspections by your technicians yet."}
                </td>
              </tr>
            ) : (
              submissions.map((sub) => {
                const req = sub.ppi_request as {
                  id: string;
                  ppi_type: string;
                  vehicle: { year: number | null; make: string | null; model: string | null } | null;
                  requester: { id: string; display_name: string | null; username: string | null } | null;
                } | null;
                const performer = sub.performer as { id: string; display_name: string | null; username: string | null } | null;
                const vehicle = req?.vehicle;
                const vehicleLabel = vehicle
                  ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
                  : "Unknown Vehicle";
                const ppiType = req?.ppi_type ?? "";

                return (
                  <tr key={sub.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{vehicleLabel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${PPI_TYPE_COLOR[ppiType] ?? "bg-muted text-muted-foreground"}`}>
                        {PPI_TYPE_LABEL[ppiType] ?? ppiType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px]">
                            {getInitials(req?.requester?.display_name ?? "U")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">
                          {req?.requester?.display_name ?? req?.requester?.username ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {performer ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(performer.display_name ?? "T")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">
                            {performer.display_name ?? performer.username}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[sub.status] ?? "outline"}>
                        {STATUS_LABEL[sub.status] ?? sub.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sub.submitted_at ? formatDate(sub.submitted_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {req?.id && (
                        <Link
                          href={`/tech/ppi/${req.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:gap-2 transition-all"
                        >
                          View
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildUrl({ page: String(currentPage - 1) })}>Previous</Link>
              </Button>
            )}
            {currentPage < totalPages && (
              <Button asChild size="sm">
                <Link href={buildUrl({ page: String(currentPage + 1) })}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
