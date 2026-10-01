-- Re-apply the terminal-dispense uniqueness guard for external PostgreSQL deployments.
-- Safe to run repeatedly and only affects terminal dispenses.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pharmacy_dispenses_one_active
  ON pharmacy_dispenses(hospital_id, medication_id)
  WHERE medication_id IS NOT NULL AND status='dispensed';