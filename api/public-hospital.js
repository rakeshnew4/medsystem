import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];

export default async function(req,res){
  const h=await db.query("SELECT id,name,phone,address FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.json({hospital:null,doctors:[],faqs:[]});
  const hid=h.rows[0].id;
  const [doctors,faqs]=await Promise.all([
    db.query("SELECT id,name,specialty,consultation_fee FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY name",[hid]),
    db.query("SELECT question,answer FROM hospital_faqs WHERE hospital_id=$1 AND active=true ORDER BY id",[hid])
  ]);
  res.json({hospital:h.rows[0],doctors:doctors.rows,faqs:faqs.rows});
}