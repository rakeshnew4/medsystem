import { db } from "../../lib/db.js";
export const access="public";
export const methods=["GET"];
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
function bearer(req){const h=String(req.headers?.authorization||"");return h.toLowerCase().startsWith("bearer ")?h.slice(7).trim():null}
async function auth(req,res){
  const k=bearer(req);if(!k)return res.status(401).json({resourceType:"OperationOutcome",issue:[{severity:"error",code:"login",diagnostics:"Bearer API key required"}]});
  const h=await hash(k);
  let r=await db.query("SELECT hospital_id FROM hospital_settings WHERE setting_key='integration.api_key_hash' AND setting_value->>'hash'=$1 LIMIT 1",[h]);
  if(!r.rows[0])r=await db.query("SELECT hospital_id FROM hospital_settings WHERE setting_key='integration.fhir.api_key_hash' AND setting_value->>'hash'=$1 LIMIT 1",[h]);
  if(!r.rows[0])return res.status(401).json({resourceType:"OperationOutcome",issue:[{severity:"error",code:"login",diagnostics:"Invalid API key"}]});
  const enabled=await db.query("SELECT setting_value FROM hospital_settings WHERE hospital_id=$1 AND setting_key='integration.fhir.enabled' LIMIT 1",[r.rows[0].hospital_id]);
  if(enabled.rows[0]?.setting_value?.enabled!==true)return res.status(403).json({resourceType:"OperationOutcome",issue:[{severity:"error",code:"forbidden",diagnostics:"FHIR integration is disabled"}]});
  return Number(r.rows[0].hospital_id);
}
function resource(p){
  const name=String(p.name||"").trim().split(/\s+/).filter(Boolean);
  return {resourceType:"Patient",id:String(p.id),identifier:p.uhid?[{system:"urn:careflow:uhid",value:String(p.uhid)}]:[],name:[{use:"official",text:p.name||"",family:name.length?name[name.length-1]:"",given:name.slice(0,-1)}],telecom:[...(p.phone?[{system:"phone",value:p.phone,use:"mobile"}]:[]),...(p.email?[{system:"email",value:p.email}]:[])],birthDate:p.date_of_birth?String(p.date_of_birth).slice(0,10):undefined,active:p.status!=="inactive"};
}
export default async function(req,res){
  const hid=await auth(req,res);if(!hid||typeof hid!=="number")return;
  const id=req.query?.id?Number(req.query.id):null;
  if(id){
    const r=await db.query("SELECT id,uhid,name,phone,email,date_of_birth,status FROM patients WHERE hospital_id=$1 AND id=$2 LIMIT 1",[hid,id]);
    if(!r.rows[0])return res.status(404).json({resourceType:"OperationOutcome",issue:[{severity:"error",code:"not-found",diagnostics:"Patient not found"}]});
    return res.json(resource(r.rows[0]));
  }
  const q=String(req.query?.identifier||req.query?.name||"").trim();
  const limit=Math.min(Math.max(Number(req.query?.count||50),1),100);
  const params=[hid];let where="hospital_id=$1";
  if(req.query?.identifier){params.push(q);where+=" AND uhid=$"+params.length}
  else if(req.query?.name){params.push("%"+q.toLowerCase()+"%");where+=" AND lower(name) LIKE $"+params.length}
  params.push(limit);
  const r=await db.query("SELECT id,uhid,name,phone,email,date_of_birth,status FROM patients WHERE "+where+" ORDER BY id DESC LIMIT $"+params.length,params);
  res.json({resourceType:"Bundle",type:"searchset",total:r.rows.length,entry:r.rows.map(x=>({fullUrl:"/api/fhir/Patient?id="+x.id,resource:resource(x)}))});
}