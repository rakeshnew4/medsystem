import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","PUT"];
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
function key(){return "cf_"+crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","")}
export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.setup.manage"); if(!ctx)return;
  if(!ctx.hospitalId)return res.status(400).json({error:"Hospital is not configured"});
  if(req.method==="GET"){
    const r=await db.query("SELECT setting_key,setting_value FROM hospital_settings WHERE hospital_id=$1 AND setting_key IN ('integration.rest.enabled','integration.fhir.enabled','integration.fhir.api_key_hash') ORDER BY setting_key",[ctx.hospitalId]);
    const m=Object.fromEntries(r.rows.map(x=>[x.setting_key,x.setting_value]));
    return res.json({rest_enabled:!!m["integration.rest.enabled"]?.enabled,fhir_enabled:!!m["integration.fhir.enabled"]?.enabled,api_key_configured:!!m["integration.fhir.api_key_hash"]?.hash});
  }
  const b=req.body||{};
  if(typeof b.rest_enabled==="boolean") await db.query("INSERT INTO hospital_settings(hospital_id,setting_key,setting_value,updated_at) VALUES($1,'integration.rest.enabled',$2::jsonb,now()) ON CONFLICT(hospital_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()",[ctx.hospitalId,JSON.stringify({enabled:b.rest_enabled})]);
  if(typeof b.fhir_enabled==="boolean") await db.query("INSERT INTO hospital_settings(hospital_id,setting_key,setting_value,updated_at) VALUES($1,'integration.fhir.enabled',$2::jsonb,now()) ON CONFLICT(hospital_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()",[ctx.hospitalId,JSON.stringify({enabled:b.fhir_enabled})]);
  if(b.rotate_fhir_key===true){
    const plain=key(),h=await hash(plain);
    await db.query("INSERT INTO hospital_settings(hospital_id,setting_key,setting_value,updated_at) VALUES($1,'integration.fhir.api_key_hash',$2::jsonb,now()) ON CONFLICT(hospital_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()",[ctx.hospitalId,JSON.stringify({hash:h,created_at:new Date().toISOString()})]);
    return res.json({ok:true,fhir_api_key:plain,warning:"Store this key securely. It is shown only once."});
  }
  res.json({ok:true});
}