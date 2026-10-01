import { db } from "../lib/db.js";

export const access="admin";
export const methods=["GET"];

export default async function(req,res){
  const checks=[];
  async function check(id,sql,fn){
    try{
      const r=await db.query(sql);
      const value=fn(r.rows);
      checks.push({id,pass:value===0,value});
    }catch(error){
      checks.push({id,pass:false,error:String(error?.message||error).slice(0,300)});
    }
  }

  await check("invalid_status","SELECT count(*) AS n FROM theatre_procedures WHERE status NOT IN ('scheduled','in_progress','completed','cancelled')",r=>Number(r[0]?.n||0));
  await check("invalid_ward_return","SELECT count(*) AS n FROM theatre_procedures WHERE ward_returned_at IS NOT NULL AND status <> 'completed'",r=>Number(r[0]?.n||0));
  await check("orphan_invoice_item","SELECT count(*) AS n FROM theatre_charges WHERE invoice_item_id IS NOT NULL AND invoice_id IS NULL",r=>Number(r[0]?.n||0));
  await check("duplicate_source_charge","SELECT count(*) AS n FROM (SELECT hospital_id,source_type,source_id FROM theatre_charges WHERE source_type IS NOT NULL GROUP BY hospital_id,source_type,source_id HAVING count(*)>1) x",r=>Number(r[0]?.n||0));
  await check("duplicate_invoice_item","SELECT count(*) AS n FROM (SELECT hospital_id,invoice_item_id FROM theatre_charges WHERE invoice_item_id IS NOT NULL GROUP BY hospital_id,invoice_item_id HAVING count(*)>1) x",r=>Number(r[0]?.n||0));
  await check("active_room_overlap","SELECT count(*) AS n FROM theatre_procedures a JOIN theatre_procedures b ON a.id<b.id AND a.hospital_id=b.hospital_id AND a.theatre_room_id=b.theatre_room_id AND a.status IN ('scheduled','in_progress') AND b.status IN ('scheduled','in_progress') AND a.scheduled_start IS NOT NULL AND b.scheduled_start IS NOT NULL AND a.scheduled_start < COALESCE(b.scheduled_end,b.scheduled_start+interval '1 hour') AND b.scheduled_start < COALESCE(a.scheduled_end,a.scheduled_start+interval '1 hour')",r=>Number(r[0]?.n||0));
  await check("procedure_patient_hospital_isolation","SELECT count(*) AS n FROM theatre_procedures t JOIN patients p ON p.id=t.patient_id WHERE t.hospital_id<>p.hospital_id",r=>Number(r[0]?.n||0));
  await check("charge_procedure_patient_isolation","SELECT count(*) AS n FROM theatre_charges c JOIN theatre_procedures t ON t.id=c.procedure_id WHERE c.hospital_id<>t.hospital_id OR c.patient_id<>t.patient_id",r=>Number(r[0]?.n||0));

  const passed=checks.filter(x=>x.pass).length;
  res.json({ok:passed===checks.length,passed,total:checks.length,checks,authenticated_e2e_required:true});
}