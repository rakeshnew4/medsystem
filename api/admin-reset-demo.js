import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  const hid=h.rows[0]?.id;
  if(!hid)return res.status(400).json({error:"No hospital exists."});
  await db.query("DELETE FROM patients WHERE hospital_id=$1",[hid]);
  return res.json({ok:true,hospital_id:hid,message:"Patient demo data cleared."});
}