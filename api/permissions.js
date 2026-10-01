import { db } from "../lib/db.js";
import { requireStaff, getPermissions } from "../lib/authz.js";
export const access="user";
export const methods=["GET","PUT"];
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
  if(b.scope==="role"){
    if(!b.role||!b.permission_key)return res.status(400).json({error:"Role and permission are required"});
    await db.query("INSERT INTO role_permissions(role,permission_key,allowed) VALUES($1,$2,$3) ON CONFLICT(role,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed",[b.role,b.permission_key,b.allowed===true]);
  }else if(b.scope==="user"){
    if(!b.staff_id||!b.permission_key)return res.status(400).json({error:"Staff member and permission are required"});
    await db.query("INSERT INTO user_permissions(staff_id,permission_key,allowed,department_id) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM staff_profiles WHERE id=$1 AND hospital_id=$5) ON CONFLICT (staff_id,permission_key,COALESCE(department_id,0)) DO UPDATE SET allowed=EXCLUDED.allowed,department_id=EXCLUDED.department_id",[b.staff_id,b.permission_key,b.allowed===true,b.department_id||null,ctx.hospitalId]);
  }else return res.status(400).json({error:"Unknown permission scope"});
  res.json({ok:true});
}