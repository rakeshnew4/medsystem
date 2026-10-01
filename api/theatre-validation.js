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
  await check("invalid_ward_return","SELECT count(*) AS n FROM theatre_procedures WHERE ward_returned_at IS NOT NULL AND (status <> 'completed' OR admission_id IS NULL OR encounter_id IS NULL)",r=>Number(r[0]?.n||0));
  await check("orphan_invoice_item","SELECT count(*) AS n FROM theatre_charges WHERE invoice_item_id IS NOT NULL AND invoice_id IS NULL",r=>Number(r[0]?.n||0));
  await check("duplicate_source_charge","SELECT count(*) AS n FROM (SELECT hospital_id,source_type,source_id FROM theatre_charges WHERE source_type IS NOT NULL GROUP BY hospital_id,source_type,source_id HAVING count(*)>1) x",r=>Number(r[0]?.n||0));
  await check("duplicate_invoice_item","SELECT count(*) AS n FROM (SELECT hospital_id,invoice_item_id FROM theatre_charges WHERE invoice_item_id IS NOT NULL GROUP BY hospital_id,invoice_item_id HAVING count(*)>1) x",r=>Number(r[0]?.n||0));
  await check("active_room_overlap","SELECT count(*) AS n FROM theatre_procedures a JOIN theatre_procedures b ON a.id<b.id AND a.hospital_id=b.hospital_id AND a.theatre_room_id=b.theatre_room_id AND a.status IN ('scheduled','in_progress') AND b.status IN ('scheduled','in_progress') AND a.scheduled_start IS NOT NULL AND b.scheduled_start IS NOT NULL AND a.scheduled_start < COALESCE(b.scheduled_end,b.scheduled_start+interval '1 hour') AND b.scheduled_start < COALESCE(a.scheduled_end,a.scheduled_start+interval '1 hour')",r=>Number(r[0]?.n||0));
  await check("procedure_patient_hospital_isolation","SELECT count(*) AS n FROM theatre_procedures t JOIN patients p ON p.id=t.patient_id WHERE t.hospital_id<>p.hospital_id",r=>Number(r[0]?.n||0));
  await check("charge_procedure_patient_isolation","SELECT count(*) AS n FROM theatre_charges c JOIN theatre_procedures t ON t.id=c.procedure_id WHERE c.hospital_id<>t.hospital_id OR c.patient_id<>t.patient_id",r=>Number(r[0]?.n||0));
  await check("completed_without_outcome","SELECT count(*) AS n FROM theatre_procedures WHERE status='completed' AND NULLIF(trim(coalesce(outcome,'')),'') IS NULL",r=>Number(r[0]?.n||0));
  await check("invalid_room_state","SELECT count(*) AS n FROM theatre_procedures t JOIN theatre_rooms r ON r.id=t.theatre_room_id WHERE t.hospital_id=r.hospital_id AND r.status<>'available' AND t.status='scheduled'",r=>Number(r[0]?.n||0));
  await check("invalid_theatre_service_source","SELECT count(*) AS n FROM theatre_charges c LEFT JOIN hospital_services s ON s.id=c.source_id AND s.hospital_id=c.hospital_id WHERE c.source_type='theatre_service' AND (c.source_id IS NULL OR s.id IS NULL OR s.active IS NOT TRUE OR c.charge_type<>'theatre_service')",r=>Number(r[0]?.n||0));
  await check("invalid_source_charge_type","SELECT count(*) AS n FROM theatre_charges WHERE (source_type='medicine' AND charge_type<>'medicine') OR (source_type='pharmacy_dispense' AND charge_type<>'medicine') OR (source_type='theatre_service' AND charge_type<>'theatre_service') OR source_type='professional_fee'",r=>Number(r[0]?.n||0));
  await check("invalid_medicine_source","SELECT count(*) AS n FROM theatre_charges c JOIN theatre_procedures t ON t.id=c.procedure_id LEFT JOIN medications m ON c.source_type='medicine' AND m.id=c.source_id AND m.hospital_id=c.hospital_id LEFT JOIN pharmacy_dispenses d ON c.source_type='pharmacy_dispense' AND d.id=c.source_id AND d.hospital_id=c.hospital_id WHERE c.source_type IN ('medicine','pharmacy_dispense') AND ((c.source_type='medicine' AND m.id IS NULL) OR (c.source_type='pharmacy_dispense' AND d.id IS NULL) OR c.patient_id<>t.patient_id)",r=>Number(r[0]?.n||0));
  await check("invoice_item_matches_charge","SELECT count(*) AS n FROM theatre_charges c JOIN invoice_items ii ON ii.id=c.invoice_item_id WHERE c.invoice_id IS NULL OR ii.invoice_id<>c.invoice_id OR ii.quantity<>c.quantity OR ii.unit_price<>c.unit_price OR ii.amount<>c.amount",r=>Number(r[0]?.n||0));
  await check("charge_patient_matches_procedure","SELECT count(*) AS n FROM theatre_charges c JOIN theatre_procedures t ON t.id=c.procedure_id WHERE c.patient_id<>t.patient_id",r=>Number(r[0]?.n||0));
  await check("admission_patient_hospital_continuity","SELECT count(*) AS n FROM theatre_procedures t JOIN admissions a ON a.id=t.admission_id WHERE t.admission_id IS NOT NULL AND (t.hospital_id<>a.hospital_id OR t.patient_id<>a.patient_id)",r=>Number(r[0]?.n||0));
  await check("active_admission_encounter_continuity","SELECT count(*) AS n FROM theatre_procedures t JOIN admissions a ON a.id=t.admission_id LEFT JOIN care_encounters e ON e.id=t.encounter_id WHERE t.admission_id IS NOT NULL AND (a.discharged_at IS NOT NULL OR t.encounter_id IS NULL OR e.id IS NULL OR e.status<>'open' OR e.hospital_id<>t.hospital_id OR e.patient_id<>t.patient_id OR e.admission_id<>t.admission_id)",r=>Number(r[0]?.n||0));

  const passed=checks.filter(x=>x.pass).length;
  res.json({ok:passed===checks.length,passed,total:checks.length,checks,authenticated_e2e_required:true});
}