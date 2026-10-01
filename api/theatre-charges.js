import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST","PUT"];

export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.billing":"action.billing.manage");
 if(!ctx)return;
 if(req.method==="GET"){
  const pid=Number(req.query?.procedure_id||0), patientId=Number(req.query?.patient_id||0);
  const where=pid?"AND c.procedure_id=$2":patientId?"AND c.patient_id=$2":"";
  const params=pid?[ctx.hospitalId,pid]:patientId?[ctx.hospitalId,patientId]:[ctx.hospitalId];
  const r=await db.query(`SELECT c.*,t.procedure_name,t.status AS procedure_status,i.invoice_number,cat.name AS catalog_name,cat.service_type AS catalog_service_type
    FROM theatre_charges c JOIN theatre_procedures t ON t.id=c.procedure_id
    LEFT JOIN theatre_procedure_catalog cat ON cat.id=c.catalog_id AND cat.hospital_id=c.hospital_id
    LEFT JOIN invoices i ON i.id=c.invoice_id AND i.hospital_id=c.hospital_id
    WHERE c.hospital_id=$1 ${where} ORDER BY c.created_at DESC LIMIT 500`,params);
  return res.json(r.rows);
 }
 if(req.method==="POST"){
  if(ctx.staff.role!=="billing"&&ctx.staff.role!=="admin")return res.status(403).json({error:"Only billing staff or administrators can create Theatre charges"});
  const b=req.body||{}, procedureId=Number(b.procedure_id||0), qty=Number(b.quantity||1), unit=Number(b.unit_price);
  if(!procedureId||!String(b.description||"").trim())return res.status(400).json({error:"Procedure and charge description are required"});
  if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(unit)||unit<0)return res.status(400).json({error:"Invalid quantity or unit price"});
  const allowedTypes=["procedure","theatre_service","professional_fee","medicine","consumable"];
  const chargeType=String(b.charge_type||"procedure");
  if(!allowedTypes.includes(chargeType))return res.status(400).json({error:"Unsupported Theatre charge type"});
  const p=await db.query("SELECT id,patient_id,status FROM theatre_procedures WHERE id=$1 AND hospital_id=$2",[procedureId,ctx.hospitalId]);
  if(!p.rows[0])return res.status(404).json({error:"Theatre procedure not found"});
  const amount=qty*unit;
  const sourceType=b.source_type?String(b.source_type).trim():null;
  const sourceId=b.source_id?Number(b.source_id):null;
  const catalogId=b.catalog_id?Number(b.catalog_id):null;
  if(catalogId){
    const cat=await db.query("SELECT id,service_type,active FROM theatre_procedure_catalog WHERE id=$1 AND hospital_id=$2",[catalogId,ctx.hospitalId]);
    if(!cat.rows[0])return res.status(404).json({error:"Theatre billing catalogue entry not found"});
    if(!cat.rows[0].active)return res.status(409).json({error:"Inactive Theatre billing catalogue entry"});
    if(!["procedure","theatre_service","professional_fee","medicine"].includes(cat.rows[0].service_type))return res.status(400).json({error:"Catalogue entry is not billable"});
    if(chargeType!==cat.rows[0].service_type)return res.status(400).json({error:"Charge type does not match Theatre catalogue service type"});
  }
  if((sourceType&&!Number.isInteger(sourceId))||(!sourceType&&sourceId))return res.status(400).json({error:"source_type and source_id must be supplied together"});
  if(sourceType&&!["theatre_service","professional_fee","medicine","pharmacy_dispense"].includes(sourceType))return res.status(400).json({error:"Unsupported Theatre source type"});
  if(sourceType&&sourceId){
    const dup=await db.query("SELECT id FROM theatre_charges WHERE hospital_id=$1 AND source_type=$2 AND source_id=$3",[ctx.hospitalId,sourceType,sourceId]);
    if(dup.rows[0])return res.status(409).json({error:"Source charge is already represented in Theatre billing",charge_id:dup.rows[0].id});
  }
  const r=await db.query(`INSERT INTO theatre_charges(hospital_id,procedure_id,patient_id,charge_type,description,quantity,unit_price,amount,source_type,source_id,catalog_id,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [ctx.hospitalId,procedureId,p.rows[0].patient_id,chargeType,String(b.description).trim(),qty,unit,amount,sourceType,sourceId,catalogId,ctx.user.email]);
  await logWorkflowEvent(ctx,{patientId:p.rows[0].patient_id,eventType:"theatre_charge_created",stage:"billing",entityType:"theatre_procedure",entityId:procedureId,metadata:{charge_id:r.rows[0].id,amount,charge_type:chargeType}});
  return res.status(201).json(r.rows[0]);
 }
 if(ctx.staff.role!=="billing"&&ctx.staff.role!=="admin")return res.status(403).json({error:"Only billing staff or administrators can link Theatre charges"});
 const b=req.body||{}, id=Number(b.id||0), invoiceId=Number(b.invoice_id||0);
 if(!id||!invoiceId)return res.status(400).json({error:"Charge and invoice are required"});
 const c=await db.query("SELECT * FROM theatre_charges WHERE id=$1 AND hospital_id=$2 FOR UPDATE",[id,ctx.hospitalId]);
 if(!c.rows[0])return res.status(404).json({error:"Theatre charge not found"});
 if(c.rows[0].invoice_id)return res.status(409).json({error:"Theatre charge is already linked to an invoice"});
 const inv=await db.query("SELECT id,patient_id FROM invoices WHERE id=$1 AND hospital_id=$2",[invoiceId,ctx.hospitalId]);
 if(!inv.rows[0])return res.status(404).json({error:"Invoice not found"});
 if(Number(inv.rows[0].patient_id)!==Number(c.rows[0].patient_id))return res.status(409).json({error:"Invoice does not belong to the charge patient"});
 const tx=await db.transaction([
  {sql:`WITH claimed AS (
      UPDATE theatre_charges SET invoice_id=$1
      WHERE id=$2 AND hospital_id=$3 AND invoice_id IS NULL AND invoice_item_id IS NULL
      RETURNING *
    ), item AS (
      INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,amount)
      SELECT $1,description,quantity,unit_price,amount FROM claimed
      RETURNING id
    )
    UPDATE theatre_charges c SET invoice_item_id=item.id
    FROM item, claimed
    WHERE c.id=claimed.id AND c.hospital_id=$3
    RETURNING c.*`,params:[invoiceId,id,ctx.hospitalId]},
  {sql:"UPDATE invoices SET subtotal=subtotal+(SELECT amount FROM theatre_charges WHERE id=$1 AND hospital_id=$2),total=GREATEST(0,subtotal+(SELECT amount FROM theatre_charges WHERE id=$1 AND hospital_id=$2)-discount+tax),status=CASE WHEN paid>=GREATEST(0,subtotal+(SELECT amount FROM theatre_charges WHERE id=$1 AND hospital_id=$2)-discount+tax) THEN 'paid' WHEN paid>0 THEN 'partial' ELSE 'unpaid' END,updated_at=now() WHERE id=$3 AND hospital_id=$2 RETURNING *",params:[id,ctx.hospitalId,invoiceId]}
 ]);
 const row=tx.results?.[0]?.rows?.[0];
 if(!row)return res.status(409).json({error:"Charge was already linked; refresh before retrying"});
 await logWorkflowEvent(ctx,{patientId:row.patient_id,eventType:"theatre_charge_linked",stage:"billing",entityType:"invoice",entityId:invoiceId,metadata:{charge_id:id,procedure_id:row.procedure_id,amount:row.amount}});
 return res.json(row);
}