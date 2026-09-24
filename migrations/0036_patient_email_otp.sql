CREATE TABLE IF NOT EXISTS patient_email_otp (
  email text PRIMARY KEY,
  otp_hash text NOT NULL,
  expires_at timestamp without time zone NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_sent_at timestamp without time zone NOT NULL DEFAULT now(),
  window_started_at timestamp without time zone NOT NULL DEFAULT now(),
  sends_in_window integer NOT NULL DEFAULT 1
)