import { db } from "../../lib/db.js";
export const access="public";
export const methods=["POST"];
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
function integrationKey(req){return String(req.headers?.["x-careflow-integration-key"]||"").trim()||null}
function fingerprint(sampleId,testCode,resultValue,units,resultId){return resultId?String(resultId):[sampleId,testCode,resultValue,units].map(x=>String(x??"")).join("|")}
async function integrationHospital(req,res){
  const k=integrationKey(req);if(!k)return res.status(401).json({error:"X-CareFlow-Integration-Key header required"});
  const h=await hash(k);
  const settings=await db.query("SELECT hospital_id,setting_key,setting_value FROM hospital_settings WHERE setting_key IN ('integration.api_key_hash','integration.fhir.api_key_hash')");
  const match=settings.rows.find(x=>String(x.setting_value?.hash||"")===h);
  if(!match)return res.status(401).json({error:"Invalid integration API key"});
  const enabled=await db.query("SELECT setting_value FROM hospital_settings WHERE hospital_id=$1 AND setting_key='integration.rest.enabled' LIMIT 1",[match.hospital_id]);
  if(enabled.rows[0]?.setting_value?.enabled!==true)return res.status(403).json({error:"REST integration is disabled"});
  return Number(match.hospital_id);
}
function parseRecords(body){
  if(Array.isArray(body?.resultsRecords))return body.resultsRecords;
  if(Array.isArray(body?.results_records))return body.results_records;
  if(body?.result&&typeof body.result==="object")return [body.result];
  if(body?.sampleId!=null)return [body];
  return [];
}
export default async function(req,res){
  const hospitalId=await integrationHospital(req,res);if(!hospitalId)return;
  const records=parseRecords(req.body||{});
  if(!records.length)return res.status(400).json({error:"resultsRecords with at least one result is required"});
  const details=[];
  for(const rr of records){
    const sampleId=String(rr.sampleId??rr.sample_id??"").trim();
    const testCode=String(rr.testCode??rr.test_code??"").trim();
    const resultValue=String(rr.resultValueString??rr.result_value??rr.resultValue??"").trim();
    const units=String(rr.resultUnits??rr.result_units??rr.units??"").trim();
    const resultId=rr.resultId??rr.result_id??null;
    if(!/^\d+$/.test(sampleId)||!testCode||!resultValue)return res.status(400).json({error:"Each result requires numeric sampleId, testCode and result value"});
    const fingerprintKey=fingerprint(sampleId,testCode,resultValue,units,resultId);
    const order=await db.query("SELECT id,patient_id,encounter_id,test_name,status FROM lab_orders WHERE hospital_id=$1 AND id=$2 LIMIT 1",[hospitalId,Number(sampleId)]);
    if(!order.rows[0]){details.push({sampleId,testCode,status:"Failure",error:"Lab sample/order not found"});continue}
    const o=order.rows[0];
    if(!["sample_collected","processing"].includes(o.status)){details.push({sampleId,testCode,status:"Failure",error:"Lab order is not ready to receive an analyzer result",orderStatus:o.status});continue}
    if(String(o.test_name||"").trim().toLowerCase()!==testCode.toLowerCase()){details.push({sampleId,testCode,status:"Failure",error:"Test code does not match the CareFlow laboratory order",orderedTest:o.test_name});continue}
    const updated=await db.query("WITH locked AS (SELECT pg_advisory_xact_lock(hashtext($1))) UPDATE lab_orders l SET result_summary=$2 WHERE l.hospital_id=$3 AND l.id=$4 AND l.status IN ('sample_collected','processing') AND NOT EXISTS (SELECT 1 FROM audit_logs a, locked WHERE a.hospital_id=$3 AND a.action='lis_result_received' AND a.entity_type='lab_order' AND a.entity_id=$5) RETURNING l.id,l.patient_id,l.encounter_id,l.status",[fingerprintKey,resultValue+(units?(" "+units):""),hospitalId,o.id,fingerprintKey]);
    if(!updated.rows[0]){
      const prior=await db.query("SELECT 1 FROM audit_logs WHERE hospital_id=$1 AND action='lis_result_received' AND entity_type='lab_order' AND entity_id=$2 LIMIT 1",[hospitalId,fingerprintKey]);
      if(prior.rows.length){details.push({sampleId,testCode,status:"Duplicate",resultId:resultId||fingerprintKey});continue}
      details.push({sampleId,testCode,status:"Failure",error:"Lab order changed while result was being received"});continue;
    }
    await db.query("INSERT INTO audit_logs(hospital_id,actor,action,entity_type,entity_id,details) VALUES($1,$2,'lis_result_received','lab_order',$3,$4)",[hospitalId,"lis",fingerprintKey,JSON.stringify({sampleId,testCode,result_id:resultId||null,units,patient_id:o.patient_id,encounter_id:o.encounter_id,order_id:o.id})]);
    details.push({sampleId,testCode,status:"Success",orderId:o.id,resultStatus:"received_pending_verification"});
  }
  return res.status(details.some(x=>x.status==="Success")?200:400).json({status:"LIS result processing completed.",details});
}