import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import {
  compareToFactory,
  type CurrentBuild,
  type SpecComparison,
  type VehicleFactorySpec,
} from "@/lib/vehicles/factory-spec";

// Factory Spec vs Current Build (Renditions doc). The VIN-decoded layer is
// shown next to the owner's current build so a swapped engine or a
// converted drivetrain is always labeled as such, and a difference the
// owner has not explained is called out rather than silently believed.
const STATUS_LABEL: Record<SpecComparison["status"], { text: string; tone: string }> = {
  match: { text: "Factory", tone: "text-on-surface-variant" },
  declared: { text: "Swapped / converted", tone: "text-warning" },
  differs: { text: "Differs from factory — not confirmed", tone: "text-destructive" },
  unknown: { text: "No factory data", tone: "text-on-surface-variant" },
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
        <p className="text-xs text-on-surface-variant">
          Factory values come from the VIN (NHTSA vPIC{spec.decoded_at ? `, decoded ${new Date(spec.decoded_at).toLocaleDateString()}` : ""}) and are never edited. The current build is what the owner reports today.
        </p>
      ) : (
        <p className="text-xs text-on-surface-variant">No VIN on file, so there is no factory record to compare against; these are the owner&rsquo;s current values.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              <th className="py-1.5 pr-3">Spec</th>
              <th className="py-1.5 pr-3">Factory (VIN)</th>
              <th className="py-1.5 pr-3">Current</th>
              {!compact ? <th className="py-1.5">Status</th> : null}
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
          {spec.fuel_type ? <div><dt className="font-bold uppercase tracking-wider text-[10px]">Fuel</dt><dd>{spec.fuel_type}</dd></div> : null}
          {spec.doors ? <div><dt className="font-bold uppercase tracking-wider text-[10px]">Doors</dt><dd>{spec.doors}</dd></div> : null}
          {spec.plant_country ? <div><dt className="font-bold uppercase tracking-wider text-[10px]">Built in</dt><dd>{[spec.plant_city, spec.plant_country].filter(Boolean).join(", ")}</dd></div> : null}
        </dl>
      ) : null}
      {unconfirmed.length > 0 ? (
        <p className="flex items-start gap-1.5 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-on-surface">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <span>
            {ownerView
              ? `${unconfirmed.map((row) => row.label).join(", ")} ${unconfirmed.length === 1 ? "differs" : "differ"} from the factory record but ${unconfirmed.length === 1 ? "is" : "are"} still marked original. Edit the vehicle to either use the factory value or mark the part as swapped.`
              : `${unconfirmed.map((row) => row.label).join(", ")} ${unconfirmed.length === 1 ? "differs" : "differ"} from the factory record without an explanation from the owner.`}
          </span>
        </p>
      ) : null}
    </div>
  );
}
