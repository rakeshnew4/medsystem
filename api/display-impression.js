import { db } from "hatchable";

export const access = "public";
export const methods = ["POST"];

export default async function(req,res){
  const b=req.body||{};
  const device=String(b.device||"").trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(device))return res.status(400).json({error:"Invalid display device code"});
  const r=await db.query("SELECT d.id,d.hospital_id FROM display_devices d WHERE d.device_code=$1 AND d.enabled=true",[String(b.device||"")]);
  if(!r.rows[0])return res.status(404).json({error:"Display not found"});
  const c=await db.query("SELECT id FROM display_campaigns WHERE id=$1 AND hospital_id=$2 AND active=true AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())",[Number(b.campaign_id),r.rows[0].hospital_id]);
  if(!c.rows[0])return res.status(404).json({error:"Campaign not active"});
  await db.query("INSERT INTO display_impressions(hospital_id,device_id,campaign_id,duration_seconds) VALUES($1,$2,$3,$4)",[r.rows[0].hospital_id,r.rows[0].id,c.rows[0].id,Math.max(0,Math.min(3600,Number(b.duration_seconds||0)))]);
  return res.json({ok:true});
}