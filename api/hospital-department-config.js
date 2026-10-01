import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET","PUT","DELETE"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.setup.manage");
  if(!ctx)return;
  const hid=ctx.hospitalId;
  if(!hid)return res.status(400).json({error:"Hospital is not configured yet"});

  if(req.method==="GET"){
    const departmentId=req.query?.department_id?Number(req.query.department_id):null;
    if(departmentId){
      const dep=await db.query("SELECT id,name FROM departments WHERE id=$1 AND hospital_id=$2",[departmentId,hid]);
      if(!dep.rows.length)return res.status(404).json({error:"Department not found"});
    }
    const [departments,global,overrides]=await Promise.all([
      db.query("SELECT id,name FROM departments WHERE hospital_id=$1 ORDER BY name",[hid]),
      db.query("SELECT setting_key,setting_value FROM hospital_settings WHERE hospital_id=$1 ORDER BY setting_key",[hid]),
      departmentId
        ? db.query("SELECT id,department_id,setting_key,setting_value,updated_at FROM hospital_department_settings WHERE hospital_id=$1 AND department_id=$2 ORDER BY setting_key",[hid,departmentId])
        : db.query("SELECT id,department_id,setting_key,setting_value,updated_at FROM hospital_department_settings WHERE hospital_id=$1 ORDER BY department_id,setting_key",[hid])
    ]);
    return res.json({departments:departments.rows,global:global.rows,overrides:overrides.rows});
  }

  const b=req.body||{};
  const departmentId=Number(b.department_id);
  if(!departmentId||!b.setting_key||String(b.setting_key).length>160)return res.status(400).json({error:"Department and setting_key are required"});
  const dep=await db.query("SELECT id FROM departments WHERE id=$1 AND hospital_id=$2",[departmentId,hid]);
  if(!dep.rows.length)return res.status(400).json({error:"Department is not in this hospital"});

  if(req.method==="DELETE"){
    await db.query("DELETE FROM hospital_department_settings WHERE hospital_id=$1 AND department_id=$2 AND setting_key=$3",[hid,departmentId,b.setting_key]);
    return res.json({ok:true,inherited:true});
  }

  await db.query("INSERT INTO hospital_department_settings(hospital_id,department_id,setting_key,setting_value,updated_at) VALUES($1,$2,$3,$4::jsonb,now()) ON CONFLICT(hospital_id,department_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=now()",[hid,departmentId,String(b.setting_key),JSON.stringify(b.setting_value??null)]);
  return res.json({ok:true,overridden:true});
}