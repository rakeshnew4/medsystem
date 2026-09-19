import { db } from "hatchable";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const b=req.body||{};
  if(!b.phone) return res.status(400).json({error:"Phone is required"});
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(400).json({error:"Hospital is not configured"});
  const r=await db.query("UPDATE patients SET whatsapp_phone=$1,whatsapp_opt_in=$2,updated_at=now() WHERE hospital_id=$3 AND phone=$1 RETURNING id",[b.phone,Boolean(b.opt_in),h.rows[0].id]);
  res.json({ok:true,updated:r.rowCount});
}