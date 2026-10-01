import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";

export const access="user";
export const methods=["GET","POST","PUT"];

function admissionNumber(id){
  return "IPD-"+String(id).padStart(6,"0");
}

export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.beds":"action.beds.manage");
  if(!ctx)return;

  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.ward||!b.bed_number)return res.status(400).json({error:"Ward and bed number are required"});
    try{
      const r=await db.query(
        "INSERT INTO beds(hospital_id,ward,bed_number,bed_type,status,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [ctx.hospitalId,b.ward,b.bed_number,b.bed_type||"general",b.status||"available",b.notes||null]
      );
      return res.json(r.rows[0]);
    }catch(e){
      if(String(e.message||"").toLowerCase().includes("duplicate"))return res.status(409).json({error:"A bed with this ward and bed number already exists"});
      throw e;
    }
  }

  if(req.method==="PUT"){
    const b=req.body||{};

    if(b.action==="edit-bed"){
      if(!b.id||!b.ward||!b.bed_number)return res.status(400).json({error:"Bed, ward and bed number are required"});
      const current=await db.query("SELECT status FROM beds WHERE id=$1 AND hospital_id=$2",[b.id,ctx.hospitalId]);
      if(!current.rows[0])return res.status(404).json({error:"Bed not found"});
      if(current.rows[0].status==="occupied")return res.status(409).json({error:"Occupied beds cannot be renamed or moved. Transfer/discharge the patient first."});
      const r=await db.query(
        "UPDATE beds SET ward=$1,bed_number=$2,bed_type=$3,notes=$4,updated_at=now() WHERE id=$5 AND hospital_id=$6 RETURNING *",
        [b.ward,b.bed_number,b.bed_type||"general",b.notes||null,b.id,ctx.hospitalId]
      );
      return res.json(r.rows[0]||{error:"Bed not found"});
    }

    if(b.action==="set-bed-status"){
      const allowed=["available","maintenance","blocked"];
      if(!allowed.includes(b.status))return res.status(400).json({error:"Invalid bed status"});
      const check=await db.query("SELECT status FROM beds WHERE id=$1 AND hospital_id=$2",[b.id,ctx.hospitalId]);
      if(!check.rows[0])return res.status(404).json({error:"Bed not found"});
      if(check.rows[0].status==="occupied")return res.status(409).json({error:"Occupied beds can only be released by discharge or transfer"});
      const r=await db.query("UPDATE beds SET status=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3 RETURNING *",[b.status,b.id,ctx.hospitalId]);
      return res.json(r.rows[0]);
    }

    if(b.action==="discharge"){
      const a=await db.query(
        "SELECT id,bed_id,patient_id,admitting_doctor_id FROM admissions WHERE id=$1 AND hospital_id=$2 AND discharged_at IS NULL",
        [b.id,ctx.hospitalId]
      );
      if(!a.rows[0])return res.status(404).json({error:"Active admission not found"});
      const admission=a.rows[0];

      await db.query(
        "UPDATE admissions SET discharged_at=now(),status='discharged',discharge_summary=$1,discharge_doctor_id=$2,updated_at=now() WHERE id=$3 AND hospital_id=$4",
        [b.discharge_summary||null,b.discharge_doctor_id||admission.admitting_doctor_id||null,admission.id,ctx.hospitalId]
      );
      await db.query(
        "UPDATE care_encounters SET status='completed',ended_at=COALESCE(ended_at,now()),updated_at=now() WHERE admission_id=$1 AND hospital_id=$2 AND status='open'",
        [admission.id,ctx.hospitalId]
      );
      await db.query(
        "UPDATE bed_assignments SET released_at=now() WHERE admission_id=$1 AND hospital_id=$2 AND released_at IS NULL",
        [admission.id,ctx.hospitalId]
      );
      if(admission.bed_id){
        await db.query(
          "UPDATE beds SET status='available',updated_at=now() WHERE id=$1 AND hospital_id=$2",
          [admission.bed_id,ctx.hospitalId]
        );
      }
      await logWorkflowEvent(ctx,{patientId:admission.patient_id,eventType:"ipd_discharged",stage:"discharge",entityType:"admission",entityId:admission.id,metadata:{bed_id:admission.bed_id}});
      return res.json({id:admission.id,patient_id:admission.patient_id,status:"discharged",bed_id:admission.bed_id});
    }

    if(b.action==="transfer"){
      if(!b.id||!b.new_bed_id)return res.status(400).json({error:"Admission and new bed are required"});
      const a=await db.query(
        "SELECT id,bed_id,patient_id FROM admissions WHERE id=$1 AND hospital_id=$2 AND discharged_at IS NULL",
        [b.id,ctx.hospitalId]
      );
      if(!a.rows[0])return res.status(404).json({error:"Active admission not found"});
      const admission=a.rows[0];
      const bed=await db.query("SELECT id,status FROM beds WHERE id=$1 AND hospital_id=$2",[b.new_bed_id,ctx.hospitalId]);
      if(!bed.rows[0])return res.status(404).json({error:"New bed not found"});
      if(bed.rows[0].status!=="available")return res.status(409).json({error:"New bed is not available"});

      if(admission.bed_id){
        await db.query("UPDATE bed_assignments SET released_at=now(),reason=$1 WHERE admission_id=$2 AND bed_id=$3 AND released_at IS NULL",[b.reason||"Bed transfer",admission.id,admission.bed_id]);
        await db.query("UPDATE beds SET status='available',updated_at=now() WHERE id=$1 AND hospital_id=$2",[admission.bed_id,ctx.hospitalId]);
      }
      await db.query("UPDATE admissions SET bed_id=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3",[b.new_bed_id,admission.id,ctx.hospitalId]);
      await db.query("INSERT INTO bed_assignments(hospital_id,admission_id,bed_id,reason) VALUES($1,$2,$3,$4)",[ctx.hospitalId,admission.id,b.new_bed_id,b.reason||"Bed transfer"]);
      await db.query("UPDATE beds SET status='occupied',updated_at=now() WHERE id=$1 AND hospital_id=$2",[b.new_bed_id,ctx.hospitalId]);
      await logWorkflowEvent(ctx,{patientId:admission.patient_id,eventType:"bed_transferred",stage:"ipd",entityType:"admission",entityId:admission.id,metadata:{from_bed_id:admission.bed_id,to_bed_id:b.new_bed_id,reason:b.reason||"Bed transfer"}});
      return res.json({id:admission.id,bed_id:b.new_bed_id,patient_id:admission.patient_id});
    }

    if(b.action==="admit"){
      if(!b.patient_id||!b.bed_id)return res.status(400).json({error:"Patient and bed are required"});
      const patient=await db.query("SELECT id,name FROM patients WHERE id=$1 AND hospital_id=$2",[b.patient_id,ctx.hospitalId]);
      if(!patient.rows[0])return res.status(404).json({error:"Patient not found"});
      const existing=await db.query("SELECT id,bed_id FROM admissions WHERE patient_id=$1 AND hospital_id=$2 AND discharged_at IS NULL",[b.patient_id,ctx.hospitalId]);
      if(existing.rows[0])return res.status(409).json({error:"Patient is already admitted",admission_id:existing.rows[0].id,bed_id:existing.rows[0].bed_id});
      const check=await db.query("SELECT id,status FROM beds WHERE id=$1 AND hospital_id=$2",[b.bed_id,ctx.hospitalId]);
      if(!check.rows[0])return res.status(404).json({error:"Bed not found"});
      if(check.rows[0].status!=="available")return res.status(409).json({error:"Bed is not available"});

      // Reserve the admission id first so every dependent write can run in one DB transaction.
      // The sequence is independent from row locks, so concurrent admissions still receive distinct ids.
      const seq=await db.query("SELECT nextval('admissions_id_seq') AS id");
      const admissionId=Number(seq.rows[0].id);
      const admissionNumberValue=admissionNumber(admissionId);
      const tx=await db.transaction([
        {
          sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM beds WHERE id=$1 AND hospital_id=$2 AND status='available' FOR UPDATE) THEN 1 ELSE CAST('bed_unavailable' AS integer) END AS ready",
          params:[b.bed_id,ctx.hospitalId]
        },
        {
          sql:"INSERT INTO admissions(id,hospital_id,patient_id,bed_id,admitting_doctor_id,expected_discharge_date,admission_type,notes,admission_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          params:[admissionId,ctx.hospitalId,b.patient_id,b.bed_id,b.doctor_id||null,b.expected_discharge_date||null,b.admission_type||"general",b.notes||null,admissionNumberValue]
        },
        {
          sql:"INSERT INTO care_encounters(hospital_id,patient_id,encounter_type,admission_id,doctor_id,status,reason) VALUES($1,$2,'ipd',$3,$4,'open',$5)",
          params:[ctx.hospitalId,b.patient_id,admissionId,b.doctor_id||null,b.reason||"Inpatient admission"]
        },
        {
          sql:"INSERT INTO bed_assignments(hospital_id,admission_id,bed_id,reason) VALUES($1,$2,$3,$4)",
          params:[ctx.hospitalId,admissionId,b.bed_id,"Initial admission"]
        },
        {
          sql:"UPDATE beds SET status='occupied',updated_at=now() WHERE id=$1 AND hospital_id=$2",
          params:[b.bed_id,ctx.hospitalId]
        }
      ]);
      const encounter=await db.query("SELECT id FROM care_encounters WHERE admission_id=$1 AND hospital_id=$2 ORDER BY id DESC LIMIT 1",[admissionId,ctx.hospitalId]);
      await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId:encounter.rows[0]?.id||null,eventType:"ipd_admitted",stage:"ipd",entityType:"admission",entityId:admissionId,metadata:{bed_id:b.bed_id,admission_type:b.admission_type||"general"}});
      const admission=await db.query("SELECT * FROM admissions WHERE id=$1 AND hospital_id=$2",[admissionId,ctx.hospitalId]);
      return res.json({...admission.rows[0],admission_number:admissionNumberValue,encounter_id:encounter.rows[0]?.id||null});
    }

    const r=await db.query(
      "UPDATE beds SET status=$1,notes=$2,updated_at=now() WHERE id=$3 AND hospital_id=$4 AND status<>'occupied' RETURNING *",
      [b.status,b.notes||null,b.id,ctx.hospitalId]
    );
    return res.json(r.rows[0]||{error:"Bed not found or occupied"});
  }

  const r=await db.query(
    `SELECT b.*,
      a.id AS admission_id,a.admission_number,a.admission_type,a.patient_id,a.admitted_at,a.expected_discharge_date,
      a.status AS admission_status,a.notes AS admission_notes,
      p.name AS patient_name,p.phone,p.email,p.date_of_birth,p.status AS patient_status,
      d.name AS doctor_name,
      (SELECT count(*)::int FROM doctor_visits v WHERE v.patient_id=a.patient_id AND v.hospital_id=$1) AS visit_count,
      (SELECT count(*)::int FROM medications m WHERE m.patient_id=a.patient_id AND m.hospital_id=$1) AS medicine_count,
      (SELECT count(*)::int FROM clinical_reports cr WHERE cr.patient_id=a.patient_id AND cr.hospital_id=$1) AS report_count,
      (SELECT ba.id FROM bed_assignments ba WHERE ba.admission_id=a.id AND ba.released_at IS NULL ORDER BY ba.assigned_at DESC LIMIT 1) AS active_assignment_id
    FROM beds b
    LEFT JOIN admissions a ON a.bed_id=b.id AND a.discharged_at IS NULL
    LEFT JOIN patients p ON p.id=a.patient_id
    LEFT JOIN doctors d ON d.id=a.admitting_doctor_id
    WHERE b.hospital_id=$1
    ORDER BY b.ward,b.bed_number`,
    [ctx.hospitalId]
  );
  res.json(r.rows);
}