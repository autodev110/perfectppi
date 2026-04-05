"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePpiWizard } from "@/features/ppi/hooks";
import { TechSelector } from "@/components/shared/tech-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressTracker } from "@/components/shared/progress-tracker";
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
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
  "Vehicle",
  "Vehicle Info",
  "Ownership",
  "Your Role",
  "Performer",
  "Select Tech",
  "Confirm",
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
  const router = useRouter();
  const wizard = usePpiWizard();
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
      setLoadingVehicles(false);
    }
    loadVehicles();
  }, []);

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
          <Link href="/dashboard/ppi">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-bold">New Inspection</h1>
          <p className="text-muted-foreground text-sm">
            Step {wizard.currentIndex + 1} of {wizard.totalSteps}
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

      {/* Step: Vehicle */}
      {wizard.step === "vehicle" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Which vehicle are you inspecting?</h2>
          {loadingVehicles ? (
            <p className="text-muted-foreground text-sm">Loading vehicles…</p>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-muted-foreground text-sm">No vehicles yet.</p>
              <Button asChild variant="outline">
                <Link href="/dashboard/vehicles/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add a Vehicle First
                </Link>
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
                      <p className="font-semibold">{name || "Unnamed Vehicle"}</p>
                      {v.vin && <p className="text-xs text-muted-foreground font-mono">{v.vin}</p>}
                    </div>
                  </button>
                );
              })}
              <Button variant="outline" asChild className="w-full">
                <Link href="/dashboard/vehicles/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Vehicle
                </Link>
              </Button>
            </div>
          )}
          <Button
            onClick={wizard.next}
            disabled={!wizard.form.vehicle_id}
            className="w-full h-12"
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step: Vehicle info */}
      {wizard.step === "vehicle_info" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Confirm the vehicle details</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Enter the VIN and current mileage before the inspection starts.
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vin">VIN</Label>
              <Input
                id="vin"
                value={wizard.form.vin}
                onChange={(e) => wizard.update("vin", e.target.value.toUpperCase())}
                placeholder="17-character VIN"
                maxLength={17}
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mileage">Mileage</Label>
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
            <Button variant="outline" onClick={wizard.back} className="flex-1">Back</Button>
            <Button
              onClick={wizard.next}
              disabled={!wizard.form.vin.trim() || !wizard.form.mileage.trim()}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step: Whose car */}
      {wizard.step === "whose_car" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Whose vehicle is this?</h2>
          <div className="space-y-3">
            <OptionCard
              selected={wizard.form.whose_car === "own"}
              onClick={() => wizard.update("whose_car", "own")}
              icon={User}
              title="My vehicle"
              description="This vehicle belongs to me"
            />
            <OptionCard
              selected={wizard.form.whose_car === "other"}
              onClick={() => wizard.update("whose_car", "other")}
              icon={Car}
              title="Someone else's vehicle"
              description="I'm inspecting a vehicle that belongs to another party"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">Back</Button>
            <Button onClick={wizard.next} disabled={!wizard.form.whose_car} className="flex-1">Continue</Button>
          </div>
        </div>
      )}

      {/* Step: Requester role */}
      {wizard.step === "requester_role" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">What is your role with this vehicle?</h2>
          <div className="space-y-3">
            <OptionCard
              selected={wizard.form.requester_role === "buying"}
              onClick={() => wizard.update("requester_role", "buying")}
              icon={ShoppingCart}
              title="I'm buying"
              description="I want to inspect before purchasing"
            />
            <OptionCard
              selected={wizard.form.requester_role === "selling"}
              onClick={() => wizard.update("requester_role", "selling")}
              icon={Tag}
              title="I'm selling"
              description="I want a pre-sale inspection for transparency"
            />
            <OptionCard
              selected={wizard.form.requester_role === "documenting"}
              onClick={() => wizard.update("requester_role", "documenting")}
              icon={Car}
              title="Just documenting"
              description="I want to record the vehicle's current condition"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">Back</Button>
            <Button onClick={wizard.next} disabled={!wizard.form.requester_role} className="flex-1">Continue</Button>
          </div>
        </div>
      )}

      {/* Step: Performer type */}
      {wizard.step === "performer_type" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Who will perform the inspection?</h2>
          <div className="space-y-3">
            <OptionCard
              selected={wizard.form.performer_type === "self"}
              onClick={() => wizard.update("performer_type", "self")}
              icon={User}
              title="I'll inspect it myself"
              description="Personal PPI — guided step-by-step inspection on your device"
            />
            <OptionCard
              selected={wizard.form.performer_type === "technician"}
              onClick={() => wizard.update("performer_type", "technician")}
              icon={Wrench}
              title="Assign a technician"
              description="A certified technician will complete the inspection"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">Back</Button>
            <Button onClick={wizard.next} disabled={!wizard.form.performer_type} className="flex-1">Continue</Button>
          </div>
        </div>
      )}

      {/* Step: Select tech (only if technician) */}
      {wizard.step === "select_tech" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Select a Technician</h2>
          <TechSelector
            selectedId={wizard.form.assigned_tech_profile_id}
            onSelect={(id, name) => {
              wizard.update("assigned_tech_profile_id", id);
              wizard.update("selected_tech_name", name);
            }}
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">Back</Button>
            <Button
              onClick={wizard.next}
              disabled={!wizard.form.assigned_tech_profile_id}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step: Confirm */}
      {wizard.step === "confirm" && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Review & Start</h2>
          <div className="rounded-2xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Car className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Vehicle</p>
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
                    : "Selected vehicle"}
                </p>
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  VIN {wizard.form.vin || "Not provided"} • {wizard.form.mileage || "0"} mi
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your Role</p>
                <p className="font-semibold capitalize">{wizard.form.requester_role}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {wizard.form.performer_type === "self" ? (
                <User className="h-5 w-5 text-muted-foreground" />
              ) : (
                <UserCheck className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Performed By</p>
                <p className="font-semibold">
                  {wizard.form.performer_type === "self"
                    ? "Myself (Personal PPI)"
                    : wizard.form.selected_tech_name
                    ? `${wizard.form.selected_tech_name} (Technician)`
                    : "Technician (unassigned)"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={wizard.back} className="flex-1">Back</Button>
            <Button
              onClick={handleSubmit}
              disabled={wizard.submitting}
              className="flex-1 h-12 font-bold"
            >
              {wizard.submitting
                ? "Creating…"
                : wizard.form.performer_type === "self"
                ? "Start Inspection"
                : "Send to Technician"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
