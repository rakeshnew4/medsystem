import { auth } from "hatchable";
import { db } from "./db.js";

export const PRIMARY_ADMIN_EMAIL = "rakeshkolipaka4@gmail.com";

export async function getPreviewRole(user,req){
  const token=req.cookies?.careflow_role_session||req.cookies?.careflow_role_preview||req.headers?.['x-careflow-role-token'];
  if(!token)return null;
  const r=await db.query("SELECT role FROM admin_role_preview_sessions WHERE token=$1 AND admin_user_id=$2 AND expires_at>now()",[token,String(user.id)]);
  return r.rows[0]?.role||null;
}

export async function requireStaff(req,res,roles=[]){
  const user=await auth.getUser(req);
  console.log("[auth] requireStaff", {
    authenticated:!!user,user_id:user?.id?String(user.id):null,
    email:user?.email?String(user.email).toLowerCase():null,
    route:req?.path||req?.url||null,method:req?.method||null
  });
  if(!user){
    res.status(401).json({error:"Sign in required"});return null;
  }

  // Common path: one query gets the hospital and matching staff profile.
  const hs=await db.query(
    "SELECT h.id AS hospital_id,s.id,s.hospital_id AS staff_hospital_id,s.user_id,s.email,s.display_name,s.role,s.doctor_id,s.department_id,s.active FROM hospitals h LEFT JOIN LATERAL (SELECT id,hospital_id,user_id,email,display_name,role,doctor_id,department_id,active FROM staff_profiles WHERE hospital_id=h.id AND (user_id=$1 OR lower(email)=lower($2)) ORDER BY CASE WHEN user_id=$1 THEN 0 ELSE 1 END LIMIT 1) s ON true ORDER BY h.id LIMIT 1",
    [user.id,user.email]
  );
  const row=hs.rows[0];

  if(!row?.hospital_id){
    if(String(user.email||'').toLowerCase()!==PRIMARY_ADMIN_EMAIL){
      res.status(403).json({error:"This email is not registered as hospital staff"});return null;
    }
    return {user,staff:{id:null,hospital_id:null,user_id:user.id,email:user.email,display_name:user.name||user.email,role:"admin",doctor_id:null,department_id:null,active:true},hospitalId:null};
  }

  let staff=row.id?{
    id:row.id,hospital_id:row.staff_hospital_id||row.hospital_id,user_id:row.user_id,
    email:row.email,display_name:row.display_name,role:row.role,doctor_id:row.doctor_id,department_id:row.department_id,active:row.active
  }:null;

  if(!staff && String(user.email||'').toLowerCase()===PRIMARY_ADMIN_EMAIL){
    const ins=await db.query(
      "INSERT INTO staff_profiles(hospital_id,user_id,email,display_name,role,active) VALUES($1,$2,$3,$4,'admin',true) ON CONFLICT(hospital_id,email) DO UPDATE SET user_id=EXCLUDED.user_id,role='admin',active=true,updated_at=now() RETURNING id,hospital_id,user_id,email,display_name,role,doctor_id,active",
      [row.hospital_id,user.id,user.email,user.name||user.email]
    );
    staff=ins.rows[0];
  }

  if(!staff){
    res.status(403).json({error:"This email is not registered by the hospital administrator"});return null;
  }
  if(!staff.active||staff.role==="pending"){
    res.status(403).json({error:"Your staff account is awaiting activation by an administrator",staff});return null;
  }

  const previewRole=await getPreviewRole(user,req);
  if(previewRole&&String(user.email||'').toLowerCase()===PRIMARY_ADMIN_EMAIL){
    const preview={...staff,role:previewRole,display_name:staff.display_name+" (Test "+previewRole+")"};
    if(roles.length&&!roles.includes(preview.role)){
      res.status(403).json({error:"You do not have permission for this action",role:preview.role});return null;
    }
    return {user,staff:preview,hospitalId:row.hospital_id,previewRole};
  }

  if(roles.length&&!roles.includes(staff.role)){
    res.status(403).json({error:"You do not have permission for this action",role:staff.role});return null;
  }
  return {user,staff,hospitalId:row.hospital_id};
}

export async function getPermissions(ctx){
  if(!ctx)return {};
  if(ctx.staff.role==="admin"){
    const r=await db.query("SELECT permission_key,true AS allowed FROM permissions");
    return Object.fromEntries(r.rows.map(x=>[x.permission_key,true]));
  }
  const r=await db.query("SELECT p.permission_key,COALESCE(ud.allowed,ug.allowed,rp.allowed,false) AS allowed FROM permissions p LEFT JOIN role_permissions rp ON rp.role=$1 AND rp.permission_key=p.permission_key LEFT JOIN user_permissions ud ON ud.staff_id=$2 AND ud.permission_key=p.permission_key AND ud.department_id=$3 LEFT JOIN user_permissions ug ON ug.staff_id=$2 AND ug.permission_key=p.permission_key AND ug.department_id IS NULL",[ctx.staff.role,ctx.staff.id,ctx.staff.department_id||null]);
  return Object.fromEntries(r.rows.map(x=>[x.permission_key,!!x.allowed]));
}

export async function requirePermission(req,res,permission){
  const ctx=await requireStaff(req,res);
  if(!ctx)return null;
  if(ctx.staff.role==="admin")return ctx;
  const r=await db.query(
    "SELECT COALESCE(ud.allowed,ug.allowed,rp.allowed,false) AS allowed FROM permissions p LEFT JOIN role_permissions rp ON rp.role=$1 AND rp.permission_key=p.permission_key LEFT JOIN user_permissions ud ON ud.staff_id=$2 AND ud.permission_key=p.permission_key AND ud.department_id=$4 LEFT JOIN user_permissions ug ON ug.staff_id=$2 AND ug.permission_key=p.permission_key AND ug.department_id IS NULL WHERE p.permission_key=$3",
    [ctx.staff.role,ctx.staff.id,permission,ctx.staff.department_id||null]
  );
  if(!r.rows[0]?.allowed){
    res.status(403).json({error:"You do not have permission for this action",permission});return null;
  }
  return ctx;
}