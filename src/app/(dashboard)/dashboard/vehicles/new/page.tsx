"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createVehicle } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VinScanButton } from "@/components/shared/vin-scan-button";
import { CurrentBuildFields, type CurrentBuildValues } from "@/components/shared/current-build-fields";
import type { FactorySummary } from "@/lib/vehicles/factory-spec";
import { VehicleConfigurationFields } from "@/components/shared/vehicle-configuration-fields";
import { VehicleMakeModelFields } from "@/components/shared/vehicle-make-model-fields";
import Link from "next/link";

import { useTranslator } from "@/lib/i18n/client";

export default function NewVehiclePage() {
  const uiText = useTranslator();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [nickname, setNickname] = useState("");
  const [build, setBuild] = useState<CurrentBuildValues>({ engine: "", transmission: "", drivetrain: "", body_style: "" });
  const [factory, setFactory] = useState<FactorySummary | null>(null);
  const [existingVehicle, setExistingVehicle] = useState<{
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
  } | null>(null);

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    setExistingVehicle(null);
    const result = await createVehicle(formData);
    if (result?.error) {
      setError(result.error);
      setExistingVehicle(result.existingVehicle ?? null);
      setLoading(false);
      submittingRef.current = false;
    } else if (result?.data) {
      const returnTo = searchParams.get("returnTo");
      if (returnTo?.startsWith("/dashboard/ppi/new")) {
        const destination = new URL(returnTo, window.location.origin);
        destination.searchParams.set("vehicle", result.data.id);
        router.push(`${destination.pathname}${destination.search}`);
      } else {
        router.push(`/dashboard/vehicles/${result.data.id}`);
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">{uiText("ui.add_vehicle_f10cf1da45")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.vehicle_information_e1f8540b9b")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nickname">{uiText("ui.nickname_d720f61c8c")}</Label>
                <Input
                  id="nickname"
                  name="nickname"
                  placeholder={uiText("ui.blue_daily_a9b8182d60")}
                  maxLength={60}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownership_state">{uiText("ui.garage_relationship_e26b2f2b89")}</Label>
                <select
                  id="ownership_state"
                  name="ownership_state"
                  defaultValue="owned"
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="owned">{uiText("ui.owned_17b760c41c")}</option>
                  <option value="previously_owned">{uiText("ui.previously_owned_c56be55e86")}</option>
                  <option value="considering">{uiText("ui.shopping_considering_2850c42eca")}</option>
                  <option value="project">{uiText("ui.project_9859597853")}</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="year">{uiText("ui.year_89f6832560")}</Label>
                <Input
                  id="year"
                  name="year"
                  type="number"
                  placeholder="2024"
                  min={1900}
                  max={2100}
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trim">{uiText("ui.trim_aaa5478b26")}</Label>
                <Input
                  id="trim"
                  name="trim"
                  placeholder={uiText("ui.se_f031b70a26")}
                  value={trim}
                  onChange={(event) => setTrim(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <VehicleMakeModelFields make={make} model={model} year={year} onMakeChange={(value) => { setMake(value); setModel(""); }} onModelChange={setModel} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vin">{uiText("ui.vin_5e0211b12d")}</Label>
                <Input
                  id="vin"
                  name="vin"
                  placeholder={uiText("ui.17_character_vin_380e833d76")}
                  maxLength={17}
                  className="font-mono uppercase"
                  value={vin}
                  onChange={(event) => setVin(event.target.value.toUpperCase())}
                />
                <VinScanButton
                  onDecoded={(vehicle) => {
                    setVin(vehicle.vin);
                    if (vehicle.year) setYear(String(vehicle.year));
                    if (vehicle.make) setMake(vehicle.make);
                    if (vehicle.model) setModel(vehicle.model);
                    if (vehicle.trim) setTrim(vehicle.trim);
                    // The factory layer only fills blanks; anything the
                    // owner already typed stays as the current build.
                    const summary = vehicle.factory_summary ?? null;
                    setFactory(summary);
                    if (summary) {
                      setBuild((current) => ({
                        engine: current.engine || summary.engine || "",
                        transmission: current.transmission || summary.transmission || "",
                        drivetrain: current.drivetrain || summary.drivetrain || "",
                        body_style: current.body_style || summary.body_style || "",
                      }));
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mileage">{uiText("ui.mileage_ffe44a0179")}</Label>
                <Input
                  id="mileage"
                  name="mileage"
                  type="number"
                  placeholder="50000"
                  min={0}
                />
              </div>
            </div>
            <VehicleConfigurationFields />
            <div className="grid gap-4 sm:grid-cols-2">
              <CurrentBuildFields
                values={build}
                onChange={(field, value) => setBuild((current) => ({ ...current, [field]: value }))}
                factory={factory}
              />
            </div>
            {factory ? (
              <p className="text-xs text-muted-foreground">{uiText("ui.factory_values_come_from_the_vin_and_are_kep_43d882d8fb")}</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="visibility">{uiText("ui.visibility_7448611d5f")}</Label>
              <select
                id="visibility"
                name="visibility"
                defaultValue="private"
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="private">{uiText("ui.private_only_visible_in_your_dashboard_99afad0bf6")}</option>
                <option value="friends">{uiText("ui.friends_visible_to_accepted_friends_c3c3438ae7")}</option>
                <option value="public">{uiText("ui.public_can_be_used_for_public_profile_and_ma_4d85549202")}</option>
              </select>
              <p className="text-xs text-muted-foreground">{uiText("ui.keep_private_by_default_choose_public_only_w_fc82f561c9")}</p>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {existingVehicle && (
              <Link
                href={`/dashboard/vehicles/${existingVehicle.id}`}
                className="block rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
              >
                <p className="font-semibold">
                  {[existingVehicle.year, existingVehicle.make, existingVehicle.model, existingVehicle.trim]
                    .filter(Boolean)
                    .join(" ") || uiText("ui.existing_vehicle_04bb0a6731")}
                </p>
                {existingVehicle.vin && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{existingVehicle.vin}</p>
                )}
                <p className="mt-2 text-sm font-medium text-primary">{uiText("ui.view_vehicle_details_f80ae6e662")}</p>
              </Link>
            )}
            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? uiText("ui.adding_913a8849b6") : uiText("ui.add_vehicle_f10cf1da45")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >{uiText("ui.cancel_19766ed6cc")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
