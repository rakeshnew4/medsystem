import { db } from "hatchable";

export const access="public";
export const methods=["GET"];

export default async function(req,res){
  const slug=String(req.query?.slug||"").trim().toLowerCase();
  const q=slug
    ? await db.query("SELECT id,name,phone,address,timezone,public_slug FROM hospitals WHERE public_slug=$1 LIMIT 1",[slug])
    : await db.query("SELECT id,name,phone,address,timezone,public_slug FROM hospitals ORDER BY id LIMIT 1");
  const h=q.rows[0];
  if(!h)return res.status(404).json({error:"Hospital is not configured"});
  const [doctors,faqs]=await Promise.all([
    db.query("SELECT id,name,specialty,consultation_fee,display_room,online_consultation_enabled FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY name",[h.id]),
    db.query("SELECT question,answer FROM hospital_faqs WHERE hospital_id=$1 AND active=true ORDER BY id",[h.id])
  ]);
  res.json({hospital:h,doctors:doctors.rows,faqs:faqs.rows});
}