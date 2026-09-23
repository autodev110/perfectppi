// ============================================================================
// Inspector accuracy certification (05-developer-handoff.md §8).
//
// The wording is versioned and stored immutably in ppi_certification_texts;
// changing it means publishing a new version, never editing this one. It is an
// accuracy certification, not a professional credential or a signature.
// ============================================================================

export const CERTIFICATION_TEXT_VERSION = "inspection_accuracy/1";

export const CERTIFICATION_TEXT =
  "I certify that the observations and answers in this inspection are accurate to the best of my knowledge and ability.";

/** Shown on reports regenerated from inspections submitted before certification existed. */
export const HISTORICAL_CERTIFICATION_NOTE = "Certification not recorded for this historical inspection";

/**
 * Header an updated native client sends to declare it can render and submit
 * catalog-2 inspections (typed observations plus certification). Browser
 * sessions always can; bearer-token clients that omit it are older app builds.
 */
export const INSPECTION_CATALOG_HEADER = "x-ppi-inspection-catalog";

export interface SubmitCertificationInput {
  accepted: boolean;
  textVersion: string;
  expectedRevision: number;
  locale?: string;
}

/** Maps a database refusal from submit_ppi_certified to user-facing copy. */
export function certifiedSubmitErrorMessage(code: string): string {
  switch (code) {
    case "certification_required":
      return "Confirm the accuracy certification to submit.";
    case "certification_text_unknown":
      return "The certification wording changed. Reload and review it again.";
    case "stale_revision":
      return "This inspection changed after you reviewed it. Review it again before certifying.";
    case "required_answers_incomplete":
      return "Some required checks still need an answer.";
    case "technician_measurements_required":
      return "Technicians must enter measured tread depth and tire pressure for every tire.";
    case "required_photos_incomplete":
      return "Some checks still need a photo, or a reason the photo could not be taken.";
    case "invalid_answers":
      return "Some answers are not valid. Review the highlighted checks.";
    case "not_performer":
      return "Only the assigned inspector can certify and submit this inspection.";
    case "submission_not_editable":
      return "This inspection was already submitted.";
    case "media_unverified":
      return "Some photos are still being verified. Try submitting again in a moment.";
    case "pressure_recheck_required":
      return "A pressure retention result needs a second reading and elapsed time.";
    case "invalid_extraction_reference":
      return "A confirmed photo reading is no longer valid for that check. Review the suggested values again.";
    default:
      return "Could not submit the inspection. Please try again.";
  }
}

/** The bare error code PostgREST surfaces from a RAISE EXCEPTION message. */
export function databaseErrorCode(message: string | null | undefined): string {
  if (!message) return "";
  const match = /^([a-z_]+)(?::|$)/.exec(message.trim());
  return match ? match[1] : message.trim();
}
