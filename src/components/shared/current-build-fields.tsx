"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  normalizeDrivetrain,
  normalizeTransmissionStyle,
  type FactorySummary,
} from "@/lib/vehicles/factory-spec";

export type CurrentBuildValues = { engine: string; transmission: string; drivetrain: string; body_style: string };

// The current-build fields with the factory value shown under each one
// (Renditions doc: Factory Spec vs Current Build). "Use factory" copies the
// decoded value; a drivetrain or transmission that contradicts the factory
// record is flagged here before the server refuses it.
export function CurrentBuildFields({
  values,
  onChange,
  factory,
  originals,
}: {
  values: CurrentBuildValues;
  onChange: (field: keyof CurrentBuildValues, value: string) => void;
  factory: FactorySummary | null;
  originals?: { engine: boolean; transmission: boolean; drivetrain: boolean };
}) {
  const driveConflict = factory?.drivetrain && values.drivetrain
    && normalizeDrivetrain(factory.drivetrain) && normalizeDrivetrain(values.drivetrain)
    && normalizeDrivetrain(factory.drivetrain) !== normalizeDrivetrain(values.drivetrain)
    && (originals?.drivetrain ?? true);
  const transConflict = factory?.transmission && values.transmission
    && normalizeTransmissionStyle(factory.transmission) && normalizeTransmissionStyle(values.transmission)
    && normalizeTransmissionStyle(factory.transmission) !== normalizeTransmissionStyle(values.transmission)
    && (originals?.transmission ?? true);

  const fields: Array<{ key: keyof CurrentBuildValues; label: string; placeholder: string; conflict?: boolean }> = [
    { key: "engine", label: "Current engine/motor", placeholder: "2.0L turbo or swapped engine" },
    { key: "drivetrain", label: "Current drivetrain", placeholder: "FWD, RWD, AWD, or 4WD", conflict: Boolean(driveConflict) },
    { key: "transmission", label: "Current transmission", placeholder: "10-speed automatic", conflict: Boolean(transConflict) },
    { key: "body_style", label: "Body style", placeholder: "Sedan" },
  ];

  return (
    <>
      {fields.map((field) => {
        const factoryValue = factory?.[field.key] ?? null;
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              name={field.key}
              placeholder={field.placeholder}
              maxLength={100}
              value={values[field.key]}
              onChange={(event) => onChange(field.key, event.target.value)}
              aria-invalid={field.conflict || undefined}
              aria-describedby={factoryValue ? `${field.key}-factory` : undefined}
            />
            {factoryValue ? (
              <p id={`${field.key}-factory`} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Factory (VIN): <span className="font-semibold text-foreground">{factoryValue}</span></span>
                {values[field.key].trim() !== factoryValue ? (
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onChange(field.key, factoryValue)}>Use factory value</Button>
                ) : null}
              </p>
            ) : null}
            {field.conflict ? (
              <p className="text-xs font-semibold text-destructive">
                This contradicts the VIN&rsquo;s factory record. Use the factory value, or choose Modified / Custom build below and mark this part as not original.
              </p>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
