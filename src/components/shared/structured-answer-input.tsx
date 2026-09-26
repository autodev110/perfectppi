"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PpiAnswerItem } from "@/types/api";
import {
  BODY_DEFECT_TYPES,
  CRACKING_LEVELS,
  CRACKING_RUBRIC,
  DEFECT_LABELS,
  NOT_APPLICABLE_REASON_CODES,
  REASON_LABELS,
  SCALE_LABELS,
  TIRE_DEFECT_TYPES,
  WEAR_LEVELS,
  WEAR_PATTERNS,
  WEAR_RUBRIC,
  WHEEL_DEFECT_TYPES,
  newDefectId,
  parseObservation,
  parseStructuredKey,
  validateObservation,
  type ExceptionReasonCode,
  type ObservationDocument,
  type PerformerMode,
  type BodyPanel,
  type StructuredFamily,
} from "@/features/ppi/inspection-schema";
import type { BodyMarker } from "@/features/ppi/body-diagram";
import { BodyDiagramPicker } from "./body-diagram-picker";
import { normalizeDecimalInput } from "@/features/ppi/inspection-units";
import { t as uiText } from "@/lib/i18n";


// ============================================================================
// Editors for catalog-2 structured answers.
//
// Each editor keeps a local draft and reports a validated observation (or null
// while the draft is incomplete). Photo suggestions are shown beside the
// fields and only become facts when the inspector taps "Use".
// ============================================================================

type Mode = "observed" | "unable_to_assess" | "not_applicable" | "not_inspected";

interface EditorProps {
  answer: PpiAnswerItem;
  value: string;
  onChange: (observation: ObservationDocument | null) => void;
  performerMode: PerformerMode;
  hasError?: boolean;
  serverError?: string | null;
  submissionId: string;
  /** Most recent uploaded photo on this answer, used for reading suggestions. */
  latestPhotoId?: string | null;
  /** Confirmed sidewall markings from the previous corner, for "Same as previous". */
  previousMarkings?: Record<string, unknown> | null;
  /** Photos are read together for the whole step, so hide per-photo reading. */
  hideSuggestion?: boolean;
  /** Bumped after answers are filled from photos, so editors reload them. */
  fillVersion?: number;
}

