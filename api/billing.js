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
  const inv=await db.query("INSERT INTO invoices(hospital_id,patient_id,appointment_id,visit_id,invoice_number,subtotal,discount,tax,total,paid,payment_method,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *",[ctx.hospitalId,b.patient_id,b.appointment_id||null,b.visit_id||null,invoiceNumber,subtotal,discount,tax,total,paid,b.payment_method||null,status,b.notes||null,ctx.user.email]);
  for(const item of b.items) await db.query("INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,amount) VALUES($1,$2,$3,$4,$5)",[inv.rows[0].id,item.description,Number(item.quantity||1),Number(item.unit_price||0),Number(item.quantity||1)*Number(item.unit_price||0)]);
  await logWorkflowEvent(ctx,{patientId:b.patient_id,eventType:"invoice_created",stage:"billing",entityType:"invoice",entityId:inv.rows[0].id,metadata:{total,paid,status}});
  if(ctx.staff.role!=="billing")await notifyRoles({hospitalId:ctx.hospitalId,roles:["billing"],title:"New bill ready",body:"A new invoice is waiting for billing/payment action.",kind:"workflow",entityType:"invoice",entityId:inv.rows[0].id,patientId:b.patient_id,excludeStaffId:ctx.staff.id});
  return res.json(inv.rows[0]);
 }
 if(req.method==="PUT"){
  const b=req.body||{};const paid=Number(b.paid);
  if(!Number.isFinite(paid)||paid<0)return res.status(400).json({error:"Payment must be zero or a positive amount"});
  const cur=await db.query("SELECT patient_id,total,paid FROM invoices WHERE id=$1 AND hospital_id=$2",[b.id,ctx.hospitalId]);if(!cur.rows[0])return res.status(404).json({error:"Invoice not found"});
  if(paid>Number(cur.rows[0].total))return res.status(400).json({error:"Payment cannot exceed invoice total"});
  const status=paid>=Number(cur.rows[0].total)?"paid":paid>0?"partial":"unpaid";const r=await db.query("UPDATE invoices SET paid=$1,payment_method=COALESCE($2,payment_method),status=$3,updated_at=now() WHERE id=$4 AND hospital_id=$5 RETURNING *",[paid,b.payment_method||null,status,b.id,ctx.hospitalId]);await logWorkflowEvent(ctx,{patientId:cur.rows[0].patient_id,eventType:"payment_recorded",stage:"billing",entityType:"invoice",entityId:b.id,metadata:{paid,status}});return res.json(r.rows[0]);
 }
 const r=await db.query("SELECT i.*,p.name AS patient_name,p.phone FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.hospital_id=$1 ORDER BY i.created_at DESC LIMIT 300",[ctx.hospitalId]);res.json(r.rows);
}