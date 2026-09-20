import { db } from "hatchable";
import { requireStaff } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
  const ctx=await requireStaff(req,res);
  if(!ctx)return;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.ward||!b.bed_number)return res.status(400).json({error:"Ward and bed number are required"});
    const r=await db.query("INSERT INTO beds(hospital_id,ward,bed_number,bed_type,status,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[ctx.hospitalId,b.ward,b.bed_number,b.bed_type||"general",b.status||"available",b.notes||null]);
    return res.json(r.rows[0]);
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    if(b.action==="discharge"){
      const r=await db.query("UPDATE admissions SET discharged_at=now(),status='discharged',updated_at=now() WHERE id=$1 AND hospital_id=$2 AND discharged_at IS NULL RETURNING id,bed_id,patient_id",[b.id,ctx.hospitalId]);
      if(r.rows[0]) await db.query("UPDATE beds SET status='available',updated_at=now() WHERE id=$1 AND hospital_id=$2",[r.rows[0].bed_id,ctx.hospitalId]);
      return res.json(r.rows[0]||{error:"Admission not found"});
    }
    if(b.action==="admit"){
      if(!b.patient_id||!b.bed_id)return res.status(400).json({error:"Patient and bed are required"});
      const check=await db.query("SELECT id,status FROM beds WHERE id=$1 AND hospital_id=$2",[b.bed_id,ctx.hospitalId]);
      if(!check.rows[0])return res.status(404).json({error:"Bed not found"});
      if(check.rows[0].status!=="available")return res.status(409).json({error:"Bed is not available"});
      const r=await db.query("INSERT INTO admissions(hospital_id,patient_id,bed_id,admitting_doctor_id,expected_discharge_date,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[ctx.hospitalId,b.patient_id,b.bed_id,b.doctor_id||null,b.expected_discharge_date||null,b.notes||null]);
      await db.query("UPDATE beds SET status='occupied',updated_at=now() WHERE id=$1",[b.bed_id]);
      return res.json(r.rows[0]);
    }
    const r=await db.query("UPDATE beds SET status=$1,notes=$2,updated_at=now() WHERE id=$3 AND hospital_id=$4 RETURNING *",[b.status,b.notes||null,b.id,ctx.hospitalId]);
    return res.json(r.rows[0]||{error:"Bed not found"});
  }
  const r=await db.query("SELECT b.*,a.id AS admission_id,a.patient_id,a.admitted_at,a.expected_discharge_date,p.name AS patient_name,p.phone,p.date_of_birth,d.name AS doctor_name,(SELECT count(*)::int FROM doctor_visits v WHERE v.patient_id=a.patient_id AND v.hospital_id=$1) AS visit_count,(SELECT count(*)::int FROM medications m WHERE m.patient_id=a.patient_id AND m.hospital_id=$1) AS medicine_count,(SELECT count(*)::int FROM clinical_reports cr WHERE cr.patient_id=a.patient_id AND cr.hospital_id=$1) AS report_count FROM beds b LEFT JOIN admissions a ON a.bed_id=b.id AND a.discharged_at IS NULL LEFT JOIN patients p ON p.id=a.patient_id LEFT JOIN doctors d ON d.id=a.admitting_doctor_id WHERE b.hospital_id=$1 ORDER BY b.ward,b.bed_number",[ctx.hospitalId]);
  res.json(r.rows);
}