function parseValue(value: string): ObservationDocument | null {
  if (!value) return null;
  try {
    return parseObservation(JSON.parse(value));
  } catch {
    return null;
  }
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  labels,
  multi,
  selected,
}: {
  options: readonly T[];
  value?: T | null;
  onChange: (next: T) => void;
  labels: Record<string, string>;
  multi?: boolean;
  selected?: readonly T[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = multi ? selected?.includes(option) : value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50",
            )}
          >
            {labels[option] ?? option}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function ReasonPicker({
  codes,
  reason,
  explanation,
  onChange,
}: {
  codes: readonly ExceptionReasonCode[];
  reason: ExceptionReasonCode | null;
  explanation: string;
  onChange: (reason: ExceptionReasonCode, explanation: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed p-3">
      <p className="text-sm font-medium">{uiText("ui.why_could_it_not_be_checked_46507080fd")}</p>
      <Chips options={codes} value={reason} labels={REASON_LABELS} onChange={(next) => onChange(next, explanation)} />
      <Textarea
        value={explanation}
        onChange={(event) => onChange(reason ?? "other", event.target.value)}
        rows={2}
        placeholder={reason === "other" ? uiText("ui.explain_what_prevented_the_check_required_ad4cf025e5") : uiText("ui.optional_detail_aa84ac0f27")}
        className="resize-none"
      />
    </div>
  );
}

const MODE_LABELS: Record<Mode, string> = {
  observed: uiText("ui.recorded_c7175fa7a0"),
  unable_to_assess: uiText("ui.unable_to_assess_e0dd502fa5"),
  not_applicable: uiText("ui.not_applicable_5237c96ac1"),
  not_inspected: uiText("ui.not_checked_d16948e73a"),
};

/**
 * Shared shell: state selector, reason picker for exceptions, validation
 * message. `buildValue` returns the observed value or null while incomplete.
 */
function useObservationEditor(props: EditorProps) {
  const initial = useMemo(() => parseValue(props.value), [props.value]);
  const [mode, setMode] = useState<Mode>((initial?.state as Mode) ?? "observed");
  const [reason, setReason] = useState<ExceptionReasonCode | null>(initial?.reason?.code ?? null);
  const [explanation, setExplanation] = useState(initial?.reason?.explanation ?? "");
  const [error, setError] = useState<string | null>(null);
  const questionKey = props.answer.question_key ?? "";

  function emit(next: Partial<ObservationDocument> & { state: Mode }) {
    if (next.state !== "observed" && !next.reason) {
      props.onChange(null);
      setError(null);
      return;
    }
    if (next.state === "observed" && next.value === null) {
      props.onChange(null);
      setError(null);
      return;
    }
    const candidate = {
      v: 1,
      source: "inspector_entry",
      ...next,
    };
    const validation = validateObservation(questionKey, candidate);
    if (validation.ok) {
      setError(null);
      props.onChange(validation.observation);
    } else {
      setError(validation.error);
      props.onChange(null);
    }
  }

  return { initial, mode, setMode, reason, setReason, explanation, setExplanation, error, setError, emit, questionKey };
}

function ModeSelector({ modes, mode, onChange }: { modes: Mode[]; mode: Mode; onChange: (mode: Mode) => void }) {
  if (modes.length <= 1) return null;
  return <Chips options={modes} value={mode} labels={MODE_LABELS} onChange={onChange} />;
}

function ErrorLine({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <p className="text-sm font-medium text-destructive">{error}</p>;
}

// ---------------------------------------------------------------------------
// Measurements: tread, pressure, brake pad, battery
// ---------------------------------------------------------------------------

function DecimalInput({ value, onChange, unit, placeholder }: { value: string; onChange: (value: string) => void; unit?: string; placeholder?: string }) {
  return (
    <div className="relative">
      <Input
        value={value}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        className={cn("h-12 rounded-xl text-center font-mono text-lg", unit && "pr-16")}
        placeholder={placeholder}
      />
      {unit ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-muted-foreground">{unit}</span>
      ) : null}
    </div>
  );
}

function MeasurementEditor(props: EditorProps & { family: StructuredFamily }) {
  const editor = useObservationEditor(props);
  const value = (editor.initial?.value ?? {}) as Record<string, unknown>;
  const isTread = props.family === "tire_tread";
  const isPressure = props.family === "tire_pressure";
  const isBattery = props.family === "battery_test";
  const [reading, setReading] = useState(String(value.reading ?? ""));
  const [unit, setUnit] = useState(String(value.unit ?? (isTread ? "thirty_seconds_inch" : isPressure ? "psi" : isBattery ? "volts" : "mm")));
  const [method, setMethod] = useState(String(value.method ?? (isTread ? "tread_depth_gauge" : isPressure ? "pressure_gauge" : isBattery ? "battery_tester" : "caliper_gauge")));
  const [context, setContext] = useState<string>(String(value.context ?? ""));
  const [loss, setLoss] = useState(String(value.pressure_loss ?? "not_tested"));
  const recheck = (value.recheck ?? {}) as Record<string, string>;
  const [recheckReading, setRecheckReading] = useState(recheck.reading ?? "");
  const [recheckMinutes, setRecheckMinutes] = useState(recheck.minutes_elapsed ?? "");
  const positions = (value.positions ?? {}) as Record<string, string>;
  const [showPositions, setShowPositions] = useState(Boolean(value.positions));
  const [inner, setInner] = useState(positions.inner ?? "");
  const [center, setCenter] = useState(positions.center ?? "");
  const [outer, setOuter] = useState(positions.outer ?? "");
  const [result, setResult] = useState(String(value.result ?? ""));
  const [ccaMeasured, setCcaMeasured] = useState(String(value.cca_measured ?? ""));
  const [ccaRated, setCcaRated] = useState(String(value.cca_rated ?? ""));

  const measuredOnly = (isTread || isPressure) && props.performerMode === "technician";
  const modes: Mode[] = measuredOnly
    ? ["observed"]
    : props.answer.is_required
      ? ["observed", "unable_to_assess"]
      : ["observed", "not_inspected"];

  function publish(overrides: Record<string, string | boolean> = {}) {
    const state = (overrides.mode as Mode) ?? editor.mode;
    if (state !== "observed") {
      const code = (overrides.reason as ExceptionReasonCode) ?? editor.reason;
      const text = (overrides.explanation as string) ?? editor.explanation;
      editor.emit({ state, reason: code ? { code, explanation: text || null } : null, value: null });
      return;
    }
    const next = {
      reading: normalizeDecimalInput(String(overrides.reading ?? reading)) ?? String(overrides.reading ?? reading).trim(),
      unit: String(overrides.unit ?? unit),
      method: String(overrides.method ?? method),
      context: String(overrides.context ?? context),
      loss: String(overrides.loss ?? loss),
      recheckReading: String(overrides.recheckReading ?? recheckReading),
      recheckMinutes: String(overrides.recheckMinutes ?? recheckMinutes),
      inner: String(overrides.inner ?? inner),
      center: String(overrides.center ?? center),
      outer: String(overrides.outer ?? outer),
      result: String(overrides.result ?? result),
      ccaMeasured: String(overrides.ccaMeasured ?? ccaMeasured),
      ccaRated: String(overrides.ccaRated ?? ccaRated),
      showPositions: (overrides.showPositions as boolean | undefined) ?? showPositions,
    };
    if (!next.reading) {
      editor.emit({ state: "observed", value: null });
      return;
    }
    const observed: Record<string, unknown> = { reading: next.reading, unit: next.unit, method: next.method };
    if (isTread && next.showPositions) {
      const entries = Object.fromEntries(
        [["inner", next.inner], ["center", next.center], ["outer", next.outer]]
          .map(([key, raw]) => [key, normalizeDecimalInput(raw) ?? raw.trim()])
          .filter(([, raw]) => raw !== ""),
      );
      if (Object.keys(entries).length) observed.positions = entries;
    }
    if (isPressure) {
      observed.context = next.context || undefined;
      observed.pressure_loss = next.loss;
      if (
        ["observed", "not_observed_during_test"].includes(next.loss)
        && next.recheckReading
        && next.recheckMinutes
      ) {
        observed.recheck = {
          reading: normalizeDecimalInput(next.recheckReading) ?? next.recheckReading.trim(),
          minutes_elapsed: normalizeDecimalInput(next.recheckMinutes) ?? next.recheckMinutes.trim(),
        };
      }
    }
    if (isBattery) {
      observed.result = next.result || undefined;
      if (next.ccaMeasured) observed.cca_measured = normalizeDecimalInput(next.ccaMeasured) ?? next.ccaMeasured;
      if (next.ccaRated) observed.cca_rated = normalizeDecimalInput(next.ccaRated) ?? next.ccaRated;
    }
    editor.emit({ state: "observed", value: observed });
  }

  const unitLabel = unit === "thirty_seconds_inch" ? "/32 in" : unit === "kpa" ? "kPa" : unit === "psi" ? "psi" : unit === "volts" ? "V" : "mm";

  return (
    <div className="space-y-3">
      <ModeSelector
        modes={modes}
        mode={editor.mode}
        onChange={(mode) => {
          editor.setMode(mode);
          publish({ mode });
        }}
      />
      {measuredOnly ? (
        <p className="text-xs text-muted-foreground">{uiText("ui.technicians_record_a_measured_reading_for_ev_bc8c0d6f93")}</p>
      ) : null}

      {editor.mode === "observed" ? (
        <div className="space-y-3">
          <DecimalInput
            value={reading}
            unit={unitLabel}
            onChange={(next) => {
              setReading(next);
              publish({ reading: next });
            }}
          />
          {isTread ? (
            <>
              <Chips
                options={["thirty_seconds_inch", "mm"] as const}
                value={unit as "thirty_seconds_inch" | "mm"}
                labels={{ thirty_seconds_inch: uiText("ui.32nds_of_an_inch_12d84e84d4"), mm: uiText("ui.millimetres_4b13675413") }}
                onChange={(next) => {
                  setUnit(next);
                  publish({ unit: next });
                }}
              />
              <p className="text-xs text-muted-foreground">{uiText("ui.enter_the_lowest_reading_you_measured_decima_adeac9aab4")}</p>
              <button
                type="button"
                className="text-sm font-medium text-primary"
                onClick={() => {
                  setShowPositions(!showPositions);
                  publish({ showPositions: !showPositions });
                }}
              >
                {showPositions ? uiText("ui.hide_inner_center_outer_readings_c5bf7bcb34") : uiText("ui.add_inner_center_outer_readings_optional_e480a905e1")}
              </button>
              {showPositions ? (
                <div className="grid grid-cols-3 gap-2">
                  <Field label={uiText("ui.inner_fa338a5ea2")}>
                    <DecimalInput value={inner} onChange={(next) => { setInner(next); publish({ inner: next }); }} />
                  </Field>
                  <Field label={uiText("ui.center_d946067427")}>
                    <DecimalInput value={center} onChange={(next) => { setCenter(next); publish({ center: next }); }} />
                  </Field>
                  <Field label={uiText("ui.outer_5e426f92df")}>
                    <DecimalInput value={outer} onChange={(next) => { setOuter(next); publish({ outer: next }); }} />
                  </Field>
                </div>
              ) : null}
              <Field label={uiText("ui.how_it_was_measured_7db0a093ab")}>
                <Chips
                  options={["tread_depth_gauge", "ruler_or_coin", "other"] as const}
                  value={method as "tread_depth_gauge"}
                  labels={{ tread_depth_gauge: uiText("ui.tread_depth_gauge_b4776a52cd"), ruler_or_coin: uiText("ui.ruler_or_coin_22dae6a4df"), other: uiText("ui.other_tool_6724caefaf") }}
                  onChange={(next) => { setMethod(next); publish({ method: next }); }}
                />
              </Field>
            </>
          ) : null}
          {isPressure ? (
            <>
              <Chips
                options={["psi", "kpa"] as const}
                value={unit as "psi" | "kpa"}
                labels={{ psi: "psi", kpa: "kPa" }}
                onChange={(next) => { setUnit(next); publish({ unit: next }); }}
              />
              <Field label={uiText("ui.were_the_tires_cold_95252e38e9")} hint={uiText("ui.cold_means_driven_less_than_about_a_mile_in__12e56d6126")}>
                <Chips
                  options={["cold", "warm", "unknown"] as const}
                  value={context as "cold"}
                  labels={{ cold: uiText("ui.cold_f151cd9e12"), warm: uiText("ui.warm_recently_driven_e2d92a36ff"), unknown: uiText("ui.not_sure_dca5fa430c") }}
                  onChange={(next) => { setContext(next); publish({ context: next }); }}
                />
              </Field>
              <Field label={uiText("ui.measured_with_bd0146ad72")}>
                <Chips
                  options={["pressure_gauge", "tpms_display", "other"] as const}
                  value={method as "pressure_gauge"}
                  labels={{ pressure_gauge: uiText("ui.pressure_gauge_707e8d2521"), tpms_display: "Dashboard (TPMS)", other: uiText("ui.other_f97e9da0e3") }}
                  onChange={(next) => { setMethod(next); publish({ method: next }); }}
                />
              </Field>
              <Field label={uiText("ui.pressure_loss_18ef083ef3")} hint={uiText("ui.one_reading_cannot_show_whether_a_tire_holds_498b172b4a")}>
                <Chips
                  options={["not_tested", "not_observed_during_test", "observed", "reported"] as const}
                  value={loss as "not_tested"}
                  labels={{
                    not_tested: uiText("ui.not_tested_51e3a01219"),
                    not_observed_during_test: uiText("ui.held_pressure_on_recheck_13ee76ad88"),
                    observed: uiText("ui.lost_pressure_4f50671db2"),
                    reported: uiText("ui.owner_reports_it_loses_air_a0972ae238"),
                  }}
                  onChange={(next) => { setLoss(next); publish({ loss: next }); }}
                />
              </Field>
              {["observed", "not_observed_during_test"].includes(loss) ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={uiText("ui.recheck_reading_b272f20252")} hint={`Use the same unit as the initial reading (${unitLabel}).`}>
                    <DecimalInput
                      value={recheckReading}
                      unit={unitLabel}
                      onChange={(next) => {
                        setRecheckReading(next);
                        publish({ recheckReading: next });
                      }}
                    />
                  </Field>
                  <Field label={uiText("ui.minutes_elapsed_5a14065958")}>
                    <DecimalInput
                      value={recheckMinutes}
                      unit="min"
                      onChange={(next) => {
                        setRecheckMinutes(next);
                        publish({ recheckMinutes: next });
                      }}
                    />
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}
          {isBattery ? (
            <>
              <Field label={uiText("ui.result_6e7d50e84f")}>
                <Chips
                  options={["good", "marginal", "replace", "inconclusive"] as const}
                  value={result as "good"}
                  labels={{ good: uiText("ui.good_c939327ca1"), marginal: uiText("ui.marginal_023f2ca37a"), replace: uiText("ui.replace_95e154398a"), inconclusive: uiText("ui.inconclusive_9141583b65") }}
                  onChange={(next) => { setResult(next); publish({ result: next }); }}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={uiText("ui.measured_cca_optional_c0ed58f135")}>
                  <DecimalInput value={ccaMeasured} onChange={(next) => { setCcaMeasured(next); publish({ ccaMeasured: next }); }} />
                </Field>
                <Field label={uiText("ui.rated_cca_optional_373f2ee229")}>
                  <DecimalInput value={ccaRated} onChange={(next) => { setCcaRated(next); publish({ ccaRated: next }); }} />
                </Field>
              </div>
              <Field label={uiText("ui.tester_9e7cd9cb5a")}>
                <Chips
                  options={["battery_tester", "multimeter", "other"] as const}
                  value={method as "battery_tester"}
                  labels={{ battery_tester: uiText("ui.battery_tester_98a6e6959b"), multimeter: uiText("ui.multimeter_f2810faea1"), other: uiText("ui.other_f97e9da0e3") }}
                  onChange={(next) => { setMethod(next); publish({ method: next }); }}
                />
              </Field>
            </>
          ) : null}
        </div>
      ) : editor.mode === "unable_to_assess" ? (
        <ReasonPicker
          codes={["no_gauge", "inaccessible", "unsafe_access", "weather_or_lighting", "other"]}
          reason={editor.reason}
          explanation={editor.explanation}
          onChange={(code, text) => {
            editor.setReason(code);
            editor.setExplanation(text);
            publish({ reason: code, explanation: text });
          }}
        />
      ) : editor.mode === "not_inspected" ? (
        <ReasonPicker
          codes={["no_gauge", "inaccessible", "other"]}
          reason={editor.reason}
          explanation={editor.explanation}
          onChange={(code, text) => {
            editor.setReason(code);
            editor.setExplanation(text);
            publish({ reason: code, explanation: text });
          }}
        />
      ) : null}
      <ErrorLine error={editor.error ?? props.serverError} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo reading suggestions
// ---------------------------------------------------------------------------

interface Suggestion {
  extraction_id: string;
  status: "extracted" | "unreadable" | "failed";
  candidates: Record<string, string | null>;
}

function useSuggestion(submissionId: string, target: "tire_sidewall" | "tire_dot" | "tire_placard", mediaId?: string | null) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedFor = useRef<string | null>(null);

  async function request() {
    if (!mediaId || loading) return;
    setLoading(true);
    setError(null);
    requestedFor.current = mediaId;
    try {
      const response = await fetch(`/api/ppi/submissions/${submissionId}/extractions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_id: mediaId, target }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error ?? uiText("ui.could_not_read_the_photo_enter_the_values_by_31f15d612c"));
        return;
      }
      if (requestedFor.current === mediaId) setSuggestion(json.data);
    } catch {
      setError(uiText("ui.could_not_read_the_photo_enter_the_values_by_31f15d612c"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSuggestion(null);
    setError(null);
  }, [mediaId]);

  return { suggestion, loading, error, request, available: Boolean(mediaId) };
}

function SuggestionPanel({
  state,
  fields,
  onUse,
}: {
  state: ReturnType<typeof useSuggestion>;
  fields: { key: string; label: string }[];
  onUse: (suggestion: Suggestion) => void;
}) {
  if (!state.available) {
    return <p className="text-xs text-muted-foreground">{uiText("ui.take_the_photo_below_to_get_a_suggested_read_2c266336e0")}</p>;
  }
  const readable = state.suggestion?.status === "extracted"
    && fields.some((field) => state.suggestion?.candidates[field.key]);
  return (
    <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
      {!state.suggestion ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void state.request()} disabled={state.loading}>
          {state.loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}{uiText("ui.suggest_from_photo_352b94ec5b")}</Button>
      ) : readable ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{uiText("ui.suggested_from_photo_check_before_using_2bf813e965")}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {fields.map((field) => (
              <div key={field.key} className="contents">
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="font-mono">{state.suggestion?.candidates[field.key] ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <Button type="button" size="sm" onClick={() => state.suggestion && onUse(state.suggestion)}>{uiText("ui.use_these_values_ba1740c8ce")}</Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{uiText("ui.the_photo_could_not_be_read_retake_a_closer__d2a00201de")}</p>
      )}
      <ErrorLine error={state.error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidewall markings
// ---------------------------------------------------------------------------

function MarkingsEditor(props: EditorProps) {
  const editor = useObservationEditor(props);
  const initial = (editor.initial?.value ?? {}) as Record<string, string>;
  const [fields, setFields] = useState<Record<string, string>>({
    size: initial.size ?? "",
    load_index: initial.load_index ?? "",
    speed_rating: initial.speed_rating ?? "",
    brand: initial.brand ?? "",
    model: initial.model ?? "",
    extra_marking: initial.extra_marking ?? "",
    raw: initial.raw ?? "",
  });
  const [extractionId, setExtractionId] = useState<string | null>(editor.initial?.extraction_id ?? null);
  const suggestion = useSuggestion(props.submissionId, "tire_sidewall", props.latestPhotoId);

  function publish(nextFields: Record<string, string>, mode: Mode = editor.mode, nextExtraction = extractionId, overrides?: { reason?: ExceptionReasonCode; explanation?: string }) {
    if (mode !== "observed") {
      const code = overrides?.reason ?? editor.reason;
      const text = overrides?.explanation ?? editor.explanation;
      editor.emit({ state: mode, reason: code ? { code, explanation: text || null } : null, value: null });
      return;
    }
    const trimmed = Object.fromEntries(Object.entries(nextFields).map(([key, value]) => [key, key === "speed_rating" ? value.trim().toUpperCase() : value.trim()]));
    if (!trimmed.size && !trimmed.raw) {
      editor.emit({ state: "observed", value: null });
      return;
    }
    editor.emit({
      state: "observed",
      value: trimmed,
      source: nextExtraction ? "confirmed_extraction" : "inspector_entry",
      extraction_id: nextExtraction,
      extraction_ids: nextExtraction && nextExtraction === editor.initial?.extraction_id ? editor.initial?.extraction_ids ?? null : null,
    });
  }

  function update(key: string, value: string) {
    const next = { ...fields, [key]: value };
    setFields(next);
    publish(next);
  }

  return (
    <div className="space-y-3">
      <ModeSelector
        modes={["observed", "unable_to_assess"]}
        mode={editor.mode}
        onChange={(mode) => { editor.setMode(mode); publish(fields, mode); }}
      />
      {editor.mode === "observed" ? (
        <>
          {props.hideSuggestion ? null : (
            <SuggestionPanel
              state={suggestion}
              fields={[
                { key: "size", label: uiText("ui.size_1af8519073") },
                { key: "load_index", label: uiText("ui.load_index_f969c15757") },
                { key: "speed_rating", label: uiText("ui.speed_rating_d74d0984f8") },
                { key: "brand", label: uiText("ui.brand_090ed4316f") },
              ]}
              onUse={(result) => {
                const next = {
                  ...fields,
                  ...Object.fromEntries(
                    Object.entries(result.candidates)
                      .filter(([key, value]) => value && key in fields)
                      .map(([key, value]) => [key, String(value)]),
                  ),
                };
                setFields(next);
                setExtractionId(result.extraction_id);
                publish(next, "observed", result.extraction_id);
              }}
            />
          )}
          {props.previousMarkings ? (
            <button
              type="button"
              className="text-sm font-medium text-primary"
              onClick={() => {
                // Copies identity fields only; DOT date, tread, pressure and
                // condition are never copied between tires.
                const previous = props.previousMarkings as Record<string, string>;
                const next = {
                  ...fields,
                  size: previous.size ?? "",
                  load_index: previous.load_index ?? "",
                  speed_rating: previous.speed_rating ?? "",
                  brand: previous.brand ?? "",
                  model: previous.model ?? "",
                };
                setFields(next);
                setExtractionId(null);
                publish(next, "observed", null);
              }}
            >{uiText("ui.same_size_and_model_as_the_previous_tire_0782e1bfc5")}</button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label={uiText("ui.tire_size_ec20be9319")} hint={uiText("ui.e_g_225_50r17_615bb8c474")}>
              <Input value={fields.size} onChange={(event) => update("size", event.target.value)} />
            </Field>
            <Field label={uiText("ui.load_index_f969c15757")} hint={uiText("ui.number_e_g_98_8bc264598d")}>
              <Input value={fields.load_index} inputMode="numeric" onChange={(event) => update("load_index", event.target.value)} />
            </Field>
            <Field label={uiText("ui.speed_rating_d74d0984f8")} hint={uiText("ui.letter_e_g_v_630c0ea2f9")}>
              <Input value={fields.speed_rating} onChange={(event) => update("speed_rating", event.target.value)} />
            </Field>
            <Field label={uiText("ui.brand_optional_945c53913c")}>
              <Input value={fields.brand} onChange={(event) => update("brand", event.target.value)} />
            </Field>
            <Field label={uiText("ui.model_optional_caa6106f12")}>
              <Input value={fields.model} onChange={(event) => update("model", event.target.value)} />
            </Field>
            <Field label={uiText("ui.xl_lt_marking_optional_36f3d775a1")}>
              <Input value={fields.extra_marking} onChange={(event) => update("extra_marking", event.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">{uiText("ui.leave_a_field_blank_if_it_cannot_be_read_it__42b8c47c17")}</p>
        </>
      ) : (
        <ReasonPicker
          codes={["unreadable", "inaccessible", "other"]}
          reason={editor.reason}
          explanation={editor.explanation}
          onChange={(code, text) => {
            editor.setReason(code);
            editor.setExplanation(text);
            publish(fields, editor.mode, extractionId, { reason: code, explanation: text });
          }}
        />
      )}
      <ErrorLine error={editor.error ?? props.serverError} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DOT date code
// ---------------------------------------------------------------------------

function DotEditor(props: EditorProps) {
  const editor = useObservationEditor(props);
  const [code, setCode] = useState(String((editor.initial?.value as { code?: string } | null)?.code ?? ""));
  const [extractionId, setExtractionId] = useState<string | null>(editor.initial?.extraction_id ?? null);
  const suggestion = useSuggestion(props.submissionId, "tire_dot", props.latestPhotoId);

  function publish(nextCode: string, mode: Mode = editor.mode, nextExtraction = extractionId, overrides?: { reason?: ExceptionReasonCode; explanation?: string }) {
    if (mode !== "observed") {
      const reasonCode = overrides?.reason ?? editor.reason;
      const text = overrides?.explanation ?? editor.explanation;
      editor.emit({ state: mode, reason: reasonCode ? { code: reasonCode, explanation: text || null } : null, value: null });
      return;
    }
    const digits = nextCode.replace(/\D/g, "");
    editor.emit({
      state: "observed",
      value: digits ? { code: digits } : null,
      source: nextExtraction ? "confirmed_extraction" : "inspector_entry",
      extraction_id: nextExtraction,
      extraction_ids: nextExtraction && nextExtraction === editor.initial?.extraction_id ? editor.initial?.extraction_ids ?? null : null,
    });
  }

  return (
    <div className="space-y-3">
      <ModeSelector modes={["observed", "unable_to_assess"]} mode={editor.mode} onChange={(mode) => { editor.setMode(mode); publish(code, mode); }} />
      {editor.mode === "observed" ? (
        <>
          {props.hideSuggestion ? null : (
            <SuggestionPanel
              state={suggestion}
              fields={[{ key: "code", label: uiText("ui.date_code_39f501d4da") }]}
              onUse={(result) => {
                const next = String(result.candidates.code ?? "");
                setCode(next);
                setExtractionId(result.extraction_id);
                publish(next, "observed", result.extraction_id);
              }}
            />
          )}
          <Input
            value={code}
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => {
              setCode(event.target.value);
              setExtractionId(null);
              publish(event.target.value, "observed", null);
            }}
            className="h-12 rounded-xl text-center font-mono text-lg tracking-[0.3em]"
            placeholder={uiText("ui.wwyy_e71501b521")}
          />
          <p className="text-xs text-muted-foreground">{uiText("ui.the_last_four_digits_after_dot_week_then_yea_a0c6a16972")}</p>
        </>
      ) : (
        <ReasonPicker
          codes={["unreadable", "inaccessible", "other"]}
          reason={editor.reason}
          explanation={editor.explanation}
          onChange={(reasonCode, text) => {
            editor.setReason(reasonCode);
            editor.setExplanation(text);
            publish(code, editor.mode, extractionId, { reason: reasonCode, explanation: text });
          }}
        />
      )}
      <ErrorLine error={editor.error ?? props.serverError} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cracking / wear scales
// ---------------------------------------------------------------------------

const SCALE_TONES: Record<string, string> = {
  none: "border-emerald-500",
  even: "border-emerald-500",
  starting: "border-amber-400",
  uneven_monitor: "border-amber-400",
  significant: "border-orange-500",
  severe: "border-red-600",
  severe_uneven: "border-red-600",
};

function ScaleEditor(props: EditorProps & { family: "tire_cracking" | "tire_wear" }) {
  const editor = useObservationEditor(props);
  const initial = (editor.initial?.value ?? {}) as { level?: string; patterns?: string[] };
  const [level, setLevel] = useState(initial.level ?? "");
  const [patterns, setPatterns] = useState<string[]>(initial.patterns ?? []);
  const levels = props.family === "tire_cracking" ? CRACKING_LEVELS : WEAR_LEVELS;
  const rubric: Record<string, string> = props.family === "tire_cracking" ? CRACKING_RUBRIC : WEAR_RUBRIC;

  function publish(nextLevel: string, nextPatterns: string[], mode: Mode = editor.mode, overrides?: { reason?: ExceptionReasonCode; explanation?: string }) {
    if (mode !== "observed") {
      const code = overrides?.reason ?? editor.reason;
      const text = overrides?.explanation ?? editor.explanation;
      editor.emit({ state: mode, reason: code ? { code, explanation: text || null } : null, value: null });
      return;
    }
    editor.emit({
      state: "observed",
      value: nextLevel ? { level: nextLevel, ...(nextPatterns.length ? { patterns: nextPatterns } : {}) } : null,
    });
  }

  return (
    <div className="space-y-3">
      <ModeSelector modes={["observed", "unable_to_assess"]} mode={editor.mode} onChange={(mode) => { editor.setMode(mode); publish(level, patterns, mode); }} />
      {editor.mode === "observed" ? (
        <div className="space-y-2">
          {levels.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => { setLevel(option); publish(option, patterns); }}
              aria-pressed={level === option}
              className={cn(
                "w-full rounded-xl border-2 border-l-8 px-4 py-3 text-left transition-colors",
                SCALE_TONES[option],
                level === option ? "bg-primary/10 ring-2 ring-primary" : "bg-background hover:bg-muted/50",
              )}
            >
              <span className="block font-semibold">{SCALE_LABELS[option]}</span>
              <span className="block text-sm text-muted-foreground">{rubric[option]}</span>
            </button>
          ))}
          {props.family === "tire_wear" && level && level !== "even" ? (
            <Field label={uiText("ui.where_is_the_wear_optional_6a53fe65df")}>
              <Chips
                options={WEAR_PATTERNS}
                multi
                selected={patterns}
                labels={{
                  inner_edge: uiText("ui.inner_edge_5ae6a7df33"),
                  outer_edge: uiText("ui.outer_edge_03d1c7d0a2"),
                  center: uiText("ui.center_d946067427"),
                  both_shoulders: uiText("ui.both_edges_bf5af9cb2c"),
                  cupping: uiText("ui.cupping_68ea547c3e"),
                  patchy: uiText("ui.patchy_ed3707094f"),
                  other: uiText("ui.other_f97e9da0e3"),
                }}
                onChange={(pattern) => {
                  const next = patterns.includes(pattern) ? patterns.filter((entry) => entry !== pattern) : [...patterns, pattern];
                  setPatterns(next);
                  publish(level, next);
                }}
              />
            </Field>
          ) : null}
        </div>
      ) : (
        <ReasonPicker
          codes={["inaccessible", "weather_or_lighting", "unsafe_access", "other"]}
          reason={editor.reason}
          explanation={editor.explanation}
          onChange={(code, text) => {
            editor.setReason(code);
            editor.setExplanation(text);
            publish(level, patterns, editor.mode, { reason: code, explanation: text });
          }}
        />
      )}
      <ErrorLine error={editor.error ?? props.serverError} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Defect lists: tire damage, wheel damage, body panels
// ---------------------------------------------------------------------------

interface DraftDefect {
  id: string;
  /** Empty until the inspector picks a type; drafts never default to a finding. */
  type: string;
  location?: string;
  certainty?: "confirmed" | "suspected";
  structural?: boolean | null;
  severity?: "minor" | "moderate" | "severe";
  note?: string;
  /** Tap-placed location on the body diagram (body panels only). */
  marker?: BodyMarker | { x: number; y: number } | null;
}

function DefectRows({
  kind,
  defects,
  onChange,
  panel,
}: {
  kind: "tire" | "wheel" | "body";
  defects: DraftDefect[];
  onChange: (next: DraftDefect[]) => void;
  /** The body panel these entries belong to, for the location diagram. */
  panel?: BodyPanel;
}) {
  const types = kind === "tire" ? TIRE_DEFECT_TYPES : kind === "wheel" ? WHEEL_DEFECT_TYPES : BODY_DEFECT_TYPES;
  function patch(index: number, change: Partial<DraftDefect>) {
    onChange(defects.map((defect, position) => (position === index ? { ...defect, ...change } : defect)));
  }
  return (
    <div className="space-y-3">
      {defects.map((defect, index) => (
        <div key={defect.id} className="space-y-2 rounded-xl border p-3">
          <div className="flex items-start justify-between gap-2">
            <Chips options={types} value={defect.type || null} labels={DEFECT_LABELS} onChange={(type) => patch(index, { type })} />
            <button
              type="button"
              aria-label={uiText("ui.remove_this_damage_entry_b77ed1ebbf")}
              className="rounded-md p-1 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(defects.filter((_, position) => position !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {kind === "tire" ? (
            <Field label={uiText("ui.where_on_the_tire_02470c1963")}>
              <Chips
                options={["tread", "shoulder", "sidewall", "unknown"] as const}
                value={(defect.location ?? "unknown") as "tread"}
                labels={{ tread: uiText("ui.tread_5b4f5c8af6"), shoulder: uiText("ui.shoulder_50b7e74431"), sidewall: uiText("ui.sidewall_e87f980620"), unknown: uiText("ui.not_sure_dca5fa430c") }}
                onChange={(location) => patch(index, { location })}
              />
            </Field>
          ) : null}
          {kind === "body" ? (
            <Field label={uiText("ui.extent_aa3129d351")}>
              <Chips
                options={["minor", "moderate", "severe"] as const}
                value={defect.severity ?? null}
                labels={{ minor: uiText("ui.minor_cosmetic_4adf543544"), moderate: uiText("ui.needs_repair_4ed3689d9d"), severe: uiText("ui.severe_aa93f64a30") }}
                onChange={(severity) => patch(index, { severity })}
              />
            </Field>
          ) : null}
          {kind !== "body" ? (
            <Field label={uiText("ui.how_sure_are_you_fddc2b0bdb")}>
              <Chips
                options={["confirmed", "suspected"] as const}
                value={defect.certainty ?? null}
                labels={{ confirmed: uiText("ui.confirmed_fe00b67b6d"), suspected: uiText("ui.suspected_needs_a_closer_look_fa806037a7") }}
                onChange={(certainty) => patch(index, { certainty })}
              />
            </Field>
          ) : null}
          {(kind === "tire" && defect.type === "cut") || kind === "body" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={defect.structural === true}
                onChange={(event) => patch(index, { structural: event.target.checked })}
              />
              {kind === "tire" ? uiText("ui.the_cut_reaches_the_tire_structure_cords_or__210b12af89") : uiText("ui.structural_damage_frame_pillar_or_crumple_zo_61389fe11d")}
            </label>
          ) : null}
          <Textarea
            rows={2}
            value={defect.note ?? ""}
            onChange={(event) => patch(index, { note: event.target.value })}
            placeholder={uiText("ui.short_note_optional_095d2cfa8a")}
            className="resize-none"
          />
          {kind === "body" && panel ? (
            <DefectLocation
              panel={panel}
              index={index}
              defects={defects}
              onChange={(marker) => patch(index, { marker })}
            />
          ) : null}
          {defectIncomplete(kind, defect) ? (
            <p className="text-xs font-medium text-amber-700">
              {kind === "body" ? uiText("ui.choose_the_damage_type_and_its_extent_6e30896ffe") : uiText("ui.choose_the_damage_type_and_whether_it_is_con_b5dede3f6f")}
            </p>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...defects, blankDefect(kind)])
        }
      >
        <Plus className="mr-1 h-4 w-4" />{uiText("ui.add_damage_542c40f17d")}</Button>
    </div>
  );
}

function EvidenceException({
  value,
  onChange,
}: {
  value: { code: ExceptionReasonCode; explanation?: string | null } | null;
  onChange: (next: { code: ExceptionReasonCode; explanation?: string | null } | null) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked ? { code: "inaccessible" } : null)} />{uiText("ui.i_could_not_photograph_this_damage_cbc4324ddc")}</label>
      {value ? (
        <Chips
          options={["inaccessible", "unsafe_access", "weather_or_lighting", "other"] as const}
          value={value.code as "inaccessible"}
          labels={REASON_LABELS}
          onChange={(code) => onChange({ code, explanation: value.explanation ?? null })}
        />
      ) : null}
    </div>
  );
}

/** Collapsed until opened, or open when the entry already has a marker. */
function DefectLocation({
  panel,
  index,
  defects,
  onChange,
}: {
  panel: BodyPanel;
  index: number;
  defects: DraftDefect[];
  onChange: (marker: BodyMarker | null) => void;
}) {
  const marker = defects[index].marker ?? null;
  const [open, setOpen] = useState(Boolean(marker));
  if (!open) {
    return (
      <button type="button" className="text-sm font-medium text-primary" onClick={() => setOpen(true)}>{uiText("ui.mark_the_location_on_the_diagram_optional_51d7443968")}</button>
    );
  }
  const others = defects.flatMap((defect, position) =>
    position !== index && defect.marker ? [{ label: String(position + 1), x: defect.marker.x, y: defect.marker.y }] : [],
  );
  return <BodyDiagramPicker panel={panel} label={String(index + 1)} marker={marker} others={others} onChange={onChange} />;
}

function blankDefect(kind: "tire" | "wheel" | "body"): DraftDefect {
  // "Not sure" is a truthful location default; type and confirmation are not.
  return { id: newDefectId(), type: "", ...(kind === "tire" ? { location: "unknown" } : {}) };
}

function defectIncomplete(kind: "tire" | "wheel" | "body", defect: DraftDefect) {
  return !defect.type || (kind === "body" ? !defect.severity : !defect.certainty);
}

/** Null while any entry still needs a choice, so a draft is never saved as a finding. */
function cleanDefects(kind: "tire" | "wheel" | "body", defects: DraftDefect[]) {
  if (defects.some((defect) => defectIncomplete(kind, defect))) return null;
  return defects.map((defect) => {
    const base: Record<string, unknown> = { id: defect.id, type: defect.type };
    if (defect.note?.trim()) base.note = defect.note.trim();
    if (kind === "tire") {
      base.location = defect.location ?? "unknown";
      base.certainty = defect.certainty;
      if (defect.type === "cut") base.structural = defect.structural === true;
    }
    if (kind === "wheel") base.certainty = defect.certainty;
    if (kind === "body") {
      base.severity = defect.severity;
      if (defect.structural) base.structural = true;
      if (defect.marker) base.marker = { view: "top", x: defect.marker.x, y: defect.marker.y };
    }
    return base;
  });
}

function DefectListEditor(props: EditorProps & { kind: "tire" | "wheel" }) {
  const editor = useObservationEditor(props);
  const initial = (editor.initial?.value ?? {}) as { none_observed?: boolean; defects?: DraftDefect[] };
  const [choice, setChoice] = useState<"none" | "damage" | null>(
    editor.initial?.state === "observed" ? (initial.none_observed ? "none" : "damage") : null,
  );
  const [defects, setDefects] = useState<DraftDefect[]>(initial.defects ?? []);
  const [exception, setException] = useState(editor.initial?.evidence_exception ?? null);

  function publish(nextChoice = choice, nextDefects = defects, nextException = exception, mode: Mode = editor.mode, overrides?: { reason?: ExceptionReasonCode; explanation?: string }) {
    if (mode !== "observed") {
      const code = overrides?.reason ?? editor.reason;
      const text = overrides?.explanation ?? editor.explanation;
      editor.emit({ state: mode, reason: code ? { code, explanation: text || null } : null, value: null });
      return;
    }
    if (nextChoice === "none") {
      editor.emit({ state: "observed", value: { none_observed: true } });
    } else if (nextChoice === "damage" && nextDefects.length) {
      const cleaned = cleanDefects(props.kind, nextDefects);
      editor.emit({ state: "observed", value: cleaned ? { defects: cleaned } : null, evidence_exception: nextException });
    } else {
      editor.emit({ state: "observed", value: null });
    }
  }

  return (
    <div className="space-y-3">
      <ModeSelector modes={["observed", "unable_to_assess"]} mode={editor.mode} onChange={(mode) => { editor.setMode(mode); publish(choice, defects, exception, mode); }} />
      {editor.mode === "observed" ? (
        <>
          <Chips
            options={["none", "damage"] as const}
            value={choice}
            labels={{ none: uiText("ui.none_observed_7b563836dc"), damage: props.kind === "tire" ? uiText("ui.damage_or_object_found_4b12f12b36") : uiText("ui.damage_found_8f4fb1dc03") }}
            onChange={(next) => {
              setChoice(next);
              const nextDefects = next === "damage" && defects.length === 0 ? [blankDefect(props.kind)] : defects;
              setDefects(nextDefects);
              publish(next, nextDefects);
            }}
          />
          {props.kind === "tire" && choice === "damage" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{uiText("ui.any_confirmed_puncture_or_embedded_object_na_bea3f6953f")}</p>
          ) : null}
          {choice === "damage" ? (
            <>
              <DefectRows kind={props.kind} defects={defects} onChange={(next) => { setDefects(next); publish("damage", next); }} />
              <EvidenceException value={exception} onChange={(next) => { setException(next); publish("damage", defects, next); }} />
            </>
          ) : null}
        </>
      ) : (
        <ReasonPicker
          codes={["inaccessible", "unsafe_access", "weather_or_lighting", "other"]}
          reason={editor.reason}
          explanation={editor.explanation}
          onChange={(code, text) => {
            editor.setReason(code);
            editor.setExplanation(text);
            publish(choice, defects, exception, editor.mode, { reason: code, explanation: text });
          }}
        />
      )}
      <ErrorLine error={editor.error ?? props.serverError} />
    </div>
  );
}

function PanelEditor(props: EditorProps) {
  const editor = useObservationEditor(props);
  const info = parseStructuredKey(props.answer.question_key ?? "");
  const panel = info?.family === "body_panel" ? info.panel : undefined;
  const initial = (editor.initial?.value ?? {}) as { condition?: string; defects?: DraftDefect[] };
  const [condition, setCondition] = useState<string | null>(editor.initial?.state === "observed" ? initial.condition ?? null : null);
  const [defects, setDefects] = useState<DraftDefect[]>(initial.defects ?? []);
  const [exception, setException] = useState(editor.initial?.evidence_exception ?? null);
  const modes: Mode[] = props.answer.is_required ? ["observed", "unable_to_assess", "not_applicable"] : ["observed", "not_inspected"];

  function publish(nextCondition = condition, nextDefects = defects, nextException = exception, mode: Mode = editor.mode, overrides?: { reason?: ExceptionReasonCode; explanation?: string }) {
    if (mode !== "observed") {
      const code = overrides?.reason ?? editor.reason;
      const text = overrides?.explanation ?? editor.explanation;
      editor.emit({ state: mode, reason: code ? { code, explanation: text || null } : null, value: null });
      return;
    }
    if (nextCondition === "no_visible_damage") {
      editor.emit({ state: "observed", value: { condition: "no_visible_damage" } });
    } else if (nextCondition === "damage_present" && nextDefects.length) {
      const cleaned = cleanDefects("body", nextDefects);
      editor.emit({ state: "observed", value: cleaned ? { condition: "damage_present", defects: cleaned } : null, evidence_exception: nextException });
    } else {
      editor.emit({ state: "observed", value: null });
    }
  }

  return (
    <div className="space-y-3">
      <ModeSelector modes={modes} mode={editor.mode} onChange={(mode) => { editor.setMode(mode); publish(condition, defects, exception, mode); }} />
      {editor.mode === "observed" ? (
        <>
          <Chips
            options={["no_visible_damage", "damage_present"] as const}
            value={condition as "no_visible_damage"}
            labels={{ no_visible_damage: uiText("ui.no_visible_damage_d5ebd4c53c"), damage_present: uiText("ui.damage_present_8b5a79c53f") }}
            onChange={(next) => {
              setCondition(next);
              const nextDefects = next === "damage_present" && defects.length === 0 ? [blankDefect("body")] : defects;
              setDefects(nextDefects);
              publish(next, nextDefects);
            }}
          />
          {condition === "damage_present" ? (
            <>
              <DefectRows kind="body" panel={panel} defects={defects} onChange={(next) => { setDefects(next); publish("damage_present", next); }} />
              <EvidenceException value={exception} onChange={(next) => { setException(next); publish("damage_present", defects, next); }} />
            </>
          ) : null}
        </>
      ) : (
        <ReasonPicker
          codes={editor.mode === "not_applicable" ? NOT_APPLICABLE_REASON_CODES : ["inaccessible", "unsafe_access", "weather_or_lighting", "other"]}
          reason={editor.reason}
          explanation={editor.explanation}
          onChange={(code, text) => {
            editor.setReason(code);
            editor.setExplanation(text);
            publish(condition, defects, exception, editor.mode, { reason: code, explanation: text });
          }}
        />
      )}
      <ErrorLine error={editor.error ?? props.serverError} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tire placard
// ---------------------------------------------------------------------------

function PlacardEditor(props: EditorProps) {
  const editor = useObservationEditor(props);
  const initial = (editor.initial?.value ?? {}) as Record<string, unknown>;
  const front = (initial.front ?? {}) as Record<string, string>;
  const rear = (initial.rear ?? {}) as Record<string, string>;
  const [fields, setFields] = useState<Record<string, string>>({
    front_size: front.size ?? "",
    front_pressure: front.pressure ?? "",
    rear_size: rear.size ?? "",
    rear_pressure: rear.pressure ?? "",
    unit: front.unit ?? "psi",
    load_index: String(initial.load_index ?? ""),
    speed_rating: String(initial.speed_rating ?? ""),
    documented_alternative: String(initial.documented_alternative ?? ""),
  });
  const [extractionId, setExtractionId] = useState<string | null>(editor.initial?.extraction_id ?? null);
  const suggestion = useSuggestion(props.submissionId, "tire_placard", props.latestPhotoId);

  function publish(next: Record<string, string>, mode: Mode = editor.mode, nextExtraction = extractionId, overrides?: { reason?: ExceptionReasonCode; explanation?: string }) {
    if (mode !== "observed") {
      const code = overrides?.reason ?? editor.reason;
      const text = overrides?.explanation ?? editor.explanation;
      editor.emit({ state: mode, reason: code ? { code, explanation: text || null } : null, value: null });
      return;
    }
    if (!next.front_size.trim() && !next.rear_size.trim()) {
      editor.emit({ state: "observed", value: null });
      return;
    }
    editor.emit({
      state: "observed",
      value: {
        front: { size: next.front_size.trim(), pressure: normalizeDecimalInput(next.front_pressure) ?? next.front_pressure.trim(), unit: next.unit },
        rear: { size: next.rear_size.trim(), pressure: normalizeDecimalInput(next.rear_pressure) ?? next.rear_pressure.trim(), unit: next.unit },
        load_index: next.load_index.trim(),
        speed_rating: next.speed_rating.trim().toUpperCase(),
        location: "driver_door_jamb",
        documented_alternative: next.documented_alternative.trim(),
      },
      source: nextExtraction ? "confirmed_extraction" : "inspector_entry",
      extraction_id: nextExtraction,
      extraction_ids: nextExtraction && nextExtraction === editor.initial?.extraction_id ? editor.initial?.extraction_ids ?? null : null,
    });
  }

  function update(key: string, value: string) {
    const next = { ...fields, [key]: value };
    setFields(next);
    publish(next);
  }

  return (
    <div className="space-y-3">
      <ModeSelector modes={["observed", "unable_to_assess"]} mode={editor.mode} onChange={(mode) => { editor.setMode(mode); publish(fields, mode); }} />
      {editor.mode === "observed" ? (
        <>
          {props.hideSuggestion ? null : (
            <SuggestionPanel
              state={suggestion}
              fields={[
                { key: "front_size", label: uiText("ui.front_size_f4c9ef374f") },
                { key: "front_pressure", label: uiText("ui.front_cold_pressure_fbd77b5828") },
                { key: "rear_size", label: uiText("ui.rear_size_25efb0de18") },
                { key: "rear_pressure", label: uiText("ui.rear_cold_pressure_03e2eada95") },
              ]}
              onUse={(result) => {
                const next = {
                  ...fields,
                  ...Object.fromEntries(
                    Object.entries(result.candidates)
                      .filter(([key, value]) => value && key in fields)
                      .map(([key, value]) => [key, String(value)]),
                  ),
                };
                setFields(next);
                setExtractionId(result.extraction_id);
                publish(next, "observed", result.extraction_id);
              }}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={uiText("ui.front_tire_size_09f282cc55")}>
              <Input value={fields.front_size} onChange={(event) => update("front_size", event.target.value)} placeholder={uiText("ui.e_g_225_50r17_615bb8c474")} />
            </Field>
            <Field label={uiText("ui.front_cold_pressure_fbd77b5828")}>
              <DecimalInput value={fields.front_pressure} onChange={(next) => update("front_pressure", next)} unit={fields.unit === "kpa" ? "kPa" : "psi"} />
            </Field>
            <Field label={uiText("ui.rear_tire_size_e5795885b0")}>
              <Input value={fields.rear_size} onChange={(event) => update("rear_size", event.target.value)} placeholder={uiText("ui.e_g_225_50r17_615bb8c474")} />
            </Field>
            <Field label={uiText("ui.rear_cold_pressure_03e2eada95")}>
              <DecimalInput value={fields.rear_pressure} onChange={(next) => update("rear_pressure", next)} unit={fields.unit === "kpa" ? "kPa" : "psi"} />
            </Field>
          </div>
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => {
              const next = { ...fields, rear_size: fields.front_size, rear_pressure: fields.front_pressure };
              setFields(next);
              publish(next);
            }}
          >{uiText("ui.rear_is_the_same_as_front_4b33e76e8e")}</button>
          <Chips
            options={["psi", "kpa"] as const}
            value={fields.unit as "psi"}
            labels={{ psi: "psi", kpa: "kPa" }}
            onChange={(next) => update("unit", next)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label={uiText("ui.load_index_if_shown_c8adee3984")}>
              <Input value={fields.load_index} onChange={(event) => update("load_index", event.target.value)} />
            </Field>
            <Field label={uiText("ui.speed_rating_if_shown_4b96b251ce")}>
              <Input value={fields.speed_rating} onChange={(event) => update("speed_rating", event.target.value)} />
            </Field>
          </div>
          <Field label={uiText("ui.approved_alternative_fitment_optional_9e34bdc292")} hint={uiText("ui.only_if_the_owner_s_manual_or_manufacturer_d_046f133401")}>
            <Textarea
              rows={2}
              value={fields.documented_alternative}
              onChange={(event) => update("documented_alternative", event.target.value)}
              className="resize-none"
            />
          </Field>
        </>
      ) : (
        <ReasonPicker
          codes={["missing_label", "unreadable", "inaccessible", "other"]}
          reason={editor.reason}
          explanation={editor.explanation}
          onChange={(code, text) => {
            editor.setReason(code);
            editor.setExplanation(text);
            publish(fields, editor.mode, extractionId, { reason: code, explanation: text });
          }}
        />
      )}
      <ErrorLine error={editor.error ?? props.serverError} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function StructuredAnswerInput(props: EditorProps) {
  const info = parseStructuredKey(props.answer.question_key ?? "");
  if (!info) {
    return <p className="text-sm text-destructive">{uiText("ui.this_question_cannot_be_edited_in_this_versi_e3e24748ed")}</p>;
  }
  // Remount when the underlying row changes so drafts never leak between rows,
  // and after a fill from photos so the editor shows the filled values.
  const key = `${props.answer.id}:${props.fillVersion ?? 0}`;
  switch (info.family) {
    case "tire_tread":
    case "tire_pressure":
    case "brake_pad":
    case "battery_test":
      return <MeasurementEditor key={key} {...props} family={info.family} />;
    case "tire_sidewall":
      return <MarkingsEditor key={key} {...props} />;
    case "tire_dot":
      return <DotEditor key={key} {...props} />;
    case "tire_cracking":
    case "tire_wear":
      return <ScaleEditor key={key} {...props} family={info.family} />;
    case "tire_damage":
      return <DefectListEditor key={key} {...props} kind="tire" />;
    case "wheel_damage":
      return <DefectListEditor key={key} {...props} kind="wheel" />;
    case "body_panel":
      return <PanelEditor key={key} {...props} />;
    case "tire_placard":
      return <PlacardEditor key={key} {...props} />;
  }
}
