"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePpiWizard } from "@/features/ppi/hooks";
import { TechSelector } from "@/components/shared/tech-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressTracker } from "@/components/shared/progress-tracker";
import {
  INSPECTION_SCOPE_DESCRIPTIONS,
  INSPECTION_SCOPE_LABELS,
} from "@/features/ppi/constants";
import { createClient } from "@/lib/supabase/client";
import {
  Car,
  User,
  ShoppingCart,
  Tag,
  Wrench,
  UserCheck,
  ChevronLeft,
  Plus,
  ClipboardCheck,
  CircleDot,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { VinScanButton } from "@/components/shared/vin-scan-button";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

interface Vehicle {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  mileage: number | null;
}

const STEP_LABELS = [
  uiText("ui.inspection_type_7bd16f30e7"),
  uiText("ui.vehicle_a62394ba4a"),
  uiText("ui.vehicle_info_2fbf145100"),
  uiText("ui.ownership_c7d3acc826"),
  uiText("ui.your_role_ab3364cde0"),
  uiText("ui.performer_f4b163abde"),
  uiText("ui.select_tech_ea5fe2e575"),
  uiText("ui.confirm_eebdd24a77"),
];

function OptionCard({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full p-6 rounded-2xl border-2 text-left transition-all group",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40 bg-background"
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "p-3 rounded-xl transition-colors",
            selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="font-bold text-base">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}

export default function NewInspectionPage() {
  const uiText = useTranslator();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedVehicleId = searchParams.get("vehicle");
  const wizard = usePpiWizard();
  const updateWizard = wizard.update;
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);

  useEffect(() => {
    async function loadVehicles() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (!profile) return;

      const { data } = await supabase
        .from("vehicles")
        .select("id, year, make, model, trim, vin, mileage")
        .eq("owner_id", profile.id)
        .order("created_at", { ascending: false });

      setVehicles(data ?? []);
      const requestedVehicle = (data ?? []).find(
        (vehicle) => vehicle.id === requestedVehicleId
      );
      if (requestedVehicle) {
        updateWizard("vehicle_id", requestedVehicle.id);
        updateWizard("vin", requestedVehicle.vin ?? "");
        updateWizard(
          "mileage",
          requestedVehicle.mileage != null ? String(requestedVehicle.mileage) : ""
        );
      }
      setLoadingVehicles(false);
    }
    loadVehicles();
  }, [requestedVehicleId, updateWizard]);

  const stepLabels = STEP_LABELS.filter(
    (label) => label !== "Select Tech" || wizard.form.performer_type === "technician"
  );

  function handleVehicleSelect(vehicle: Vehicle) {
    wizard.update("vehicle_id", vehicle.id);
    wizard.update("vin", vehicle.vin ?? "");
    wizard.update("mileage", vehicle.mileage != null ? String(vehicle.mileage) : "");
  }

  async function handleSubmit() {
    const result = await wizard.submit();
    if (!result) return;
    if (result.submissionId) {
      // Self-PPI: go straight to inspect
      router.push(`/dashboard/ppi/${result.requestId}/inspect?sub=${result.submissionId}`);
    } else {
      // Tech-assigned: go to request detail
      router.push(`/dashboard/ppi/${result.requestId}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/ppi" aria-label={uiText("ui.back_to_inspections_f60e4f1784")}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.new_inspection_2841d576b4")}</h1>
          <p className="text-muted-foreground text-sm">{uiText("ui.step_474a987f3b")}{wizard.currentIndex + 1}{uiText("ui.of_a4282e4b22")}{wizard.totalSteps}
          </p>
        </div>
      </div>

      {/* Progress */}
      <ProgressTracker
        sections={stepLabels.map((label, i) => ({
          label,
          completed: i < wizard.currentIndex,
          active: i === wizard.currentIndex,
        }))}
      />

      {wizard.error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive font-medium">{wizard.error}</p>
        </div>
      )}

      {/* Step: Inspection type */}
      {wizard.step === "inspection_scope" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">{uiText("ui.what_kind_of_inspection_744aa5edd6")}</h2>
          <div className="space-y-3">
            <OptionCard
              selected={wizard.form.inspection_scope === "complete"}
              onClick={() => wizard.update("inspection_scope", "complete")}
              icon={ClipboardCheck}
              title={INSPECTION_SCOPE_LABELS.complete}
              description={INSPECTION_SCOPE_DESCRIPTIONS.complete}
            />
            <OptionCard
              selected={wizard.form.inspection_scope === "dents_tires"}
              onClick={() => wizard.update("inspection_scope", "dents_tires")}
              icon={CircleDot}
              title={INSPECTION_SCOPE_LABELS.dents_tires}
              description={INSPECTION_SCOPE_DESCRIPTIONS.dents_tires}
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={wizard.next} className="flex-1">{uiText("ui.continue_31fbef1625")}</Button>
          </div>
        </div>
      )}

      {/* Step: Vehicle */}
      {wizard.step === "vehicle" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">{uiText("ui.which_vehicle_are_you_inspecting_7518e126fc")}</h2>
          {loadingVehicles ? (
            <p className="text-muted-foreground text-sm">{uiText("ui.loading_vehicles_e6d4c5ba32")}</p>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-muted-foreground text-sm">{uiText("ui.no_vehicles_yet_45c11738a9")}</p>
              <Button asChild variant="outline">
                <Link href="/dashboard/vehicles/new?returnTo=%2Fdashboard%2Fppi%2Fnew">
                  <Plus className="h-4 w-4 mr-2" />{uiText("ui.new_vehicle_ba5174d888")}</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {vehicles.map((v) => {
                const name = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
                const selected = wizard.form.vehicle_id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => handleVehicleSelect(v)}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                      selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    )}
                  >
                    <Car className={cn("h-6 w-6", selected ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className="font-semibold">{name || uiText("ui.unnamed_vehicle_d76c0d0940")}</p>
                      {v.vin && <p className="text-xs text-muted-foreground font-mono">{v.vin}</p>}
                    </div>
                  </button>
                );
              })}
              <Button variant="outline" asChild className="w-full">
                <Link href="/dashboard/vehicles/new?returnTo=%2Fdashboard%2Fppi%2Fnew">
                  <Plus className="h-4 w-4 mr-2" />{uiText("ui.new_vehicle_ba5174d888")}</Link>
              </Button>
            </div>
          )}
          <Button
            onClick={wizard.next}
            disabled={!wizard.form.vehicle_id}
            className="w-full h-12"
          >{uiText("ui.continue_31fbef1625")}</Button>
        </div>
      )}

      {/* Step: Vehicle info */}
      {wizard.step === "vehicle_info" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">{uiText("ui.confirm_the_vehicle_details_5a51053c49")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{uiText("ui.enter_the_vin_and_current_mileage_before_the_fe8b2c0bb3")}</p>
          </div>

          <div className="rounded-2xl border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vin">{uiText("ui.vin_5e0211b12d")}</Label>
              <Input
                id="vin"
                value={wizard.form.vin}
                onChange={(e) => wizard.update("vin", e.target.value.toUpperCase())}
                placeholder={uiText("ui.17_character_vin_380e833d76")}
                maxLength={17}
                className="font-mono uppercase"
              />
              <VinScanButton
                label={wizard.form.vin.trim() ? uiText("ui.rescan_vin_3da7075dc3") : uiText("ui.scan_vin_5074b45d61")}
                onDecoded={(vehicle) => wizard.update("vin", vehicle.vin)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mileage">{uiText("ui.mileage_ffe44a0179")}</Label>
              <Input
                id="mileage"
                type="number"
                min={0}
                value={wizard.form.mileage}
                onChange={(e) => wizard.update("mileage", e.target.value)}
                placeholder="50000"
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">{uiText("ui.back_76900f1bfd")}</Button>
            <Button
              onClick={wizard.next}
              disabled={!wizard.form.vin.trim() || !wizard.form.mileage.trim()}
              className="flex-1"
            >{uiText("ui.continue_31fbef1625")}</Button>
          </div>
        </div>
      )}

      {/* Step: Whose car */}
      {wizard.step === "whose_car" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">{uiText("ui.whose_vehicle_is_this_3d249811c8")}</h2>
          <div className="space-y-3">
            <OptionCard
              selected={wizard.form.whose_car === "own"}
              onClick={() => wizard.update("whose_car", "own")}
              icon={User}
              title={uiText("ui.my_vehicle_2810180906")}
              description={uiText("ui.this_vehicle_belongs_to_me_f64fcc55ad")}
            />
            <OptionCard
              selected={wizard.form.whose_car === "other"}
              onClick={() => wizard.update("whose_car", "other")}
              icon={Car}
              title={uiText("ui.someone_else_s_vehicle_3d60f841bc")}
              description={uiText("ui.i_m_inspecting_a_vehicle_that_belongs_to_ano_9f128c5612")}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">{uiText("ui.back_76900f1bfd")}</Button>
            <Button onClick={wizard.next} disabled={!wizard.form.whose_car} className="flex-1">{uiText("ui.continue_31fbef1625")}</Button>
          </div>
        </div>
      )}

      {/* Step: Requester role */}
      {wizard.step === "requester_role" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">{uiText("ui.what_is_your_role_with_this_vehicle_b8c0ff7936")}</h2>
          <div className="space-y-3">
            <OptionCard
              selected={wizard.form.requester_role === "buying"}
              onClick={() => wizard.update("requester_role", "buying")}
              icon={ShoppingCart}
              title={uiText("ui.i_m_buying_9e4eeb5d03")}
              description={uiText("ui.i_want_to_inspect_before_purchasing_75f28852bb")}
            />
            <OptionCard
              selected={wizard.form.requester_role === "selling"}
              onClick={() => wizard.update("requester_role", "selling")}
              icon={Tag}
              title={uiText("ui.i_m_selling_420d71be88")}
              description={uiText("ui.i_want_a_pre_sale_inspection_for_transparenc_dd44d4b0d9")}
            />
            <OptionCard
              selected={wizard.form.requester_role === "documenting"}
              onClick={() => wizard.update("requester_role", "documenting")}
              icon={Car}
              title={uiText("ui.just_documenting_0ffae26047")}
              description={uiText("ui.i_want_to_record_the_vehicle_s_current_condi_7be0992f3e")}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">{uiText("ui.back_76900f1bfd")}</Button>
            <Button onClick={wizard.next} disabled={!wizard.form.requester_role} className="flex-1">{uiText("ui.continue_31fbef1625")}</Button>
          </div>
        </div>
      )}

      {/* Step: Performer type */}
      {wizard.step === "performer_type" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">{uiText("ui.who_will_perform_the_inspection_0af5af11d6")}</h2>
          <div className="space-y-3">
            <OptionCard
              selected={wizard.form.performer_type === "self"}
              onClick={() => wizard.update("performer_type", "self")}
              icon={User}
              title={uiText("ui.i_ll_inspect_it_myself_5f180c8801")}
              description={uiText("ui.personal_ppi_guided_step_by_step_inspection__363cfc586c")}
            />
            <OptionCard
              selected={wizard.form.performer_type === "technician"}
              onClick={() => wizard.update("performer_type", "technician")}
              icon={Wrench}
              title={uiText("ui.assign_a_technician_2d56ea27f1")}
              description={uiText("ui.a_certified_technician_will_complete_the_ins_628d5b7236")}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">{uiText("ui.back_76900f1bfd")}</Button>
            <Button onClick={wizard.next} disabled={!wizard.form.performer_type} className="flex-1">{uiText("ui.continue_31fbef1625")}</Button>
          </div>
        </div>
      )}

      {/* Step: Select tech (only if technician) */}
      {wizard.step === "select_tech" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">{uiText("ui.select_a_technician_270e7271bb")}</h2>
          <TechSelector
            selectedId={wizard.form.assigned_tech_profile_id}
            onSelect={(id, name) => {
              wizard.update("assigned_tech_profile_id", id);
              wizard.update("selected_tech_name", name);
            }}
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">{uiText("ui.back_76900f1bfd")}</Button>
            <Button
              onClick={wizard.next}
              disabled={!wizard.form.assigned_tech_profile_id}
              className="flex-1"
            >{uiText("ui.continue_31fbef1625")}</Button>
          </div>
        </div>
      )}

      {/* Step: Confirm */}
      {wizard.step === "confirm" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">{uiText("ui.review_start_2b3dc3c0bc")}</h2>
          <div className="rounded-2xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Car className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiText("ui.vehicle_a62394ba4a")}</p>
                <p className="font-semibold">
                  {vehicles
                    .find((v) => v.id === wizard.form.vehicle_id)
                    ? [
                        vehicles.find((v) => v.id === wizard.form.vehicle_id)?.year,
                        vehicles.find((v) => v.id === wizard.form.vehicle_id)?.make,
                        vehicles.find((v) => v.id === wizard.form.vehicle_id)?.model,
                      ]
                        .filter(Boolean)
                        .join(" ")
                    : uiText("ui.selected_vehicle_1c5bdbd072")}
                </p>
                <p className="text-sm text-muted-foreground font-mono mt-1">{uiText("ui.vin_439a32c322")}{wizard.form.vin || uiText("ui.not_provided_d83b9ff3c0")} • {wizard.form.mileage || "0"}{uiText("ui.mi_3074dbe604")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiText("ui.your_role_ab3364cde0")}</p>
                <p className="font-semibold capitalize">{wizard.form.requester_role}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiText("ui.inspection_type_7bd16f30e7")}</p>
                <p className="font-semibold">
                  {INSPECTION_SCOPE_LABELS[wizard.form.inspection_scope]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {wizard.form.performer_type === "self" ? (
                <User className="h-5 w-5 text-muted-foreground" />
              ) : (
                <UserCheck className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{uiText("ui.performed_by_50ef1c2fa9")}</p>
                <p className="font-semibold">
                  {wizard.form.performer_type === "self"
                    ? uiText("ui.myself_personal_ppi_14a730f0e9")
                    : wizard.form.selected_tech_name
                    ? uiText("ui.technician_d7cdd8040c", { arg0: String(wizard.form.selected_tech_name) })
                    : uiText("ui.technician_unassigned_d050dec7ca")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">{uiText("ui.back_76900f1bfd")}</Button>
            <Button
              onClick={handleSubmit}
              disabled={wizard.submitting}
              className="flex-1 h-12 font-bold"
            >
              {wizard.submitting
                ? uiText("ui.creating_c79ed9492e")
                : wizard.form.performer_type === "self"
                ? uiText("ui.start_inspection_945cba4b32")
                : uiText("ui.send_to_technician_8a68ad8d43")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
