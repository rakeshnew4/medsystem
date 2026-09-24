import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];

export default async function(req,res){
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  const hid=h.rows[0]?.id;
  if(!hid)return res.status(400).json({error:"Create the hospital first."});

  const key="complete_demo_v1";
  const exists=await db.query("SELECT id FROM demo_seed_runs WHERE hospital_id=$1 AND seed_key=$2",[hid,key]);
  if(exists.rows.length)return res.json({ok:true,alreadySeeded:true,message:"Complete demo dataset already exists."});

  await db.query(`INSERT INTO doctors(hospital_id,name,specialty,active)
    VALUES($1,'Dr. Ananya Rao','General Medicine',true),($1,'Dr. Rahul Mehta','Pediatrics',true),
          ($1,'Dr. Priya Nair','Gynecology',true),($1,'Dr. Arjun Singh','Orthopedics',true)
    ON CONFLICT DO NOTHING`,[hid]);

  await db.query(`INSERT INTO patients(hospital_id,name,phone,notes)
    SELECT $1, (ARRAY['Aarav','Meera','Rohan','Ishita','Vikram','Anika','Kabir','Neha','Aditya','Sneha','Arjun','Pooja','Karan','Divya','Rahul','Kavya','Manish','Nisha','Sanjay','Aditi','Varun','Priyanka','Mohit','Riya','Suresh','Tanvi','Naveen','Shreya','Amit','Lakshmi'])[g],
      '+9197000'||lpad(g::text,5,'0'),'DEMO DATA'
    FROM generate_series(1,30) g
    WHERE NOT EXISTS (SELECT 1 FROM patients p WHERE p.hospital_id=$1 AND p.phone='+9197000'||lpad(g::text,5,'0'))`,[hid]);

  await db.query(`INSERT INTO queue_entries(hospital_id,patient_id,doctor_id,stage,priority,token,reason,notes,checked_in_at)
    SELECT $1,p.id,d.id,
      (ARRAY['waiting','vitals','doctor','lab','followup','pharmacy'])[1+mod(g,6)],
      CASE WHEN mod(g,9)=0 THEN 'urgent' WHEN mod(g,4)=0 THEN 'high' ELSE 'normal' END,
      'D-'||lpad(g::text,3,'0'),
      (ARRAY['Consultation','Follow-up','Review','Routine visit'])[1+mod(g,4)],
      'DEMO DATA — active queue example',
      now()-((g%7)*interval '12 minutes')
    FROM generate_series(1,18) g
    CROSS JOIN LATERAL (SELECT p.id FROM patients p WHERE p.hospital_id=$1 AND p.phone='+9197000'||lpad((1+mod(g-1,30))::text,5,'0') LIMIT 1) p
    CROSS JOIN LATERAL (SELECT d.id FROM doctors d WHERE d.hospital_id=$1 ORDER BY d.id OFFSET mod(g-1,4) LIMIT 1) d
    WHERE NOT EXISTS (SELECT 1 FROM queue_entries q WHERE q.hospital_id=$1 AND q.token='D-'||lpad(g::text,3,'0'))`,[hid]);

  await db.query(`INSERT INTO followups(hospital_id,patient_id,doctor_id,due_date,status,notes)
    SELECT $1,p.id,d.id,current_date + (g-24),
      CASE WHEN g<=24 THEN 'due' ELSE 'scheduled' END,
      'DEMO DATA — follow-up review'
    FROM generate_series(1,45) g
    CROSS JOIN LATERAL (SELECT p.id FROM patients p WHERE p.hospital_id=$1 AND p.phone='+9197000'||lpad((1+mod(g-1,30))::text,5,'0') LIMIT 1) p
    CROSS JOIN LATERAL (SELECT d.id FROM doctors d WHERE d.hospital_id=$1 ORDER BY d.id OFFSET mod(g-1,4) LIMIT 1) d
    WHERE NOT EXISTS (
      SELECT 1 FROM followups f WHERE f.hospital_id=$1 AND f.notes='DEMO DATA — follow-up review' AND f.patient_id=p.id AND f.due_date=current_date+(g-24)
    )`,[hid]);

  await db.query(`INSERT INTO beds(hospital_id,ward,bed_number,bed_type,status,notes)
    SELECT $1,'General Ward','G-'||lpad(g::text,2,'0'),
      CASE WHEN mod(g,5)=0 THEN 'semi-private' ELSE 'general' END,
      CASE WHEN g IN (3,7) THEN 'maintenance' ELSE 'available' END,
      'DEMO DATA'
    FROM generate_series(1,12) g
    WHERE NOT EXISTS (SELECT 1 FROM beds b WHERE b.hospital_id=$1 AND b.bed_number='G-'||lpad(g::text,2,'0'))`,[hid]);

  await db.query(`INSERT INTO admissions(hospital_id,patient_id,bed_id,admitting_doctor_id,admitted_at,expected_discharge_date,status,notes)
    SELECT $1,p.id,b.id,d.id,now()-(g*interval '1 day'),current_date+(g+1),'admitted','DEMO DATA — sample admission'
    FROM generate_series(1,4) g
    CROSS JOIN LATERAL (SELECT p.id FROM patients p WHERE p.hospital_id=$1 AND p.phone='+9197000'||lpad((20+g)::text,5,'0') LIMIT 1) p
    CROSS JOIN LATERAL (SELECT b.id FROM beds b WHERE b.hospital_id=$1 AND b.bed_number='G-'||lpad(g::text,2,'0') AND b.status='available' LIMIT 1) b
    CROSS JOIN LATERAL (SELECT d.id FROM doctors d WHERE d.hospital_id=$1 ORDER BY d.id OFFSET mod(g-1,4) LIMIT 1) d
    WHERE NOT EXISTS (SELECT 1 FROM admissions a WHERE a.hospital_id=$1 AND a.bed_id=b.id AND a.discharged_at IS NULL)`,[hid]);

  await db.query(`UPDATE beds b SET status='occupied',updated_at=now()
    WHERE b.hospital_id=$1 AND b.bed_number IN ('G-01','G-02','G-03','G-04')`,[hid]);

  await db.query(`INSERT INTO vitals(hospital_id,patient_id,queue_entry_id,recorded_by,blood_pressure_systolic,blood_pressure_diastolic,pulse,temperature,weight_kg,height_cm,spo2,respiratory_rate,notes,recorded_at)
    SELECT $1,v.patient_id,NULL,'demo@careflow.local',
      110+mod(v.id,35),70+mod(v.id,20),68+mod(v.id,32),36.4+(mod(v.id,7)/10.0),
      48+mod(v.id,35),150+mod(v.id,30),96+mod(v.id,4),14+mod(v.id,8),
      'DEMO DATA — sample vitals',v.started_at
    FROM doctor_visits v
    WHERE v.hospital_id=$1 AND v.clinical_notes LIKE 'DEMO DATA%'
      AND NOT EXISTS (SELECT 1 FROM vitals x WHERE x.hospital_id=$1 AND x.patient_id=v.patient_id AND x.notes='DEMO DATA — sample vitals')`,[hid]);

  await db.query(`INSERT INTO lab_orders(hospital_id,patient_id,doctor_id,visit_id,test_name,status,ordered_at,completed_at,result_summary,notes)
    SELECT $1,v.patient_id,v.doctor_id,v.id,
      (ARRAY['CBC','Blood Sugar','Lipid Profile','LFT','KFT','Urine Routine'])[1+mod(v.id,6)],
      CASE WHEN mod(v.id,5)=0 THEN 'ordered' ELSE 'completed' END,
      v.started_at,
      CASE WHEN mod(v.id,5)=0 THEN NULL ELSE v.started_at+interval '2 hours' END,
      CASE WHEN mod(v.id,5)=0 THEN NULL ELSE 'DEMO DATA — sample report available' END,
      'DEMO DATA'
    FROM doctor_visits v
    WHERE v.hospital_id=$1 AND v.clinical_notes LIKE 'DEMO DATA%'
      AND NOT EXISTS (SELECT 1 FROM lab_orders l WHERE l.hospital_id=$1 AND l.visit_id=v.id)`,[hid]);

  await db.query(`INSERT INTO medications(hospital_id,patient_id,doctor_id,visit_id,medicine_name,dose,frequency,duration,instructions,prescribed_at)
    SELECT $1,v.patient_id,v.doctor_id,v.id,
      (ARRAY['Paracetamol','Amoxicillin','Pantoprazole','Cetirizine','Vitamin D3','Calcium'])[1+mod(v.id,6)],
      CASE WHEN mod(v.id,2)=0 THEN '500 mg' ELSE '1 tablet' END,
      CASE WHEN mod(v.id,3)=0 THEN 'Once daily' WHEN mod(v.id,3)=1 THEN 'Twice daily' ELSE 'After meals' END,
      CASE WHEN mod(v.id,4)=0 THEN '5 days' ELSE '7 days' END,
      'DEMO DATA — sample prescription',
      v.started_at
    FROM doctor_visits v
    WHERE v.hospital_id=$1 AND v.clinical_notes LIKE 'DEMO DATA%'
      AND NOT EXISTS (SELECT 1 FROM medications m WHERE m.hospital_id=$1 AND m.visit_id=v.id)`,[hid]);

  await db.query(`INSERT INTO clinical_reports(hospital_id,patient_id,visit_id,report_type,title,report_date,summary)
    SELECT $1,v.patient_id,v.id,'lab',
      'DEMO DATA — Lab report #'||v.id,v.started_at::date,
      'Sample operational report for demo and workflow testing.'
    FROM doctor_visits v
    WHERE v.hospital_id=$1 AND v.clinical_notes LIKE 'DEMO DATA%' AND mod(v.id,3)=0
      AND NOT EXISTS (SELECT 1 FROM clinical_reports r WHERE r.hospital_id=$1 AND r.visit_id=v.id)`,[hid]);

  await db.query("INSERT INTO demo_seed_runs(hospital_id,seed_key) VALUES($1,$2)",[hid,key]);

  const counts=await db.query(`SELECT
    (SELECT count(*) FROM patients WHERE hospital_id=$1 AND phone LIKE '+9197000%') AS patients,
    (SELECT count(*) FROM appointments WHERE hospital_id=$1 AND appointment_date>=current_date-59) AS appointments,
    (SELECT count(*) FROM invoices WHERE hospital_id=$1 AND notes='DEMO DATA') AS invoices,
    (SELECT count(*) FROM queue_entries WHERE hospital_id=$1 AND notes='DEMO DATA — active queue example' AND completed_at IS NULL) AS queue,
    (SELECT count(*) FROM followups WHERE hospital_id=$1 AND notes='DEMO DATA — follow-up review') AS followups,
    (SELECT count(*) FROM vitals WHERE hospital_id=$1 AND notes='DEMO DATA — sample vitals') AS vitals,
    (SELECT count(*) FROM lab_orders WHERE hospital_id=$1 AND notes='DEMO DATA') AS lab_orders,
    (SELECT count(*) FROM medications WHERE hospital_id=$1 AND instructions='DEMO DATA — sample prescription') AS medications,
    (SELECT count(*) FROM clinical_reports WHERE hospital_id=$1 AND report_type='lab' AND title LIKE 'DEMO DATA%') AS reports`,[hid]);

  return res.json({ok:true,...counts.rows[0],message:"Complete demo dataset added. All generated records are labeled DEMO DATA."});
}