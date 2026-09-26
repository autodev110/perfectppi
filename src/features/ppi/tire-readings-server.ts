import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { saveAnswers } from "./actions";
import { extractFromPhoto } from "./inspection-extraction";
import { parseObservation, validateObservation } from "./inspection-schema";
import {
  mergeReadings,
  planFill,
  slotQuestions,
  type PhotoReading,
  type ReadingTarget,
  type SlotAnswerResult,
  type SlotFillResult,
  type TireSlot,
} from "./tire-readings";

// ============================================================================
// Reads every photo of one tire slot and fills its answers (see
// tire-readings.ts). Each photo reading is cached per photo, so reading again
// after adding a photo only reads the new one. Saving goes through
// saveAnswers, the same validation and provenance checks as any edit.
// ============================================================================

const READ_CONCURRENCY = 4;
export const MAX_TIRE_PHOTOS_PER_SLOT = 8;

export async function fillTireSlotFromPhotos(params: {
  supabase: SupabaseClient<Database>;
  submissionId: string;
  slot: TireSlot;
  requestedBy: string;
}): Promise<SlotFillResult> {
  const questions = slotQuestions(params.slot);
  const { data: answerRows, error: answersError } = await params.supabase
    .from("ppi_answers")
    .select("id, question_key, observation, section:ppi_sections!inner(ppi_submission_id)")
    .eq("section.ppi_submission_id", params.submissionId)
    .in("question_key", questions.map((question) => question.key));
  if (answersError) throw new Error(answersError.message);
  const answers = answerRows ?? [];
  const answerIds = answers.map((answer) => answer.id);

  const { data: mediaRows, error: mediaError } = answerIds.length
    ? await params.supabase
        .from("ppi_media")
        .select("id, ppi_answer_id, uploaded_at")
        .in("ppi_answer_id", answerIds)
        .eq("media_type", "image")
        .order("uploaded_at", { ascending: true })
        .limit(MAX_TIRE_PHOTOS_PER_SLOT + 1)
    : { data: [], error: null };
  if (mediaError) throw new Error(mediaError.message);
  const photos = mediaRows ?? [];

  if (photos.length > MAX_TIRE_PHOTOS_PER_SLOT) {
    throw new Error(`Use no more than ${MAX_TIRE_PHOTOS_PER_SLOT} photos for one tire or placard.`);
  }

  const result: SlotFillResult = { slot: params.slot, photo_count: photos.length, readings: [], answers: [] };
  if (photos.length === 0) return result;

  // Every photo of the slot is read for every target the slot fills: a DOT
  // code can appear on any of a tire's sidewall photos.
  const jobs = photos.flatMap((photo) => questions.map((question) => ({ mediaId: photo.id, target: question.target })));
  const readings: (PhotoReading & { target: ReadingTarget })[] = [];
  for (let start = 0; start < jobs.length; start += READ_CONCURRENCY) {
    const batch = jobs.slice(start, start + READ_CONCURRENCY);
    const settled = await Promise.all(batch.map(async (job) => {
      try {
        const reading = await extractFromPhoto({ mediaId: job.mediaId, target: job.target, requestedBy: params.requestedBy });
        return { ...job, reading, error: undefined };
      } catch (error) {
        return { ...job, reading: null, error: error instanceof Error ? error.message : "The photo could not be read." };
      }
    }));
    for (const entry of settled) {
      if (entry.reading) {
        readings.push({
          target: entry.target,
          extraction_id: entry.reading.extraction_id,
          media_id: entry.mediaId,
          status: entry.reading.status,
          candidates: entry.reading.candidates,
        });
        result.readings.push({ media_id: entry.mediaId, target: entry.target, status: entry.reading.status });
      } else {
        result.readings.push({ media_id: entry.mediaId, target: entry.target, status: "failed", error: entry.error });
      }
    }
  }

  for (const question of questions) {
    const answer = answers.find((row) => row.question_key === question.key);
    if (!answer) continue;
    const merged = mergeReadings(question.target, readings.filter((reading) => reading.target === question.target));
    const plan = planFill(question.target, parseObservation(answer.observation), merged);
    const entry: SlotAnswerResult = {
      answer_id: answer.id,
      question_key: question.key,
      filled: [],
      conflicts: plan.conflicts,
      ...(plan.kept ? { kept: plan.kept } : {}),
    };
    if (plan.observation) {
      const validation = validateObservation(question.key, plan.observation);
      if (!validation.ok) {
        entry.error = validation.error;
      } else {
        const saved = await saveAnswers(params.submissionId, [{ answerId: answer.id, observation: validation.observation }]);
        if ("error" in saved && saved.error) entry.error = saved.error;
        else entry.filled = plan.filled;
      }
    }
    result.answers.push(entry);
  }
  return result;
}
