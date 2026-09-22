-- 0019 OPD registration, UHID and hospital-day token numbering

ALTER TABLE patients ADD COLUMN IF NOT EXISTS uhid text;

UPDATE patients
SET uhid = 'UHID-' || lpad(id::text, 6, '0')
WHERE uhid IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_hospital_uhid
ON patients(hospital_id, uhid);

CREATE TABLE IF NOT EXISTS opd_daily_tokens (
  hospital_id bigint NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  token_date date NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, token_date)
);

ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS token_date date;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS token_number integer;

UPDATE queue_entries
SET token_date = COALESCE(token_date, checked_in_at::date)
WHERE token_date IS NULL;

WITH numbered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY hospital_id, token_date
           ORDER BY checked_in_at, id
         )::integer AS rn
  FROM queue_entries
  WHERE token_date IS NOT NULL
)
UPDATE queue_entries q
SET token_number = n.rn
FROM numbered n
WHERE q.id = n.id
  AND q.token_number IS NULL;

UPDATE queue_entries
SET token = 'T' || lpad(token_number::text, 3, '0')
WHERE token_number IS NOT NULL
  AND (token IS NULL OR token = '');

CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_hospital_day_token
ON queue_entries(hospital_id, token_date, token_number)
WHERE token_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_queue_hospital_token_date
ON queue_entries(hospital_id, token_date, token_number);

INSERT INTO opd_daily_tokens(hospital_id, token_date, last_number)
SELECT hospital_id, token_date, max(token_number)
FROM queue_entries
WHERE token_date IS NOT NULL
  AND token_number IS NOT NULL
GROUP BY hospital_id, token_date
ON CONFLICT (hospital_id, token_date)
DO UPDATE SET
  last_number = GREATEST(opd_daily_tokens.last_number, EXCLUDED.last_number),
  updated_at = now();