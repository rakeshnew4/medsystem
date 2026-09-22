-- Reconcile pre-workflow IPD data so existing active admissions have meaningful state.
UPDATE care_encounters
SET current_stage='ipd', updated_at=now()
WHERE encounter_type='ipd' AND status='open' AND current_stage='registered';

UPDATE admissions
SET admission_number='IPD-' || lpad(id::text,6,'0'), updated_at=now()
WHERE admission_number IS NULL;

-- Do not silently release an occupied bed here. Any occupied bed without an active
-- admission is surfaced by the admin consistency checks and must be reconciled by staff.