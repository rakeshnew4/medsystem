import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";

export const access="user";
export const methods=["GET","POST","PUT"];

export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.patients":"action.patient.create");
 if(!ctx)return;
 const hid=ctx.hospitalId;

 if(req.method==="POST"){
  const b=req.body||{};
  const name=String(b.name||"").trim();
  const phone=String(b.phone||"").trim();
  if(!name)return res.status(400).json({error:"Patient name is required"});

  // HMIS-aligned registration guard: review likely existing identities before creating another record.
  // Current CareFlow identity fields support exact phone matching and name+DOB matching.
  const dup=await db.query(
   "SELECT p.id,p.name,p.uhid,p.phone,p.email,p.date_of_birth,p.status FROM patients p LEFT JOIN patient_identity pi ON pi.patient_id=p.id AND pi.hospital_id=p.hospital_id WHERE p.hospital_id=$1 AND ((NULLIF($2,'') IS NOT NULL AND regexp_replace(COALESCE(p.phone,''),'\\\\D','','g')=regexp_replace($2,'\\\\D','','g')) OR (LOWER(TRIM(p.name))=LOWER(TRIM($3)) AND $4::date IS NOT NULL AND p.date_of_birth=$4::date) OR (NULLIF($5,'') IS NOT NULL AND LOWER(COALESCE(pi.nic_passport,''))=LOWER($5))) ORDER BY p.created_at DESC LIMIT 10",
   [hid,phone,name,b.date_of_birth||null,String(b.nic_passport||"").trim()]
  );
  if(dup.rows.length)return res.status(409).json({error:"Possible existing patient found",code:"POSSIBLE_DUPLICATE",matches:dup.rows});

  const inserted=await db.query("INSERT INTO patients(hospital_id,name,phone,email,date_of_birth,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[hid,name,phone||null,b.email||null,b.date_of_birth||null,b.notes||null,b.status||"active"]);
  const patientId=inserted.rows[0].id;
  const r=await db.query("UPDATE patients SET uhid=COALESCE(NULLIF(uhid,''),'UHID-'||lpad(id::text,6,'0')),registration_source=$3,registration_source_locked=true WHERE id=$1 AND hospital_id=$2 RETURNING id,name,uhid,phone,email,date_of_birth,notes,status,created_at",[patientId,hid,String(b.source||"staff")]);
  await db.query("INSERT INTO patient_identity(hospital_id,patient_id,title,sex,nic_passport,alternate_phone,address,area,blood_group,occupation,emergency_contact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(patient_id) DO UPDATE SET title=EXCLUDED.title,sex=EXCLUDED.sex,nic_passport=EXCLUDED.nic_passport,alternate_phone=EXCLUDED.alternate_phone,address=EXCLUDED.address,area=EXCLUDED.area,blood_group=EXCLUDED.blood_group,occupation=EXCLUDED.occupation,emergency_contact=EXCLUDED.emergency_contact,updated_at=now()",[hid,patientId,b.title||null,b.sex||null,b.nic_passport||null,b.alternate_phone||null,b.address||null,b.area||null,b.blood_group||null,b.occupation||null,b.emergency_contact||null]);
  await logWorkflowEvent(ctx,{patientId,eventType:"patient_registered",stage:"registration",entityType:"patient",entityId:patientId,metadata:{source:b.source||"staff"}});
  return res.json(r.rows[0]);
 }

 if(req.method==="PUT"){
  const b=req.body||{};
  const r=await db.query("UPDATE patients SET name=$1,phone=$2,email=$3,date_of_birth=$4,notes=$5,status=$6,updated_at=now() WHERE id=$7 AND hospital_id=$8 RETURNING id,name,uhid,phone,email,date_of_birth,notes,status",[b.name,b.phone||null,b.email||null,b.date_of_birth||null,b.notes||null,b.status||"active",b.id,hid]);
  return res.json(r.rows[0]||{error:"Patient not found"});
 }

 // Search-first registration support. This keeps the receptionist flow close to HMIS:
 // search an existing identity before creating a new one.
 const search=String(req.query?.search||"").trim();
 if(search){
  const r=await db.query(
   `SELECT id,name,uhid,phone,email,date_of_birth,notes,status,created_at
    FROM patients
    WHERE hospital_id=$1
      AND (LOWER(name) LIKE LOWER($2) OR COALESCE(phone,'') LIKE $2 OR COALESCE(uhid,'') ILIKE $2)
    ORDER BY created_at DESC
    LIMIT 20`,
   [hid,"%"+search+"%"]
  );
  return res.json(r.rows);
 }

 // Hospital timezone is read in the same SQL request as the patient list.
 const r=await db.query(`
   SELECT p.id,p.name,p.uhid,p.phone,p.email,p.date_of_birth,p.notes,p.status,p.created_at,
   CASE WHEN a.id IS NOT NULL THEN 'ipd' ELSE 'opd' END AS care_type,
   a.id AS active_admission_id,a.admission_number,a.admission_type,
   b.ward,b.bed_number,
   q.id AS active_queue_id,q.token AS today_token,q.token_date,q.token_number,q.stage AS queue_stage,q.doctor_id AS queue_doctor_id,
   d.name AS queue_doctor_name
   FROM patients p
   JOIN hospitals h ON h.id=p.hospital_id
   LEFT JOIN admissions a ON a.patient_id=p.id AND a.hospital_id=p.hospital_id AND a.discharged_at IS NULL
   LEFT JOIN beds b ON b.id=a.bed_id
   LEFT JOIN LATERAL (
     SELECT q.*
     FROM queue_entries q
     WHERE q.hospital_id=p.hospital_id
       AND q.patient_id=p.id
       AND q.completed_at IS NULL
       AND q.token_date=(now() AT TIME ZONE h.timezone)::date
     ORDER BY q.checked_in_at DESC,q.id DESC
     LIMIT 1
   ) q ON true
   LEFT JOIN doctors d ON d.id=q.doctor_id
   WHERE p.hospital_id=$1
   ORDER BY p.created_at DESC LIMIT 300
 `,[hid]);
 res.json(r.rows);
}