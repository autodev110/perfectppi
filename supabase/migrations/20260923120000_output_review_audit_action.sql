-- An administrator released a two-page inspection report that was held as
-- needs_review (layout overflow), after replacing the overflowing text with a
-- faithful concise summary (05-developer-handoff.md, layout overflow policy).
-- The audit row records who released it, which regions changed and the
-- attestation they confirmed.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'output_review_released';
