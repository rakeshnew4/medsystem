import { db } from "../lib/db.js";
import { logWorkflowEvent } from "../lib/workflow.js";

export const access="admin";
export const methods=["GET"];

export default async function(req,res){
  const patient=await db.query("SELECT id,hospital_id FROM patients ORDER BY id LIMIT 1");
  if(!patient.rows[0])return res.status(409).json({error:"No patient exists for deterministic workflow-event validation"});

  const patientId=Number(patient.rows[0].id);
  const hospitalId=patient.rows[0].hospital_id;
  const marker="pharmacy-dispense-fault-test";
  const before=await db.query(
    "SELECT count(*) AS count FROM workflow_events WHERE hospital_id=(SELECT hospital_id FROM patients WHERE id=$1) AND patient_id=$1 AND entity_type='pharmacy_dispense' AND entity_id=$2",
    [patientId,marker]
  );

  const fault={};
  fault.self=fault;
  const simulated=await logWorkflowEvent(
    {hospitalId,user:{id:"validation"},staff:{id:null}},
    {
      patientId,
      eventType:"medicine_dispensed",
      stage:"pharmacy",
      entityType:"pharmacy_dispense",
      entityId:marker,
      metadata:fault
    }
  );

  const after=await db.query(
    "SELECT count(*) AS count FROM workflow_events WHERE hospital_id=(SELECT hospital_id FROM patients WHERE id=$1) AND patient_id=$1 AND entity_type='pharmacy_dispense' AND entity_id=$2",
    [patientId,marker]
  );
  const idx=await db.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='pharmacy_dispenses' AND indexname='ux_pharmacy_dispenses_one_active'"
  );

  const checks=[
    {name:"event_failure_is_non_fatal",passed:simulated?.recorded===false&&simulated?.reason==="persistence_failed"},
    {name:"failed_event_does_not_write_marker",passed:Number(before.rows[0]?.count||0)===Number(after.rows[0]?.count||0)},
    {name:"duplicate_dispense_guard_present",passed:idx.rows.length===1}
  ];
  return res.json({ok:checks.every(x=>x.passed),checks});
}