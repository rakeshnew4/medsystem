import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST"];

export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.pharmacy.manage"); if(!ctx)return;

 if(req.method==="GET"){
  if(req.query?.view==="stock"){
   const r=await db.query("SELECT * FROM pharmacy_stock WHERE hospital_id=$1 AND active=true ORDER BY medicine_name, expiry_date NULLS LAST, batch_no",[ctx.hospitalId]);
   return res.json(r.rows);
  }
  const pid=req.query?.patient_id;
  const r=await db.query("SELECT m.id AS medication_id,m.patient_id,p.name AS patient_name,m.medicine_name,m.dose,m.frequency,m.duration,m.instructions,m.encounter_id,m.prescribed_at,COALESCE(x.quantity,0) AS dispensed_quantity,COALESCE(x.status,'pending') AS dispense_status,x.dispensed_at FROM medications m JOIN patients p ON p.id=m.patient_id LEFT JOIN LATERAL (SELECT pd.quantity,pd.status,pd.dispensed_at FROM pharmacy_dispenses pd WHERE pd.hospital_id=m.hospital_id AND pd.medication_id=m.id ORDER BY pd.dispensed_at DESC LIMIT 1) x ON true WHERE m.hospital_id=$1 AND ($2::bigint IS NULL OR m.patient_id=$2) ORDER BY m.prescribed_at DESC LIMIT 300",[ctx.hospitalId,pid||null]);
  return res.json(r.rows);
 }

 const b=req.body||{};
 const patientId=Number(b.patient_id), medicationId=Number(b.medication_id), quantity=Number(b.quantity);
 if(!Number.isInteger(patientId)||patientId<=0)return res.status(400).json({error:"patient_id is required"});
 if(!Number.isInteger(medicationId)||medicationId<=0)return res.status(400).json({error:"medication_id is required"});
 if(!Number.isFinite(quantity)||quantity<=0)return res.status(400).json({error:"quantity must be greater than zero"});

 const med=await db.query("SELECT id,patient_id,encounter_id,medicine_name FROM medications WHERE hospital_id=$1 AND id=$2",[ctx.hospitalId,medicationId]);
 if(!med.rows.length)return res.status(404).json({error:"Prescription not found"});
 if(Number(med.rows[0].patient_id)!==patientId)return res.status(400).json({error:"Prescription does not belong to this patient"});

 const existing=await db.query("SELECT id,status,quantity FROM pharmacy_dispenses WHERE hospital_id=$1 AND medication_id=$2 AND status='dispensed' ORDER BY dispensed_at DESC LIMIT 1",[ctx.hospitalId,medicationId]);
 if(existing.rows.length)return res.status(409).json({error:"This prescription has already been dispensed",dispense_id:existing.rows[0].id});

 const stock=await db.query("SELECT COALESCE(SUM(quantity),0) AS available FROM pharmacy_stock WHERE hospital_id=$1 AND active=true AND LOWER(TRIM(medicine_name))=LOWER(TRIM($2)) AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)",[ctx.hospitalId,med.rows[0].medicine_name]);
 if(Number(stock.rows[0].available)<quantity){
  return res.status(409).json({error:"Insufficient non-expired stock",medicine_name:med.rows[0].medicine_name,requested_quantity:quantity,available_quantity:Number(stock.rows[0].available)});
 }

 const sql=`
WITH eligible AS (
 SELECT id,quantity,medicine_name,batch_no,expiry_date,
        SUM(quantity) OVER (ORDER BY expiry_date NULLS LAST,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_qty,
        SUM(quantity) OVER () AS total_qty
 FROM pharmacy_stock
 WHERE hospital_id=$1 AND active=true
   AND LOWER(TRIM(medicine_name))=LOWER(TRIM($2))
   AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE) AND quantity>0
 ORDER BY expiry_date NULLS LAST,id FOR UPDATE
),
allocation_plan AS (
 SELECT id,LEAST(quantity,GREATEST(0,$3-(running_qty-quantity))) AS take_qty
 FROM eligible WHERE total_qty >= $3 AND running_qty-quantity < $3
),
deducted AS (
 UPDATE pharmacy_stock s SET quantity=s.quantity-a.take_qty,updated_at=CURRENT_TIMESTAMP
 FROM allocation_plan a WHERE s.id=a.id AND a.take_qty>0
 RETURNING s.id,s.medicine_name,s.batch_no,s.expiry_date,s.quantity
),
deducted_summary AS (SELECT COALESCE(SUM(take_qty),0) AS deducted_qty FROM allocation_plan),
dispense AS (
 INSERT INTO pharmacy_dispenses(hospital_id,patient_id,medication_id,encounter_id,quantity,dispensed_by,status,notes)
 SELECT $1,$4,$5,$6,$3,$7,'dispensed',$8 FROM deducted_summary WHERE deducted_qty >= $3
 RETURNING id,patient_id,medication_id,encounter_id,quantity,dispensed_by,status,dispensed_at
),
stock_txn AS (
 INSERT INTO pharmacy_stock_transactions(hospital_id,stock_id,transaction_type,quantity,medication_id,patient_id,encounter_id,performed_by,notes)
 SELECT $1,d.id,'dispense',a.take_qty,$5,$4,$6,$7,$8 FROM deducted d JOIN allocation_plan a ON a.id=d.id
 RETURNING id
),
queue_candidate AS (
 SELECT id FROM queue_entries WHERE hospital_id=$1 AND patient_id=$4 AND stage='pharmacy' AND completed_at IS NULL
 ORDER BY created_at DESC,id DESC LIMIT 1
),
queue_done AS (
 UPDATE queue_entries q SET stage='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
 FROM queue_candidate c WHERE q.id=c.id AND EXISTS (SELECT 1 FROM dispense) RETURNING q.id
),
encounter_done AS (
 UPDATE care_encounters ce SET status='completed',current_stage='completed',ended_at=COALESCE(ce.ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
 WHERE ce.hospital_id=$1 AND ce.id=$6 AND EXISTS (SELECT 1 FROM queue_done)
 RETURNING ce.id
)
SELECT d.id AS dispense_id,d.patient_id,d.medication_id,d.encounter_id,d.quantity,d.dispensed_by,d.status,d.dispensed_at,
 COALESCE((SELECT json_agg(json_build_object('stock_id',ds.id,'batch_no',ds.batch_no,'expiry_date',ds.expiry_date,'remaining_quantity',ds.quantity) ORDER BY ds.expiry_date NULLS LAST,ds.id) FROM deducted ds),'[]'::json) AS stock_batches,
 (SELECT id FROM queue_done LIMIT 1) AS completed_queue_id,
 (SELECT id FROM encounter_done LIMIT 1) AS completed_encounter_id
FROM dispense d
`;
 const r=await db.query(sql,[ctx.hospitalId,med.rows[0].medicine_name,quantity,patientId,medicationId,med.rows[0].encounter_id||null,ctx.user.email,b.notes||null]);
 if(!r.rows.length)return res.status(409).json({error:"Dispensing could not be completed; stock changed or is no longer available. Please refresh and retry."});

 const row=r.rows[0];
 await logWorkflowEvent(ctx,{patientId,encounterId:row.encounter_id||null,eventType:"medicine_dispensed",stage:"pharmacy",entityType:"pharmacy_dispense",entityId:row.dispense_id,metadata:{quantity:Number(row.quantity),stock_id:row.stock_id,batch_no:row.batch_no,remaining_stock:Number(row.remaining_stock),queue_id:row.completed_queue_id||null}});
 return res.json(row);
}