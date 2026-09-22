CREATE TABLE IF NOT EXISTS patient_otp_limits (
  phone_digits text PRIMARY KEY,
  window_started_at timestamp without time zone NOT NULL DEFAULT now(),
  sends_in_window integer NOT NULL DEFAULT 0,
  last_sent_at timestamp without time zone
)