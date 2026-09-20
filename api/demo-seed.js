import { db } from "hatchable";
export const access = "admin";
export const methods = ["POST"];

export default async function(req,res){
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  const hid=h.rows[0]?.id;
  if(!hid)return res.status(400).json({error:"Create the hospital first."});

  const existing=await db.query("SELECT id FROM demo_seed_runs WHERE hospital_id=$1 AND seed_key=$2",[hid,"two_months_v2"]);
  if(existing.rows.length)return res.json({ok:true,alreadySeeded:true,message:"Two-month demo data already exists."});

  await db.query("INSERT INTO doctors(hospital_id,name,specialty,active) VALUES($1,'Dr. Ananya Rao','General Medicine',true),($1,'Dr. Rahul Mehta','Pediatrics',true),($1,'Dr. Priya Nair','Gynecology',true),($1,'Dr. Arjun Singh','Orthopedics',true) ON CONFLICT DO NOTHING",[hid]);

  await db.query(`INSERT INTO patients(hospital_id,name,phone,notes)
    SELECT $1, (ARRAY['Aarav','Meera','Rohan','Ishita','Vikram','Anika','Kabir','Neha','Aditya','Sneha','Arjun','Pooja','Karan','Divya','Rahul','Kavya','Manish','Nisha','Sanjay','Aditi','Varun','Priyanka','Mohit','Riya','Suresh','Tanvi','Naveen','Shreya','Amit','Lakshmi'])[g],
           '+9197000'||lpad(g::text,5,'0'), 'DEMO DATA'
    FROM generate_series(1,30) g
    WHERE NOT EXISTS (SELECT 1 FROM patients p WHERE p.hospital_id=$1 AND p.phone='+9197000'||lpad(g::text,5,'0'))`,[hid]);

  await db.query(`INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,reason)
    SELECT $1,
      (SELECT p.id FROM patients p WHERE p.hospital_id=$1 AND p.phone='+9197000'||lpad((1+mod(d*5+j,30))::text,5,'0') LIMIT 1),
      (SELECT d2.id FROM doctors d2 WHERE d2.hospital_id=$1 ORDER BY d2.id OFFSET mod(d+j,4) LIMIT 1),
      current_date-59+d,
      make_time(9+mod(j,8),0,0),
      CASE WHEN mod(j,11)=0 THEN 'no_show' ELSE 'completed' END,
      (ARRAY['Routine visit','Follow-up','Consultation','Review'])[1+mod(j,4)]
    FROM generate_series(0,59) d
    CROSS JOIN generate_series(0,12) j
    WHERE extract(dow from current_date-59+d) <> 0 AND j < 8+mod(d,6)`,[hid]);

  await db.query(`INSERT INTO doctor_visits(hospital_id,patient_id,doctor_id,appointment_id,visit_number,visit_status,clinical_notes,started_at,ended_at)
    SELECT a.hospital_id,a.patient_id,a.doctor_id,a.id,1,'completed','DEMO DATA — operational visit for analytics',
           (a.appointment_date::timestamp+a.appointment_time),
           (a.appointment_date::timestamp+a.appointment_time)+make_interval(mins=>20+mod(row_number() over(order by a.id),4)*10)
    FROM appointments a
    WHERE a.hospital_id=$1 AND a.appointment_date>=current_date-59 AND a.reason IN ('Routine visit','Follow-up','Consultation','Review')
      AND a.status='completed' AND NOT EXISTS (SELECT 1 FROM doctor_visits v WHERE v.appointment_id=a.id)`,[hid]);

  await db.query(`INSERT INTO invoices(hospital_id,patient_id,appointment_id,visit_id,invoice_number,subtotal,discount,tax,total,paid,payment_method,status,notes,created_at)
    SELECT v.hospital_id,v.patient_id,v.appointment_id,v.id,
           'DEMO-'||to_char(a.appointment_date,'YYYYMMDD')||'-'||v.id,
           500+mod(v.id,5)*150,0,0,500+mod(v.id,5)*150,
           CASE WHEN mod(v.id,5)=0 THEN 500+mod(v.id,5)*150 ELSE round((500+mod(v.id,5)*150)*0.6,2) END,
           CASE WHEN mod(v.id,3)=0 THEN 'upi' WHEN mod(v.id,3)=1 THEN 'cash' ELSE 'card' END,
           CASE WHEN mod(v.id,5)=0 THEN 'paid' ELSE 'partial' END,'DEMO DATA',a.appointment_date::timestamp
    FROM doctor_visits v JOIN appointments a ON a.id=v.appointment_id
    WHERE v.hospital_id=$1 AND v.clinical_notes LIKE 'DEMO DATA%' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.visit_id=v.id)`,[hid]);

  await db.query("INSERT INTO demo_seed_runs(hospital_id,seed_key) VALUES($1,$2)",[hid,"two_months_v2"]);
  const counts=await db.query("SELECT (SELECT count(*) FROM patients WHERE hospital_id=$1 AND phone LIKE '+9197000%') patients,(SELECT count(*) FROM appointments WHERE hospital_id=$1 AND appointment_date>=current_date-59 AND reason IN ('Routine visit','Follow-up','Consultation','Review')) appointments,(SELECT count(*) FROM doctor_visits WHERE hospital_id=$1 AND clinical_notes LIKE 'DEMO DATA%') visits,(SELECT count(*) FROM invoices WHERE hospital_id=$1 AND notes='DEMO DATA') invoices",[hid]);
  return res.json({ok:true,...counts.rows[0],period_start:new Date(Date.now()-59*86400000).toISOString().slice(0,10),period_end:new Date().toISOString().slice(0,10),note:"Operational demo data only. Clearly labeled DEMO DATA."});
}