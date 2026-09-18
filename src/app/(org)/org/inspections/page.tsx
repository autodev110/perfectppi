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
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  in_progress: "secondary",
  submitted: "default",
  completed: "default",
  needs_revision: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: uiText("ui.draft_ebf12ef47c"),
  in_progress: uiText("ui.in_progress_b4cc4b07c3"),
  submitted: uiText("ui.submitted_64900440a8"),
  completed: uiText("ui.completed_22a970d2e5"),
  needs_revision: uiText("ui.needs_revision_35d98e8994"),
};

const PPI_TYPE_LABEL: Record<string, string> = {
  personal: uiText("ui.personal_845f928640"),
  general_tech: uiText("ui.general_tech_abac3cc0ed"),
  certified_tech: uiText("ui.certified_tech_43c5ead0c8"),
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
  const uiText = await getRequestTranslator();
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
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.organization_inspections_216d6dbf6e")}</h1>
          <p className="text-muted-foreground text-sm">
            {total.toLocaleString()}{uiText("ui.inspection_6ddb257e8e")}{total !== 1 ? uiText("ui.s_043a718774") : ""}{uiText("ui.by_your_technicians_878cba663f")}{hasFilters && " · Filtered"}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <form action="/org/inspections" method="GET" className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs font-bold text-muted-foreground mb-1">{uiText("ui.status_920e413c7d")}</p>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">{uiText("ui.all_statuses_8ee57323a6")}</option>
            <option value="draft">{uiText("ui.draft_ebf12ef47c")}</option>
            <option value="in_progress">{uiText("ui.in_progress_b4cc4b07c3")}</option>
            <option value="submitted">{uiText("ui.submitted_64900440a8")}</option>
            <option value="completed">{uiText("ui.completed_22a970d2e5")}</option>
            <option value="needs_revision">{uiText("ui.needs_revision_35d98e8994")}</option>
          </select>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground mb-1">{uiText("ui.from_date_3813fd0790")}</p>
          <Input
            name="from"
            type="date"
            defaultValue={params.from ?? ""}
            className="h-9 w-36 text-sm"
          />
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground mb-1">{uiText("ui.to_date_485348889f")}</p>
          <Input
            name="to"
            type="date"
            defaultValue={params.to ?? ""}
            className="h-9 w-36 text-sm"
          />
        </div>

        <Button type="submit" size="sm">{uiText("ui.apply_31e392d1c0")}</Button>
        {hasFilters && (
          <Button asChild variant="outline" size="sm">
            <Link href="/org/inspections">
              <X className="h-3.5 w-3.5 mr-1" />{uiText("ui.clear_83b12c2216")}</Link>
          </Button>
        )}
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.vehicle_a62394ba4a")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.type_baaddf70fb")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.requester_b5687cf04a")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.technician_9041ccc417")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.status_920e413c7d")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.submitted_64900440a8")}</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {hasFilters ? uiText("ui.no_inspections_match_your_filters_fbc3b1812f") : uiText("ui.no_inspections_by_your_technicians_yet_0a705acc22")}
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
                  : uiText("ui.unknown_vehicle_615ff95383");
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
                            {getInitials(req?.requester?.display_name ?? uiText("ui.u_a25513c7e0"))}
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
                              {getInitials(performer.display_name ?? uiText("ui.t_e632b7095b"))}
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
                        >{uiText("ui.view_dcc839a401")}<ArrowRight className="h-3 w-3" />
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
          <p className="text-muted-foreground">{uiText("ui.page_6076934f99")}{currentPage}{uiText("ui.of_a4282e4b22")}{totalPages}
          </p>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildUrl({ page: String(currentPage - 1) })}>{uiText("ui.previous_a57b08a480")}</Link>
              </Button>
            )}
            {currentPage < totalPages && (
              <Button asChild size="sm">
                <Link href={buildUrl({ page: String(currentPage + 1) })}>{uiText("ui.next_1ff57a29d7")}</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
