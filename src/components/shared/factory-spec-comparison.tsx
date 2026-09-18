import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import {
  compareToFactory,
  type CurrentBuild,
  type SpecComparison,
  type VehicleFactorySpec,
} from "@/lib/vehicles/factory-spec";
import { t as uiText } from "@/lib/i18n";

// Factory Spec vs Current Build (Renditions doc). The VIN-decoded layer is
// shown next to the owner's current build so a swapped engine or a
// converted drivetrain is always labeled as such, and a difference the
// owner has not explained is called out rather than silently believed.
const STATUS_LABEL: Record<SpecComparison["status"], { text: string; tone: string }> = {
  match: { text: uiText("ui.factory_c4b97afe64"), tone: "text-on-surface-variant" },
  declared: { text: uiText("ui.swapped_converted_563f55cdba"), tone: "text-warning" },
  differs: { text: uiText("ui.differs_from_factory_not_confirmed_8b8c89e5de"), tone: "text-destructive" },
  unknown: { text: uiText("ui.no_factory_data_1b9029a48b"), tone: "text-on-surface-variant" },
};

export function FactorySpecComparison({
  spec,
  current,
  ownerView = false,
  compact = false,
}: {
  spec: VehicleFactorySpec | null;
  current: CurrentBuild;
  ownerView?: boolean;
  compact?: boolean;
}) {
  const rows = compareToFactory(spec, current);
  const unconfirmed = rows.filter((row) => row.status === "differs");
  return (
    <div className="space-y-3">
      {spec ? (
        <p className="text-xs text-on-surface-variant">{uiText("ui.factory_values_come_from_the_vin_nhtsa_vpic_74abe6f4d7")}{spec.decoded_at ? uiText("ui.decoded_15f3116cbd", { arg0: String(new Date(spec.decoded_at).toLocaleDateString()) }) : ""}{uiText("ui.and_are_never_edited_the_current_build_is_wh_c6c1755fd1")}</p>
      ) : (
        <p className="text-xs text-on-surface-variant">{uiText("ui.no_vin_on_file_so_there_is_no_factory_record_26928c1ae8")}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              <th className="py-1.5 pr-3">{uiText("ui.spec_9bdc1337d7")}</th>
              <th className="py-1.5 pr-3">{uiText("ui.factory_vin_4127ec19eb")}</th>
              <th className="py-1.5 pr-3">{uiText("ui.current_e0d1b68224")}</th>
              {!compact ? <th className="py-1.5">{uiText("ui.status_920e413c7d")}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/40">
            {rows.map((row) => {
              const label = STATUS_LABEL[row.status];
              return (
                <tr key={row.field}>
                  <td className="py-2 pr-3 font-semibold">{row.label}</td>
                  <td className="py-2 pr-3 text-on-surface-variant">{row.factory ?? "—"}</td>
                  <td className="py-2 pr-3 font-medium">
                    {row.current ?? "—"}
                    {compact && row.status !== "match" && row.status !== "unknown" ? (
                      <span className={`ml-1.5 text-[11px] font-semibold ${label.tone}`}>({label.text})</span>
                    ) : null}
                  </td>
                  {!compact ? (
                    <td className={`py-2 text-xs font-semibold ${label.tone}`}>
                      <span className="inline-flex items-center gap-1">
                        {row.status === "match" ? <CheckCircle2 className="h-3.5 w-3.5" /> : row.status === "declared" ? <Wrench className="h-3.5 w-3.5" /> : row.status === "differs" ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                        {label.text}
                      </span>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {spec && !compact ? (
        <dl className="grid gap-x-6 gap-y-1 text-xs text-on-surface-variant sm:grid-cols-3">
          {spec.fuel_type ? <div><dt className="font-bold uppercase tracking-wider text-[10px]">{uiText("ui.fuel_a80f942f41")}</dt><dd>{spec.fuel_type}</dd></div> : null}
          {spec.doors ? <div><dt className="font-bold uppercase tracking-wider text-[10px]">{uiText("ui.doors_7989480e41")}</dt><dd>{spec.doors}</dd></div> : null}
          {spec.plant_country ? <div><dt className="font-bold uppercase tracking-wider text-[10px]">{uiText("ui.built_in_78a6a8fe9b")}</dt><dd>{[spec.plant_city, spec.plant_country].filter(Boolean).join(", ")}</dd></div> : null}
        </dl>
      ) : null}
      {unconfirmed.length > 0 ? (
        <p className="flex items-start gap-1.5 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-on-surface">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <span>
            {ownerView
              ? uiText("ui.from_the_factory_record_but_still_marked_ori_13aa014d14", { arg0: String(unconfirmed.map((row) => row.label).join(", ")), arg1: String(unconfirmed.length === 1 ? "differs" : "differ"), arg2: String(unconfirmed.length === 1 ? "is" : "are") })
              : uiText("ui.from_the_factory_record_without_an_explanati_e36aaff536", { arg0: String(unconfirmed.map((row) => row.label).join(", ")), arg1: String(unconfirmed.length === 1 ? "differs" : "differ") })}
          </span>
        </p>
      ) : null}
    </div>
  );
}
