import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
export default async function(req,res){
 const h=await hash("invalid-test-key");
 const r=await db.query("SELECT hospital_id FROM hospital_settings WHERE setting_key='integration.api_key_hash' AND setting_value->>'hash'=$1 LIMIT 1",[h]);
 const f=await db.query("SELECT hospital_id FROM hospital_settings WHERE setting_key='integration.fhir.api_key_hash' AND setting_value->>'hash'=$1 LIMIT 1",[h]);
 return res.json({hash_length:h.length,generic_rows:r.rows,fhir_rows:f.rows});
}