import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET","PUT"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.setup.manage");
  if(!ctx)return;
  const hid=ctx.hospitalId;
  if(!hid)return res.status(400).json({error:"Hospital is not configured yet"});

  if(req.method==="GET"){
    const [h,settings,features,modules,labels,services,hours]=await Promise.all([
      db.query("SELECT id,name,phone,address,timezone FROM hospitals WHERE id=$1",[hid]),
      db.query("SELECT setting_key,setting_value FROM hospital_settings WHERE hospital_id=$1 ORDER BY setting_key",[hid]),
      db.query("SELECT feature_key,enabled,configuration FROM hospital_features WHERE hospital_id=$1 ORDER BY feature_key",[hid]),
      db.query("SELECT module_key,enabled,display_name,display_order,configuration FROM hospital_modules WHERE hospital_id=$1 ORDER BY display_order,module_key",[hid]),
      db.query("SELECT label_key,label_value FROM hospital_labels WHERE hospital_id=$1 ORDER BY label_key",[hid]),
      db.query("SELECT id,department_id,service_code,name,description,service_type,price,duration_minutes,active,configuration FROM hospital_services WHERE hospital_id=$1 ORDER BY active DESC,name",[hid]),
      db.query("SELECT id,day_of_week,start_time,end_time,is_open,slot_duration_minutes,configuration FROM hospital_working_hours WHERE hospital_id=$1 ORDER BY day_of_week",[hid])
    ]);
    return res.json({hospital:h.rows[0]||null,settings:settings.rows,features:features.rows,modules:modules.rows,labels:labels.rows,services:services.rows,working_hours:hours.rows});
  }

  const b=req.body||{};
  if(b.type==="hospital"){
    if(!b.name)return res.status(400).json({error:"Hospital name is required"});
    const r=await db.query("UPDATE hospitals SET name=$1,phone=$2,address=$3,timezone=$4,updated_at=now() WHERE id=$5 RETURNING id,name,phone,address,timezone",[b.name,b.phone||null,b.address||null,b.timezone||"Asia/Kolkata",hid]);
    return res.json(r.rows[0]);
  }
  if(b.type==="setting"){
    if(!b.setting_key)return res.status(400).json({error:"setting_key is required"});
    await db.query("INSERT INTO hospital_settings(hospital_id,setting_key,setting_value,updated_at) VALUES($1,$2,$3::jsonb,now()) ON CONFLICT(hospital_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()",[hid,b.setting_key,JSON.stringify(b.setting_value??{})]);
    return res.json({ok:true});
  }
  if(b.type==="feature"){
    if(!b.feature_key)return res.status(400).json({error:"feature_key is required"});
    await db.query("INSERT INTO hospital_features(hospital_id,feature_key,enabled,configuration,updated_at) VALUES($1,$2,$3,$4::jsonb,now()) ON CONFLICT(hospital_id,feature_key) DO UPDATE SET enabled=EXCLUDED.enabled,configuration=EXCLUDED.configuration,updated_at=now()",[hid,b.feature_key,!!b.enabled,JSON.stringify(b.configuration??{})]);
    return res.json({ok:true});
  }
  if(b.type==="module"){
    if(!b.module_key)return res.status(400).json({error:"module_key is required"});
    await db.query("INSERT INTO hospital_modules(hospital_id,module_key,enabled,display_name,display_order,configuration,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,now()) ON CONFLICT(hospital_id,module_key) DO UPDATE SET enabled=EXCLUDED.enabled,display_name=EXCLUDED.display_name,display_order=EXCLUDED.display_order,configuration=EXCLUDED.configuration,updated_at=now()",[hid,b.module_key,!!b.enabled,b.display_name||null,Number(b.display_order||100),JSON.stringify(b.configuration??{})]);
    return res.json({ok:true});
  }
  if(b.type==="label"){
    if(!b.label_key)return res.status(400).json({error:"label_key is required"});
    await db.query("INSERT INTO hospital_labels(hospital_id,label_key,label_value,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(hospital_id,label_key) DO UPDATE SET label_value=EXCLUDED.label_value,updated_at=now()",[hid,b.label_key,String(b.label_value??"")]);
    return res.json({ok:true});
  }
  if(b.type==="service"){
    if(!b.name)return res.status(400).json({error:"Service name is required"});
    if(b.id){
      const r=await db.query("UPDATE hospital_services SET department_id=$1,service_code=$2,name=$3,description=$4,service_type=$5,price=$6,duration_minutes=$7,active=$8,configuration=$9::jsonb,updated_at=now() WHERE id=$10 AND hospital_id=$11 RETURNING *",[b.department_id||null,b.service_code||null,b.name,b.description||null,b.service_type||"consultation",b.price===""?null:b.price,b.duration_minutes===""?null:b.duration_minutes,b.active!==false,JSON.stringify(b.configuration??{}),b.id,hid]);
      return res.json(r.rows[0]||null);
    }
    const r=await db.query("INSERT INTO hospital_services(hospital_id,department_id,service_code,name,description,service_type,price,duration_minutes,active,configuration) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *",[hid,b.department_id||null,b.service_code||null,b.name,b.description||null,b.service_type||"consultation",b.price===""?null:b.price,b.duration_minutes===""?null:b.duration_minutes,b.active!==false,JSON.stringify(b.configuration??{})]);
    return res.json(r.rows[0]);
  }
  if(b.type==="working_hours"){
    const day=Number(b.day_of_week);
    if(day<0||day>6)return res.status(400).json({error:"Invalid day_of_week"});
    await db.query("INSERT INTO hospital_working_hours(hospital_id,day_of_week,start_time,end_time,is_open,slot_duration_minutes,configuration) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(hospital_id,day_of_week) DO UPDATE SET start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,is_open=EXCLUDED.is_open,slot_duration_minutes=EXCLUDED.slot_duration_minutes,configuration=EXCLUDED.configuration",[hid,day,b.start_time||null,b.end_time||null,b.is_open!==false,b.slot_duration_minutes||null,JSON.stringify(b.configuration??{})]);
    return res.json({ok:true});
  }
  return res.status(400).json({error:"Unknown configuration type"});
}