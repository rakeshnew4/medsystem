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
      if(!b.id)return res.status(400).json({error:"Admission is required"});

      // Discharge is one atomic room-discharge transition. The admission, checklist
      // and current bed are locked before any state changes. The guard requires every
      // discharge gate to be satisfied, so a concurrent request cannot release the
      // bed while another request is still changing the checklist.
      const tx=await db.transaction([{
        sql:`WITH locked_admission AS (
          SELECT id,bed_id,patient_id,admitting_doctor_id
          FROM admissions
          WHERE id=$1 AND hospital_id=$2 AND discharged_at IS NULL
          FOR UPDATE
        ),
        locked_checklist AS (
          SELECT d.id, d.admission_id, d.clinical_clearance, d.reports_ready,
                 d.medication_reconciled, d.billing_cleared,
                 d.insurance_status, d.payment_status, d.discharge_medicines, d.summary
          FROM discharge_checklists d
          JOIN locked_admission a ON a.id=d.admission_id
          WHERE d.hospital_id=$2
          FOR UPDATE
        ),
        locked_bed AS (
          SELECT b.id,b.status
          FROM beds b
          JOIN locked_admission a ON a.bed_id=b.id
          WHERE b.hospital_id=$2
          FOR UPDATE
        ),
        ready AS (
          SELECT a.id,a.patient_id,a.bed_id,a.admitting_doctor_id,c.id AS encounter_id,
                 COALESCE(d.summary,$3) AS discharge_summary
          FROM locked_admission a
          JOIN locked_checklist d ON d.admission_id=a.id
          LEFT JOIN locked_bed bed ON bed.id=a.bed_id
          LEFT JOIN care_encounters c
            ON c.admission_id=a.id AND c.hospital_id=$2 AND c.status='open'
          WHERE d.clinical_clearance
            AND d.reports_ready
            AND d.medication_reconciled
            AND d.billing_cleared
            AND (
              d.payment_status='paid'
              OR (d.payment_status='approved' AND d.insurance_status='approved')
            )
            AND (a.bed_id IS NULL OR bed.status='occupied')
        ),
        changed_admission AS (
          UPDATE admissions a
          SET discharged_at=now(),
              status='discharged',
              discharge_summary=r.discharge_summary,
              discharge_doctor_id=COALESCE($4,r.admitting_doctor_id),
              updated_at=now()
          FROM ready r
          WHERE a.id=r.id AND a.hospital_id=$2
          RETURNING a.id,a.patient_id,a.bed_id,r.encounter_id
        ),
        completed_encounter AS (
          UPDATE care_encounters c
          SET status='completed',
              ended_at=COALESCE(c.ended_at,now()),
              current_stage='discharge',
              updated_at=now()
          FROM changed_admission a
          WHERE c.admission_id=a.id AND c.hospital_id=$2 AND c.status='open'
          RETURNING c.id
        ),
        released_assignments AS (
          UPDATE bed_assignments ba
          SET released_at=now()
          FROM changed_admission a
          WHERE ba.admission_id=a.id AND ba.hospital_id=$2 AND ba.released_at IS NULL
          RETURNING ba.id
        ),
        released_bed AS (
          UPDATE beds b
          SET status='available',updated_at=now()
          FROM changed_admission a
          WHERE a.bed_id IS NOT NULL
            AND b.id=a.bed_id AND b.hospital_id=$2 AND b.status='occupied'
          RETURNING b.id
        ),
        discharge_event AS (
          INSERT INTO workflow_events(
            hospital_id,patient_id,encounter_id,event_type,stage,
            actor_user_id,actor_staff_id,entity_type,entity_id,metadata
          )
          SELECT $2,a.patient_id,COALESCE(a.encounter_id,ce.id),
                 'ipd_discharged','discharge',$5,$6,'admission',a.id,
                 jsonb_build_object('bed_id',a.bed_id)
          FROM changed_admission a
          LEFT JOIN completed_encounter ce ON ce.id=a.encounter_id
          RETURNING id
        )
        SELECT
          (SELECT count(*) FROM locked_admission) AS admission_count,
          (SELECT count(*) FROM locked_checklist) AS checklist_count,
          (SELECT count(*) FROM locked_bed) AS bed_count,
          (SELECT count(*) FROM ready) AS ready_count,
          (SELECT count(*) FROM changed_admission) AS discharged_count,
          (SELECT patient_id FROM changed_admission LIMIT 1) AS patient_id,
          (SELECT bed_id FROM changed_admission LIMIT 1) AS bed_id
        `,
        params:[
          Number(b.id),
          ctx.hospitalId,
          b.discharge_summary||null,
          b.discharge_doctor_id||null,
          ctx.user?.id||ctx.user?.email||null,
          ctx.staff?.id||null
        ]
      }]);

      const result=tx.results?.[0]?.rows?.[0]||{};
      if(Number(result.admission_count||0)!==1)return res.status(404).json({error:"Active admission not found"});
      if(Number(result.checklist_count||0)!==1)return res.status(409).json({error:"Discharge checklist is required before discharge"});
      if(Number(result.bed_count||0)===0 && result.bed_id!==null && result.bed_id!==undefined)return res.status(409).json({error:"Current bed could not be verified"});
      if(Number(result.ready_count||0)!==1)return res.status(409).json({error:"Discharge checklist is incomplete or payment/insurance approval is missing"});
      return res.json({
        id:Number(b.id),
        patient_id:result.patient_id,
        status:"discharged",
        bed_id:result.bed_id==null?null:Number(result.bed_id)
      });
    }

    if(b.action==="transfer"){
      if(!b.id||!b.new_bed_id)return res.status(400).json({error:"Admission and new bed are required"});
      const a=await db.query(
        "SELECT id,bed_id,patient_id FROM admissions WHERE id=$1 AND hospital_id=$2 AND discharged_at IS NULL",
        [b.id,ctx.hospitalId]
      );
      if(!a.rows[0])return res.status(404).json({error:"Active admission not found"});
      const admission=a.rows[0];
      if(Number(admission.bed_id||0)===Number(b.new_bed_id)){
        return res.status(409).json({error:"Patient is already assigned to this bed"});
      }

      // Perform the entire room change in one transaction. The CTE first locks
      // both beds in deterministic order, then every mutation is gated by the
      // new bed being available. If it is not available, zero rows are changed.
      const transfer=await db.transaction([{
        sql:`WITH locked AS (
          SELECT id,status
          FROM beds
          WHERE hospital_id=$1 AND id IN ($2,$3)
          ORDER BY id
          FOR UPDATE
        ),
        guard AS (
          SELECT 1
          FROM locked
          WHERE id=$3 AND status='available'
        ),
        released_assignment AS (
          UPDATE bed_assignments
          SET released_at=now(),reason=$4
          WHERE admission_id=$5 AND hospital_id=$1 AND bed_id=$2 AND released_at IS NULL
            AND EXISTS (SELECT 1 FROM guard)
          RETURNING id
        ),
        released_bed AS (
          UPDATE beds
          SET status='available',updated_at=now()
          WHERE id=$2 AND hospital_id=$1
            AND EXISTS (SELECT 1 FROM guard)
          RETURNING id
        ),
        changed_admission AS (
          UPDATE admissions
          SET bed_id=$3,updated_at=now()
          WHERE id=$5 AND hospital_id=$1 AND discharged_at IS NULL
            AND EXISTS (SELECT 1 FROM guard)
          RETURNING id
        ),
        new_assignment AS (
          INSERT INTO bed_assignments(hospital_id,admission_id,bed_id,reason)
          SELECT $1,$5,$3,$4
          WHERE EXISTS (SELECT 1 FROM guard)
          RETURNING id
        ),
        occupied_bed AS (
          UPDATE beds
          SET status='occupied',updated_at=now()
          WHERE id=$3 AND hospital_id=$1
            AND EXISTS (SELECT 1 FROM guard)
          RETURNING id
        )
        SELECT
          (SELECT COUNT(*) FROM locked) AS locked_count,
          (SELECT COUNT(*) FROM guard) AS available_count,
          (SELECT COUNT(*) FROM new_assignment) AS assignment_count`,
        params:[ctx.hospitalId,admission.bed_id,b.new_bed_id,b.reason||"Bed transfer",admission.id]
      }]);
      const result=transfer.results?.[0]?.rows?.[0]||{};
      if(Number(result.locked_count||0)<(admission.bed_id?2:1))return res.status(404).json({error:"New bed not found"});
      if(Number(result.available_count||0)!==1)return res.status(409).json({error:"New bed is not available"});
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
          sql:"SELECT id,status FROM beds WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
          params:[b.bed_id,ctx.hospitalId]
        },
        {
          sql:"INSERT INTO admissions(id,hospital_id,patient_id,bed_id,admitting_doctor_id,expected_discharge_date,admission_type,notes,admission_number) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 FROM beds WHERE id=$4 AND hospital_id=$2 AND status='available'",
          params:[admissionId,ctx.hospitalId,b.patient_id,b.bed_id,b.doctor_id||null,b.expected_discharge_date||null,b.admission_type||"general",b.notes||null,admissionNumberValue]
        },
        {
          sql:"INSERT INTO care_encounters(hospital_id,patient_id,encounter_type,admission_id,doctor_id,status,reason) SELECT $1,$2,'ipd',$3,$4,'open',$5 FROM admissions WHERE id=$3 AND hospital_id=$1",
          params:[ctx.hospitalId,b.patient_id,admissionId,b.doctor_id||null,b.reason||"Inpatient admission"]
        },
        {
          sql:"INSERT INTO bed_assignments(hospital_id,admission_id,bed_id,reason) SELECT $1,$2,$3,$4 FROM admissions WHERE id=$2 AND hospital_id=$1",
          params:[ctx.hospitalId,admissionId,b.bed_id,"Initial admission"]
        },
        {
          sql:"UPDATE beds SET status='occupied',updated_at=now() WHERE id=$1 AND hospital_id=$2 AND EXISTS (SELECT 1 FROM admissions WHERE id=$3 AND hospital_id=$2)",
          params:[b.bed_id,ctx.hospitalId,admissionId]
        }
      ]);
      const admission=await db.query("SELECT * FROM admissions WHERE id=$1 AND hospital_id=$2",[admissionId,ctx.hospitalId]);
      if(!admission.rows[0])return res.status(409).json({error:"Bed is no longer available; admission was not created"});
      const encounter=await db.query("SELECT id FROM care_encounters WHERE admission_id=$1 AND hospital_id=$2 ORDER BY id DESC LIMIT 1",[admissionId,ctx.hospitalId]);
      await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId:encounter.rows[0]?.id||null,eventType:"ipd_admitted",stage:"ipd",entityType:"admission",entityId:admissionId,metadata:{bed_id:b.bed_id,admission_type:b.admission_type||"general"}});
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