-- Prevent concurrent/retried dispensing from creating two terminal dispenses for one prescription.
-- Production was checked before adding this constraint: no duplicate active dispenses exist.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pharmacy_dispenses_one_active
  ON pharmacy_dispenses(hospital_id, medication_id)
  WHERE medication_id IS NOT NULL AND status='dispensed';