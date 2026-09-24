import { auth } from "hatchable";
import { db } from "../lib/db.js";
import { PRIMARY_ADMIN_EMAIL, getPermissions, getPreviewRole } from "../lib/authz.js";
export const access="public";
export const methods=["GET"];
export default async function(req,res){
  const user=await auth.getUser(req);
  if(!user)return res.json({signed_in:false});
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0])return res.json({signed_in:true,user,staff:String(user.email||'').toLowerCase()===PRIMARY_ADMIN_EMAIL?{email:user.email,role:'admin',active:true}:null,permissions:String(user.email||'').toLowerCase()===PRIMARY_ADMIN_EMAIL?{'page.setup':true,'action.setup.manage':true}: {}});
  let r=await db.query("SELECT id,email,display_name,role,active,doctor_id,user_id FROM staff_profiles WHERE hospital_id=$1 AND (user_id=$2 OR lower(email)=lower($3)) ORDER BY CASE WHEN user_id=$2 THEN 0 ELSE 1 END LIMIT 1",[h.rows[0].id,user.id,user.email]);
  const staff=r.rows[0]||null;
  if(!staff)return res.json({signed_in:true,user,staff:null,permissions:{}});
  if(!staff.user_id){await db.query("UPDATE staff_profiles SET user_id=$1,updated_at=now() WHERE id=$2 AND user_id IS NULL",[user.id,staff.id]);staff.user_id=user.id;}
  const previewRole=await getPreviewRole(user,req);
  const effectiveStaff=previewRole?{...staff,role:previewRole,display_name:(staff.display_name||staff.email)+" (Test "+previewRole+")"}:staff;
  const effective=effectiveStaff.role==="admin"?Object.fromEntries((await db.query("SELECT permission_key FROM permissions")).rows.map(x=>[x.permission_key,true])):await getPermissions({staff:effectiveStaff});
  res.json({signed_in:true,user,staff:effectiveStaff,permissions:effective,can_role_preview:String(user.email||"").toLowerCase()===PRIMARY_ADMIN_EMAIL,preview:!!previewRole});
}