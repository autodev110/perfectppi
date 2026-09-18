import { BUILD_STAGE_LABELS, POST_TYPE_LABELS, type PostType } from "@/lib/community/post-types";
import { formatCurrency, formatDate, formatMileage } from "@/lib/utils/formatting";
import type { CommunityInspectionSummary } from "@/features/community/queries";
import { ClipboardCheck } from "lucide-react";
import { t as uiText } from "@/lib/i18n";

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
      if (stage && stage in BUILD_STAGE_LABELS) rows.push([uiText("ui.stage_de838855e4"), BUILD_STAGE_LABELS[stage as keyof typeof BUILD_STAGE_LABELS]]);
      if (list("parts").length) rows.push([uiText("ui.parts_efbcd674b4"), list("parts").join(", ")]);
      break;
    }
    case "maintenance": {
      if (str("service")) rows.push([uiText("ui.service_d677190e0a"), str("service")!]);
      if (num("mileage") !== null) rows.push([uiText("ui.mileage_ffe44a0179"), `${formatMileage(num("mileage")!)} mi`]);
      if (num("cost_cents") !== null) rows.push([uiText("ui.cost_204a5eb2cd"), formatCurrency(num("cost_cents")!)]);
      if (details.diy === true) rows.push([uiText("ui.done_by_632330eab9"), "Owner (DIY)"]);
      if (list("parts").length) rows.push([uiText("ui.parts_efbcd674b4"), list("parts").join(", ")]);
      break;
    }
    case "buying_advice": {
      if (num("budget_cents") !== null) rows.push([uiText("ui.budget_1c6225ec70"), formatCurrency(num("budget_cents")!)]);
      if (num("year_min") !== null || num("year_max") !== null) rows.push([uiText("ui.years_b68ca0811f"), `${num("year_min") ?? "…"} – ${num("year_max") ?? "…"}`]);
      if (list("makes").length) rows.push([uiText("ui.makes_cb2281be76"), list("makes").join(", ")]);
      if (str("use_case")) rows.push([uiText("ui.use_c36d819e7b"), str("use_case")!]);
      break;
    }
    case "inspection_discussion": {
      if (inspection) {
        rows.push([uiText("ui.inspection_6e4fa13da4"), inspection.inspection_scope === "dents_tires" ? uiText("ui.dents_tires_6612976b29") : uiText("ui.complete_143b270a32")]);
        rows.push([uiText("ui.type_baaddf70fb"), inspection.ppi_type.replaceAll("_", " ")]);
        rows.push([uiText("ui.status_920e413c7d"), inspection.status === "completed" ? uiText("ui.completed_40175f744f", { arg0: String(inspection.completed_at ? ` ${formatDate(inspection.completed_at)}` : "") }) : uiText("ui.submitted_64900440a8")]);
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
          <ClipboardCheck className="h-3.5 w-3.5" />{POST_TYPE_LABELS[postType].label}{uiText("ui.findings_are_not_shared_automatically_93ddcca5c1")}</div>
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
