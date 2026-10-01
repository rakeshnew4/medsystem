import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const r=await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='hospital_settings' ORDER BY ordinal_position");
 const k=await db.query("SELECT setting_key FROM hospital_settings WHERE setting_key LIKE 'integration.%' ORDER BY setting_key LIMIT 50");
 const q=await db.query("SELECT hospital_id FROM hospital_settings WHERE setting_key IN ('integration.api_key_hash','integration.fhir.api_key_hash') AND setting_value->>'hash'=$1 ORDER BY CASE WHEN setting_key='integration.api_key_hash' THEN 0 ELSE 1 END LIMIT 1",["invalid-test-hash"]);
 return res.json({columns:r.rows,keys:k.rows,key_lookup:q.rows});
}