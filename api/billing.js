import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
import { notifyRoles } from "../lib/staff-notifications.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.billing":"action.billing.manage");
 if(!ctx)return;
 if(req.method==="POST"){
  const b=req.body||{};
  if(!b.patient_id||!b.items?.length)return res.status(400).json({error:"Patient and at least one bill item are required"});
  const invoiceNumber="INV-"+new Date().getFullYear()+"-"+Date.now().toString(36).toUpperCase()+"-"+globalThis.crypto.randomUUID().slice(0,6).toUpperCase();
  const items=b.items.map(x=>({description:String(x.description||"").trim(),quantity:Number(x.quantity||1),unit_price:Number(x.unit_price||0)}));
  if(items.some(x=>!x.description||!Number.isFinite(x.quantity)||x.quantity<=0||!Number.isFinite(x.unit_price)||x.unit_price<0))return res.status(400).json({error:"Every bill item needs a description, positive quantity and non-negative price"});
  const subtotal=items.reduce((s,x)=>s+(x.quantity*x.unit_price),0);
  const discount=Number(b.discount||0),tax=Number(b.tax||0),total=Math.max(0,subtotal-discount+tax),paid=Number(b.paid||0);
  if(!Number.isFinite(discount)||discount<0||discount>subtotal)return res.status(400).json({error:"Invalid discount"});
  if(!Number.isFinite(tax)||tax<0)return res.status(400).json({error:"Invalid tax"});
  if(!Number.isFinite(paid)||paid<0||paid>total)return res.status(400).json({error:"Payment cannot be negative or exceed the invoice total"});
  const status=paid>=total?"paid":paid>0?"partial":"unpaid";
  // Encounter-event continuity is currently validated separately; keep invoice creation independent of optional encounter metadata.
  const statements=[
    {sql:"INSERT INTO invoices(hospital_id,patient_id,appointment_id,visit_id,invoice_number,subtotal,discount,tax,total,paid,payment_method,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *",params:[ctx.hospitalId,b.patient_id,b.appointment_id||null,b.visit_id||null,invoiceNumber,subtotal,discount,tax,total,paid,b.payment_method||null,status,b.notes||null,ctx.user.email]},
    ...items.map(item=>({sql:"INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,amount) SELECT x.id,$2,$3,$4,$5 FROM (SELECT id FROM invoices WHERE invoice_number=$1 AND hospital_id=$6) x",params:[invoiceNumber,item.description,item.quantity,item.unit_price,item.quantity*item.unit_price,ctx.hospitalId]}))
  ];
  if(paid>0)statements.push({sql:"INSERT INTO invoice_payments(hospital_id,invoice_id,amount,payment_method,reference,received_by) SELECT $1,id,$2,$3,$4,$5 FROM invoices WHERE invoice_number=$6 AND hospital_id=$1",params:[ctx.hospitalId,paid,b.payment_method||null,b.reference||null,ctx.user.email,invoiceNumber]});
  const tx=await db.transaction(statements);
  const inv=tx.results?.[0]?.rows?.[0];
  if(!inv)return res.status(500).json({error:"Invoice creation failed"});
  await logWorkflowEvent(ctx,{patientId:b.patient_id,eventType:"invoice_created",stage:"billing",entityType:"invoice",entityId:inv.id,metadata:{total,paid,status}});
  if(ctx.staff.role!=="billing")await notifyRoles({hospitalId:ctx.hospitalId,roles:["billing"],title:"New bill ready",body:"A new invoice is waiting for billing/payment action.",kind:"workflow",entityType:"invoice",entityId:inv.id,patientId:b.patient_id,excludeStaffId:ctx.staff.id});
  return res.json(inv);
 }
 if(req.method==="PUT"){
  const b=req.body||{};const amount=Number(b.amount);
  if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:"Payment amount must be greater than zero"});
  const cur=await db.query("SELECT patient_id,total,paid FROM invoices WHERE id=$1 AND hospital_id=$2 FOR UPDATE",[b.id,ctx.hospitalId]);if(!cur.rows[0])return res.status(404).json({error:"Invoice not found"});
  const due=Math.max(0,Number(cur.rows[0].total)-Number(cur.rows[0].paid));
  if(amount>due)return res.status(400).json({error:"Payment cannot exceed outstanding balance"});
  const nextPaid=Number(cur.rows[0].paid)+amount;
  const status=nextPaid>=Number(cur.rows[0].total)?"paid":"partial";
  const tx=await db.transaction([
    {sql:"SELECT id,total,paid,patient_id FROM invoices WHERE id=$1 AND hospital_id=$2 FOR UPDATE",params:[b.id,ctx.hospitalId]},
    {sql:"INSERT INTO invoice_payments(hospital_id,invoice_id,amount,payment_method,reference,received_by) SELECT $1,$2,$3,$4,$5,$6 WHERE $3 <= (SELECT total-paid FROM invoices WHERE id=$2 AND hospital_id=$1)",params:[ctx.hospitalId,b.id,amount,b.payment_method||null,b.reference||null,ctx.user.email]},
    {sql:"UPDATE invoices SET paid=paid+$1,payment_method=COALESCE($2,payment_method),status=CASE WHEN paid+$1>=total THEN 'paid' ELSE 'partial' END,updated_at=now() WHERE id=$3 AND hospital_id=$4 AND paid+$1<=total RETURNING *",params:[amount,b.payment_method||null,b.id,ctx.hospitalId]}
  ]);
  const updated=tx.results?.[2]?.rows?.[0];
  if(!updated)return res.status(409).json({error:"Payment could not be applied; outstanding balance may have changed. Please refresh and retry."});
  await logWorkflowEvent(ctx,{patientId:updated.patient_id,eventType:"payment_recorded",stage:"billing",entityType:"invoice",entityId:b.id,metadata:{amount,paid:updated.paid,status:updated.status,reference:b.reference||null}});
  return res.json(updated);
 }
 if(req.query?.id){
   const r=await db.query("SELECT i.*,p.name AS patient_name,p.phone,p.uhid FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.id=$1 AND i.hospital_id=$2",[Number(req.query.id),ctx.hospitalId]);
   if(!r.rows[0])return res.status(404).json({error:"Invoice not found"});
   const payments=await db.query("SELECT id,amount,payment_method,reference,received_by,created_at FROM invoice_payments WHERE invoice_id=$1 AND hospital_id=$2 ORDER BY created_at",[Number(req.query.id),ctx.hospitalId]);
   const items=await db.query("SELECT id,description,quantity,unit_price,amount FROM invoice_items WHERE invoice_id=$1 ORDER BY id",[Number(req.query.id)]);
   return res.json({...r.rows[0],items:items.rows,payments:payments.rows});
 }
 const r=await db.query("SELECT i.*,p.name AS patient_name,p.phone,p.uhid FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.hospital_id=$1 ORDER BY i.created_at DESC LIMIT 300",[ctx.hospitalId]);res.json(r.rows);
}