import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.patients":"action.patient.create");
 if(!ctx)return;
 const hid=ctx.hospitalId;
 if(req.method==="POST"){
  const b=req.body||{}; if(!b.name)return res.status(400).json({error:"Patient name is required"});
  const r=await db.query("INSERT INTO patients(hospital_id,name,phone,email,date_of_birth,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,phone,email,date_of_birth,notes,status",[hid,b.name,b.phone||null,b.email||null,b.date_of_birth||null,b.notes||null,b.status||"active"]);
  return res.json(r.rows[0]);
 }
 if(req.method==="PUT"){
  const b=req.body||{};
  const r=await db.query("UPDATE patients SET name=$1,phone=$2,email=$3,date_of_birth=$4,notes=$5,status=$6,updated_at=now() WHERE id=$7 AND hospital_id=$8 RETURNING id,name,phone,email,date_of_birth,notes,status",[b.name,b.phone||null,b.email||null,b.date_of_birth||null,b.notes||null,b.status||"active",b.id,hid]);
  return res.json(r.rows[0]||{error:"Patient not found"});
 }
 const r=await db.query("SELECT id,name,phone,email,date_of_birth,notes,status,created_at FROM patients WHERE hospital_id=$1 ORDER BY created_at DESC LIMIT 300",[hid]);
 res.json(r.rows);
}