import { db } from "../lib/db.js";

export const access="admin";
export const methods=["GET"];

export default async function(req,res){
  const checks=[];

  const invalidStatus=await db.query("SELECT count(*)::int AS n FROM theatre_procedures WHERE status NOT IN ('scheduled','in_progress','completed','cancelled')");
  checks.push({id:"valid_status",pass:Number(invalidStatus.rows[0].n)===0,value:Number(invalidStatus.rows[0].n)});

  const invalidWard=await db.query("SELECT count(*)::int AS n FROM theatre_procedures WHERE ward_returned_at IS NOT NULL AND status <> 'completed'");
  checks.push({id:"ward_return_requires_completed",pass:Number(invalidWard.rows[0].n)===0,value:Number(invalidWard.rows[0].n)});

  const orphanInvoiceItem=await db.query("SELECT count(*)::int AS n FROM theatre_charges WHERE invoice_item_id IS NOT NULL AND invoice_id IS NULL");
  checks.push({id:"invoice_item_requires_invoice",pass:Number(orphanInvoiceItem.rows[0].n)===0,value:Number(orphanInvoiceItem.rows[0].n)});

  const duplicateSources=await db.query("SELECT count(*)::int AS n FROM (SELECT hospital_id,source_type,source_id,count(*) FROM theatre_charges WHERE source_type IS NOT NULL GROUP BY hospital_id,source_type,source_id HAVING count(*)>1) x");
  checks.push({id:"unique_source_charge",pass:Number(duplicateSources.rows[0].n)===0,value:Number(duplicateSources.rows[0].n)});

  const duplicateInvoiceLinks=await db.query("SELECT count(*)::int AS n FROM (SELECT hospital_id,invoice_item_id,count(*) FROM theatre_charges WHERE invoice_item_id IS NOT NULL GROUP BY hospital_id,invoice_item_id HAVING count(*)>1) x");
  checks.push({id:"unique_invoice_item_link",pass:Number(duplicateInvoiceLinks.rows[0].n)===0,value:Number(duplicateInvoiceLinks.rows[0].n)});

  const badChargeTypes=await db.query("SELECT count(*)::int AS n FROM theatre_charges WHERE charge_type NOT IN ('procedure','theatre_service','professional_fee','medicine','consumable')");
  checks.push({id:"allowed_charge_types",pass:Number(badChargeTypes.rows[0].n)===0,value:Number(badChargeTypes.rows[0].n)});

  const badCatalogTypes=await db.query("SELECT count(*)::int AS n FROM theatre_procedure_catalog WHERE service_type NOT IN ('procedure','theatre_service','professional_fee','medicine')");
  checks.push({id:"allowed_catalog_service_types",pass:Number(badCatalogTypes.rows[0].n)===0,value:Number(badCatalogTypes.rows[0].n)});

  const crossHospital=await db.query("SELECT count(*)::int AS n FROM theatre_procedures t JOIN patients p ON p.id=t.patient_id WHERE t.hospital_id<>p.hospital_id");
  checks.push({id:"procedure_patient_hospital_isolation",pass:Number(crossHospital.rows[0].n)===0,value:Number(crossHospital.rows[0].n)});

  const crossCharge=await db.query("SELECT count(*)::int AS n FROM theatre_charges c JOIN theatre_procedures t ON t.id=c.procedure_id WHERE c.hospital_id<>t.hospital_id OR c.patient_id<>t.patient_id");
  checks.push({id:"charge_procedure_patient_isolation",pass:Number(crossCharge.rows[0].n)===0,value:Number(crossCharge.rows[0].n)});

  const overlap=await db.query(`SELECT count(*)::int AS n FROM theatre_procedures a JOIN theatre_procedures b
    ON a.id<b.id AND a.hospital_id=b.hospital_id AND a.theatre_room_id=b.theatre_room_id
    AND a.status IN ('scheduled','in_progress') AND b.status IN ('scheduled','in_progress')
    AND a.scheduled_start IS NOT NULL AND b.scheduled_start IS NOT NULL
    AND a.scheduled_start < COALESCE(b.scheduled_end,b.scheduled_start+interval '1 hour')
    AND b.scheduled_start < COALESCE(a.scheduled_end,a.scheduled_start+interval '1 hour')`);
  checks.push({id:"active_room_overlap",pass:Number(overlap.rows[0].n)===0,value:Number(overlap.rows[0].n)});

  const perms=await db.query("SELECT role,permission_key,allowed FROM role_permissions WHERE permission_key='action.theatre.manage' AND role IN ('admin','doctor','nurse','billing','receptionist') ORDER BY role");
  const expected={admin:true,doctor:true,nurse:true,billing:false,receptionist:false};
  for(const role of Object.keys(expected)){
    const row=perms.rows.find(x=>x.role===role);
    checks.push({id:"role_"+role,pass:!!row && !!row.allowed===expected[role],value:row?.allowed??null});
  }

  const passed=checks.filter(x=>x.pass).length;
  res.json({ok:passed===checks.length,passed,total:checks.length,checks,authenticated_e2e_required:true});
}