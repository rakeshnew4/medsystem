import { db } from "../../lib/db.js";

export const access="public";
export const methods=["GET"];

const min=t=>{if(!t)return null;const p=String(t).slice(0,5).split(":").map(Number);return p[0]*60+p[1]};
const time=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");

async function hospitalFor(slug){
  const q=slug
    ? await db.query("SELECT id FROM hospitals WHERE public_slug=$1 LIMIT 1",[slug])
    : await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  return q.rows[0]?.id||null;
}

export default async function(req,res){
  const doctorId=Number(req.query.doctor_id||0);
  const date=String(req.query.date||"");
  const type=String(req.query.type||"in_person")==="online"?"online":"in_person";
  if(!doctorId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return res.status(400).json({error:"doctor_id and a valid date are required"});
  const hid=await hospitalFor(String(req.query.slug||"").trim().toLowerCase());
  if(!hid)return res.status(404).json({error:"Hospital is not configured"});

  const doctor=await db.query("SELECT id,name,specialty,online_consultation_enabled FROM doctors WHERE id=$1 AND hospital_id=$2 AND active=true",[doctorId,hid]);
  if(!doctor.rows[0])return res.status(404).json({error:"Doctor is not available"});
  if(type==="online"&&!doctor.rows[0].online_consultation_enabled)return res.json({slots:[],doctor:doctor.rows[0],consultation_type:type});

  const d=new Date(date+"T12:00:00Z"),dow=d.getUTCDay();
  const [rules,exceptions,presence,booked]=await Promise.all([
    db.query("SELECT * FROM doctor_availability_rules WHERE hospital_id=$1 AND doctor_id=$2 AND day_of_week=$3 AND active=true AND (appointment_type=$4 OR appointment_type='opd') ORDER BY start_time",[hid,doctorId,dow,type==="online"?"online":"opd"]),
    db.query("SELECT * FROM doctor_availability_exceptions WHERE hospital_id=$1 AND doctor_id=$2 AND exception_date=$3 ORDER BY start_time",[hid,doctorId,date]),
    db.query("SELECT sp.* FROM staff_presence sp JOIN staff_profiles s ON s.id=sp.staff_id WHERE sp.hospital_id=$1 AND s.doctor_id=$2",[hid,doctorId]),
    db.query("SELECT appointment_time FROM appointments WHERE hospital_id=$1 AND doctor_id=$2 AND appointment_date=$3 AND status <> 'cancelled'",[hid,doctorId,date])
  ]);
  let windows=rules.rows.map(r=>({start:min(r.start_time),end:min(r.end_time),duration:Number(r.slot_duration_minutes||15)}));
  if(!windows.length)windows=[{start:9*60,end:18*60,duration:30}];

  for(const e of exceptions.rows){
    const s=e.start_time?min(e.start_time):0,en=e.end_time?min(e.end_time):24*60;
    if(["leave","unavailable","closed"].includes(String(e.exception_type).toLowerCase())){
      windows=windows.flatMap(w=>w.end<=s||w.start>=en?[w]:[{...w,end:Math.min(w.end,s)},{...w,start:Math.max(w.start,en)}].filter(x=>x.start<x.end));
    }else if(String(e.exception_type).toLowerCase()==="extra"&&e.start_time&&e.end_time)windows.push({start:s,end:en,duration:30});
  }

  const p=presence.rows[0];
  const blocked=["lunch","outside","meeting","unavailable","off_duty","custom"].includes(p?.status);
  if(blocked&&date===new Date().toISOString().slice(0,10)){
    const until=p.expected_until?new Date(p.expected_until):null;
    const untilMin=until?until.getHours()*60+until.getMinutes():24*60;
    const now=new Date(),nowMin=now.getHours()*60+now.getMinutes();
    const endBlock=until&&untilMin>nowMin?untilMin:24*60;
    windows=windows.flatMap(w=>w.end<=nowMin||w.start>=endBlock?[w]:[{...w,end:Math.min(w.end,nowMin)},{...w,start:Math.max(w.start,endBlock)}].filter(x=>x.start<x.end));
  }

  const taken=new Set(booked.rows.map(x=>String(x.appointment_time).slice(0,5)));
  const slots=[];
  for(const w of windows)for(let m=w.start;m+w.duration<=w.end;m+=w.duration){
    const t=time(m);
    if(!taken.has(t))slots.push(t);
  }
  res.json({slots,doctor:doctor.rows[0],consultation_type:type,availability:{rules:rules.rows,exceptions:exceptions.rows,presence:p||null}});
}