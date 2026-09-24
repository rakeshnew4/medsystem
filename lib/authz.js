import { auth } from "hatchable";
import { db } from "./db.js";

export const PRIMARY_ADMIN_EMAIL = "rakeshkolipaka4@gmail.com";

export async function getPreviewRole(user,req){
  if(String(user.email||'').toLowerCase()!==PRIMARY_ADMIN_EMAIL)return null;
  const token=req.cookies?.careflow_role_preview;
  if(!token)return null;
  const r=await db.query("SELECT role FROM admin_role_preview_sessions WHERE token=$1 AND admin_user_id=$2 AND expires_at>now()",[token,String(user.id)]);
  return r.rows[0]?.role||null;
}

async function getStaff(user,hospitalId){
  let s=await db.query("SELECT id,hospital_id,user_id,email,display_name,role,doctor_id,active FROM staff_profiles WHERE hospital_id=$1 AND (user_id=$2 OR lower(email)=lower($3)) ORDER BY CASE WHEN user_id=$2 THEN 0 ELSE 1 END LIMIT 1",[hospitalId,user.id,user.email]);
  if(!s.rows[0]){
    if(String(user.email||'').toLowerCase()!==PRIMARY_ADMIN_EMAIL)return null;
    const ins=await db.query("INSERT INTO staff_profiles(hospital_id,user_id,email,display_name,role,active) VALUES($1,$2,$3,$4,'admin',true) ON CONFLICT(hospital_id,email) DO UPDATE SET user_id=EXCLUDED.user_id,role='admin',active=true,updated_at=now() RETURNING id,hospital_id,user_id,email,display_name,role,doctor_id,active",[hospitalId,user.id,user.email,user.name||user.email]);
    return ins.rows[0];
  }
  const staff=s.rows[0];
  if(!staff.user_id){
    const bound=await db.query("UPDATE staff_profiles SET user_id=$1,display_name=COALESCE(display_name,$2),updated_at=now() WHERE id=$3 AND user_id IS NULL RETURNING id,hospital_id,user_id,email,display_name,role,doctor_id,active",[user.id,user.name||user.email,staff.id]);
    if(bound.rows[0])return bound.rows[0];
  }
  return staff;
}

export async function requireStaff(req,res,roles=[]){
  const user=await auth.getUser(req);
  if(!user){res.status(401).json({error:"Sign in required"});return null;}
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]){
    if(String(user.email||'').toLowerCase()!==PRIMARY_ADMIN_EMAIL){res.status(403).json({error:"This email is not registered as hospital staff"});return null;}
    return {user,staff:{id:null,hospital_id:null,user_id:user.id,email:user.email,display_name:user.name||user.email,role:"admin",doctor_id:null,active:true},hospitalId:null};
  }
  const staff=await getStaff(user,h.rows[0].id);
  if(!staff){res.status(403).json({error:"This email is not registered by the hospital administrator"});return null;}
  if(!staff.active || staff.role==="pending"){res.status(403).json({error:"Your staff account is awaiting activation by an administrator",staff});return null;}
  const previewRole=await getPreviewRole(user,req);
  if(previewRole && String(user.email||'').toLowerCase()===PRIMARY_ADMIN_EMAIL){
    const preview={...staff,role:previewRole,display_name:staff.display_name+" (Test "+previewRole+")"};
    if(roles.length && !roles.includes(preview.role)){res.status(403).json({error:"You do not have permission for this action",role:preview.role});return null;}
    return {user,staff:preview,hospitalId:h.rows[0].id,previewRole};
  }
  if(roles.length && !roles.includes(staff.role)){res.status(403).json({error:"You do not have permission for this action",role:staff.role});return null;}
  return {user,staff,hospitalId:h.rows[0].id};
}

export async function getPermissions(ctx){
  if(!ctx)return {};
  if(ctx.staff.role==="admin"){
    const r=await db.query("SELECT permission_key,true AS allowed FROM permissions");
    return Object.fromEntries(r.rows.map(x=>[x.permission_key,true]));
  }
  const r=await db.query("SELECT p.permission_key,COALESCE(up.allowed,rp.allowed,false) AS allowed FROM permissions p LEFT JOIN role_permissions rp ON rp.role=$1 AND rp.permission_key=p.permission_key LEFT JOIN user_permissions up ON up.staff_id=$2 AND up.permission_key=p.permission_key",[ctx.staff.role,ctx.staff.id]);
  return Object.fromEntries(r.rows.map(x=>[x.permission_key,!!x.allowed]));
}

export async function requirePermission(req,res,permission){
  const ctx=await requireStaff(req,res);
  if(!ctx)return null;
  if(ctx.staff.role==="admin")return ctx;
  const r=await db.query("SELECT COALESCE(up.allowed,rp.allowed,false) AS allowed FROM permissions p LEFT JOIN role_permissions rp ON rp.role=$1 AND rp.permission_key=p.permission_key LEFT JOIN user_permissions up ON up.staff_id=$2 AND up.permission_key=p.permission_key WHERE p.permission_key=$3",[ctx.staff.role,ctx.staff.id,permission]);
  if(!r.rows[0]?.allowed){res.status(403).json({error:"You do not have permission for this action",permission});return null;}
  return ctx;
}