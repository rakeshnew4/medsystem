DROP TABLE IF EXISTS clinic_insights;
DROP TABLE IF EXISTS demo_seed_runs;
CREATE TABLE demo_seed_runs (
  id bigserial PRIMARY KEY,
  hospital_id bigint NOT NULL,
  seed_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, seed_key)
);
CREATE TABLE clinic_insights (
  id bigserial PRIMARY KEY,
  hospital_id bigint NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metric_key text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  dimension text,
  dimension_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clinic_insights_hospital_period_idx ON clinic_insights(hospital_id, period_start, period_end);