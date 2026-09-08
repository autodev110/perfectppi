"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createVehicle } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VinScanButton } from "@/components/shared/vin-scan-button";
import Link from "next/link";

export default function NewVehiclePage() {
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
      <h1 className="font-heading text-2xl font-bold">Add Vehicle</h1>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
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
                <Label htmlFor="make">Make *</Label>
                <Input
                  id="make"
                  name="make"
                  placeholder="Toyota"
                  required
                  value={make}
                  onChange={(event) => setMake(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="model">Model *</Label>
                <Input
                  id="model"
                  name="model"
                  placeholder="Camry"
                  required
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trim">Trim</Label>
                <Input
                  id="trim"
                  name="trim"
                  placeholder="SE"
                  value={trim}
                  onChange={(event) => setTrim(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vin">VIN</Label>
                <Input
                  id="vin"
                  name="vin"
                  placeholder="17-character VIN"
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
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mileage">Mileage</Label>
                <Input
                  id="mileage"
                  name="mileage"
                  type="number"
                  placeholder="50000"
                  min={0}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility</Label>
              <select
                id="visibility"
                name="visibility"
                defaultValue="private"
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="private">Private - only visible in your dashboard</option>
                <option value="public">Public - can be used for public profile and marketplace</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Keep private by default. Choose public only when you want the vehicle to appear on public pages.
              </p>
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
                    .join(" ") || "Existing vehicle"}
                </p>
                {existingVehicle.vin && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{existingVehicle.vin}</p>
                )}
                <p className="mt-2 text-sm font-medium text-primary">View vehicle details</p>
              </Link>
            )}
            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Adding..." : "Add Vehicle"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
