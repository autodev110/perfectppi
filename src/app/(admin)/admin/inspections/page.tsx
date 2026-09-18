import { getAdminInspections } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/formatting";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/formatting";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
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
    ppiType?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function AllInspectionsPage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);

  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page ?? "1"));
  const perPage = 50;

  const { submissions, total } = await getAdminInspections(currentPage, perPage, {
    status: params.status,
    ppiType: params.ppiType,
    from: params.from,
    to: params.to,
  });

  const totalPages = Math.ceil(total / perPage);
  const hasFilters = !!(params.status || params.ppiType || params.from || params.to);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = { ...params, ...overrides };
    const qs = Object.entries(p)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/admin/inspections${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.all_inspections_426376221e")}</h1>
          <p className="text-muted-foreground text-sm">
            {total.toLocaleString()}{uiText("ui.inspection_6ddb257e8e")}{total !== 1 ? uiText("ui.s_043a718774") : ""}{uiText("ui.total_88c4fa9611")}{hasFilters && " · Filtered"}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <form action="/admin/inspections" method="GET" className="flex flex-wrap gap-3 items-end">
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
          <p className="text-xs font-bold text-muted-foreground mb-1">{uiText("ui.ppi_type_18f86212e0")}</p>
          <select
            name="ppiType"
            defaultValue={params.ppiType ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">{uiText("ui.all_types_f10988e79e")}</option>
            <option value="personal">{uiText("ui.personal_845f928640")}</option>
            <option value="general_tech">{uiText("ui.general_tech_abac3cc0ed")}</option>
            <option value="certified_tech">{uiText("ui.certified_tech_43c5ead0c8")}</option>
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
            <Link href="/admin/inspections">
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
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.performer_f4b163abde")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.status_920e413c7d")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.submitted_64900440a8")}</th>
              <th className="px-4 py-3 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {hasFilters ? uiText("ui.no_inspections_match_your_filters_fbc3b1812f") : uiText("ui.no_inspections_yet_cb6f263e87")}
                </td>
              </tr>
            ) : (
              submissions.map((sub) => {
                const req = sub.ppi_request as {
                  id: string;
                  ppi_type: string;
                  performer_type: string;
                  vehicle: { year: number | null; make: string | null; model: string | null; vin: string | null } | null;
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
                      {vehicle?.vin && (
                        <p className="text-xs text-muted-foreground font-mono">{vehicle.vin}</p>
                      )}
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
                        <span className="text-muted-foreground italic text-xs">{uiText("ui.self_85bc0f9585")}</span>
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
                          href={`/admin/inspections/${req.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-on-tertiary-container hover:gap-2 transition-all"
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
