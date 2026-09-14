-- Enum values must commit before the following migration uses them.
CREATE TYPE public.vehicle_build_stage_status AS ENUM ('planned', 'in_progress', 'complete', 'on_hold');
CREATE TYPE public.vehicle_build_document_kind AS ENUM ('receipt', 'invoice', 'warranty', 'dyno_sheet', 'alignment', 'other');
