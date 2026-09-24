import { db } from "../lib/db.js";
export const access = "user";
import { requirePermission } from "../lib/authz.js";
export const methods = ["GET","POST"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.doctors":"action.doctors.manage");
  if(!ctx)return;
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(400).json({error:"Create a hospital first"});
  const hid=h.rows[0].id;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.name||!b.specialty) return res.status(400).json({error:"Name and specialty are required"});
    const r=await db.query("INSERT INTO doctors(hospital_id,department_id,name,specialty,phone,consultation_fee,display_room) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,specialty,phone,consultation_fee,display_room,active",[hid,b.department_id||null,b.name,b.specialty,b.phone||null,b.consultation_fee||null,b.display_room||null]);
    return res.json(r.rows[0]);
  }
  const r=await db.query("SELECT d.id,d.name,d.specialty,d.phone,d.consultation_fee,d.display_room,d.active,dep.name AS department_name FROM doctors d LEFT JOIN departments dep ON dep.id=d.department_id WHERE d.hospital_id=$1 ORDER BY d.name",[hid]);
  res.json(r.rows);
}