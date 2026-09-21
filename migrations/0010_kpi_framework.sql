-- CareFlow KPI framework
-- PostgreSQL migration 0010
-- Source tables: appointments, patients, queue_entries, doctor_visits,
-- vitals, lab_orders, medications, followups, beds, admissions,
-- invoices, invoice_items, notifications, conversations, messages, staff_profiles.
--
-- Design:
-- 1. kpi_definitions is the catalog/contract for every KPI.
-- 2. kpi_daily stores immutable-ish daily snapshots that can be refreshed.
-- 3. refresh_hospital_kpis() calculates one hospital/day.
-- 4. kpi_daily_summary exposes rolling 7/30/60-day values.
--
-- No clinical diagnosis/treatment KPI is included.

CREATE TABLE IF NOT EXISTS kpi_definitions (
  id BIGSERIAL PRIMARY KEY,
  metric_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'count',
  aggregation TEXT NOT NULL DEFAULT 'sum',
  source_tables TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kpi_daily (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  kpi_date DATE NOT NULL,
  metric_key TEXT NOT NULL REFERENCES kpi_definitions(metric_key) ON DELETE CASCADE,
  metric_value NUMERIC(18,4) NOT NULL DEFAULT 0,
  numerator NUMERIC(18,4),
  denominator NUMERIC(18,4),
  dimension TEXT,
  dimension_value TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, kpi_date, metric_key, dimension, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_kpi_daily_hospital_date
  ON kpi_daily(hospital_id, kpi_date DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_daily_metric_date
  ON kpi_daily(metric_key, kpi_date DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_daily_dimension
  ON kpi_daily(hospital_id, metric_key, dimension, dimension_value, kpi_date DESC);

-- KPI catalog
INSERT INTO kpi_definitions
(metric_key, category, name, description, unit, aggregation, source_tables)
VALUES
-- Patient KPIs
('new_patients','patients','New patients','Patients created on the KPI date','patients','sum','patients'),
('active_patients','patients','Active patients','Patients marked active as of the KPI date','patients','snapshot','patients'),
('inactive_patients','patients','Inactive patients','Patients marked inactive as of the KPI date','patients','snapshot','patients'),
('returning_patient_visits','patients','Returning patient visits','Completed visits by patients whose first recorded patient date predates the KPI date','visits','sum','patients,doctor_visits'),
('patient_visits_per_patient','patients','Visits per patient','Completed doctor visits divided by active patient count','ratio','ratio','doctor_visits,patients'),

-- Appointment KPIs
('appointments_booked','appointments','Appointments booked','Appointments scheduled for the KPI date','appointments','sum','appointments'),
('appointments_completed','appointments','Appointments completed','Appointments with completed status on the KPI date','appointments','sum','appointments'),
('appointments_checked_in','appointments','Appointments checked in','Appointments checked in on the KPI date','appointments','sum','appointments'),
('appointments_cancelled','appointments','Appointments cancelled','Appointments cancelled on the KPI date','appointments','sum','appointments'),
('appointments_no_show','appointments','Appointments no-show','Appointments marked no-show for the KPI date','appointments','sum','appointments'),
('appointment_completion_rate','appointments','Appointment completion rate','Completed appointments divided by scheduled appointments','percent','ratio','appointments'),
('appointment_no_show_rate','appointments','Appointment no-show rate','No-show appointments divided by scheduled appointments','percent','ratio','appointments'),
('appointment_cancellation_rate','appointments','Appointment cancellation rate','Cancelled appointments divided by scheduled appointments','percent','ratio','appointments'),
('same_day_booking_rate','appointments','Same-day booking rate','Appointments created on the same date as the appointment','percent','ratio','appointments'),

-- Queue / service KPIs
('queue_checkins','operations','Queue check-ins','Queue entries checked in on the KPI date','patients','sum','queue_entries'),
('avg_wait_minutes','operations','Average waiting time','Average minutes from queue check-in to doctor start','minutes','average','queue_entries,doctor_visits'),
('p90_wait_minutes','operations','P90 waiting time','90th percentile minutes from queue check-in to doctor start','minutes','percentile','queue_entries,doctor_visits'),
('avg_consultation_minutes','operations','Average consultation time','Average completed doctor consultation duration','minutes','average','doctor_visits'),
('p90_consultation_minutes','operations','P90 consultation time','90th percentile completed consultation duration','minutes','percentile','doctor_visits'),
('queue_completed','operations','Queue completions','Queue entries completed on the KPI date','patients','sum','queue_entries'),
('queue_open_end_of_day','operations','Open queue at end of day','Queue entries not completed by end of the KPI date','patients','snapshot','queue_entries'),

-- Clinical workflow KPIs
('completed_visits','clinical','Completed consultations','Completed doctor visits on the KPI date','visits','sum','doctor_visits'),
('open_visits_end_of_day','clinical','Open consultations','Doctor visits still open at end of day','visits','snapshot','doctor_visits'),
('prescriptions_issued','clinical','Prescriptions issued','Medication rows prescribed on the KPI date','medications','sum','medications'),
('patients_with_vitals','clinical','Patients with vitals','Distinct patients with vitals recorded on the KPI date','patients','sum','vitals'),
('lab_orders','clinical','Lab orders','Lab orders created on the KPI date','orders','sum','lab_orders'),
('lab_completed','clinical','Lab orders completed','Lab orders completed on the KPI date','orders','sum','lab_orders'),
('lab_pending_end_of_day','clinical','Pending lab orders','Lab orders still not completed/cancelled at end of day','orders','snapshot','lab_orders'),

-- Follow-up KPIs
('followups_created','followups','Follow-ups created','Follow-ups created on the KPI date','followups','sum','followups'),
('followups_due','followups','Follow-ups due','Follow-ups due on the KPI date','followups','sum','followups'),
('followups_completed','followups','Follow-ups completed','Follow-ups completed on the KPI date','followups','sum','followups'),
('followups_overdue','followups','Overdue follow-ups','Open follow-ups past their due date as of the KPI date','followups','snapshot','followups'),
('followup_completion_rate','followups','Follow-up completion rate','Follow-ups completed divided by follow-ups due','percent','ratio','followups'),

-- Revenue KPIs
('invoices_created','revenue','Invoices created','Invoices created on the KPI date','invoices','sum','invoices'),
('gross_billed','revenue','Gross billed','Invoice total created on the KPI date','currency','sum','invoices'),
('amount_collected','revenue','Amount collected','Payments recorded on invoices on the KPI date','currency','sum','invoices'),
('outstanding_receivables','revenue','Outstanding receivables','Total unpaid invoice balance as of the KPI date','currency','snapshot','invoices'),
('collection_rate','revenue','Collection rate','Collected amount divided by billed amount','percent','ratio','invoices'),
('average_invoice_value','revenue','Average invoice value','Average invoice total created on the KPI date','currency','average','invoices'),
('discount_amount','revenue','Discount amount','Discount granted on invoices created on the KPI date','currency','sum','invoices'),
('tax_amount','revenue','Tax amount','Tax charged on invoices created on the KPI date','currency','sum','invoices'),

-- Beds / admissions
('beds_total','inpatient','Total beds','Configured beds as of the KPI date','beds','snapshot','beds'),
('beds_occupied','inpatient','Occupied beds','Beds with an active admission as of the KPI date','beds','snapshot','beds,admissions'),
('bed_occupancy_rate','inpatient','Bed occupancy rate','Occupied beds divided by configured beds','percent','ratio','beds,admissions'),
('admissions_started','inpatient','Admissions started','Admissions started on the KPI date','admissions','sum','admissions'),
('discharges','inpatient','Discharges','Admissions discharged on the KPI date','admissions','sum','admissions'),

-- Communication / automation
('notifications_sent','communications','Notifications sent','Notifications marked sent on the KPI date','notifications','sum','notifications'),
('notification_failure_rate','communications','Notification failure rate','Failed notifications divided by attempted notifications','percent','ratio','notifications'),
('conversations_created','communications','Conversations created','Conversations opened/created on the KPI date','conversations','sum','conversations'),
('staff_active','staff','Active staff','Active staff profiles as of the KPI date','staff','snapshot','staff_profiles')
ON CONFLICT (metric_key) DO UPDATE SET
  category=EXCLUDED.category,
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  unit=EXCLUDED.unit,
  aggregation=EXCLUDED.aggregation,
  source_tables=EXCLUDED.source_tables,
  active=true;

CREATE OR REPLACE FUNCTION refresh_hospital_kpis(
  p_hospital_id BIGINT,
  p_kpi_date DATE
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_start TIMESTAMP := p_kpi_date::timestamp;
  v_end   TIMESTAMP := (p_kpi_date + 1)::timestamp;
  v_appt_booked NUMERIC := 0;
  v_appt_completed NUMERIC := 0;
  v_appt_checked NUMERIC := 0;
  v_appt_cancelled NUMERIC := 0;
  v_appt_no_show NUMERIC := 0;
  v_new_patients NUMERIC := 0;
  v_completed_visits NUMERIC := 0;
  v_active_patients NUMERIC := 0;
  v_inactive_patients NUMERIC := 0;
  v_returning_visits NUMERIC := 0;
  v_queue_checkins NUMERIC := 0;
  v_queue_completed NUMERIC := 0;
  v_avg_wait NUMERIC := 0;
  v_p90_wait NUMERIC := 0;
  v_avg_consult NUMERIC := 0;
  v_p90_consult NUMERIC := 0;
  v_open_visits NUMERIC := 0;
  v_prescriptions NUMERIC := 0;
  v_patients_vitals NUMERIC := 0;
  v_lab_orders NUMERIC := 0;
  v_lab_completed NUMERIC := 0;
  v_lab_pending NUMERIC := 0;
  v_followups_created NUMERIC := 0;
  v_followups_due NUMERIC := 0;
  v_followups_completed NUMERIC := 0;
  v_followups_overdue NUMERIC := 0;
  v_invoices NUMERIC := 0;
  v_billed NUMERIC := 0;
  v_collected NUMERIC := 0;
  v_outstanding NUMERIC := 0;
  v_discount NUMERIC := 0;
  v_tax NUMERIC := 0;
  v_avg_invoice NUMERIC := 0;
  v_beds_total NUMERIC := 0;
  v_beds_occupied NUMERIC := 0;
  v_admissions NUMERIC := 0;
  v_discharges NUMERIC := 0;
  v_notifications_sent NUMERIC := 0;
  v_notifications_failed NUMERIC := 0;
  v_notifications_attempted NUMERIC := 0;
  v_conversations NUMERIC := 0;
  v_staff_active NUMERIC := 0;
  v_queue_open_eod NUMERIC := 0;
  v_same_day_bookings NUMERIC := 0;
BEGIN
  -- Appointments are measured by appointment_date, not created_at.
  SELECT
    count(*),
    count(*) FILTER (WHERE status='completed'),
    count(*) FILTER (WHERE status='checked_in'),
    count(*) FILTER (WHERE status='cancelled'),
    count(*) FILTER (WHERE status='no_show'),
    count(*) FILTER (WHERE created_at::date=p_kpi_date)
  INTO
    v_appt_booked, v_appt_completed, v_appt_checked,
    v_appt_cancelled, v_appt_no_show, v_same_day_bookings
  FROM appointments
  WHERE hospital_id=p_hospital_id
    AND appointment_date=p_kpi_date;

  SELECT count(*)
  INTO v_new_patients
  FROM patients
  WHERE hospital_id=p_hospital_id
    AND created_at >= v_start AND created_at < v_end;

  SELECT
    count(*) FILTER (WHERE status='active'),
    count(*) FILTER (WHERE status='inactive')
  INTO v_active_patients, v_inactive_patients
  FROM patients
  WHERE hospital_id=p_hospital_id
    AND created_at < v_end;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE p.created_at::date < p_kpi_date
    )
  INTO v_completed_visits, v_returning_visits
  FROM doctor_visits v
  JOIN patients p ON p.id=v.patient_id AND p.hospital_id=p_hospital_id
  WHERE v.hospital_id=p_hospital_id
    AND v.visit_status='completed'
    AND v.ended_at >= v_start AND v.ended_at < v_end;

  SELECT count(*), count(*) FILTER (WHERE completed_at IS NOT NULL)
  INTO v_queue_checkins, v_queue_completed
  FROM queue_entries
  WHERE hospital_id=p_hospital_id
    AND checked_in_at >= v_start AND checked_in_at < v_end;

  SELECT
    COALESCE(avg(EXTRACT(EPOCH FROM (v.started_at-q.checked_in_at))/60.0),0),
    COALESCE(percentile_cont(0.90) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (v.started_at-q.checked_in_at))/60.0
    ),0)
  INTO v_avg_wait, v_p90_wait
  FROM queue_entries q
  JOIN doctor_visits v
    ON v.queue_entry_id=q.id
   AND v.hospital_id=p_hospital_id
  WHERE q.hospital_id=p_hospital_id
    AND q.checked_in_at >= v_start AND q.checked_in_at < v_end
    AND v.started_at IS NOT NULL
    AND v.started_at >= q.checked_in_at;

  SELECT
    COALESCE(avg(EXTRACT(EPOCH FROM (ended_at-started_at))/60.0),0),
    COALESCE(percentile_cont(0.90) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (ended_at-started_at))/60.0
    ),0)
  INTO v_avg_consult, v_p90_consult
  FROM doctor_visits
  WHERE hospital_id=p_hospital_id
    AND visit_status='completed'
    AND ended_at >= v_start AND ended_at < v_end
    AND started_at IS NOT NULL AND ended_at >= started_at;

  SELECT count(*)
  INTO v_open_visits
  FROM doctor_visits
  WHERE hospital_id=p_hospital_id
    AND started_at < v_end
    AND (ended_at IS NULL OR ended_at >= v_end);

  SELECT count(*)
  INTO v_prescriptions
  FROM medications
  WHERE hospital_id=p_hospital_id
    AND prescribed_at >= v_start AND prescribed_at < v_end;

  SELECT count(DISTINCT patient_id)
  INTO v_patients_vitals
  FROM vitals
  WHERE hospital_id=p_hospital_id
    AND recorded_at >= v_start AND recorded_at < v_end;

  SELECT count(*), count(*) FILTER (WHERE completed_at >= v_start AND completed_at < v_end)
  INTO v_lab_orders, v_lab_completed
  FROM lab_orders
  WHERE hospital_id=p_hospital_id
    AND ordered_at >= v_start AND ordered_at < v_end;

  SELECT count(*)
  INTO v_lab_pending
  FROM lab_orders
  WHERE hospital_id=p_hospital_id
    AND ordered_at < v_end
    AND COALESCE(completed_at, '9999-12-31'::timestamp) >= v_end
    AND status NOT IN ('cancelled','completed');

  SELECT count(*)
  INTO v_followups_created
  FROM followups
  WHERE hospital_id=p_hospital_id
    AND created_at >= v_start AND created_at < v_end;

  SELECT count(*)
  INTO v_followups_due
  FROM followups
  WHERE hospital_id=p_hospital_id
    AND due_date=p_kpi_date;

  SELECT count(*)
  INTO v_followups_completed
  FROM followups
  WHERE hospital_id=p_hospital_id
    AND updated_at >= v_start AND updated_at < v_end
    AND status IN ('completed','done');

  SELECT count(*)
  INTO v_followups_overdue
  FROM followups
  WHERE hospital_id=p_hospital_id
    AND due_date < p_kpi_date
    AND status NOT IN ('completed','done','cancelled');

  SELECT
    count(*),
    COALESCE(sum(total),0),
    COALESCE(sum(paid),0),
    COALESCE(sum(discount),0),
    COALESCE(sum(tax),0),
    COALESCE(avg(total),0)
  INTO v_invoices, v_billed, v_collected, v_discount, v_tax, v_avg_invoice
  FROM invoices
  WHERE hospital_id=p_hospital_id
    AND created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(sum(total-paid),0)
  INTO v_outstanding
  FROM invoices
  WHERE hospital_id=p_hospital_id
    AND created_at < v_end
    AND status NOT IN ('paid','cancelled');

  SELECT count(*), count(*) FILTER (WHERE a.id IS NOT NULL)
  INTO v_beds_total, v_beds_occupied
  FROM beds b
  LEFT JOIN admissions a
    ON a.bed_id=b.id
   AND a.hospital_id=p_hospital_id
   AND a.admitted_at < v_end
   AND (a.discharged_at IS NULL OR a.discharged_at >= v_end)
  WHERE b.hospital_id=p_hospital_id;

  SELECT count(*) FILTER (WHERE admitted_at >= v_start AND admitted_at < v_end),
         count(*) FILTER (WHERE discharged_at >= v_start AND discharged_at < v_end)
  INTO v_admissions, v_discharges
  FROM admissions
  WHERE hospital_id=p_hospital_id;

  SELECT
    count(*) FILTER (WHERE status='sent' AND sent_at >= v_start AND sent_at < v_end),
    count(*) FILTER (WHERE status IN ('failed','error') AND updated_at >= v_start AND updated_at < v_end),
    count(*) FILTER (WHERE status IN ('sent','failed','error') AND COALESCE(sent_at,updated_at) >= v_start AND COALESCE(sent_at,updated_at) < v_end)
  INTO v_notifications_sent, v_notifications_failed, v_notifications_attempted
  FROM notifications
  WHERE hospital_id=p_hospital_id;

  SELECT count(*)
  INTO v_conversations
  FROM conversations
  WHERE hospital_id=p_hospital_id
    AND created_at >= v_start AND created_at < v_end;

  SELECT count(*)
  INTO v_staff_active
  FROM staff_profiles
  WHERE hospital_id=p_hospital_id
    AND active=true
    AND created_at < v_end;

  SELECT count(*)
  INTO v_queue_open_eod
  FROM queue_entries
  WHERE hospital_id=p_hospital_id
    AND checked_in_at < v_end
    AND (completed_at IS NULL OR completed_at >= v_end);

  DELETE FROM kpi_daily
  WHERE hospital_id=p_hospital_id
    AND kpi_date=p_kpi_date;

  INSERT INTO kpi_daily
    (hospital_id,kpi_date,metric_key,metric_value,numerator,denominator,metadata)
  VALUES
    (p_hospital_id,p_kpi_date,'new_patients',v_new_patients,v_new_patients,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'active_patients',v_active_patients,v_active_patients,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'inactive_patients',v_inactive_patients,v_inactive_patients,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'returning_patient_visits',v_returning_visits,v_returning_visits,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'patient_visits_per_patient',CASE WHEN v_active_patients=0 THEN 0 ELSE v_completed_visits/v_active_patients END,v_completed_visits,v_active_patients,'{}'),

    (p_hospital_id,p_kpi_date,'appointments_booked',v_appt_booked,v_appt_booked,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'appointments_completed',v_appt_completed,v_appt_completed,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'appointments_checked_in',v_appt_checked,v_appt_checked,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'appointments_cancelled',v_appt_cancelled,v_appt_cancelled,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'appointments_no_show',v_appt_no_show,v_appt_no_show,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'appointment_completion_rate',CASE WHEN v_appt_booked=0 THEN 0 ELSE 100*v_appt_completed/v_appt_booked END,v_appt_completed,v_appt_booked,'{}'),
    (p_hospital_id,p_kpi_date,'appointment_no_show_rate',CASE WHEN v_appt_booked=0 THEN 0 ELSE 100*v_appt_no_show/v_appt_booked END,v_appt_no_show,v_appt_booked,'{}'),
    (p_hospital_id,p_kpi_date,'appointment_cancellation_rate',CASE WHEN v_appt_booked=0 THEN 0 ELSE 100*v_appt_cancelled/v_appt_booked END,v_appt_cancelled,v_appt_booked,'{}'),
    (p_hospital_id,p_kpi_date,'same_day_booking_rate',CASE WHEN v_appt_booked=0 THEN 0 ELSE 100*v_same_day_bookings/v_appt_booked END,v_same_day_bookings,v_appt_booked,'{}'),

    (p_hospital_id,p_kpi_date,'queue_checkins',v_queue_checkins,v_queue_checkins,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'avg_wait_minutes',v_avg_wait,v_avg_wait,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'p90_wait_minutes',v_p90_wait,v_p90_wait,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'avg_consultation_minutes',v_avg_consult,v_avg_consult,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'p90_consultation_minutes',v_p90_consult,v_p90_consult,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'queue_completed',v_queue_completed,v_queue_completed,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'queue_open_end_of_day',v_queue_open_eod,v_queue_open_eod,NULL,'{}'),

    (p_hospital_id,p_kpi_date,'completed_visits',v_completed_visits,v_completed_visits,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'open_visits_end_of_day',v_open_visits,v_open_visits,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'prescriptions_issued',v_prescriptions,v_prescriptions,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'patients_with_vitals',v_patients_vitals,v_patients_vitals,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'lab_orders',v_lab_orders,v_lab_orders,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'lab_completed',v_lab_completed,v_lab_completed,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'lab_pending_end_of_day',v_lab_pending,v_lab_pending,NULL,'{}'),

    (p_hospital_id,p_kpi_date,'followups_created',v_followups_created,v_followups_created,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'followups_due',v_followups_due,v_followups_due,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'followups_completed',v_followups_completed,v_followups_completed,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'followups_overdue',v_followups_overdue,v_followups_overdue,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'followup_completion_rate',CASE WHEN v_followups_due=0 THEN 0 ELSE 100*v_followups_completed/v_followups_due END,v_followups_completed,v_followups_due,'{}'),

    (p_hospital_id,p_kpi_date,'invoices_created',v_invoices,v_invoices,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'gross_billed',v_billed,v_billed,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'amount_collected',v_collected,v_collected,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'outstanding_receivables',v_outstanding,v_outstanding,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'collection_rate',CASE WHEN v_billed=0 THEN 0 ELSE 100*v_collected/v_billed END,v_collected,v_billed,'{}'),
    (p_hospital_id,p_kpi_date,'average_invoice_value',v_avg_invoice,v_avg_invoice,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'discount_amount',v_discount,v_discount,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'tax_amount',v_tax,v_tax,NULL,'{}'),

    (p_hospital_id,p_kpi_date,'beds_total',v_beds_total,v_beds_total,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'beds_occupied',v_beds_occupied,v_beds_occupied,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'bed_occupancy_rate',CASE WHEN v_beds_total=0 THEN 0 ELSE 100*v_beds_occupied/v_beds_total END,v_beds_occupied,v_beds_total,'{}'),
    (p_hospital_id,p_kpi_date,'admissions_started',v_admissions,v_admissions,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'discharges',v_discharges,v_discharges,NULL,'{}'),

    (p_hospital_id,p_kpi_date,'notifications_sent',v_notifications_sent,v_notifications_sent,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'notification_failure_rate',CASE WHEN v_notifications_attempted=0 THEN 0 ELSE 100*v_notifications_failed/v_notifications_attempted END,v_notifications_failed,v_notifications_attempted,'{}'),
    (p_hospital_id,p_kpi_date,'conversations_created',v_conversations,v_conversations,NULL,'{}'),
    (p_hospital_id,p_kpi_date,'staff_active',v_staff_active,v_staff_active,NULL,'{}');
