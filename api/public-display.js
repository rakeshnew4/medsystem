import { db } from "hatchable";
import { hospitalLocalDate } from "../lib/opd.js";

export const access="public";
export const methods=["GET"];

function mins(v){return Math.max(0,Math.round(Number(v)||0))}
function rangeFor(base){
  const b=mins(base||15);
  return {min:Math.max(3,Math.round(b*0.85)),max:Math.max(5,Math.round(b*1.25))};
}

export default async function(req,res){
  const h=await db.query("SELECT id,name,phone,address,timezone FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(404).json({error:"Hospital not configured"});
  const hospital=h.rows[0];
  const date=await hospitalLocalDate(hospital.id);

  const [queues, doctors, durations]=await Promise.all([
    db.query(
      "SELECT q.id,q.token,q.token_number,q.stage,q.doctor_id,q.checked_in_at,q.started_at,d.name AS doctor_name,d.specialty,d.display_room FROM queue_entries q LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.token_date=$2 AND q.completed_at IS NULL ORDER BY q.token_number",
      [hospital.id,date]
    ),
    db.query(
      "SELECT d.id,d.name,d.specialty,d.display_room FROM doctors d WHERE d.hospital_id=$1 AND d.active=true ORDER BY d.name,d.id",
      [hospital.id]
    ),
    db.query(
      "SELECT doctor_id,percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at-started_at))/60.0) AS median_minutes,COUNT(*)::int AS sample_size FROM doctor_visits WHERE hospital_id=$1 AND visit_status='completed' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at>started_at AND ended_at-started_at BETWEEN interval '3 minutes' AND interval '90 minutes' GROUP BY doctor_id",
      [hospital.id]
    )
  ]);

  const byDoctor=new Map();
  for(const q of queues.rows) if(q.doctor_id){
    if(!byDoctor.has(Number(q.doctor_id)))byDoctor.set(Number(q.doctor_id),[]);
    byDoctor.get(Number(q.doctor_id)).push(q);
  }
  const durationMap=new Map(durations.rows.map(x=>[Number(x.doctor_id),mins(x.median_minutes||15)]));
  const activeDoctorIds=[...byDoctor.keys()];
  const displayDoctors=[];
  const seenNames=new Set();

  for(const d of doctors.rows.sort((a,b)=>{
    const aq=activeDoctorIds.includes(Number(a.id))?0:1,bq=activeDoctorIds.includes(Number(b.id))?0:1;
    return aq-bq || String(a.name).localeCompare(String(b.name));
  })){
    const key=String(d.name||"").trim().toLowerCase()+"|"+String(d.specialty||"").trim().toLowerCase();
    if(seenNames.has(key))continue;
    seenNames.add(key);
    const list=byDoctor.get(Number(d.id))||[];
    const doctorMins=durationMap.get(Number(d.id))||15;
    const current=list.find(x=>x.stage==="doctor")||null;
    const next=list.find(x=>x.stage!=="completed" && x.stage!=="doctor")||null;
    const upcoming=list.filter(x=>x.stage!=="completed").slice(0,4).map(x=>x.token);
    displayDoctors.push({
      id:d.id,name:d.name,specialty:d.specialty,room:d.display_room||null,
      current_token:current?.token||null,next_token:next?.token||null,upcoming,
      estimated_wait:next?rangeFor((list.filter(x=>x.token_number<next.token_number&&x.stage!=="completed").length*doctorMins)+(current?doctorMins:0)):null,
      average_consultation_minutes:doctorMins,has_active_queue:list.length>0
    });
    if(displayDoctors.length>=8)break;
  }

  res.json({
    hospital:{name:hospital.name,phone:hospital.phone,address:hospital.address},
    token_date:date,updated_at:new Date().toISOString(),
    queue:queues.rows.filter(x=>x.stage==="waiting").map(x=>x.token),
    vitals:queues.rows.filter(x=>x.stage==="vitals").map(x=>x.token),
    doctors:displayDoctors,
    upcoming:queues.rows.filter(x=>["waiting","vitals","doctor"].includes(x.stage)).slice(0,10).map(x=>({token:x.token,stage:x.stage,doctor:x.doctor_name||null}))
  });
}