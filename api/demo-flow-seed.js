import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  const hid=h.rows[0]?.id;
  if(!hid)return res.status(400).json({error:"Create the hospital first."});

  await db.query(`INSERT INTO queue_entries(hospital_id,patient_id,doctor_id,stage,priority,token,reason,notes)
    SELECT $1,
      (SELECT id FROM patients WHERE hospital_id=$1 AND phone='+9197000'||lpad(g::text,5,'0') LIMIT 1),
      (SELECT id FROM doctors WHERE hospital_id=$1 ORDER BY id OFFSET mod(g-1,4) LIMIT 1),
      (ARRAY['waiting','vitals','doctor','lab','followup','pharmacy'])[1+mod(g-1,6)],
      CASE WHEN g IN (5,11) THEN 'urgent' WHEN mod(g,4)=0 THEN 'high' ELSE 'normal' END,
      'LIVE-DEMO-'||lpad(g::text,2,'0'),
      (ARRAY['Consultation','Follow-up','Review','Routine visit'])[1+mod(g-1,4)],
      'DEMO DATA — active queue'
    FROM generate_series(1,18) g
    WHERE (SELECT id FROM patients WHERE hospital_id=$1 AND phone='+9197000'||lpad(g::text,5,'0') LIMIT 1) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM queue_entries q WHERE q.hospital_id=$1 AND q.token='LIVE-DEMO-'||lpad(g::text,2,'0'))`,[hid]);

  const c=await db.query(`SELECT
    (SELECT count(*) FROM queue_entries WHERE hospital_id=$1 AND notes='DEMO DATA — active queue' AND completed_at IS NULL) queue,
    (SELECT count(*) FROM beds WHERE hospital_id=$1) beds,
    (SELECT count(*) FROM admissions WHERE hospital_id=$1 AND discharged_at IS NULL) admissions`,[hid]);
  return res.json({ok:true,...c.rows[0]});
}