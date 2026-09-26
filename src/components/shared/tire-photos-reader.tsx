"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SlotFillResult, TireSlot } from "@/features/ppi/tire-readings";
import { useTranslator } from "@/lib/i18n/client";

// ============================================================================
// First tire step: read every placard and sidewall photo at once and report
// what was filled, what the photos disagreed on, and what could not be read.
// ============================================================================

type SlotOutcome = SlotFillResult | { slot: TireSlot; error: string };

interface SummaryLine {
  tone: "ok" | "warn" | "muted";
  text: string;
}

export function TirePhotosReader({
  photoCount,
  onRead,
  onFilled,
}: {
  photoCount: number;
  onRead: () => Promise<SlotOutcome[] | null>;
  onFilled: () => void;
}) {
  const uiText = useTranslator();
  const [reading, setReading] = useState(false);
  const [lines, setLines] = useState<SummaryLine[] | null>(null);

  const fieldLabel = (field: string): string => {
    switch (field) {
      case "size": return uiText("ui.size_1af8519073");
      case "load_index": return uiText("ui.load_index_f969c15757");
      case "speed_rating": return uiText("ui.speed_rating_d74d0984f8");
      case "brand": return uiText("ui.brand_090ed4316f");
      case "model": return uiText("ui.model_5e2c614c23");
      case "extra_marking": return uiText("ui.xl_lt_marking_c61f320b73");
      case "code": return uiText("ui.dot_date_code_145aa80041");
      case "front_size": return uiText("ui.front_size_f4c9ef374f");
      case "front_pressure": return uiText("ui.front_pressure_7fb5490214");
      case "rear_size": return uiText("ui.rear_size_25efb0de18");
      case "rear_pressure": return uiText("ui.rear_pressure_bcda250ff4");
      case "unit": return uiText("ui.pressure_unit_dcd61c1b57");
      default: return field;
    }
  };
  const slotLabel = (slot: TireSlot): string => {
    switch (slot) {
      case "placard": return uiText("ui.door_placard_682c1a1e60");
      case "front_left": return uiText("ui.front_left_tire_dd20734a3e");
      case "front_right": return uiText("ui.front_right_tire_5b7c00c16b");
      case "rear_left": return uiText("ui.rear_left_tire_5b9aa120f5");
      case "rear_right": return uiText("ui.rear_right_tire_39b0dfb355");
    }
  };

  function summarize(outcomes: SlotOutcome[]): SummaryLine[] {
    const summary: SummaryLine[] = [];
    for (const outcome of outcomes) {
      const slot = slotLabel(outcome.slot);
      if ("error" in outcome) {
        summary.push({ tone: "warn", text: uiText("ui.text_6012dfd765", { arg0: String(slot), arg1: String(outcome.error) }) });
        continue;
      }
      if (outcome.photo_count === 0) {
        summary.push({ tone: "muted", text: uiText("ui.no_photos_yet_08af30cbc9", { arg0: String(slot) }) });
        continue;
      }
      const filled = outcome.answers.flatMap((answer) => answer.filled);
      if (filled.length) {
        summary.push({ tone: "ok", text: uiText("ui.filled_in_fed72ff1a1", { arg0: String(slot), arg1: String(filled.map(fieldLabel).join(" · ")) }) });
      }
      for (const answer of outcome.answers) {
        for (const conflict of answer.conflicts) {
          const read = conflict.read
            .map((option) => (conflict.read.length > 1 ? `${option.value} (${option.media_ids.length})` : option.value))
            .join(" / ");
          summary.push({
            tone: "warn",
            text: conflict.entered
              ? uiText("ui.the_photos_show_but_you_entered_check_it_and_1848f16f11", { arg0: String(slot), arg1: String(fieldLabel(conflict.field)), arg2: String(read), arg3: String(conflict.entered) })
              : uiText("ui.the_photos_disagree_check_the_tire_and_enter_328f0ef934", { arg0: String(slot), arg1: String(fieldLabel(conflict.field)), arg2: String(read) }),
          });
        }
        if (answer.kept) {
          summary.push({ tone: "muted", text: uiText("ui.kept_your_answer_that_it_could_not_be_checke_bb238e1587", { arg0: String(slot) }) });
        }
        if (answer.error) summary.push({ tone: "warn", text: uiText("ui.text_6012dfd765", { arg0: String(slot), arg1: String(answer.error) }) });
      }
      const usable = outcome.readings.some((entry) => entry.status === "extracted");
      if (!usable) {
        summary.push({ tone: "warn", text: uiText("ui.the_photos_could_not_be_read_take_a_closer_s_d4d7058c88", { arg0: String(slot) }) });
      } else if (!filled.length && outcome.answers.every((answer) => answer.conflicts.length === 0 && !answer.error && !answer.kept)) {
        summary.push({ tone: "muted", text: uiText("ui.nothing_new_to_fill_in_4c1f515503", { arg0: String(slot) }) });
      }
    }
    return summary;
  }

  async function read() {
    setReading(true);
    const outcomes = await onRead();
    setReading(false);
    if (!outcomes) {
      setLines([{ tone: "warn", text: uiText("ui.your_latest_changes_could_not_be_saved_so_th_68bc6940a7") }]);
      return;
    }
    setLines(summarize(outcomes));
    onFilled();
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground">{uiText("ui.photograph_the_door_placard_and_each_tire_s__4d87a9998a")}</p>
      <Button type="button" onClick={read} disabled={reading || photoCount === 0} className="w-full">
        {reading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanText className="mr-2 h-4 w-4" />}
        {reading ? uiText("ui.reading_photos_5293d799cb") : uiText("ui.read_photos_and_fill_in_details_8fb698284a")}
      </Button>
      {photoCount === 0 ? <p className="text-xs text-muted-foreground">{uiText("ui.add_at_least_one_photo_first_092dab4642")}</p> : null}
      {lines ? (
        <ul className="space-y-1.5 text-sm" aria-live="polite">
          {lines.map((line, index) => (
            <li
              key={index}
              className={
                line.tone === "ok"
                  ? "flex gap-2 text-emerald-700 dark:text-emerald-400"
                  : line.tone === "warn"
                    ? "flex gap-2 text-amber-800 dark:text-amber-300"
                    : "flex gap-2 text-muted-foreground"
              }
            >
              {line.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : line.tone === "warn" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <span className="w-4 shrink-0" />}
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
