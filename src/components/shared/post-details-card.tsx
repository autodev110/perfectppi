import { BUILD_STAGE_LABELS, POST_TYPE_LABELS, type PostType } from "@/lib/community/post-types";
import { formatCurrency, formatDate, formatMileage } from "@/lib/utils/formatting";
import type { CommunityInspectionSummary } from "@/features/community/queries";
import { ClipboardCheck } from "lucide-react";

// Structured details under a post's text (plan 14.7 "rich attachment
// card"). Everything here is what the author typed into the type's fields;
// the inspection card is the redacted summary only.
export function PostDetailsCard({
  postType,
  details,
  inspection,
}: {
  postType: PostType;
  details: Record<string, unknown>;
  inspection: CommunityInspectionSummary | null;
}) {
  const str = (key: string) => (typeof details[key] === "string" ? (details[key] as string) : null);
  const num = (key: string) => (typeof details[key] === "number" ? (details[key] as number) : null);
  const list = (key: string) => (Array.isArray(details[key]) ? (details[key] as unknown[]).filter((v): v is string => typeof v === "string") : []);
  const rows: Array<[string, string]> = [];

  switch (postType) {
    case "build_update": {
      const stage = str("stage");
      if (stage && stage in BUILD_STAGE_LABELS) rows.push(["Stage", BUILD_STAGE_LABELS[stage as keyof typeof BUILD_STAGE_LABELS]]);
      if (list("parts").length) rows.push(["Parts", list("parts").join(", ")]);
      break;
    }
    case "maintenance": {
      if (str("service")) rows.push(["Service", str("service")!]);
      if (num("mileage") !== null) rows.push(["Mileage", `${formatMileage(num("mileage")!)} mi`]);
      if (num("cost_cents") !== null) rows.push(["Cost", formatCurrency(num("cost_cents")!)]);
      if (details.diy === true) rows.push(["Done by", "Owner (DIY)"]);
      if (list("parts").length) rows.push(["Parts", list("parts").join(", ")]);
      break;
    }
    case "buying_advice": {
      if (num("budget_cents") !== null) rows.push(["Budget", formatCurrency(num("budget_cents")!)]);
      if (num("year_min") !== null || num("year_max") !== null) rows.push(["Years", `${num("year_min") ?? "…"} – ${num("year_max") ?? "…"}`]);
      if (list("makes").length) rows.push(["Makes", list("makes").join(", ")]);
      if (str("use_case")) rows.push(["Use", str("use_case")!]);
      break;
    }
    case "inspection_discussion": {
      if (inspection) {
        rows.push(["Inspection", inspection.inspection_scope === "dents_tires" ? "Dents & tires" : "Complete"]);
        rows.push(["Type", inspection.ppi_type.replaceAll("_", " ")]);
        rows.push(["Status", inspection.status === "completed" ? `Completed${inspection.completed_at ? ` ${formatDate(inspection.completed_at)}` : ""}` : "Submitted"]);
      }
      break;
    }
    default:
      break;
  }
  if (rows.length === 0) return null;

  return (
    <dl className="mt-4 grid gap-x-6 gap-y-1.5 rounded-2xl bg-surface-container p-4 text-sm sm:grid-cols-[auto_1fr]">
      {postType === "inspection_discussion" ? (
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant sm:col-span-2">
          <ClipboardCheck className="h-3.5 w-3.5" />{POST_TYPE_LABELS[postType].label} · findings are not shared automatically
        </div>
      ) : null}
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-semibold text-on-surface-variant">{label}</dt>
          <dd className="text-on-surface">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
