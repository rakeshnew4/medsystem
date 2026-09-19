import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET","POST"];
export default async function(req,res){
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(400).json({error:"Create a hospital first"});
  const hid=h.rows[0].id;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.name) return res.status(400).json({error:"Patient name is required"});
    const r=await db.query("INSERT INTO patients(hospital_id,name,phone,email,date_of_birth,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,phone,email,date_of_birth,notes",[hid,b.name,b.phone||null,b.email||null,b.date_of_birth||null,b.notes||null]);
    return res.json(r.rows[0]);
  }
  const r=await db.query("SELECT id,name,phone,email,date_of_birth,notes,created_at FROM patients WHERE hospital_id=$1 ORDER BY created_at DESC LIMIT 100",[hid]);
  res.json(r.rows);
}