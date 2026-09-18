"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  normalizeDrivetrain,
  normalizeTransmissionStyle,
  type FactorySummary,
} from "@/lib/vehicles/factory-spec";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
  const driveConflict = factory?.drivetrain && values.drivetrain
    && normalizeDrivetrain(factory.drivetrain) && normalizeDrivetrain(values.drivetrain)
    && normalizeDrivetrain(factory.drivetrain) !== normalizeDrivetrain(values.drivetrain)
    && (originals?.drivetrain ?? true);
  const transConflict = factory?.transmission && values.transmission
    && normalizeTransmissionStyle(factory.transmission) && normalizeTransmissionStyle(values.transmission)
    && normalizeTransmissionStyle(factory.transmission) !== normalizeTransmissionStyle(values.transmission)
    && (originals?.transmission ?? true);

  const fields: Array<{ key: keyof CurrentBuildValues; label: string; placeholder: string; conflict?: boolean }> = [
    { key: "engine", label: uiText("ui.current_engine_motor_c513af8075"), placeholder: uiText("ui.2_0l_turbo_or_swapped_engine_ff96d7c8d4") },
    { key: "drivetrain", label: uiText("ui.current_drivetrain_a23751a0e3"), placeholder: uiText("ui.fwd_rwd_awd_or_4wd_9071355366"), conflict: Boolean(driveConflict) },
    { key: "transmission", label: uiText("ui.current_transmission_c985bc1b17"), placeholder: uiText("ui.10_speed_automatic_f88323c575"), conflict: Boolean(transConflict) },
    { key: "body_style", label: uiText("ui.body_style_191c24bf12"), placeholder: uiText("ui.sedan_18c9b86509") },
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
                <span>{uiText("ui.factory_vin_4dded2e01e")}<span className="font-semibold text-foreground">{factoryValue}</span></span>
                {values[field.key].trim() !== factoryValue ? (
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onChange(field.key, factoryValue)}>{uiText("ui.use_factory_value_331bb3472f")}</Button>
                ) : null}
              </p>
            ) : null}
            {field.conflict ? (
              <p className="text-xs font-semibold text-destructive">{uiText("ui.this_contradicts_the_vin_s_factory_record_us_374d7b093a")}</p>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
