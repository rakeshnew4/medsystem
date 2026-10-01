import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
import { notifyRoles } from "../lib/staff-notifications.js";

export const access="user";
export const methods=["GET","PUT"];

const transitions={
  ordered:"sample_collected",
  sample_collected:"processing",
  processing:"verified"
};

export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.lab.manage"); if(!ctx)return;

 if(req.method==="GET"){
  const pid=req.query?.patient_id||null;
  const r=await db.query(
   "SELECT l.*,p.name AS patient_name,p.uhid,d.name AS doctor_name,i.invoice_number,i.total AS invoice_total,i.paid AS invoice_paid,i.status AS invoice_status FROM lab_orders l JOIN patients p ON p.id=l.patient_id LEFT JOIN doctors d ON d.id=l.doctor_id LEFT JOIN invoices i ON i.id=l.invoice_id AND i.hospital_id=l.hospital_id WHERE l.hospital_id=$1 AND ($2::bigint IS NULL OR l.patient_id=$2) ORDER BY l.ordered_at DESC LIMIT 500",
   [ctx.hospitalId,pid]
  );
  return res.json(r.rows);
 }

 const b=req.body||{};
 if(!b.id)return res.status(400).json({error:"Lab order id is required"});
 const current=await db.query(
  "SELECT l.*,i.status AS invoice_status,i.total AS invoice_total,i.paid AS invoice_paid FROM lab_orders l LEFT JOIN invoices i ON i.id=l.invoice_id AND i.hospital_id=l.hospital_id WHERE l.id=$1 AND l.hospital_id=$2",
  [Number(b.id),ctx.hospitalId]
 );
 if(!current.rows[0])return res.status(404).json({error:"Lab order not found"});
 const order=current.rows[0];
 const target=String(b.status||"");
 if(target==="cancelled"){
  if(!["ordered","sample_collected"].includes(order.status))return res.status(409).json({error:"Only an unprocessed lab order can be cancelled"});
  const r=await db.query("UPDATE lab_orders SET status='cancelled' WHERE id=$1 AND hospital_id=$2 RETURNING *",[order.id,ctx.hospitalId]);
  await logWorkflowEvent(ctx,{patientId:order.patient_id,encounterId:order.encounter_id,eventType:"lab_cancelled",stage:"lab",entityType:"lab_order",entityId:order.id});
  return res.json(r.rows[0]);
 }
 if(transitions[order.status]!==target)return res.status(409).json({error:"Invalid laboratory status transition",from:order.status,to:target});

 if(target==="sample_collected"){
  if(order.invoice_id && order.invoice_status!=="paid")return res.status(409).json({error:"Laboratory payment must be settled before sample collection"});
  const r=await db.query("UPDATE lab_orders SET status='sample_collected',sample_collected_at=COALESCE(sample_collected_at,now()) WHERE id=$1 AND hospital_id=$2 AND status='ordered' RETURNING *",[order.id,ctx.hospitalId]);
  if(!r.rows[0])return res.status(409).json({error:"Lab order changed; refresh and try again"});
  await logWorkflowEvent(ctx,{patientId:order.patient_id,encounterId:order.encounter_id,eventType:"lab_sample_collected",stage:"lab",entityType:"lab_order",entityId:order.id});
  return res.json(r.rows[0]);
 }

 if(target==="processing"){
  const r=await db.query("UPDATE lab_orders SET status='processing',processing_started_at=COALESCE(processing_started_at,now()) WHERE id=$1 AND hospital_id=$2 AND status='sample_collected' RETURNING *",[order.id,ctx.hospitalId]);
  if(!r.rows[0])return res.status(409).json({error:"Lab order changed; refresh and try again"});
  await logWorkflowEvent(ctx,{patientId:order.patient_id,encounterId:order.encounter_id,eventType:"lab_processing_started",stage:"lab",entityType:"lab_order",entityId:order.id});
  return res.json(r.rows[0]);
 }

 if(target==="verified"){
  const result=String(b.result_summary||"").trim();
  if(!result)return res.status(400).json({error:"Result is required before verification"});
  const r=await db.query(
   "UPDATE lab_orders SET status='verified',result_summary=$1,completed_at=COALESCE(completed_at,now()),verified_at=COALESCE(verified_at,now()),verified_by=$2,doctor_notified_at=now() WHERE id=$3 AND hospital_id=$4 AND status='processing' RETURNING *",
   [result,ctx.user?.email||String(ctx.staff?.id||""),order.id,ctx.hospitalId]
  );
  if(!r.rows[0])return res.status(409).json({error:"Lab order changed; refresh and try again"});
  const report=await db.query(
   "INSERT INTO clinical_reports(hospital_id,patient_id,visit_id,lab_order_id,encounter_id,report_type,title,report_date,summary) VALUES($1,$2,$3,$4,$5,'lab_result',$6,current_date,$7) RETURNING id",
   [ctx.hospitalId,order.patient_id,order.visit_id||null,order.id,order.encounter_id||null,order.test_name,result]
  );
  if(order.queue_entry_id){
   await db.query("UPDATE queue_entries SET stage='followup',updated_at=now() WHERE id=$1 AND hospital_id=$2 AND stage='lab'",[order.queue_entry_id,ctx.hospitalId]);
  }
  await logWorkflowEvent(ctx,{patientId:order.patient_id,encounterId:order.encounter_id,eventType:"lab_result_verified",stage:"followup",entityType:"lab_order",entityId:order.id,metadata:{result_report_id:report.rows[0]?.id||null}});
  await notifyRoles({hospitalId:ctx.hospitalId,roles:["doctor"],title:"Laboratory result verified",body:"A laboratory result is ready for doctor review.",kind:"workflow",entityType:"lab_order",entityId:order.id,patientId:order.patient_id});
  return res.json(r.rows[0]);
 }

 return res.status(400).json({error:"Unsupported laboratory action"});
}