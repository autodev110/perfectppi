-- Keep active inspections aligned with the canonical guided flow. Submitted
-- versions are historical records and are intentionally left untouched.
UPDATE public.ppi_sections AS section_row
SET sort_order = CASE section_row.section_type
  WHEN 'vehicle_basics' THEN 1
  WHEN 'exterior' THEN 2
  WHEN 'interior' THEN 3
  WHEN 'road_test' THEN 4
  WHEN 'dashboard_warnings' THEN 5
  WHEN 'engine_bay' THEN 6
  WHEN 'fluids' THEN 7
  WHEN 'tires_brakes' THEN 8
  WHEN 'suspension_steering' THEN 9
  WHEN 'underbody' THEN 10
  WHEN 'electrical_controls' THEN 11
  WHEN 'modifications' THEN 12
END
FROM public.ppi_submissions AS submission_row
WHERE submission_row.id = section_row.ppi_submission_id
  AND submission_row.status IN ('draft', 'in_progress');

-- Prefill only unanswered identity questions from the vehicle chosen at
-- intake. Technicians still see and confirm the values as the first steps.
UPDATE public.ppi_answers AS answer_row
SET answer_value = upper(btrim(vehicle_row.vin))
FROM public.ppi_sections AS section_row
JOIN public.ppi_submissions AS submission_row
  ON submission_row.id = section_row.ppi_submission_id
JOIN public.ppi_requests AS request_row
  ON request_row.id = submission_row.ppi_request_id
JOIN public.vehicles AS vehicle_row
  ON vehicle_row.id = request_row.vehicle_id
WHERE answer_row.ppi_section_id = section_row.id
  AND submission_row.status IN ('draft', 'in_progress')
  AND answer_row.prompt = 'Confirm the VIN on the vehicle'
  AND nullif(btrim(answer_row.answer_value), '') IS NULL
  AND nullif(btrim(vehicle_row.vin), '') IS NOT NULL;

UPDATE public.ppi_answers AS answer_row
SET answer_value = vehicle_row.mileage::text
FROM public.ppi_sections AS section_row
JOIN public.ppi_submissions AS submission_row
  ON submission_row.id = section_row.ppi_submission_id
JOIN public.ppi_requests AS request_row
  ON request_row.id = submission_row.ppi_request_id
JOIN public.vehicles AS vehicle_row
  ON vehicle_row.id = request_row.vehicle_id
WHERE answer_row.ppi_section_id = section_row.id
  AND submission_row.status IN ('draft', 'in_progress')
  AND answer_row.prompt = 'Current odometer reading (miles)'
  AND nullif(btrim(answer_row.answer_value), '') IS NULL
  AND vehicle_row.mileage IS NOT NULL;

-- The former wording repeated the windows check from the preceding question.
UPDATE public.ppi_answers AS answer_row
SET prompt = 'Do all door locks work from the driver switch?'
FROM public.ppi_sections AS section_row
JOIN public.ppi_submissions AS submission_row
  ON submission_row.id = section_row.ppi_submission_id
WHERE answer_row.ppi_section_id = section_row.id
  AND submission_row.status IN ('draft', 'in_progress')
  AND answer_row.prompt = 'Do all door locks and windows work from the driver switch?';
