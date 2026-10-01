import { db } from "../lib/db.js";
import { requireStaff, getPermissions } from "../lib/authz.js";
export const access="user";
export const methods=["GET","PUT","DELETE"];
export default async function(req,res){
  const ctx=await requireStaff(req,res);
  if(!ctx)return;
  if(req.method==="GET"){
    const permissions=await db.query("SELECT permission_key,label,category,description FROM permissions ORDER BY category,permission_key");
    const roles=await db.query("SELECT role,permission_key,allowed FROM role_permissions ORDER BY role,permission_key");
    const overrides=ctx.staff.role==="admin"?await db.query("SELECT up.id,up.staff_id,up.permission_key,up.allowed,up.department_id,d.name AS department_name FROM user_permissions up JOIN staff_profiles s ON s.id=up.staff_id LEFT JOIN departments d ON d.id=up.department_id AND d.hospital_id=s.hospital_id WHERE s.hospital_id=$1",[ctx.hospitalId]):{rows:[]};
    const effective=await getPermissions(ctx);
    return res.json({permissions:permissions.rows,roles:roles.rows,overrides:overrides.rows,effective});
  }
  if(ctx.staff.role!=="admin")return res.status(403).json({error:"Only administrators can change permissions"});
  const b=req.body||{};
  if(req.method==="DELETE"){
    if(b.scope!=="user"||!b.staff_id||!b.permission_key)return res.status(400).json({error:"Staff member and permission are required"});
    const staff=await db.query("SELECT id FROM staff_profiles WHERE id=$1 AND hospital_id=$2",[b.staff_id,ctx.hospitalId]);
    if(!staff.rows.length)return res.status(404).json({error:"Staff member not found in this hospital"});
    const departmentId=(b.department_id!=null&&b.department_id!=="")?Number(b.department_id):null;
    if(departmentId!=null){const dep=await db.query("SELECT id FROM departments WHERE id=$1 AND hospital_id=$2",[departmentId,ctx.hospitalId]);if(!dep.rows.length)return res.status(400).json({error:"Department is not in this hospital"});}
    await db.query("DELETE FROM user_permissions WHERE staff_id=$1 AND permission_key=$2 AND ((department_id=$3) OR (department_id IS NULL AND $3 IS NULL))",[b.staff_id,b.permission_key,departmentId]);
    return res.json({ok:true,cleared:true});
  }
  if(b.scope==="role"){
    if(!b.role||!b.permission_key)return res.status(400).json({error:"Role and permission are required"});
    await db.query("INSERT INTO role_permissions(role,permission_key,allowed) VALUES($1,$2,$3) ON CONFLICT(role,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed",[b.role,b.permission_key,b.allowed===true]);
  }else if(b.scope==="user"){
    if(!b.staff_id||!b.permission_key)return res.status(400).json({error:"Staff member and permission are required"});
    const staff=await db.query("SELECT id,department_id FROM staff_profiles WHERE id=$1 AND hospital_id=$2",[b.staff_id,ctx.hospitalId]);
    if(!staff.rows.length)return res.status(404).json({error:"Staff member not found in this hospital"});
    const departmentId=(b.department_id!=null&&b.department_id!=="")?Number(b.department_id):null;
    if(departmentId!=null){const dep=await db.query("SELECT id FROM departments WHERE id=$1 AND hospital_id=$2",[departmentId,ctx.hospitalId]);if(!dep.rows.length)return res.status(400).json({error:"Department is not in this hospital"});}
    if(typeof b.allowed!=="boolean")return res.status(400).json({error:"allowed must be boolean"});
    await db.query("INSERT INTO user_permissions(staff_id,permission_key,allowed,department_id) VALUES($1,$2,$3,$4) ON CONFLICT (staff_id,permission_key,COALESCE(department_id,0)) DO UPDATE SET allowed=EXCLUDED.allowed",[b.staff_id,b.permission_key,b.allowed,departmentId]);
  }else return res.status(400).json({error:"Unknown permission scope"});
  res.json({ok:true});
}