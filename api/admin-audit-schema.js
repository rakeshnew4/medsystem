import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
  const r=await db.query("SELECT to_regclass('public.audit_logs') AS audit_logs");
  res.json({ok:true,rows:r.rows});
}