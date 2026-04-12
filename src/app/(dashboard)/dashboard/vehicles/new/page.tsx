"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createVehicle } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewVehiclePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    const result = await createVehicle(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      submittingRef.current = false;
    } else if (result?.data) {
      router.push(`/dashboard/vehicles/${result.data.id}`);
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="make">Make *</Label>
                <Input
                  id="make"
                  name="make"
                  placeholder="Toyota"
                  required
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trim">Trim</Label>
                <Input id="trim" name="trim" placeholder="SE" />
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
