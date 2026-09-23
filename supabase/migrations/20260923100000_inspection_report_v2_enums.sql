-- Inspection report redesign, part 1 of 2: answer types for typed observations.
--
-- PostgreSQL cannot use an enum value in the transaction that adds it, so the
-- new values ship alone and the tables/functions that reference them follow in
-- 20260923101000_inspection_report_v2.sql.
--
-- Contract: docs/perfectppi-report-handoff/docs/inspection-report-redesign/
-- 05-developer-handoff.md §3–4 and 06-field-map-and-rules.md §2–4.

ALTER TYPE public.answer_type ADD VALUE IF NOT EXISTS 'measurement';
ALTER TYPE public.answer_type ADD VALUE IF NOT EXISTS 'tire_markings';
ALTER TYPE public.answer_type ADD VALUE IF NOT EXISTS 'dot_code';
ALTER TYPE public.answer_type ADD VALUE IF NOT EXISTS 'condition_scale';
ALTER TYPE public.answer_type ADD VALUE IF NOT EXISTS 'defect_list';
ALTER TYPE public.answer_type ADD VALUE IF NOT EXISTS 'tire_placard';
ALTER TYPE public.answer_type ADD VALUE IF NOT EXISTS 'panel_condition';
