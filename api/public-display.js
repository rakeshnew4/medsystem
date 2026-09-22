import { db } from "hatchable";

export const access = "public";
export const methods = ["GET"];

export default async function(req,res){
  const code=String(req.query?.device||"").trim();
  if(!code)return res.status(400).json({error:"device is required"});
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code))return res.status(400).json({error:"Invalid display device code"});
  const d=await db.query("SELECT d.id,d.hospital_id,d.name,d.location,d.token_percent,d.ad_percent,d.ad_rotation_seconds,d.show_next_tokens,d.show_sound,h.name AS hospital_name FROM display_devices d JOIN hospitals h ON h.id=d.hospital_id WHERE d.device_code=$1 AND d.enabled=true LIMIT 1",[code]);
  if(!d.rows[0])return res.status(404).json({error:"Display not found or disabled"});
  const device=d.rows[0];
  const [queue,ads]=await Promise.all([
    db.query("SELECT q.id,q.token,q.stage,q.doctor_id,COALESCE(doc.name,'') AS doctor_name,COALESCE(doc.display_room,'') AS room FROM queue_entries q LEFT JOIN doctors doc ON doc.id=q.doctor_id WHERE q.hospital_id=$1 AND q.token_date=current_date AND q.stage NOT IN ('completed','cancelled') ORDER BY q.token_number LIMIT 20",[device.hospital_id]),
    db.query("SELECT id,advertiser_name,title,body,media_type,media_url,click_url,priority FROM display_campaigns WHERE hospital_id=$1 AND active=true AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now()) ORDER BY priority ASC,title",[device.hospital_id])
  ]);
  return res.json({device:{id:device.id,name:device.name,location:device.location,token_percent:device.token_percent,ad_percent:device.ad_percent,ad_rotation_seconds:device.ad_rotation_seconds,show_next_tokens:device.show_next_tokens,show_sound:device.show_sound,hospital_name:device.hospital_name},queue:queue.rows,ads:ads.rows});
}