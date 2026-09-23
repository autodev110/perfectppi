import type { FactsInputSection } from "./inspection-facts.ts";

// ============================================================================
// The certified submission snapshot, as submit_ppi_certified stores it in
// ppi_submission_certifications.facts_snapshot / media_manifest, and its
// adapter back to fact-builder input. Reports and the evidence appendix read
// this frozen copy rather than live rows or today's vehicle profile.
// ============================================================================

export interface CertifiedSnapshot {
  facts_hash: string;
  certified_at: string;
  certification_text: string;
  text_version: string;
  performer_mode: string;
  facts_snapshot: {
    sections?: { id: string; section_type: string; notes: string | null; sort_order: number }[];
    answers?: {
      id: string;
      section_id: string;
      question_key: string | null;
      prompt: string;
      answer_type: string;
      answer_value: string | null;
      observation: unknown;
      is_required: boolean;
      sort_order: number;
    }[];
    vehicle?: { year: number | null; make: string | null; model: string | null; trim: string | null; vin: string | null; mileage: number | null };
    inspector?: { display_name: string | null; username?: string | null };
  };
  media_manifest: {
    id: string;
    section_id: string;
    answer_id: string | null;
    storage_reference: string;
    media_type: string;
    caption: string | null;
    captured_at: string | null;
    uploaded_at: string | null;
  }[];
}

/** Sections exactly as certified: answers, notes and the frozen media manifest. */
export function sectionsFromSnapshot(snapshot: CertifiedSnapshot): FactsInputSection[] {
  const sections = [...(snapshot.facts_snapshot.sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return sections.map((section) => ({
    section_type: section.section_type,
    notes: section.notes,
    answers: (snapshot.facts_snapshot.answers ?? [])
      .filter((answer) => answer.section_id === section.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((answer) => ({
        id: answer.id,
        prompt: answer.prompt,
        question_key: answer.question_key,
        answer_type: answer.answer_type,
        answer_value: answer.answer_value,
        observation: answer.observation,
        is_required: answer.is_required,
      })),
    media: snapshot.media_manifest
      .filter((media) => media.section_id === section.id)
      .map((media) => ({
        id: media.id,
        ppi_answer_id: media.answer_id,
        url: media.storage_reference,
        media_type: media.media_type,
        caption: media.caption,
        captured_at: media.captured_at,
        uploaded_at: media.uploaded_at,
      })),
  }));
}

/** The inspector's name as certified: display name, else username. */
export function certifiedInspectorName(snapshot: CertifiedSnapshot | null): string | null {
  const inspector = snapshot?.facts_snapshot.inspector;
  return inspector?.display_name?.trim() || inspector?.username?.trim() || null;
}