END;
$$;

CREATE OR REPLACE FUNCTION refresh_all_hospital_kpis(
  p_from DATE,
  p_to DATE
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  h RECORD;
  d DATE;
BEGIN
  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must be >= p_from';
  END IF;

  FOR h IN SELECT id FROM hospitals LOOP
    d := p_from;
    WHILE d <= p_to LOOP
      PERFORM refresh_hospital_kpis(h.id,d);
      d := d + 1;
    END LOOP;
  END LOOP;
END;
$$;

-- Rolling KPI view. Rate KPIs are recalculated from stored numerators/denominators
-- instead of averaging daily percentages.
CREATE OR REPLACE VIEW kpi_rolling_summary AS
WITH periods AS (
  SELECT
    h.id AS hospital_id,
    p.period_name,
    p.days,
    current_date - (p.days-1) AS period_start,
    current_date AS period_end
  FROM hospitals h
  CROSS JOIN (VALUES ('7d',7),('30d',30),('60d',60)) p(period_name,days)
),
base AS (
  SELECT
    p.hospital_id,p.period_name,p.days,p.period_start,p.period_end,
    k.metric_key,d.category,d.name,d.unit,d.aggregation,
    sum(k.metric_value) AS value_sum,
    sum(k.numerator) AS numerator,
    sum(k.denominator) AS denominator
  FROM periods p
  JOIN kpi_daily k
    ON k.hospital_id=p.hospital_id
   AND k.kpi_date BETWEEN p.period_start AND p.period_end
  JOIN kpi_definitions d ON d.metric_key=k.metric_key
  GROUP BY p.hospital_id,p.period_name,p.days,p.period_start,p.period_end,
           k.metric_key,d.category,d.name,d.unit,d.aggregation
)
SELECT
  hospital_id,
  period_name,
  period_start,
  period_end,
  metric_key,
  category,
  name,
  unit,
  CASE
    WHEN aggregation='ratio' AND COALESCE(denominator,0) <> 0
      THEN ROUND(100*numerator/denominator,2)
    WHEN aggregation='average'
      THEN ROUND(value_sum/NULLIF((period_end-period_start)+1,0),2)
    ELSE ROUND(value_sum,2)
  END AS value,
  numerator,
  denominator
FROM base;

-- Doctor-level operational KPI view. This intentionally stays separate from
-- the hospital-wide daily table because doctor dimensions are naturally queried
-- ad hoc and should not multiply the daily KPI storage unnecessarily.
CREATE OR REPLACE VIEW doctor_kpi_daily AS
SELECT
  v.hospital_id,
  v.doctor_id,
  d.name AS doctor_name,
  v.started_at::date AS kpi_date,
  count(*) FILTER (WHERE v.visit_status='completed')::int AS completed_visits,
  count(*) FILTER (WHERE v.visit_status='open')::int AS open_visits,
  ROUND(
    COALESCE(avg(EXTRACT(EPOCH FROM (v.ended_at-v.started_at))/60.0)
      FILTER (WHERE v.visit_status='completed' AND v.ended_at IS NOT NULL),0)::numeric,2
  ) AS avg_consultation_minutes,
  ROUND(
    COALESCE(percentile_cont(0.90) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (v.ended_at-v.started_at))/60.0
    ) FILTER (WHERE v.visit_status='completed' AND v.ended_at IS NOT NULL),0)::numeric,2
  ) AS p90_consultation_minutes
