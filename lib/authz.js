import { auth } from "hatchable";
import { db } from "./db.js";

export const PRIMARY_ADMIN_EMAIL = "rakeshkolipaka4@gmail.com";
const DEMO_ROLES = ["admin","doctor","nurse","receptionist","lab","pharmacy","billing","store"];

function demoEnabled(){
  return String(process.env.CARE_FLOW_DEMO_MODE||"").trim().toLowerCase()==="true";
}

function requestedDemoRole(req){
  const raw=req.cookies?.careflow_demo_role||req.headers?.["x-careflow-demo-role"]||req.query?.demo_role||"admin";
  const role=String(raw).trim().toLowerCase();
  return DEMO_ROLES.includes(role)?role:"admin";
}

export async function getPreviewRole(user,req){
  const token=req.cookies?.careflow_role_session||req.cookies?.careflow_role_preview||req.headers?.['x-careflow-role-token'];
  if(!token)return null;
  const r=await db.query("SELECT role FROM admin_role_preview_sessions WHERE token=$1 AND admin_user_id=$2 AND expires_at>now()",[token,String(user.id)]);
  return r.rows[0]?.role||null;
}

export async function requireStaff(req,res,roles=[]){
  const user=await auth.getUser(req);

  const demoUser=!!user&&(String(user.id)==="careflow-demo"||String(user.email||"").toLowerCase()==="demo@careflow.test");
  if(demoEnabled()&&(!user||demoUser)){
    const hs=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
    if(!hs.rows[0]){
      res.status(503).json({error:"Demo mode requires an initialized hospital"});return null;
    }
    const role=requestedDemoRole(req);
    const doctorRow=role==="doctor"?await db.query("SELECT id FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY id LIMIT 1",[hs.rows[0].id]):{rows:[]};
    const staff={id:null,hospital_id:hs.rows[0].id,user_id:null,email:"demo@careflow.test",display_name:"Demo "+role,role,doctor_id:doctorRow.rows[0]?.id||null,department_id:null,active:true};
    if(roles.length&&!roles.includes(role)){
      res.status(403).json({error:"Demo role does not have access to this action",role});return null;
    }
    return {user:{id:"careflow-demo",email:staff.email,name:staff.display_name},staff,hospitalId:hs.rows[0].id,demo:true};
  }

  console.log("[auth] requireStaff",{authenticated:!!user,user_id:user?.id?String(user.id):null,email:user?.email?String(user.email).toLowerCase():null,route:req?.path||req?.url||null,method:req?.method||null});
  if(!user){res.status(401).json({error:"Sign in required"});return null;}

  const hs=await db.query("SELECT h.id AS hospital_id,s.id,s.hospital_id AS staff_hospital_id,s.user_id,s.email,s.display_name,s.role,s.doctor_id,s.department_id,s.active FROM hospitals h LEFT JOIN LATERAL (SELECT id,hospital_id,user_id,email,display_name,role,doctor_id,department_id,active FROM staff_profiles WHERE hospital_id=h.id AND (user_id=$1 OR lower(email)=lower($2)) ORDER BY CASE WHEN user_id=$1 THEN 0 ELSE 1 END LIMIT 1) s ON true ORDER BY h.id LIMIT 1",[user.id,user.email]);
  const row=hs.rows[0];

  if(!row?.hospital_id){
    if(String(user.email||'').toLowerCase()!==PRIMARY_ADMIN_EMAIL){res.status(403).json({error:"This email is not registered as hospital staff"});return null;}
    return {user,staff:{id:null,hospital_id:null,user_id:user.id,email:user.email,display_name:user.name||user.email,role:"admin",doctor_id:null,department_id:null,active:true},hospitalId:null};
  }

  let staff=row.id?{id:row.id,hospital_id:row.staff_hospital_id||row.hospital_id,user_id:row.user_id,email:row.email,display_name:row.display_name,role:row.role,doctor_id:row.doctor_id,department_id:row.department_id,active:row.active}:null;

  if(!staff&&String(user.email||'').toLowerCase()===PRIMARY_ADMIN_EMAIL){
    const ins=await db.query("INSERT INTO staff_profiles(hospital_id,user_id,email,display_name,role,active) VALUES($1,$2,$3,$4,'admin',true) ON CONFLICT(hospital_id,email) DO UPDATE SET user_id=EXCLUDED.user_id,role='admin',active=true,updated_at=now() RETURNING id,hospital_id,user_id,email,display_name,role,doctor_id,active",[row.hospital_id,user.id,user.email,user.name||user.email]);
    staff=ins.rows[0];
  }

  if(!staff){res.status(403).json({error:"This email is not registered by the hospital administrator"});return null;}
  if(!staff.active||staff.role==="pending"){res.status(403).json({error:"Your staff account is awaiting activation by an administrator",staff});return null;}

  const previewRole=await getPreviewRole(user,req);
  if(previewRole&&String(user.email||'').toLowerCase()===PRIMARY_ADMIN_EMAIL){
    const preview={...staff,role:previewRole,display_name:staff.display_name+" (Test "+previewRole+")"};
    if(roles.length&&!roles.includes(preview.role)){res.status(403).json({error:"You do not have permission for this action",role:preview.role});return null;}
    return {user,staff:preview,hospitalId:row.hospital_id,previewRole};
  }

  if(roles.length&&!roles.includes(staff.role)){res.status(403).json({error:"You do not have permission for this action",role:staff.role});return null;}
  return {user,staff,hospitalId:row.hospital_id};
}

const DEMO_ROLE_PERMISSIONS={
  receptionist:["page.dashboard","page.appointments","page.patients","page.queue","action.patient.create","action.appointment.create","action.queue.manage"],
  nurse:["page.dashboard","page.patients","page.queue","action.queue.manage","action.vitals.record","action.clinical.view"],
  doctor:["page.dashboard","page.patients","page.queue","page.doctors","page.followups","action.queue.manage","action.vitals.record","action.clinical.view","action.clinical.write","action.followups.manage","action.ai.use"],
  lab:["page.dashboard","page.patients","page.queue","action.clinical.view","action.lab.manage"],
  pharmacy:["page.dashboard","page.patients","page.queue","action.clinical.view","action.pharmacy.manage"],
  billing:["page.dashboard","page.patients","page.billing","action.clinical.view","action.billing.manage"],
  store:["page.dashboard","action.assets.manage"]
};

export async function getPermissions(ctx){
  if(!ctx)return {};
  if(ctx.demo){
    const allowed=new Set(DEMO_ROLE_PERMISSIONS[String(ctx.staff.role||"").toLowerCase()]||[]);
    return Object.fromEntries([...allowed].map(k=>[k,true]));
  }
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
  if(ctx.demo){
    const perms=await getPermissions(ctx);
    if(!perms[permission]){res.status(403).json({error:"You do not have permission for this action",permission});return null;}
    return ctx;
  }
  const r=await db.query("SELECT COALESCE(ud.allowed,ug.allowed,rp.allowed,false) AS allowed FROM permissions p LEFT JOIN role_permissions rp ON rp.role=$1 AND rp.permission_key=p.permission_key LEFT JOIN user_permissions ud ON ud.staff_id=$2 AND ud.permission_key=p.permission_key AND ud.department_id=$4 LEFT JOIN user_permissions ug ON ug.staff_id=$2 AND ug.permission_key=p.permission_key AND ug.department_id IS NULL WHERE p.permission_key=$3",[ctx.staff.role,ctx.staff.id,permission,ctx.staff.department_id||null]);
  if(!r.rows[0]?.allowed){res.status(403).json({error:"You do not have permission for this action",permission});return null;}
  return ctx;
}