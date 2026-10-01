import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const r=await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='hospital_settings' ORDER BY ordinal_position");
 const k=await db.query("SELECT setting_key FROM hospital_settings WHERE setting_key LIKE 'integration.%' ORDER BY setting_key LIMIT 50");
 return res.json({columns:r.rows,keys:k.rows});
}