FROM doctor_visits v
LEFT JOIN doctors d ON d.id=v.doctor_id
GROUP BY v.hospital_id,v.doctor_id,d.name,v.started_at::date;

-- Daily operational snapshot for dashboards.
CREATE OR REPLACE VIEW hospital_kpi_dashboard AS
SELECT
  k.hospital_id,
  k.kpi_date,
  max(k.metric_value) FILTER (WHERE k.metric_key='appointments_booked') AS appointments_booked,
  max(k.metric_value) FILTER (WHERE k.metric_key='appointments_completed') AS appointments_completed,
  max(k.metric_value) FILTER (WHERE k.metric_key='appointments_no_show') AS appointments_no_show,
  max(k.metric_value) FILTER (WHERE k.metric_key='appointment_no_show_rate') AS no_show_rate,
  max(k.metric_value) FILTER (WHERE k.metric_key='new_patients') AS new_patients,
  max(k.metric_value) FILTER (WHERE k.metric_key='completed_visits') AS completed_visits,
  max(k.metric_value) FILTER (WHERE k.metric_key='avg_wait_minutes') AS avg_wait_minutes,
  max(k.metric_value) FILTER (WHERE k.metric_key='p90_wait_minutes') AS p90_wait_minutes,
  max(k.metric_value) FILTER (WHERE k.metric_key='avg_consultation_minutes') AS avg_consultation_minutes,
  max(k.metric_value) FILTER (WHERE k.metric_key='gross_billed') AS gross_billed,
  max(k.metric_value) FILTER (WHERE k.metric_key='amount_collected') AS amount_collected,
  max(k.metric_value) FILTER (WHERE k.metric_key='outstanding_receivables') AS outstanding_receivables,
  max(k.metric_value) FILTER (WHERE k.metric_key='bed_occupancy_rate') AS bed_occupancy_rate,
  max(k.metric_value) FILTER (WHERE k.metric_key='followups_overdue') AS followups_overdue,
  max(k.metric_value) FILTER (WHERE k.metric_key='lab_pending_end_of_day') AS lab_pending,
  max(k.metric_value) FILTER (WHERE k.metric_key='staff_active') AS staff_active
