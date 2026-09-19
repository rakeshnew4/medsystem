ALTER TABLE patients ADD COLUMN whatsapp_phone TEXT;
ALTER TABLE patients ADD COLUMN whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_patients_whatsapp ON patients(hospital_id, whatsapp_opt_in);

ALTER TABLE notifications ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE notifications ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN last_error TEXT;

CREATE UNIQUE INDEX uq_notification_appointment_kind ON notifications(appointment_id, kind) WHERE appointment_id IS NOT NULL;