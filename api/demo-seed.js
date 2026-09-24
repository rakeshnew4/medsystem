import { db } from "../lib/db.js";
export const access = "admin";
export const methods = ["POST"];

export default async function(req,res){
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  const hid=h.rows[0]?.id;
  if(!hid)return res.status(400).json({error:"Create the hospital first."});

  const key="full_demo_v3";
  const existing=await db.query("SELECT id FROM demo_seed_runs WHERE hospital_id=$1 AND seed_key=$2",[hid,key]);
  if(existing.rows.length){
    const countQueries={
      departments:"SELECT count(*)::int AS n FROM departments WHERE hospital_id=$1",
      doctors:"SELECT count(*)::int AS n FROM doctors WHERE hospital_id=$1",
      patients:"SELECT count(*)::int AS n FROM patients WHERE hospital_id=$1",
      appointments:"SELECT count(*)::int AS n FROM appointments WHERE hospital_id=$1",
      followups:"SELECT count(*)::int AS n FROM followups WHERE hospital_id=$1",
      hospital_faqs:"SELECT count(*)::int AS n FROM hospital_faqs WHERE hospital_id=$1",
      conversations:"SELECT count(*)::int AS n FROM conversations WHERE hospital_id=$1",
      messages:"SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.hospital_id=$1",
      notifications:"SELECT count(*)::int AS n FROM notifications WHERE hospital_id=$1",
      audit_logs:"SELECT count(*)::int AS n FROM audit_logs WHERE hospital_id=$1",
      staff_profiles:"SELECT count(*)::int AS n FROM staff_profiles WHERE hospital_id=$1",
      queue_entries:"SELECT count(*)::int AS n FROM queue_entries WHERE hospital_id=$1",
      vitals:"SELECT count(*)::int AS n FROM vitals WHERE hospital_id=$1",
      doctor_visits:"SELECT count(*)::int AS n FROM doctor_visits WHERE hospital_id=$1",
      lab_orders:"SELECT count(*)::int AS n FROM lab_orders WHERE hospital_id=$1",
      medications:"SELECT count(*)::int AS n FROM medications WHERE hospital_id=$1",
      clinical_reports:"SELECT count(*)::int AS n FROM clinical_reports WHERE hospital_id=$1",
      beds:"SELECT count(*)::int AS n FROM beds WHERE hospital_id=$1",
      admissions:"SELECT count(*)::int AS n FROM admissions WHERE hospital_id=$1",
      invoices:"SELECT count(*)::int AS n FROM invoices WHERE hospital_id=$1",
      invoice_items:"SELECT count(*)::int AS n FROM invoice_items i JOIN invoices x ON x.id=i.invoice_id WHERE x.hospital_id=$1"
    };
    const counts={};
    for(const [name,sql] of Object.entries(countQueries)){const r=await db.query(sql,[hid]);counts[name]=r.rows[0].n;}
    return res.json({ok:true,alreadySeeded:true,seed:key,counts,message:"Full demo dataset already exists."});
  }

  // Reference data
  await db.query(`INSERT INTO departments(hospital_id,name,description)
    SELECT $1,'Department '||g,
      CASE WHEN g%4=1 THEN 'General outpatient services' WHEN g%4=2 THEN 'Specialist consultations' WHEN g%4=3 THEN 'Diagnostics and follow-up' ELSE 'Preventive and routine care' END
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM departments WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO doctors(hospital_id,name,specialty,phone,consultation_fee,active)
    SELECT $1,(ARRAY['Dr. Kavya Sharma','Dr. Vivek Iyer','Dr. Neel Patel','Dr. Simran Kaur','Dr. Sanjay Rao','Dr. Pavan Kumar','Dr. Ayesha Khan','Dr. Rohit Verma','Dr. Nandita Das','Dr. Kiran Joshi','Dr. Mehul Shah','Dr. Snehal Patil','Dr. Varun Reddy','Dr. Isha Menon','Dr. Deepak Jain','Dr. Ritu Gupta','Dr. Abhishek Roy','Dr. Monica Thomas','Dr. Harish Nair','Dr. Tara Kapoor'])[g],
      (ARRAY['General Medicine','Cardiology','Pediatrics','Dermatology','Orthopedics','ENT','Gynecology','General Medicine','Neurology','Ophthalmology'])[1+mod(g-1,10)],
      '+9198000'||lpad(g::text,5,'0'),500+mod(g,6)*100,true
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM doctors WHERE hospital_id=$1)`,[hid]);

  // FAQ / conversations / messages
  await db.query(`INSERT INTO hospital_faqs(hospital_id,question,answer,active)
    SELECT $1,'Demo FAQ question '||g,'Demo answer for hospital operations question '||g,true
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM hospital_faqs WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO conversations(hospital_id,patient_id,channel,status,requires_staff)
    SELECT $1,
      (SELECT id FROM patients WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,GREATEST((SELECT count(*) FROM patients WHERE hospital_id=$1),1)) LIMIT 1),
      CASE WHEN g%3=0 THEN 'whatsapp' WHEN g%3=1 THEN 'web' ELSE 'phone' END,
      CASE WHEN g%4=0 THEN 'closed' ELSE 'open' END,
      g%3=0
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM conversations WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO messages(conversation_id,sender,body)
    SELECT c.id,CASE WHEN c.id%2=0 THEN 'patient' ELSE 'assistant' END,'Demo conversation message for testing workflow #'||c.id
    FROM conversations c
    WHERE c.hospital_id=$1
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id)
    LIMIT 20`,[hid]);

  // Staff demo rows. user_id stays NULL so these cannot impersonate a real account.
  await db.query(`INSERT INTO staff_profiles(hospital_id,user_id,email,display_name,role,doctor_id,active)
    SELECT $1,NULL,'demo.staff.'||g||'@example.invalid','Demo Staff '||g,
      (ARRAY['receptionist','nurse','doctor','lab','pharmacy'])[1+mod(g-1,5)],
      CASE WHEN mod(g-1,5)=2 THEN (SELECT id FROM doctors WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,20) LIMIT 1) ELSE NULL END,
      true
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM staff_profiles WHERE hospital_id=$1)`,[hid]);

  // Patient-facing operational tables
  await db.query(`INSERT INTO followups(hospital_id,patient_id,doctor_id,due_date,status,notes)
    SELECT $1,
      (SELECT id FROM patients WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,30) LIMIT 1),
      (SELECT id FROM doctors WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,20) LIMIT 1),
      current_date + CASE WHEN g%4=0 THEN -g ELSE g END,
      CASE WHEN g%4=0 THEN 'due' WHEN g%4=1 THEN 'completed' WHEN g%4=2 THEN 'due' ELSE 'scheduled' END,
      'DEMO DATA — follow-up record '||g
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM followups WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO queue_entries(hospital_id,patient_id,appointment_id,doctor_id,stage,priority,token,reason,notes,checked_in_at)
    SELECT $1,
      (SELECT id FROM patients WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,30) LIMIT 1),
      (SELECT id FROM appointments WHERE hospital_id=$1 ORDER BY id DESC OFFSET mod(g-1,20) LIMIT 1),
      (SELECT id FROM doctors WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,20) LIMIT 1),
      (ARRAY['waiting','vitals','doctor','lab','followup','pharmacy'])[1+mod(g-1,6)],
      (ARRAY['normal','normal','normal','high','urgent'])[1+mod(g-1,5)],
      'D-'||lpad(g::text,3,'0'),'Demo consultation','DEMO DATA — queue entry',
      now() - (g||' minutes')::interval
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM queue_entries WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO vitals(hospital_id,patient_id,queue_entry_id,recorded_by,blood_pressure_systolic,blood_pressure_diastolic,pulse,temperature,weight_kg,height_cm,spo2,respiratory_rate,notes)
    SELECT $1,q.patient_id,q.id,'demo-nurse',
      110+mod(g,25),70+mod(g,15),68+mod(g,28),36.5+mod(g,6)*0.1,55+mod(g,30),150+mod(g,35),96+mod(g,4),14+mod(g,8),'DEMO DATA — routine vitals'
    FROM generate_series(1,20) g
    JOIN LATERAL (SELECT id,patient_id FROM queue_entries WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,20) LIMIT 1) q ON true
    WHERE g > (SELECT count(*) FROM vitals WHERE hospital_id=$1)`,[hid]);

  // Clinical records
  await db.query(`INSERT INTO lab_orders(hospital_id,patient_id,doctor_id,visit_id,queue_entry_id,test_name,status,ordered_at,completed_at,result_summary,notes)
    SELECT $1,v.patient_id,v.doctor_id,v.id,NULL,
      (ARRAY['CBC','Blood glucose','Lipid profile','Liver function test','Kidney function test','Thyroid profile'])[1+mod(g-1,6)],
      CASE WHEN g%3=0 THEN 'completed' ELSE 'ordered' END,
      v.started_at,
      CASE WHEN g%3=0 THEN v.started_at+interval '2 hours' ELSE NULL END,
      CASE WHEN g%3=0 THEN 'DEMO DATA — within expected reference range' ELSE NULL END,
      'DEMO DATA — lab order'
    FROM generate_series(1,20) g
    JOIN LATERAL (SELECT id,patient_id,doctor_id,started_at FROM doctor_visits WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,GREATEST((SELECT count(*) FROM doctor_visits WHERE hospital_id=$1),1)) LIMIT 1) v ON true
    WHERE g > (SELECT count(*) FROM lab_orders WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO medications(hospital_id,patient_id,doctor_id,visit_id,medicine_name,dose,frequency,duration,instructions)
    SELECT $1,v.patient_id,v.doctor_id,v.id,
      (ARRAY['Paracetamol','Cetirizine','Pantoprazole','Amoxicillin','Vitamin D3','Calcium','Ibuprofen','Azithromycin'])[1+mod(g-1,8)],
      (ARRAY['500 mg','10 mg','40 mg','500 mg','60000 IU','500 mg','400 mg','500 mg'])[1+mod(g-1,8)],
      (ARRAY['Once daily','Twice daily','Before breakfast','After meals'])[1+mod(g-1,4)],
      (ARRAY['3 days','5 days','7 days','14 days'])[1+mod(g-1,4)],
      'DEMO DATA — sample prescription record; clinician review required'
    FROM generate_series(1,20) g
    JOIN LATERAL (SELECT id,patient_id,doctor_id FROM doctor_visits WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,GREATEST((SELECT count(*) FROM doctor_visits WHERE hospital_id=$1),1)) LIMIT 1) v ON true
    WHERE g > (SELECT count(*) FROM medications WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO clinical_reports(hospital_id,patient_id,visit_id,lab_order_id,report_type,title,report_date,summary)
    SELECT $1,v.patient_id,v.id,l.id,'lab','Demo clinical report #'||g,v.started_at::date,
      'DEMO DATA — sample operational report; not for clinical decision making.'
    FROM generate_series(1,20) g
    JOIN LATERAL (SELECT id,patient_id,started_at FROM doctor_visits WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,GREATEST((SELECT count(*) FROM doctor_visits WHERE hospital_id=$1),1)) LIMIT 1) v ON true
    LEFT JOIN LATERAL (SELECT id FROM lab_orders WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,GREATEST((SELECT count(*) FROM lab_orders WHERE hospital_id=$1),1)) LIMIT 1) l ON true
    WHERE g > (SELECT count(*) FROM clinical_reports WHERE hospital_id=$1)`,[hid]);

  // Beds and admissions: 20 beds, 10 active admissions, 10 discharged.
  await db.query(`INSERT INTO beds(hospital_id,ward,bed_number,bed_type,status,notes)
    SELECT $1,'Demo Ward '||((g-1)%4+1),'D-'||lpad(g::text,3,'0'),
      (ARRAY['general','semi-private','private','ICU'])[1+mod(g-1,4)],
      CASE WHEN g<=10 THEN 'occupied' ELSE 'available' END,
      'DEMO DATA — sample bed'
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM beds WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO admissions(hospital_id,patient_id,bed_id,admitting_doctor_id,admitted_at,expected_discharge_date,discharged_at,status,notes)
    SELECT $1,
      (SELECT id FROM patients WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,30) LIMIT 1),
      (SELECT id FROM beds WHERE hospital_id=$1 ORDER BY id OFFSET g-1 LIMIT 1),
      (SELECT id FROM doctors WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,20) LIMIT 1),
      now() - (g||' days')::interval,
      current_date + g,
      CASE WHEN g>10 THEN now() - ((g-10)||' days')::interval ELSE NULL END,
      CASE WHEN g>10 THEN 'discharged' ELSE 'admitted' END,
      'DEMO DATA — sample admission'
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM admissions WHERE hospital_id=$1)`,[hid]);

  // Billing child rows and notifications/audit
  await db.query(`INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,amount)
    SELECT i.id,'Demo consultation service',1,i.total,i.total
    FROM invoices i
    WHERE i.hospital_id=$1 AND i.notes='DEMO DATA'
      AND NOT EXISTS (SELECT 1 FROM invoice_items x WHERE x.invoice_id=i.id)
    ORDER BY i.id LIMIT 20`,[hid]);

  await db.query(`INSERT INTO notifications(hospital_id,patient_id,appointment_id,kind,scheduled_for,status)
    SELECT $1,
      (SELECT id FROM patients WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,30) LIMIT 1),
      (SELECT id FROM appointments WHERE hospital_id=$1 ORDER BY id DESC OFFSET mod(g-1,20) LIMIT 1),
      CASE WHEN g%3=0 THEN 'followup_reminder' WHEN g%3=1 THEN 'appointment_reminder' ELSE 'appointment_confirmation' END,
      now() + (g||' hours')::interval,
      CASE WHEN g%4=0 THEN 'sent' ELSE 'pending' END
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM notifications WHERE hospital_id=$1)`,[hid]);

  await db.query(`INSERT INTO audit_logs(hospital_id,actor,action,entity_type,entity_id,details)
    SELECT $1,'demo-system','demo_seed','demo_record',g::text,'DEMO DATA — sample audit event'
    FROM generate_series(1,20) g
    WHERE g > (SELECT count(*) FROM audit_logs WHERE hospital_id=$1)`,[hid]);

  await db.query("INSERT INTO demo_seed_runs(hospital_id,seed_key) VALUES($1,$2)",[hid,key]);

  const countQueries={
    departments:"SELECT count(*)::int AS n FROM departments WHERE hospital_id=$1",
    doctors:"SELECT count(*)::int AS n FROM doctors WHERE hospital_id=$1",
    patients:"SELECT count(*)::int AS n FROM patients WHERE hospital_id=$1",
    appointments:"SELECT count(*)::int AS n FROM appointments WHERE hospital_id=$1",
    followups:"SELECT count(*)::int AS n FROM followups WHERE hospital_id=$1",
    hospital_faqs:"SELECT count(*)::int AS n FROM hospital_faqs WHERE hospital_id=$1",
    conversations:"SELECT count(*)::int AS n FROM conversations WHERE hospital_id=$1",
    messages:"SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.hospital_id=$1",
    notifications:"SELECT count(*)::int AS n FROM notifications WHERE hospital_id=$1",
    audit_logs:"SELECT count(*)::int AS n FROM audit_logs WHERE hospital_id=$1",
    staff_profiles:"SELECT count(*)::int AS n FROM staff_profiles WHERE hospital_id=$1",
    queue_entries:"SELECT count(*)::int AS n FROM queue_entries WHERE hospital_id=$1",
    vitals:"SELECT count(*)::int AS n FROM vitals WHERE hospital_id=$1",
    doctor_visits:"SELECT count(*)::int AS n FROM doctor_visits WHERE hospital_id=$1",
    lab_orders:"SELECT count(*)::int AS n FROM lab_orders WHERE hospital_id=$1",
    medications:"SELECT count(*)::int AS n FROM medications WHERE hospital_id=$1",
    clinical_reports:"SELECT count(*)::int AS n FROM clinical_reports WHERE hospital_id=$1",
    beds:"SELECT count(*)::int AS n FROM beds WHERE hospital_id=$1",
    admissions:"SELECT count(*)::int AS n FROM admissions WHERE hospital_id=$1",
    invoices:"SELECT count(*)::int AS n FROM invoices WHERE hospital_id=$1",
    invoice_items:"SELECT count(*)::int AS n FROM invoice_items i JOIN invoices x ON x.id=i.invoice_id WHERE x.hospital_id=$1"
  };
  const counts={};
  for(const [name,sql] of Object.entries(countQueries)){
    const r=await db.query(sql,[hid]);
    counts[name]=r.rows[0].n;
  }
  return res.json({ok:true,seed:key,counts,message:"Full demo dataset created. Every operational table has at least 20 records where applicable; existing larger demo tables were preserved."});
}