import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.billing");
  if(!ctx)return;
  const limit=Math.min(Math.max(Number(req.query?.limit||100),1),300);
  const invoiceId=req.query?.invoice_id?Number(req.query.invoice_id):null;
  const params=[ctx.hospitalId];
  let invoiceFilter="";
  if(invoiceId){
    params.push(invoiceId);
    invoiceFilter=" AND i.id=$2";
  }
  params.push(limit);
  const paymentParams=invoiceId?[ctx.hospitalId,invoiceId,limit]:[ctx.hospitalId,limit];
  const [payments,events,audits]=await Promise.all([
    db.query(
      "SELECT ip.id,ip.invoice_id,ip.amount,ip.payment_method,ip.reference,ip.received_by,ip.created_at,i.invoice_number,p.name AS patient_name,p.uhid " +
      "FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id AND i.hospital_id=ip.hospital_id JOIN patients p ON p.id=i.patient_id " +
      "WHERE ip.hospital_id=$1"+(invoiceId?" AND ip.invoice_id=$2":"")+" ORDER BY ip.created_at DESC,ip.id DESC LIMIT $"+paymentParams.length,
      paymentParams
    ),
    db.query(
      "SELECT e.id,e.event_type,e.stage,e.entity_type,e.entity_id,e.metadata,e.created_at,s.display_name AS actor_name,s.role AS actor_role,i.invoice_number,p.name AS patient_name,p.uhid " +
      "FROM workflow_events e LEFT JOIN staff_profiles s ON s.id=e.actor_staff_id " +
      "LEFT JOIN invoices i ON i.id=CASE WHEN e.entity_type='invoice' AND e.entity_id~'^[0-9]+$' THEN CAST(e.entity_id AS BIGINT) ELSE NULL END AND i.hospital_id=e.hospital_id " +
      "LEFT JOIN patients p ON p.id=COALESCE(i.patient_id,e.patient_id) " +
      "WHERE e.hospital_id=$1 AND (e.stage='billing' OR e.event_type IN ('invoice_created','payment_recorded'))"+
      (invoiceId?" AND e.entity_type='invoice' AND e.entity_id=$2":"")+" ORDER BY e.created_at DESC,e.id DESC LIMIT $"+(invoiceId?3:2),
      invoiceId?[ctx.hospitalId,String(invoiceId),limit]:[ctx.hospitalId,limit]
    ),
    db.query(
      "SELECT a.id,a.actor,a.action,a.entity_type,a.entity_id,a.details,a.created_at,i.invoice_number,p.name AS patient_name,p.uhid " +
      "FROM audit_logs a LEFT JOIN invoices i ON i.id=CASE WHEN a.entity_type='invoice' AND a.entity_id~'^[0-9]+$' THEN CAST(a.entity_id AS BIGINT) ELSE NULL END AND i.hospital_id=a.hospital_id " +
      "LEFT JOIN patients p ON p.id=i.patient_id WHERE a.hospital_id=$1 AND (a.entity_type='invoice' OR a.action ILIKE 'payment%' OR a.action ILIKE 'invoice%')"+
      (invoiceId?" AND a.entity_id=$2":"")+" ORDER BY a.created_at DESC,a.id DESC LIMIT $"+(invoiceId?3:2),
      invoiceId?[ctx.hospitalId,String(invoiceId),limit]:[ctx.hospitalId,limit]
    )
  ]);
  return res.json({
    payments:payments.rows,
    workflow_events:events.rows,
    audit_events:audits.rows.map(x=>({...x,details:typeof x.details==="string"?(()=>{try{return JSON.parse(x.details)}catch{return {raw:x.details}}})():x.details}))
  });
}