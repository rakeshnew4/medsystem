import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET","PUT"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.patients":"action.beds.manage");
  if(!ctx)return;

  if(req.method==="PUT"){
    const b=req.body||{};
    if(b.action==="update-admission"){
      const r=await db.query(
        "UPDATE admissions SET expected_discharge_date=$1,admission_type=$2,notes=$3,updated_at=now() WHERE id=$4 AND hospital_id=$5 AND discharged_at IS NULL RETURNING *",
        [b.expected_discharge_date||null,b.admission_type||"general",b.notes||null,b.id,ctx.hospitalId]
      );
      return res.json(r.rows[0]||{error:"Active admission not found"});
    }
    return res.status(400).json({error:"Unknown IPD action"});
  }

  const patientId=req.query?.patient_id;
  const admissionId=req.query?.admission_id;
  let where="a.hospital_id=$1";
  const params=[ctx.hospitalId];
  if(patientId){params.push(patientId);where+=" AND a.patient_id=$"+params.length}
  if(admissionId){params.push(admissionId);where+=" AND a.id=$"+params.length}

  const admissions=await db.query(
    `SELECT a.*,p.name AS patient_name,p.phone,p.date_of_birth,
      d.name AS doctor_name,
      b.ward,b.bed_number,b.bed_type,b.status AS bed_status,
      ce.id AS encounter_id,ce.status AS encounter_status,
      (SELECT COUNT(*)::int FROM bed_assignments ba WHERE ba.admission_id=a.id) AS transfer_count
     FROM admissions a
     JOIN patients p ON p.id=a.patient_id
     LEFT JOIN doctors d ON d.id=a.admitting_doctor_id
     LEFT JOIN beds b ON b.id=a.bed_id
     LEFT JOIN care_encounters ce ON ce.admission_id=a.id
     WHERE ${where}
     ORDER BY a.admitted_at DESC`,
    params
  );

  if(patientId||admissionId){
    const ids=admissions.rows.map(x=>x.id);
    let assignments=[];
    if(ids.length){
      const ar=await db.query(
        `SELECT ba.*,b.ward,b.bed_number,b.bed_type
         FROM bed_assignments ba JOIN beds b ON b.id=ba.bed_id
         WHERE ba.hospital_id=$1 AND ba.admission_id = ANY($2::bigint[])
         ORDER BY ba.assigned_at DESC`,
        [ctx.hospitalId,ids]
      );
      assignments=ar.rows;
    }
    return res.json({admissions:admissions.rows,assignments});
  }

  res.json({admissions:admissions.rows});
}