FROM kpi_daily k
GROUP BY k.hospital_id,k.kpi_date;

-- Useful indexes for KPI refreshes.
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_status_date
  ON appointments(hospital_id, appointment_date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_hospital_created
  ON appointments(hospital_id, created_at);

CREATE INDEX IF NOT EXISTS idx_queue_hospital_checked
  ON queue_entries(hospital_id, checked_in_at);

CREATE INDEX IF NOT EXISTS idx_queue_hospital_completed
  ON queue_entries(hospital_id, completed_at);

CREATE INDEX IF NOT EXISTS idx_visits_hospital_started_ended
  ON doctor_visits(hospital_id, started_at, ended_at, visit_status);

CREATE INDEX IF NOT EXISTS idx_medications_hospital_prescribed
  ON medications(hospital_id, prescribed_at);

CREATE INDEX IF NOT EXISTS idx_lab_hospital_ordered_completed
  ON lab_orders(hospital_id, ordered_at, completed_at, status);

CREATE INDEX IF NOT EXISTS idx_followups_hospital_created_due_status
  ON followups(hospital_id, created_at, due_date, status);

CREATE INDEX IF NOT EXISTS idx_invoices_hospital_created_status
  ON invoices(hospital_id, created_at, status);

CREATE INDEX IF NOT EXISTS idx_notifications_hospital_times
  ON notifications(hospital_id, scheduled_for, sent_at, status);

-- Backfill the last 60 days for every hospital.
SELECT refresh_all_hospital_kpis(current_date-59, current_date);