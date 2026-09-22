import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";

export const access = "user";
export const methods = ["GET","POST","PUT"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.setup");
  if(!ctx)return;
  if(ctx.staff?.role!=="admin")return res.status(403).json({error:"Admin access required"});
  const hid=ctx.hospitalId;

  if(req.method==="GET"){
    const [devices,campaigns,summary]=await Promise.all([
      db.query("SELECT id,name,location,device_code,enabled,token_percent,ad_percent,ad_rotation_seconds,show_next_tokens,show_sound,layout_template,theme,footer_text,created_at FROM display_devices WHERE hospital_id=$1 ORDER BY name",[hid]),
      db.query("SELECT id,advertiser_name,title,body,media_type,media_url,click_url,active,starts_at,ends_at,priority,monthly_price,hospital_share_percent,created_at FROM display_campaigns WHERE hospital_id=$1 ORDER BY active DESC,priority,title",[hid]),
      db.query("SELECT count(*)::int AS impressions,count(DISTINCT campaign_id)::int AS campaigns FROM display_impressions WHERE hospital_id=$1 AND displayed_at>=now()-interval '30 days'",[hid])
    ]);
    return res.json({devices:devices.rows,campaigns:campaigns.rows,summary:summary.rows[0]||{impressions:0,campaigns:0}});
  }

  const b=req.body||{};
  if(req.method==="POST"){
    if(b.type==="device"){
      const r=await db.query("INSERT INTO display_devices(hospital_id,name,location,token_percent,ad_percent,ad_rotation_seconds,show_next_tokens,show_sound,layout_template,theme,footer_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[hid,String(b.name||"Reception display").slice(0,120),String(b.location||"").slice(0,120),Math.max(0,Math.min(100,Number(b.token_percent??50))),Math.max(0,Math.min(100,Number(b.ad_percent??50))),Math.max(3,Math.min(300,Number(b.ad_rotation_seconds??10))),b.show_next_tokens!==false,b.show_sound===true,"split","dark","Please keep your token ready. Follow hospital staff instructions."]);
      return res.json(r.rows[0]);
    }
    if(b.type==="campaign"){
      const r=await db.query("INSERT INTO display_campaigns(hospital_id,advertiser_name,title,body,media_type,media_url,click_url,active,starts_at,ends_at,priority,monthly_price,hospital_share_percent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",[hid,String(b.advertiser_name||"Hospital").slice(0,160),String(b.title||"Advertisement").slice(0,200),b.body||null,["text","image","video"].includes(b.media_type)?b.media_type:"text",b.media_url||null,b.click_url||null,b.active!==false,b.starts_at||null,b.ends_at||null,Number(b.priority||100),Number(b.monthly_price||0),Math.max(0,Math.min(100,Number(b.hospital_share_percent??60)))]);
      return res.json(r.rows[0]);
    }
    return res.status(400).json({error:"Unknown create type"});
  }

  if(req.method==="PUT"){
    if(b.type==="device"){
      const layouts=["split","token-focus","ad-focus","stacked","token-full","ad-full"];const themes=["dark","light","teal"];
      const r=await db.query("UPDATE display_devices SET name=$1,location=$2,enabled=$3,token_percent=$4,ad_percent=$5,ad_rotation_seconds=$6,show_next_tokens=$7,show_sound=$8,layout_template=$9,theme=$10,footer_text=$11,updated_at=now() WHERE id=$12 AND hospital_id=$13 RETURNING *",[String(b.name||"Display").slice(0,120),String(b.location||"").slice(0,120),b.enabled!==false,Math.max(0,Math.min(100,Number(b.token_percent??50))),Math.max(0,Math.min(100,Number(b.ad_percent??50))),Math.max(3,Math.min(300,Number(b.ad_rotation_seconds??10))),b.show_next_tokens!==false,b.show_sound===true,layouts.includes(b.layout_template)?b.layout_template:"split",themes.includes(b.theme)?b.theme:"dark",String(b.footer_text??"Please keep your token ready. Follow hospital staff instructions.").slice(0,300),Number(b.id),hid]);
      if(!r.rows[0])return res.status(404).json({error:"Display not found"});
      return res.json(r.rows[0]);
    }
    if(b.type==="campaign"){
      const r=await db.query("UPDATE display_campaigns SET advertiser_name=$1,title=$2,body=$3,media_type=$4,media_url=$5,click_url=$6,active=$7,starts_at=$8,ends_at=$9,priority=$10,monthly_price=$11,hospital_share_percent=$12,updated_at=now() WHERE id=$13 AND hospital_id=$14 RETURNING *",[String(b.advertiser_name||"Hospital").slice(0,160),String(b.title||"Advertisement").slice(0,200),b.body||null,["text","image","video"].includes(b.media_type)?b.media_type:"text",b.media_url||null,b.click_url||null,b.active!==false,b.starts_at||null,b.ends_at||null,Number(b.priority||100),Number(b.monthly_price||0),Math.max(0,Math.min(100,Number(b.hospital_share_percent??60))),Number(b.id),hid]);
      if(!r.rows[0])return res.status(404).json({error:"Campaign not found"});
      return res.json(r.rows[0]);
    }
  }
  return res.status(400).json({error:"Unsupported request"});
}