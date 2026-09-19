import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];

export default async function(req,res){
  const doctorId=req.query.doctor_id;
  const date=req.query.date;
  if(!doctorId||!date) return res.status(400).json({error:"doctor_id and date are required"});
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.json({slots:[]});
  const booked=await db.query("SELECT appointment_time FROM appointments WHERE hospital_id=$1 AND doctor_id=$2 AND appointment_date=$3 AND status <> 'cancelled'",[h.rows[0].id,doctorId,date]);
  const taken=new Set(booked.rows.map(x=>String(x.appointment_time).slice(0,5)));
  const slots=[];
  for(let hour=9;hour<18;hour++){
    for(const minute of [0,30]){
      const t=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
      if(!taken.has(t)) slots.push(t);
    }
  }
  res.json({slots});
}