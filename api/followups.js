import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET","POST","PUT"];
export default async function(req,res){
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(400).json({error:"Create a hospital first"});
  const hid=h.rows[0].id;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.patient_id||!b.due_date) return res.status(400).json({error:"Patient and due date are required"});
    const r=await db.query("INSERT INTO followups(hospital_id,patient_id,doctor_id,due_date,status,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,due_date,status",[hid,b.patient_id,b.doctor_id||null,b.due_date,b.status||"due",b.notes||null]);
    return res.json(r.rows[0]);
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    const r=await db.query("UPDATE followups SET status=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3 RETURNING id,status",[b.status,b.id,hid]);
    return res.json(r.rows[0]||{error:"Follow-up not found"});
  }
  const r=await db.query("SELECT f.id,f.due_date,f.status,f.notes,p.name AS patient_name,d.name AS doctor_name FROM followups f JOIN patients p ON p.id=f.patient_id LEFT JOIN doctors d ON d.id=f.doctor_id WHERE f.hospital_id=$1 ORDER BY f.due_date LIMIT 200",[hid]);
  res.json(r.rows);
}