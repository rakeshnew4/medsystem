-- Online OPD booking and video consultation foundation
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS public_slug text;
UPDATE hospitals
SET public_slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
WHERE public_slug IS NULL OR public_slug = '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_hospitals_public_slug ON hospitals(public_slug);

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS online_consultation_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_type text NOT NULL DEFAULT 'in_person';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS video_status text NOT NULL DEFAULT 'not_required';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS video_provider text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS video_room text;

CREATE TABLE IF NOT EXISTS video_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id bigint NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  appointment_id bigint NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'jitsi',
  room_name text NOT NULL UNIQUE,
  join_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_start timestamp,
  started_at timestamp,
  ended_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_sessions_hospital_date
ON video_sessions(hospital_id, scheduled_start);

CREATE INDEX IF NOT EXISTS idx_appointments_online
ON appointments(hospital_id, consultation_type, appointment_date, appointment_time);